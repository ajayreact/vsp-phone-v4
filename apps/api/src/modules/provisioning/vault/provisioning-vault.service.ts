import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { SipCredentialVaultService } from '../../telecom/auth/sip-credential-vault.service';
import { ProvisioningRedisService } from '../redis/provisioning-redis.service';
import {
  decryptProvHttpPassword,
  deriveProvHttpCredentialKey,
  encryptProvHttpPassword,
} from './prov-http-credential.crypto';
import type { StoredProvHttpCred } from './prov-http-credential.types';
import type { StoredDeskSipCred } from './desk-sip-credential.types';

export interface DeskSipSecret {
  password: string;
  version: string;
}

export interface ProvHttpCred {
  username: string;
  password: string;
  version: string;
}

/** Phase 11 — desk SIP + prov HTTP + admin secrets (ADR-043; not in Prisma). */
@Injectable()
export class ProvisioningVaultService {
  private readonly logger = new Logger(ProvisioningVaultService.name);
  private readonly deskSip = new Map<string, DeskSipSecret>();
  private readonly provHttp = new Map<string, ProvHttpCred>();
  private readonly adminPw = new Map<string, string>();
  private readonly provHttpKey: Buffer;

  constructor(
    private readonly config: ConfigService,
    private readonly sipVault: SipCredentialVaultService,
    private readonly redis: ProvisioningRedisService,
  ) {
    const secret =
      this.config.get<string>('PROV_HTTP_CREDENTIAL_KEY') ||
      this.config.get<string>('JWT_SECRET') ||
      this.config.get<string>('DEV_JWT_SECRET') ||
      'dev-only-prov-http-credential-key';
    this.provHttpKey = deriveProvHttpCredentialKey(secret);
  }

  issueDeskSip(params: {
    sipEndpointId: string;
    authUsername: string;
    realm: string;
  }): DeskSipSecret {
    const password = randomBytes(16).toString('base64url');
    const version = `desk-${Date.now()}`;
    const key = params.sipEndpointId.toLowerCase();
    this.deskSip.set(key, { password, version });
    this.sipVault.registerPersistentCredential({
      sipEndpointId: params.sipEndpointId,
      authUsername: params.authUsername,
      realm: params.realm,
      password,
      version,
    });
    void this.persistDeskSip(params.sipEndpointId, {
      password,
      version,
      authUsername: params.authUsername,
      realm: params.realm,
    });
    return { password, version };
  }

  async issueProvHttp(mac: string): Promise<ProvHttpCred> {
    const existing = await this.resolveProvHttp(mac);
    if (existing) return existing;

    const normalized = normalizeMac(mac);
    const cred: ProvHttpCred = {
      username: normalized,
      password: randomBytes(12).toString('base64url'),
      version: `prov-${Date.now()}`,
    };
    this.provHttp.set(normalized, cred);
    await this.persistProvHttp(normalized, cred);
    return cred;
  }

  async resolveProvHttp(mac: string): Promise<ProvHttpCred | null> {
    const normalized = normalizeMac(mac);
    const cached = this.provHttp.get(normalized);
    if (cached) return cached;

    const rehydrated = await this.loadProvHttpFromRedis(normalized);
    if (!rehydrated) return null;

    this.provHttp.set(normalized, rehydrated);
    this.logger.log(
      JSON.stringify({
        event: 'provisioning.credentials.rehydrated',
        mac: normalized,
        version: rehydrated.version,
      }),
    );
    return rehydrated;
  }

  issueAdminPassword(deviceId: string): string {
    const pw = randomBytes(10).toString('base64url');
    this.adminPw.set(deviceId.toLowerCase(), pw);
    return pw;
  }

  resolveAdminPassword(deviceId: string): string | null {
    return this.adminPw.get(deviceId.toLowerCase()) ?? null;
  }

  revokeDeskSip(sipEndpointId: string): void {
    const key = sipEndpointId.toLowerCase();
    this.deskSip.delete(key);
    this.sipVault.revokePersistentCredential(sipEndpointId);
    void this.redis.del(this.redis.deskSipCredKey(sipEndpointId));
  }

  async revokeProvHttp(mac: string): Promise<void> {
    const normalized = normalizeMac(mac);
    this.provHttp.delete(normalized);
    await this.redis.del(this.redis.provHttpCredKey(normalized));
  }

  revokeAdminPassword(deviceId: string): void {
    this.adminPw.delete(deviceId.toLowerCase());
  }

  async resolveDeskSip(sipEndpointId: string): Promise<DeskSipSecret | null> {
    const key = sipEndpointId.toLowerCase();
    const cached = this.deskSip.get(key);
    if (cached) return cached;

    const rehydrated = await this.loadDeskSipFromRedis(sipEndpointId);
    if (!rehydrated) return null;

    this.deskSip.set(key, rehydrated);
    this.logger.log(
      JSON.stringify({
        event: 'provisioning.desk_sip.rehydrated',
        sipEndpointId: key,
        version: rehydrated.version,
      }),
    );
    return rehydrated;
  }

  async resolveDeskSipPassword(sipEndpointId: string): Promise<string | null> {
    const secret = await this.resolveDeskSip(sipEndpointId);
    return secret?.password ?? null;
  }

  /**
   * Reuse the Redis desk SIP secret across generate/reprovision so GRP phones
   * that keep an old P34 do not get stuck on bad_digest after every rotate.
   * Issue only when missing; always re-register HA1 for the challenge realm.
   */
  async ensureDeskSip(params: {
    sipEndpointId: string;
    authUsername: string;
    realm: string;
    rotate?: boolean;
  }): Promise<DeskSipSecret & { rotated: boolean }> {
    if (!params.rotate) {
      const existing = await this.resolveDeskSip(params.sipEndpointId);
      if (existing) {
        this.sipVault.registerPersistentCredential({
          sipEndpointId: params.sipEndpointId,
          authUsername: params.authUsername,
          realm: params.realm,
          password: existing.password,
          version: existing.version,
          retainPassword: true,
        });
        return { ...existing, rotated: false };
      }
    }
    const issued = this.issueDeskSip(params);
    return { ...issued, rotated: true };
  }

  private async persistDeskSip(
    sipEndpointId: string,
    cred: { password: string; version: string; authUsername: string; realm: string },
  ): Promise<void> {
    const payload: StoredDeskSipCred = {
      passwordEnc: encryptProvHttpPassword(cred.password, this.provHttpKey),
      version: cred.version,
      authUsername: cred.authUsername,
      realm: cred.realm,
      createdAt: new Date().toISOString(),
    };
    await this.redis.set(this.redis.deskSipCredKey(sipEndpointId), JSON.stringify(payload));
  }

  private async loadDeskSipFromRedis(sipEndpointId: string): Promise<DeskSipSecret | null> {
    const raw = await this.redis.get(this.redis.deskSipCredKey(sipEndpointId));
    if (!raw) return null;

    try {
      const stored = JSON.parse(raw) as StoredDeskSipCred;
      if (!stored.passwordEnc || !stored.version || !stored.authUsername || !stored.realm) {
        return null;
      }
      const password = decryptProvHttpPassword(stored.passwordEnc, this.provHttpKey);
      this.sipVault.registerPersistentCredential({
        sipEndpointId,
        authUsername: stored.authUsername,
        realm: stored.realm,
        password,
        version: stored.version,
      });
      return { password, version: stored.version };
    } catch (err) {
      this.logger.warn(
        JSON.stringify({
          event: 'provisioning.desk_sip.rehydrate_failed',
          sipEndpointId: sipEndpointId.toLowerCase(),
          message: err instanceof Error ? err.message : String(err),
        }),
      );
      return null;
    }
  }

  private async persistProvHttp(mac: string, cred: ProvHttpCred): Promise<void> {
    const payload: StoredProvHttpCred = {
      username: cred.username,
      passwordEnc: encryptProvHttpPassword(cred.password, this.provHttpKey),
      version: cred.version,
      createdAt: new Date().toISOString(),
      expiresAt: null,
    };
    await this.redis.set(this.redis.provHttpCredKey(mac), JSON.stringify(payload));
  }

  private async loadProvHttpFromRedis(mac: string): Promise<ProvHttpCred | null> {
    const raw = await this.redis.get(this.redis.provHttpCredKey(mac));
    if (!raw) return null;

    try {
      const stored = JSON.parse(raw) as StoredProvHttpCred;
      if (!stored.username || !stored.passwordEnc || !stored.version) return null;
      if (stored.expiresAt) {
        const expiresAtMs = Date.parse(stored.expiresAt);
        if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
          await this.redis.del(this.redis.provHttpCredKey(mac));
          return null;
        }
      }
      return {
        username: stored.username,
        password: decryptProvHttpPassword(stored.passwordEnc, this.provHttpKey),
        version: stored.version,
      };
    } catch (err) {
      this.logger.warn(
        JSON.stringify({
          event: 'provisioning.credentials.rehydrate_failed',
          mac,
          message: err instanceof Error ? err.message : String(err),
        }),
      );
      return null;
    }
  }
}

export function normalizeMac(mac: string): string {
  return mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase().slice(0, 12);
}

export function isValidMac(mac: string): boolean {
  return /^[a-f0-9]{12}$/.test(normalizeMac(mac));
}

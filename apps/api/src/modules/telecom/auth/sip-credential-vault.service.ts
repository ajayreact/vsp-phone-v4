import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { computeHa1 } from '../auth/sip-digest.crypto';
import {
  decryptProvHttpPassword,
  deriveProvHttpCredentialKey,
} from '../../provisioning/vault/prov-http-credential.crypto';
import type { StoredDeskSipCred } from '../../provisioning/vault/desk-sip-credential.types';
import { TelecomRedisService } from '../redis/telecom-redis.service';

export type SipCredentialSource = 'redis' | 'enroll' | 'vault_ha1' | 'dev';

export interface SipCredentialRecord {
  sipEndpointId: string;
  ha1: string;
  passwordVersion: string;
  source: SipCredentialSource;
}

interface EnrollEntry {
  ha1: string;
  /** Retained so HA1 can be recomputed for Kamailio challenge realm (SIP_REGISTRAR_HOST). */
  password?: string;
  version: string;
  expiresAtMs: number;
}

/**
 * Phase 6 vault adapter (file/env backed — ADR-043 shape).
 * Production swaps this for a Secrets Manager client without changing callers.
 *
 * Credential priority for digest verify:
 * 1. Persistent desk Redis password (never shadowed by enroll when present)
 * 2. Short-lived WebRTC/mobile enroll (only after desk, or alone if no desk secret)
 * 3. Static HA1 / SIP_DEV_PASSWORD fallbacks
 */
@Injectable()
export class SipCredentialVaultService implements OnModuleInit {
  private readonly logger = new Logger(SipCredentialVaultService.name);
  private map = new Map<string, { ha1?: string; password?: string; version: string }>();
  /** Phase 10 — short-lived enroll credentials (memory; Redis is source of truth for revoke TTL) */
  private enroll = new Map<string, EnrollEntry>();
  private readonly provHttpKey: Buffer;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: TelecomRedisService,
  ) {
    const secret =
      this.config.get<string>('PROV_HTTP_CREDENTIAL_KEY') ||
      this.config.get<string>('JWT_SECRET') ||
      this.config.get<string>('DEV_JWT_SECRET') ||
      'dev-only-prov-http-credential-key';
    this.provHttpKey = deriveProvHttpCredentialKey(secret);
  }

  onModuleInit(): void {
    const raw = this.config.get<string>('SIP_VAULT_JSON', '');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Record<
          string,
          { password?: string; ha1?: string; version?: string }
        >;
        for (const [key, val] of Object.entries(parsed)) {
          this.map.set(key.toLowerCase(), {
            ha1: val.ha1,
            password: val.password,
            version: val.version ?? '1',
          });
        }
        this.logger.log(
          JSON.stringify({
            event: 'telecom.vault.loaded',
            entries: this.map.size,
            source: 'SIP_VAULT_JSON',
          }),
        );
      } catch (err) {
        this.logger.error(
          JSON.stringify({
            event: 'telecom.vault.parse_error',
            message: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }
  }

  /** Active enroll overlay (if any) — for diagnostics / dual-verify. */
  peekEnroll(sipEndpointId: string): { version: string; expiresAtMs: number } | null {
    const active = this.enroll.get(sipEndpointId.toLowerCase());
    if (!active) return null;
    if (active.expiresAtMs <= Date.now()) {
      this.enroll.delete(sipEndpointId.toLowerCase());
      return null;
    }
    return { version: active.version, expiresAtMs: active.expiresAtMs };
  }

  /** Persistent desk secret version in memory (after rehydrate). */
  peekPersistentVersion(sipEndpointId: string): string | null {
    return this.map.get(sipEndpointId.toLowerCase())?.version ?? null;
  }

  /**
   * Ordered HA1 candidates for one digest verify.
   * Desk Redis password is always first when present so enroll cannot shadow GRP REGISTER.
   */
  async resolveHa1Candidates(params: {
    sipEndpointId: string;
    authUsername: string;
    realm: string;
  }): Promise<SipCredentialRecord[]> {
    const idKey = params.sipEndpointId.toLowerCase();
    const candidates: SipCredentialRecord[] = [];
    const seen = new Set<string>();

    const push = (rec: SipCredentialRecord) => {
      if (seen.has(rec.ha1)) return;
      seen.add(rec.ha1);
      candidates.push(rec);
    };

    const byId = this.map.get(idKey);
    if (byId?.password) {
      push({
        sipEndpointId: params.sipEndpointId,
        ha1: computeHa1(params.authUsername, params.realm, byId.password),
        passwordVersion: byId.version,
        source: 'redis',
      });
    }

    const enrollKey = idKey;
    const active = this.enroll.get(enrollKey);
    if (active && active.expiresAtMs > Date.now()) {
      const enrollHa1 = active.password
        ? computeHa1(params.authUsername, params.realm, active.password)
        : active.ha1.toLowerCase();
      push({
        sipEndpointId: params.sipEndpointId,
        ha1: enrollHa1,
        passwordVersion: active.version,
        source: 'enroll',
      });
    } else if (active) {
      this.enroll.delete(enrollKey);
    }

    const userRealmKey = `${params.authUsername}@${params.realm}`.toLowerCase();
    const byUserRealm = this.map.get(userRealmKey);
    if (byUserRealm?.password) {
      push({
        sipEndpointId: params.sipEndpointId,
        ha1: computeHa1(params.authUsername, params.realm, byUserRealm.password),
        passwordVersion: byUserRealm.version,
        source: 'redis',
      });
    }
    if (byUserRealm?.ha1) {
      push({
        sipEndpointId: params.sipEndpointId,
        ha1: byUserRealm.ha1.toLowerCase(),
        passwordVersion: byUserRealm.version,
        source: 'vault_ha1',
      });
    }

    if (byId?.ha1) {
      push({
        sipEndpointId: params.sipEndpointId,
        ha1: byId.ha1.toLowerCase(),
        passwordVersion: byId.version,
        source: 'vault_ha1',
      });
    }

    const labPassword = (this.config.get<string>('SIP_DEV_PASSWORD') || '').trim();
    if (labPassword) {
      push({
        sipEndpointId: params.sipEndpointId,
        ha1: computeHa1(params.authUsername, params.realm, labPassword),
        passwordVersion: 'dev',
        source: 'dev',
      });
    }

    return candidates;
  }

  /** First candidate only — desk Redis wins over enroll when both exist. */
  async resolveHa1(params: {
    sipEndpointId: string;
    authUsername: string;
    realm: string;
  }): Promise<SipCredentialRecord | null> {
    const candidates = await this.resolveHa1Candidates(params);
    return candidates[0] ?? null;
  }

  /** Register temporary enroll digest material (Phase 10 — ADR-038). */
  registerEnrollCredential(params: {
    sipEndpointId: string;
    authUsername: string;
    realm: string;
    password: string;
    ttlSec: number;
    version: string;
  }): void {
    const ha1 = computeHa1(params.authUsername, params.realm, params.password);
    this.enroll.set(params.sipEndpointId.toLowerCase(), {
      ha1,
      password: params.password,
      version: params.version,
      expiresAtMs: Date.now() + Math.max(60, params.ttlSec) * 1000,
    });
    this.logger.log(
      JSON.stringify({
        event: 'telecom.vault.enroll_registered',
        sipEndpointId: params.sipEndpointId,
        version: params.version,
        ttlSec: params.ttlSec,
      }),
    );
  }

  revokeEnrollCredential(sipEndpointId: string): void {
    this.enroll.delete(sipEndpointId.toLowerCase());
  }

  /** Phase 11 — persistent desk-phone SIP digest (not enroll TTL). */
  registerPersistentCredential(params: {
    sipEndpointId: string;
    authUsername: string;
    realm: string;
    password: string;
    version: string;
    /** Desk phones: retain password so HA1 matches Kamailio challenge realm (SIP_REGISTRAR_HOST). */
    retainPassword?: boolean;
  }): void {
    const idKey = params.sipEndpointId.toLowerCase();
    const userRealmKey = `${params.authUsername}@${params.realm}`.toLowerCase();
    const ha1 = computeHa1(params.authUsername, params.realm, params.password);
    const retain = params.retainPassword !== false;

    if (retain) {
      this.map.set(idKey, { password: params.password, version: params.version });
    } else {
      this.map.set(idKey, { ha1, version: params.version });
    }
    this.map.set(userRealmKey, { ha1, version: params.version });
  }

  /**
   * Load desk SIP password from Redis. Always refresh when Redis has a credential so
   * provisioned GRP passwords win over stale SIP_VAULT_JSON / in-memory HA1 entries.
   */
  async rehydrateDeskCredential(sipEndpointId: string): Promise<boolean> {
    const idKey = sipEndpointId.toLowerCase();
    const raw = await this.redis.get(`vsp:prov:desk-sip:${idKey}`);
    if (!raw) {
      return this.map.has(idKey);
    }

    try {
      const stored = JSON.parse(raw) as StoredDeskSipCred;
      if (!stored.passwordEnc || !stored.version || !stored.authUsername || !stored.realm) {
        return this.map.has(idKey);
      }
      const password = decryptProvHttpPassword(stored.passwordEnc, this.provHttpKey);
      this.registerPersistentCredential({
        sipEndpointId,
        authUsername: stored.authUsername,
        realm: stored.realm,
        password,
        version: stored.version,
        retainPassword: true,
      });
      this.logger.log(
        JSON.stringify({
          event: 'telecom.vault.desk_sip.rehydrated',
          sipEndpointId: idKey,
          version: stored.version,
        }),
      );
      return true;
    } catch (err) {
      this.logger.warn(
        JSON.stringify({
          event: 'telecom.vault.desk_sip.rehydrate_failed',
          sipEndpointId: idKey,
          message: err instanceof Error ? err.message : String(err),
        }),
      );
      return this.map.has(idKey);
    }
  }

  revokePersistentCredential(sipEndpointId: string): void {
    this.map.delete(sipEndpointId.toLowerCase());
  }
}

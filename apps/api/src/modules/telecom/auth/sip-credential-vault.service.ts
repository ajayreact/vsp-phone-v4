import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { computeHa1 } from '../auth/sip-digest.crypto';
import {
  decryptProvHttpPassword,
  deriveProvHttpCredentialKey,
} from '../../provisioning/vault/prov-http-credential.crypto';
import type { StoredDeskSipCred } from '../../provisioning/vault/desk-sip-credential.types';
import { TelecomRedisService } from '../redis/telecom-redis.service';

export interface SipCredentialRecord {
  sipEndpointId: string;
  ha1: string;
  passwordVersion: string;
}

interface EnrollEntry {
  ha1: string;
  version: string;
  expiresAtMs: number;
}

/**
 * Phase 6 vault adapter (file/env backed — ADR-043 shape).
 * Production swaps this for a real Secrets Manager client without changing callers.
 *
 * Dev sources (first match wins):
 * 1. SIP_VAULT_JSON — JSON map: { "<sipEndpointId>| <authUsername@realm>": { "password"|"ha1": "..." } }
 * 2. SIP_DEV_PASSWORD — single lab password applied for any known endpoint when computing HA1
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

  async resolveHa1(params: {
    sipEndpointId: string;
    authUsername: string;
    realm: string;
  }): Promise<SipCredentialRecord | null> {
    const enrollKey = params.sipEndpointId.toLowerCase();
    const active = this.enroll.get(enrollKey);
    if (active && active.expiresAtMs > Date.now()) {
      return {
        sipEndpointId: params.sipEndpointId,
        ha1: active.ha1,
        passwordVersion: active.version,
      };
    }
    if (active) {
      this.enroll.delete(enrollKey);
    }

    // Prefer retained desk password so HA1 matches the Kamailio challenge realm
    // (SIP_REGISTRAR_HOST), not the tenant realm used when the secret was issued.
    const byId = this.map.get(params.sipEndpointId.toLowerCase());
    if (byId?.password) {
      return {
        sipEndpointId: params.sipEndpointId,
        ha1: computeHa1(params.authUsername, params.realm, byId.password),
        passwordVersion: byId.version,
      };
    }

    const userRealmKey = `${params.authUsername}@${params.realm}`.toLowerCase();
    const byUserRealm = this.map.get(userRealmKey);
    if (byUserRealm?.password) {
      return {
        sipEndpointId: params.sipEndpointId,
        ha1: computeHa1(params.authUsername, params.realm, byUserRealm.password),
        passwordVersion: byUserRealm.version,
      };
    }
    if (byUserRealm?.ha1) {
      return {
        sipEndpointId: params.sipEndpointId,
        ha1: byUserRealm.ha1.toLowerCase(),
        passwordVersion: byUserRealm.version,
      };
    }

    if (byId?.ha1) {
      return {
        sipEndpointId: params.sipEndpointId,
        ha1: byId.ha1.toLowerCase(),
        passwordVersion: byId.version,
      };
    }

    const labPassword = (this.config.get<string>('SIP_DEV_PASSWORD') || '').trim();
    if (labPassword) {
      this.logger.debug(
        JSON.stringify({
          event: 'telecom.vault.dev_password',
          sipEndpointId: params.sipEndpointId,
        }),
      );
      return {
        sipEndpointId: params.sipEndpointId,
        ha1: computeHa1(params.authUsername, params.realm, labPassword),
        passwordVersion: 'dev',
      };
    }

    return null;
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
      version: params.version,
      expiresAtMs: Date.now() + Math.max(60, params.ttlSec) * 1000,
    });
    this.logger.debug(
      JSON.stringify({
        event: 'telecom.vault.enroll_registered',
        sipEndpointId: params.sipEndpointId,
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

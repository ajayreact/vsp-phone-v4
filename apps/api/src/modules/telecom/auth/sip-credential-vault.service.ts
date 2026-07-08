import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { computeHa1 } from '../auth/sip-digest.crypto';

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

  constructor(private readonly config: ConfigService) {}

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

    const byId = this.map.get(params.sipEndpointId.toLowerCase());
    const byUserRealm = this.map.get(
      `${params.authUsername}@${params.realm}`.toLowerCase(),
    );
    const entry = byId ?? byUserRealm;

    if (entry?.ha1) {
      return {
        sipEndpointId: params.sipEndpointId,
        ha1: entry.ha1.toLowerCase(),
        passwordVersion: entry.version,
      };
    }

    if (entry?.password) {
      return {
        sipEndpointId: params.sipEndpointId,
        ha1: computeHa1(params.authUsername, params.realm, entry.password),
        passwordVersion: entry.version,
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
  }): void {
    const ha1 = computeHa1(params.authUsername, params.realm, params.password);
    this.map.set(params.sipEndpointId.toLowerCase(), {
      ha1,
      version: params.version,
    });
    this.map.set(`${params.authUsername}@${params.realm}`.toLowerCase(), {
      ha1,
      version: params.version,
    });
  }

  revokePersistentCredential(sipEndpointId: string): void {
    this.map.delete(sipEndpointId.toLowerCase());
  }
}

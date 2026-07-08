import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { SipCredentialVaultService } from '../../telecom/auth/sip-credential-vault.service';

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

  constructor(
    private readonly config: ConfigService,
    private readonly sipVault: SipCredentialVaultService,
  ) {}

  issueDeskSip(params: {
    sipEndpointId: string;
    authUsername: string;
    realm: string;
  }): DeskSipSecret {
    const password = randomBytes(16).toString('base64url');
    const version = `desk-${Date.now()}`;
    this.deskSip.set(params.sipEndpointId.toLowerCase(), { password, version });
    this.sipVault.registerPersistentCredential({
      sipEndpointId: params.sipEndpointId,
      authUsername: params.authUsername,
      realm: params.realm,
      password,
      version,
    });
    return { password, version };
  }

  issueProvHttp(mac: string): ProvHttpCred {
    const normalized = normalizeMac(mac);
    const cred: ProvHttpCred = {
      username: normalized,
      password: randomBytes(12).toString('base64url'),
      version: `prov-${Date.now()}`,
    };
    this.provHttp.set(normalized, cred);
    return cred;
  }

  resolveProvHttp(mac: string): ProvHttpCred | null {
    return this.provHttp.get(normalizeMac(mac)) ?? null;
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
    this.deskSip.delete(sipEndpointId.toLowerCase());
    this.sipVault.revokePersistentCredential(sipEndpointId);
  }

  revokeProvHttp(mac: string): void {
    this.provHttp.delete(normalizeMac(mac));
  }

  resolveDeskSipPassword(sipEndpointId: string): string | null {
    return this.deskSip.get(sipEndpointId.toLowerCase())?.password ?? null;
  }
}

export function normalizeMac(mac: string): string {
  return mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase().slice(0, 12);
}

export function isValidMac(mac: string): boolean {
  return /^[a-f0-9]{12}$/.test(normalizeMac(mac));
}

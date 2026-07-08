import { Injectable, Logger } from '@nestjs/common';
import type {
  MigrationEntityType,
  MigrationIssue,
  MigrationPayload,
} from '../types/migration.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Phase 19 — read-only migration validation (no data modification). */
@Injectable()
export class MigrationValidationService {
  private readonly logger = new Logger(MigrationValidationService.name);

  validate(payload: MigrationPayload): { errors: MigrationIssue[]; warnings: MigrationIssue[]; passed: boolean } {
    const errors: MigrationIssue[] = [];
    const warnings: MigrationIssue[] = [];

    this.validateTenants(payload, errors, warnings);
    this.validateUsers(payload, errors, warnings);
    this.validateExtensions(payload, errors, warnings);
    this.validateDids(payload, errors, warnings);
    this.validateSipAccounts(payload, errors, warnings);
    this.validateDevices(payload, errors, warnings);
    this.validateQueues(payload, errors, warnings);
    this.validateIvrs(payload, errors, warnings);
    this.validateRingGroups(payload, errors, warnings);
    this.validateHuntGroups(payload, errors, warnings);
    this.validateFeatureCodes(payload, errors, warnings);
    this.validateProvisioningProfiles(payload, errors, warnings);
    this.detectDuplicates(payload, errors, warnings);
    this.detectOrphans(payload, errors, warnings);

    const passed = errors.length === 0;
    this.logger.log(
      JSON.stringify({
        event: 'migration.validation.complete',
        passed,
        errors: errors.length,
        warnings: warnings.length,
      }),
    );

    return { errors, warnings, passed };
  }

  private validateTenants(payload: MigrationPayload, errors: MigrationIssue[], warnings: MigrationIssue[]): void {
    for (const row of payload.data.tenant ?? []) {
      const legacyId = String(row.legacyId ?? row.id ?? '');
      const name = String(row.name ?? '').trim();
      if (!legacyId) {
        errors.push(this.issue('error', 'TENANT_LEGACY_ID_REQUIRED', 'tenant', undefined, 'Tenant legacyId required'));
      }
      if (!name) {
        errors.push(this.issue('error', 'TENANT_NAME_REQUIRED', 'tenant', legacyId, 'Tenant name required'));
      }
      if (row.platformUuid && !UUID_RE.test(String(row.platformUuid))) {
        errors.push(this.issue('error', 'TENANT_UUID_INVALID', 'tenant', legacyId, 'Invalid platform UUID'));
      }
    }
    if (!payload.data.tenant?.length) {
      warnings.push(this.issue('warning', 'NO_TENANTS', 'tenant', undefined, 'No tenants in payload'));
    }
  }

  private validateUsers(payload: MigrationPayload, errors: MigrationIssue[], warnings: MigrationIssue[]): void {
    const tenantIds = this.legacyTenantIds(payload);
    for (const row of payload.data.user ?? []) {
      const legacyId = String(row.legacyId ?? row.id ?? '');
      const email = String(row.email ?? '').trim();
      const tenantLegacyId = String(row.tenantLegacyId ?? row.tenantId ?? '');
      if (!email.includes('@')) {
        errors.push(this.issue('error', 'USER_EMAIL_INVALID', 'user', legacyId, 'Invalid user email'));
      }
      if (tenantLegacyId && tenantIds.size > 0 && !tenantIds.has(tenantLegacyId)) {
        errors.push(this.issue('error', 'USER_TENANT_MISSING', 'user', legacyId, `Unknown tenant ${tenantLegacyId}`));
      }
    }
  }

  private validateExtensions(payload: MigrationPayload, errors: MigrationIssue[], warnings: MigrationIssue[]): void {
    const tenantIds = this.legacyTenantIds(payload);
    for (const row of payload.data.extension ?? []) {
      const legacyId = String(row.legacyId ?? row.id ?? '');
      const ext = String(row.extension ?? '').trim();
      const tenantLegacyId = String(row.tenantLegacyId ?? row.tenantId ?? '');
      if (!ext) {
        errors.push(this.issue('error', 'EXTENSION_REQUIRED', 'extension', legacyId, 'Extension number required'));
      }
      if (!/^\d{2,8}$/.test(ext)) {
        warnings.push(this.issue('warning', 'EXTENSION_FORMAT', 'extension', legacyId, 'Non-standard extension format'));
      }
      if (tenantLegacyId && tenantIds.size > 0 && !tenantIds.has(tenantLegacyId)) {
        errors.push(this.issue('error', 'EXTENSION_TENANT_MISSING', 'extension', legacyId, 'Unknown tenant reference'));
      }
    }
  }

  private validateDids(payload: MigrationPayload, errors: MigrationIssue[], warnings: MigrationIssue[]): void {
    const seen = new Set<string>();
    for (const row of payload.data.did ?? []) {
      const legacyId = String(row.legacyId ?? row.id ?? '');
      const e164 = String(row.e164 ?? row.number ?? '').trim();
      if (!e164.startsWith('+')) {
        errors.push(this.issue('error', 'DID_E164_INVALID', 'did', legacyId, 'DID must be E.164 (+...)'));
      }
      if (seen.has(e164)) {
        errors.push(this.issue('error', 'DID_DUPLICATE', 'did', legacyId, `Duplicate DID ${e164}`));
      }
      seen.add(e164);
      if (row.extensionLegacyId && !this.hasExtension(payload, String(row.extensionLegacyId))) {
        warnings.push(this.issue('warning', 'DID_EXTENSION_ORPHAN', 'did', legacyId, 'Extension reference not in batch'));
      }
    }
  }

  private validateSipAccounts(payload: MigrationPayload, errors: MigrationIssue[], warnings: MigrationIssue[]): void {
    for (const row of payload.data.sip_account ?? []) {
      const legacyId = String(row.legacyId ?? row.id ?? '');
      if (!row.username && !row.sipUri) {
        errors.push(this.issue('error', 'SIP_IDENTITY_REQUIRED', 'sip_account', legacyId, 'SIP username or URI required'));
      }
      if (row.password || row.secret) {
        warnings.push(this.issue('warning', 'SIP_SECRET_IN_PAYLOAD', 'sip_account', legacyId, 'SIP secrets should not be exported — use vault mapping'));
      }
    }
  }

  private validateDevices(payload: MigrationPayload, errors: MigrationIssue[], warnings: MigrationIssue[]): void {
    for (const row of payload.data.device ?? []) {
      const legacyId = String(row.legacyId ?? row.id ?? '');
      const mac = String(row.mac ?? '').replace(/[^a-fA-F0-9]/g, '');
      if (mac.length !== 12) {
        errors.push(this.issue('error', 'DEVICE_MAC_INVALID', 'device', legacyId, 'Invalid device MAC'));
      }
    }
  }

  private validateQueues(payload: MigrationPayload, errors: MigrationIssue[], warnings: MigrationIssue[]): void {
    for (const row of payload.data.queue ?? []) {
      const legacyId = String(row.legacyId ?? row.id ?? '');
      if (!row.name) {
        errors.push(this.issue('error', 'QUEUE_NAME_REQUIRED', 'queue', legacyId, 'Queue name required'));
      }
      if (row.strategy && !['round_robin', 'longest_idle', 'ring_all'].includes(String(row.strategy))) {
        warnings.push(this.issue('warning', 'QUEUE_STRATEGY_UNSUPPORTED', 'queue', legacyId, 'Queue strategy may need manual mapping'));
      }
    }
  }

  private validateIvrs(payload: MigrationPayload, errors: MigrationIssue[], warnings: MigrationIssue[]): void {
    for (const row of payload.data.ivr ?? []) {
      const legacyId = String(row.legacyId ?? row.id ?? '');
      if (!row.name) {
        errors.push(this.issue('error', 'IVR_NAME_REQUIRED', 'ivr', legacyId, 'IVR name required'));
      }
      if (row.unsupported === true) {
        warnings.push(this.issue('warning', 'IVR_UNSUPPORTED', 'ivr', legacyId, 'IVR marked unsupported in legacy export'));
      }
    }
  }

  private validateRingGroups(payload: MigrationPayload, errors: MigrationIssue[], warnings: MigrationIssue[]): void {
    for (const row of payload.data.ring_group ?? []) {
      if (!row.members || !Array.isArray(row.members) || row.members.length === 0) {
        warnings.push(this.issue('warning', 'RING_GROUP_EMPTY', 'ring_group', String(row.legacyId ?? ''), 'Ring group has no members'));
      }
    }
  }

  private validateHuntGroups(payload: MigrationPayload, errors: MigrationIssue[], warnings: MigrationIssue[]): void {
    for (const row of payload.data.hunt_group ?? []) {
      if (row.strategy === 'unsupported') {
        warnings.push(this.issue('warning', 'HUNT_UNSUPPORTED', 'hunt_group', String(row.legacyId ?? ''), 'Unsupported hunt strategy'));
      }
    }
  }

  private validateFeatureCodes(payload: MigrationPayload, errors: MigrationIssue[], warnings: MigrationIssue[]): void {
    const seen = new Set<string>();
    for (const row of payload.data.feature_code ?? []) {
      const code = String(row.code ?? '').trim();
      const legacyId = String(row.legacyId ?? code);
      if (!code) {
        errors.push(this.issue('error', 'FEATURE_CODE_REQUIRED', 'feature_code', legacyId, 'Feature code required'));
      }
      if (seen.has(code)) {
        errors.push(this.issue('error', 'FEATURE_CODE_DUPLICATE', 'feature_code', legacyId, `Duplicate feature code ${code}`));
      }
      seen.add(code);
    }
  }

  private validateProvisioningProfiles(payload: MigrationPayload, errors: MigrationIssue[], warnings: MigrationIssue[]): void {
    for (const row of payload.data.provisioning_profile ?? []) {
      const legacyId = String(row.legacyId ?? row.id ?? '');
      if (!row.template && !row.model) {
        warnings.push(this.issue('warning', 'PROV_PROFILE_INCOMPLETE', 'provisioning_profile', legacyId, 'Provisioning profile missing template/model'));
      }
    }
  }

  private detectDuplicates(payload: MigrationPayload, errors: MigrationIssue[], _warnings: MigrationIssue[]): void {
    const legacyIds = new Map<MigrationEntityType, Set<string>>();
    for (const [type, rows] of Object.entries(payload.data)) {
      if (!rows) continue;
      const set = legacyIds.get(type as MigrationEntityType) ?? new Set<string>();
      for (const row of rows) {
        const id = String(row.legacyId ?? row.id ?? '');
        if (!id) continue;
        if (set.has(id)) {
          errors.push(this.issue('error', 'DUPLICATE_LEGACY_ID', type as MigrationEntityType, id, `Duplicate legacyId ${id}`));
        }
        set.add(id);
      }
      legacyIds.set(type as MigrationEntityType, set);
    }
  }

  private detectOrphans(payload: MigrationPayload, errors: MigrationIssue[], warnings: MigrationIssue[]): void {
    const extensionIds = new Set((payload.data.extension ?? []).map((r) => String(r.legacyId ?? r.id ?? '')));
    for (const row of payload.data.user ?? []) {
      const extRef = String(row.extensionLegacyId ?? '');
      if (extRef && extensionIds.size > 0 && !extensionIds.has(extRef)) {
        warnings.push(this.issue('warning', 'USER_EXTENSION_ORPHAN', 'user', String(row.legacyId ?? ''), 'User references missing extension'));
      }
    }
    if ((payload.data.did ?? []).length > 0 && extensionIds.size === 0) {
      warnings.push(this.issue('warning', 'DID_WITHOUT_EXTENSIONS', 'did', undefined, 'DIDs present but no extensions in batch'));
    }
  }

  private legacyTenantIds(payload: MigrationPayload): Set<string> {
    return new Set((payload.data.tenant ?? []).map((t) => String(t.legacyId ?? t.id ?? '')));
  }

  private hasExtension(payload: MigrationPayload, legacyId: string): boolean {
    return (payload.data.extension ?? []).some((e) => String(e.legacyId ?? e.id ?? '') === legacyId);
  }

  private issue(
    severity: 'error' | 'warning',
    code: string,
    entityType: MigrationEntityType,
    entityId: string | undefined,
    message: string,
  ): MigrationIssue {
    return { severity, code, entityType, entityId, message };
  }
}

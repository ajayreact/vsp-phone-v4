import { Injectable } from '@nestjs/common';
import type { MigrationPayload } from '../types/migration.types';

/** Phase 19 — structured export of migration-ready records (non-secret). */
@Injectable()
export class MigrationExportService {
  exportTemplate(): MigrationPayload {
    return {
      batchLabel: 'legacy-export-template',
      dryRun: true,
      mappings: {
        tenants: {},
        extensions: {},
        dids: {},
        devices: {},
        featureCodes: {},
      },
      data: {
        tenant: [{ legacyId: 'legacy-tenant-1', name: 'Example Tenant', platformUuid: '' }],
        user: [{ legacyId: 'legacy-user-1', email: 'user@example.com', tenantLegacyId: 'legacy-tenant-1' }],
        extension: [{ legacyId: 'legacy-ext-1001', extension: '1001', tenantLegacyId: 'legacy-tenant-1' }],
        did: [{ legacyId: 'legacy-did-1', e164: '+15551234567', extensionLegacyId: 'legacy-ext-1001' }],
        sip_account: [{ legacyId: 'legacy-sip-1', username: '1001', sipUri: 'sip:1001@vsp.internal' }],
        device: [{ legacyId: 'legacy-device-1', mac: '001565000001', model: 'GRP2612' }],
        queue: [{ legacyId: 'legacy-queue-1', name: 'Support', strategy: 'round_robin' }],
        ivr: [{ legacyId: 'legacy-ivr-1', name: 'Main IVR' }],
        ring_group: [{ legacyId: 'legacy-rg-1', name: 'Sales', members: ['1001', '1002'] }],
        hunt_group: [{ legacyId: 'legacy-hg-1', name: 'Support Hunt', strategy: 'longest_idle' }],
        feature_code: [{ legacyId: 'legacy-fc-park', code: '*70', action: 'park' }],
        provisioning_profile: [{ legacyId: 'legacy-prov-1', model: 'GRP2612', template: 'grandstream-default' }],
      },
    };
  }

  sanitizeForExport(payload: MigrationPayload): MigrationPayload {
    const data: MigrationPayload['data'] = {};
    for (const [key, rows] of Object.entries(payload.data)) {
      if (!rows) continue;
      data[key as keyof MigrationPayload['data']] = rows.map((row) => {
        const copy = { ...row };
        delete copy.password;
        delete copy.secret;
        delete copy.sipPassword;
        return copy;
      });
    }
    return { ...payload, data };
  }
}

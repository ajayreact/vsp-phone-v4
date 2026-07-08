import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { MigrationMappings, MigrationPayload } from '../types/migration.types';

/** Phase 19 — legacy → platform UUID mapping engine with review reports. */
@Injectable()
export class MappingEngineService {
  buildReport(payload: MigrationPayload): Record<string, unknown> {
    const mappings: MigrationMappings = payload.mappings ?? {};
    const generated = {
      tenants: this.mapTenants(payload, mappings.tenants ?? {}),
      extensions: this.mapSimple(payload.data.extension ?? [], mappings.extensions ?? {}, 'extension'),
      dids: this.mapSimple(payload.data.did ?? [], mappings.dids ?? {}, 'did'),
      devices: this.mapSimple(payload.data.device ?? [], mappings.devices ?? {}, 'device'),
      featureCodes: this.mapSimple(payload.data.feature_code ?? [], mappings.featureCodes ?? {}, 'feature_code'),
    };

    const unmapped = {
      tenants: (payload.data.tenant ?? []).filter(
        (t) => !generated.tenants[String(t.legacyId ?? t.id ?? '')],
      ).length,
      extensions: (payload.data.extension ?? []).length - Object.keys(generated.extensions).length,
    };

    return {
      ts: new Date().toISOString(),
      providedMappings: mappings,
      generatedMappings: generated,
      unmappedCounts: unmapped,
      reviewRequired: unmapped.tenants > 0 || unmapped.extensions > 0,
    };
  }

  resolveTenantUuid(legacyId: string, payload: MigrationPayload): string {
    const explicit = payload.mappings?.tenants?.[legacyId];
    if (explicit) return explicit;
    const row = (payload.data.tenant ?? []).find((t) => String(t.legacyId ?? t.id) === legacyId);
    if (row?.platformUuid && typeof row.platformUuid === 'string') return row.platformUuid;
    return randomUUID();
  }

  private mapTenants(payload: MigrationPayload, provided: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = { ...provided };
    for (const row of payload.data.tenant ?? []) {
      const legacyId = String(row.legacyId ?? row.id ?? '');
      if (!legacyId || out[legacyId]) continue;
      out[legacyId] =
        typeof row.platformUuid === 'string' ? row.platformUuid : randomUUID();
    }
    return out;
  }

  private mapSimple(
    rows: Record<string, unknown>[],
    provided: Record<string, string>,
    _type: string,
  ): Record<string, string> {
    const out: Record<string, string> = { ...provided };
    for (const row of rows) {
      const legacyId = String(row.legacyId ?? row.id ?? '');
      if (!legacyId || out[legacyId]) continue;
      out[legacyId] = randomUUID();
    }
    return out;
  }
}

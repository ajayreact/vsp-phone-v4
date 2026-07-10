import { randomUUID } from 'node:crypto';

export function newPublicId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function tenantScope(tenantId: string) {
  return { tenantId, deletedAt: null };
}

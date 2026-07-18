/** Confirmation phrase builders / validators for tenant lifecycle operations. */

export type LifecycleOp = 'reset_pbx' | 'reset_tenant' | 'delete';

/** @deprecated Use reset_tenant */
export type LegacyLifecycleOp = LifecycleOp | 'factory_reset';

export function expectedConfirmPhrase(op: LifecycleOp | 'factory_reset', tenantDisplayName: string): string {
  const name = tenantDisplayName.trim();
  switch (op) {
    case 'reset_pbx':
      return `RESET PBX ${name}`;
    case 'reset_tenant':
    case 'factory_reset':
      return `RESET ${name}`;
    case 'delete':
      return `DELETE ${name}`;
  }
}

export function assertConfirmPhrase(
  op: LifecycleOp | 'factory_reset',
  tenantDisplayName: string,
  provided: string | undefined,
): void {
  const expected = expectedConfirmPhrase(op, tenantDisplayName);
  if ((provided ?? '').trim() !== expected) {
    throw new Error(`Confirmation phrase mismatch. Type exactly: ${expected}`);
  }
}

export const PROTECTED_TENANT_SLUGS = new Set([
  'platform',
  'inventory',
  'platform-inventory',
  'vsp-internal',
]);

export function isProtectedTenantSlug(slug: string): boolean {
  return PROTECTED_TENANT_SLUGS.has(slug.trim().toLowerCase());
}

/** Enterprise RBAC permission keys — mirrors API permissions.constants.ts */
export const PERMISSIONS = {
  // Legacy keys (backward compatible)
  PLATFORM_SUPER_ADMIN: 'platform:super_admin',
  TENANT_ADMIN: 'tenant:admin',
  TENANT_USER: 'tenant:user',
  PROVISIONING_ADMIN: 'provisioning:admin',
  RECORDINGS_READ: 'recordings:read',
  PRESENCE_READ: 'presence:read',
  PRESENCE_WRITE: 'presence:write',
  TELECOM_SERVICE: 'telecom:service',

  // Platform plane
  PLATFORM_DASHBOARD_READ: 'platform:dashboard:read',
  PLATFORM_TENANTS_READ: 'platform:tenants:read',
  PLATFORM_TENANTS_WRITE: 'platform:tenants:write',
  PLATFORM_TENANTS_SUSPEND: 'platform:tenants:suspend',
  PLATFORM_TENANTS_DELETE: 'platform.tenants.delete',
  PLATFORM_TENANTS_RESET: 'platform.tenants.reset',
  PLATFORM_DEVTOOLS: 'platform.devtools',
  PLATFORM_BILLING_READ: 'platform:billing:read',
  PLATFORM_BILLING_WRITE: 'platform:billing:write',
  PLATFORM_CARRIERS_READ: 'platform:carriers:read',
  PLATFORM_CARRIERS_WRITE: 'platform:carriers:write',
  PLATFORM_TELNYX_READ: 'platform:telnyx:read',
  PLATFORM_TELNYX_WRITE: 'platform:telnyx:write',
  PLATFORM_AUDIT_READ: 'platform:audit:read',
  PLATFORM_SETTINGS_READ: 'platform:settings:read',
  PLATFORM_SETTINGS_WRITE: 'platform:settings:write',
  PLATFORM_ROLES_READ: 'platform:roles:read',
  PLATFORM_ROLES_WRITE: 'platform:roles:write',
  PLATFORM_API_KEYS_READ: 'platform:api_keys:read',
  PLATFORM_API_KEYS_WRITE: 'platform:api_keys:write',

  // Ops plane
  OPS_DASHBOARD_READ: 'ops:dashboard:read',
  OPS_LIVE_CALLS_READ: 'ops:live_calls:read',
  OPS_LIVE_CALLS_SUPERVISE: 'ops:live_calls:supervise',
  OPS_HEALTH_READ: 'ops:health:read',
  OPS_INFRA_READ: 'ops:infra:read',
  OPS_TRACE_READ: 'ops:trace:read',
  OPS_FRAUD_READ: 'ops:fraud:read',
  OPS_ALERTS_READ: 'ops:alerts:read',
  OPS_ALERTS_WRITE: 'ops:alerts:write',

  // Supervisor / contact center
  SUPERVISOR_DASHBOARD_READ: 'supervisor:dashboard:read',
  SUPERVISOR_AGENTS_READ: 'supervisor:agents:read',
  SUPERVISOR_AGENTS_WRITE: 'supervisor:agents:write',
  SUPERVISOR_QUEUES_READ: 'supervisor:queues:read',
  SUPERVISOR_QUEUES_WRITE: 'supervisor:queues:write',
  SUPERVISOR_CALLS_READ: 'supervisor:calls:read',
  SUPERVISOR_CALLS_SUPERVISE: 'supervisor:calls:supervise',
  SUPERVISOR_RECORDINGS_READ: 'supervisor:recordings:read',
  SUPERVISOR_RECORDINGS_WRITE: 'supervisor:recordings:write',
  SUPERVISOR_REPORTS_READ: 'supervisor:reports:read',
  SUPERVISOR_WALLBOARD_READ: 'supervisor:wallboard:read',

  // Tenant plane
  TENANT_DASHBOARD_READ: 'tenant:dashboard:read',
  TENANT_USERS_READ: 'tenant:users:read',
  TENANT_USERS_MANAGE: 'tenant.users.manage',
  TENANT_EXTENSIONS_READ: 'tenant:extensions:read',
  TENANT_EXTENSIONS_MANAGE: 'tenant.extensions.manage',
  TENANT_DEVICES_READ: 'tenant:devices:read',
  TENANT_DEVICES_WRITE: 'tenant:devices:write',
  TENANT_DIDS_READ: 'tenant:dids:read',
  TENANT_DIDS_WRITE: 'tenant:dids:write',
  TENANT_ROUTING_READ: 'tenant:routing:read',
  TENANT_ROUTING_WRITE: 'tenant:routing:write',
  TENANT_QUEUES_READ: 'tenant:queues:read',
  TENANT_QUEUES_WRITE: 'tenant:queues:write',
  TENANT_IVR_READ: 'tenant:ivr:read',
  TENANT_IVR_WRITE: 'tenant:ivr:write',
  TENANT_VOICEMAIL_READ: 'tenant:voicemail:read',
  TENANT_VOICEMAIL_WRITE: 'tenant:voicemail:write',
  TENANT_CONFERENCES_READ: 'tenant:conferences:read',
  TENANT_CONFERENCES_WRITE: 'tenant:conferences:write',
  TENANT_RECORDINGS_WRITE: 'tenant:recordings:write',
  TENANT_RECORDING_POLICIES_READ: 'tenant:recording_policies:read',
  TENANT_RECORDING_POLICIES_WRITE: 'tenant:recording_policies:write',
  TENANT_CONTACTS_READ: 'tenant:contacts:read',
  TENANT_CONTACTS_WRITE: 'tenant:contacts:write',
  TENANT_RECEPTION_READ: 'tenant:reception:read',
  TENANT_RECEPTION_WRITE: 'tenant:reception:write',
  TENANT_BLF_READ: 'tenant:blf:read',
  TENANT_BLF_WRITE: 'tenant:blf:write',
  TENANT_PAGING_READ: 'tenant:paging:read',
  TENANT_PAGING_WRITE: 'tenant:paging:write',
  TENANT_CDR_READ: 'tenant:cdr:read',
  TENANT_REPORTS_READ: 'tenant:reports:read',
  TENANT_SETTINGS_READ: 'tenant:settings:read',
  TENANT_SETTINGS_WRITE: 'tenant:settings:write',
  TENANT_NUMBERS_REQUEST: 'tenant:numbers:request',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export function hasPermission(
  userPermissions: string[],
  required: string | string[],
): boolean {
  const requiredList = Array.isArray(required) ? required : [required];
  const isSuperAdmin = userPermissions.includes(PERMISSIONS.PLATFORM_SUPER_ADMIN);

  // Super admin only auto-grants platform/ops permissions — never tenant plane by default.
  // Impersonation sessions receive explicit tenant permissions from /me.
  if (isSuperAdmin) {
    const allPlatformOrOps = requiredList.every(
      (p) =>
        p === PERMISSIONS.PLATFORM_SUPER_ADMIN ||
        p.startsWith('platform:') ||
        p.startsWith('platform.') ||
        p.startsWith('ops:') ||
        p.startsWith('ops.'),
    );
    if (allPlatformOrOps) return true;
  }

  return requiredList.some((p) => userPermissions.includes(p));
}

export function displayNameFromSession(
  email: string,
  profile?: { displayName: string; firstName: string; lastName: string } | null,
): string {
  if (profile?.displayName) return profile.displayName;
  if (profile?.firstName) return `${profile.firstName} ${profile.lastName}`.trim();
  return email.split('@')[0] ?? email;
}

const PROTECTED_TENANT_SLUGS = new Set(['platform', 'inventory', 'platform-inventory', 'vsp-internal']);

export function isProtectedTenantSlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return PROTECTED_TENANT_SLUGS.has(slug.trim().toLowerCase());
}

/** Platform operators (not tenant-only admins) who may run lifecycle actions. */
export function isPlatformAdministrator(
  session: { impersonatorUserId?: string | null; portal?: string; roles?: { name: string }[] } | null,
  permissions: string[],
): boolean {
  if (!session) return false;
  if (session.portal === 'platform') return true;
  if (session.impersonatorUserId) return true;
  if (hasPermission(permissions, PERMISSIONS.PLATFORM_SUPER_ADMIN)) return true;
  if (
    hasPermission(permissions, [
      PERMISSIONS.PLATFORM_TENANTS_RESET,
      PERMISSIONS.PLATFORM_TENANTS_DELETE,
      PERMISSIONS.PLATFORM_TENANTS_WRITE,
    ])
  ) {
    return true;
  }
  return (session.roles ?? []).some((role) => /platform\s*(super\s*)?admin/i.test(role.name.trim()));
}

export function canPlatformResetPbx(permissions: string[]): boolean {
  return hasPermission(permissions, [
    PERMISSIONS.PLATFORM_TENANTS_RESET,
    PERMISSIONS.PLATFORM_TENANTS_WRITE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  ]);
}

export function canPlatformResetTenant(permissions: string[]): boolean {
  return hasPermission(permissions, [PERMISSIONS.PLATFORM_TENANTS_RESET, PERMISSIONS.PLATFORM_SUPER_ADMIN]);
}

export function canPlatformDeleteTenant(permissions: string[]): boolean {
  return hasPermission(permissions, [PERMISSIONS.PLATFORM_TENANTS_DELETE, PERMISSIONS.PLATFORM_SUPER_ADMIN]);
}

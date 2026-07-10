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
  PLATFORM_TENANTS_DELETE: 'platform:tenants:delete',
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
  TENANT_USERS_WRITE: 'tenant:users:write',
  TENANT_EXTENSIONS_READ: 'tenant:extensions:read',
  TENANT_EXTENSIONS_WRITE: 'tenant:extensions:write',
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
  if (userPermissions.includes(PERMISSIONS.PLATFORM_SUPER_ADMIN)) {
    return true;
  }
  const requiredList = Array.isArray(required) ? required : [required];
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

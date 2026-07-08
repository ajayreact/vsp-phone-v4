/** Remediation — RBAC permission keys (frozen Prisma RolePermission). */
export const PERMISSIONS = {
  PLATFORM_SUPER_ADMIN: 'platform:super_admin',
  TENANT_ADMIN: 'tenant:admin',
  TENANT_USER: 'tenant:user',
  PROVISIONING_ADMIN: 'provisioning:admin',
  RECORDINGS_READ: 'recordings:read',
  PRESENCE_READ: 'presence:read',
  PRESENCE_WRITE: 'presence:write',
  TELECOM_SERVICE: 'telecom:service',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSIONS = {
  PLATFORM_SUPER_ADMIN: 'platform:super_admin',
  TENANT_ADMIN: 'tenant:admin',
  TENANT_USER: 'tenant:user',
  PROVISIONING_ADMIN: 'provisioning:admin',
  RECORDINGS_READ: 'recordings:read',
  PRESENCE_READ: 'presence:read',
  PRESENCE_WRITE: 'presence:write',
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

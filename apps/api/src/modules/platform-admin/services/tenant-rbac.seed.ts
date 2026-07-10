import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { newPublicId } from '../../tenant-portal/utils/tenant.util';

const DEFAULT_TENANT_PERMISSIONS = [
  PERMISSIONS.TENANT_ADMIN,
  PERMISSIONS.TENANT_USER,
  PERMISSIONS.PROVISIONING_ADMIN,
  PERMISSIONS.RECORDINGS_READ,
  PERMISSIONS.PRESENCE_READ,
  PERMISSIONS.PRESENCE_WRITE,
  PERMISSIONS.TENANT_DASHBOARD_READ,
  PERMISSIONS.TENANT_USERS_READ,
  PERMISSIONS.TENANT_USERS_WRITE,
  PERMISSIONS.TENANT_EXTENSIONS_READ,
  PERMISSIONS.TENANT_EXTENSIONS_WRITE,
  PERMISSIONS.TENANT_DEVICES_READ,
  PERMISSIONS.TENANT_DEVICES_WRITE,
  PERMISSIONS.TENANT_DIDS_READ,
  PERMISSIONS.TENANT_QUEUES_READ,
  PERMISSIONS.TENANT_QUEUES_WRITE,
  PERMISSIONS.TENANT_IVR_READ,
  PERMISSIONS.TENANT_IVR_WRITE,
  PERMISSIONS.TENANT_VOICEMAIL_READ,
  PERMISSIONS.TENANT_VOICEMAIL_WRITE,
  PERMISSIONS.TENANT_ROUTING_READ,
  PERMISSIONS.TENANT_ROUTING_WRITE,
  PERMISSIONS.TENANT_CDR_READ,
  PERMISSIONS.TENANT_REPORTS_READ,
  PERMISSIONS.TENANT_SETTINGS_READ,
  PERMISSIONS.TENANT_SETTINGS_WRITE,
  PERMISSIONS.TENANT_NUMBERS_REQUEST,
];

export async function seedTenantRbac(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>,
  tenantId: string,
  actorId?: string,
): Promise<{ adminRoleId: string }> {
  const permissionIds: string[] = [];

  for (const key of DEFAULT_TENANT_PERMISSIONS) {
    const permId = randomUUID();
    await tx.permission.create({
      data: {
        id: permId,
        publicId: newPublicId('perm'),
        tenantId,
        key,
        description: key,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    permissionIds.push(permId);
  }

  const adminRoleId = randomUUID();
  await tx.role.create({
    data: {
      id: adminRoleId,
      publicId: newPublicId('role'),
      tenantId,
      name: 'Tenant Admin',
      description: 'Full tenant administration',
      systemRole: true,
      createdBy: actorId,
      updatedBy: actorId,
    },
  });

  for (const permissionId of permissionIds) {
    await tx.rolePermission.create({
      data: {
        id: randomUUID(),
        tenantId,
        roleId: adminRoleId,
        permissionId,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
  }

  const userRoleId = randomUUID();
  await tx.role.create({
    data: {
      id: userRoleId,
      publicId: newPublicId('role'),
      tenantId,
      name: 'User',
      description: 'Standard tenant user',
      systemRole: true,
      createdBy: actorId,
      updatedBy: actorId,
    },
  });

  const userPerm = permissionIds.find((_, i) => DEFAULT_TENANT_PERMISSIONS[i] === PERMISSIONS.TENANT_USER);
  if (userPerm) {
    await tx.rolePermission.create({
      data: {
        id: randomUUID(),
        tenantId,
        roleId: userRoleId,
        permissionId: userPerm,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
  }

  return { adminRoleId };
}

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { newPublicId } from '../../tenant-portal/utils/tenant.util';

const SUPERVISOR_PERMISSION_KEYS = [
  PERMISSIONS.SUPERVISOR_DASHBOARD_READ,
  PERMISSIONS.SUPERVISOR_AGENTS_READ,
  PERMISSIONS.SUPERVISOR_AGENTS_WRITE,
  PERMISSIONS.SUPERVISOR_QUEUES_READ,
  PERMISSIONS.SUPERVISOR_QUEUES_WRITE,
  PERMISSIONS.SUPERVISOR_CALLS_READ,
  PERMISSIONS.SUPERVISOR_CALLS_SUPERVISE,
  PERMISSIONS.SUPERVISOR_RECORDINGS_READ,
  PERMISSIONS.SUPERVISOR_RECORDINGS_WRITE,
  PERMISSIONS.SUPERVISOR_REPORTS_READ,
  PERMISSIONS.SUPERVISOR_WALLBOARD_READ,
] as const;

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
  ...SUPERVISOR_PERMISSION_KEYS,
];

const ROLE_DEFINITIONS: Array<{ name: string; description: string; keys: string[] }> = [
  {
    name: 'Supervisor',
    description: 'Full contact center supervisor — monitor, coach, and control agents and queues',
    keys: [
      ...SUPERVISOR_PERMISSION_KEYS,
      PERMISSIONS.TENANT_QUEUES_READ,
      PERMISSIONS.RECORDINGS_READ,
      PERMISSIONS.TENANT_REPORTS_READ,
    ],
  },
  {
    name: 'Queue Supervisor',
    description: 'Queue-focused supervisor with call supervision',
    keys: [
      PERMISSIONS.SUPERVISOR_DASHBOARD_READ,
      PERMISSIONS.SUPERVISOR_WALLBOARD_READ,
      PERMISSIONS.SUPERVISOR_QUEUES_READ,
      PERMISSIONS.SUPERVISOR_QUEUES_WRITE,
      PERMISSIONS.SUPERVISOR_AGENTS_READ,
      PERMISSIONS.SUPERVISOR_CALLS_READ,
      PERMISSIONS.SUPERVISOR_CALLS_SUPERVISE,
    ],
  },
  {
    name: 'Manager',
    description: 'Read-only management view of contact center KPIs and reports',
    keys: [
      PERMISSIONS.SUPERVISOR_DASHBOARD_READ,
      PERMISSIONS.SUPERVISOR_WALLBOARD_READ,
      PERMISSIONS.SUPERVISOR_AGENTS_READ,
      PERMISSIONS.SUPERVISOR_QUEUES_READ,
      PERMISSIONS.SUPERVISOR_CALLS_READ,
      PERMISSIONS.SUPERVISOR_RECORDINGS_READ,
      PERMISSIONS.SUPERVISOR_REPORTS_READ,
      PERMISSIONS.TENANT_REPORTS_READ,
    ],
  },
  {
    name: 'Read Only',
    description: 'View supervisor dashboards without control actions',
    keys: [
      PERMISSIONS.SUPERVISOR_DASHBOARD_READ,
      PERMISSIONS.SUPERVISOR_WALLBOARD_READ,
      PERMISSIONS.SUPERVISOR_AGENTS_READ,
      PERMISSIONS.SUPERVISOR_QUEUES_READ,
      PERMISSIONS.SUPERVISOR_CALLS_READ,
      PERMISSIONS.SUPERVISOR_RECORDINGS_READ,
      PERMISSIONS.SUPERVISOR_REPORTS_READ,
    ],
  },
  {
    name: 'Operations',
    description: 'Operations center role with supervisor monitoring and emergency controls',
    keys: [
      PERMISSIONS.SUPERVISOR_DASHBOARD_READ,
      PERMISSIONS.SUPERVISOR_WALLBOARD_READ,
      PERMISSIONS.SUPERVISOR_AGENTS_READ,
      PERMISSIONS.SUPERVISOR_AGENTS_WRITE,
      PERMISSIONS.SUPERVISOR_QUEUES_READ,
      PERMISSIONS.SUPERVISOR_QUEUES_WRITE,
      PERMISSIONS.SUPERVISOR_CALLS_READ,
      PERMISSIONS.SUPERVISOR_CALLS_SUPERVISE,
      PERMISSIONS.SUPERVISOR_REPORTS_READ,
    ],
  },
];

async function createRole(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>,
  tenantId: string,
  actorId: string | undefined,
  name: string,
  description: string,
  keys: string[],
  keyToId: Map<string, string>,
): Promise<string> {
  const roleId = randomUUID();
  await tx.role.create({
    data: {
      id: roleId,
      publicId: newPublicId('role'),
      tenantId,
      name,
      description,
      systemRole: true,
      createdBy: actorId,
      updatedBy: actorId,
    },
  });

  for (const key of keys) {
    const permissionId = keyToId.get(key);
    if (!permissionId) continue;
    await tx.rolePermission.create({
      data: {
        id: randomUUID(),
        tenantId,
        roleId,
        permissionId,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
  }

  return roleId;
}

export async function seedTenantRbac(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>,
  tenantId: string,
  actorId?: string,
): Promise<{ adminRoleId: string }> {
  const keyToId = new Map<string, string>();

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
    keyToId.set(key, permId);
  }

  const adminRoleId = await createRole(
    tx,
    tenantId,
    actorId,
    'Tenant Admin',
    'Full tenant administration',
    DEFAULT_TENANT_PERMISSIONS,
    keyToId,
  );

  await createRole(tx, tenantId, actorId, 'User', 'Standard tenant user', [PERMISSIONS.TENANT_USER], keyToId);

  for (const role of ROLE_DEFINITIONS) {
    await createRole(tx, tenantId, actorId, role.name, role.description, role.keys, keyToId);
  }

  return { adminRoleId };
}

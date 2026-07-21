import { LineStatus } from '@prisma/client';
import { extensionNeedsBusinessSetup } from './extension-auto-provision.util';

export type HubLifecycleScope = 'active' | 'archived' | 'all';

export type HubLifecycleRow = {
  archived: boolean;
  lineStatus: 'ACTIVE' | 'INACTIVE';
};

export type HubStatsRow = HubLifecycleRow & {
  did: { id: string } | null;
  dids?: Array<{ id: string }>;
  status: 'Registered' | 'Provisioned' | 'NoDevice' | 'RegistrationFailed' | 'Inactive' | 'Archived';
  onlineStatus: 'Online' | 'Offline';
  device: unknown | null;
  hasMobileApp: boolean;
  hasDeskPhone: boolean;
  extension: string;
  displayName: string;
  linkedUser: { id: string } | null;
};

export type ExtensionHubStatsComputed = {
  totalExtensions: number;
  assignedDids: number;
  registeredDevices: number;
  offlineDevices: number;
  onlineExtensions: number;
  unassignedExtensions: number;
  mobileApps: number;
  deskPhones: number;
};

export function parseHubLifecycleScope(raw?: string): HubLifecycleScope {
  if (raw === 'archived' || raw === 'all') return raw;
  return 'active';
}

export function matchesHubLifecycleRow(row: HubLifecycleRow, scope: HubLifecycleScope): boolean {
  if (scope === 'all') return true;
  if (scope === 'archived') return row.archived;
  return !row.archived && row.lineStatus !== 'INACTIVE';
}

export function filterHubRowsByLifecycle<T extends HubLifecycleRow>(rows: T[], scope: HubLifecycleScope): T[] {
  return rows.filter((row) => matchesHubLifecycleRow(row, scope));
}

/** Prisma where fragment for extension hub lifecycle scopes (merge with tenantScope). */
export function extensionLifecyclePrismaWhere(scope: HubLifecycleScope): Record<string, unknown> {
  if (scope === 'active') {
    return { archivedAt: null, line: { status: LineStatus.ACTIVE, deletedAt: null } };
  }
  if (scope === 'archived') {
    return { archivedAt: { not: null }, line: { deletedAt: null } };
  }
  return { line: { deletedAt: null } };
}

export function computeExtensionHubStats(rows: HubStatsRow[]): ExtensionHubStatsComputed {
  return {
    totalExtensions: rows.length,
    assignedDids: rows.filter((r) => (r.dids?.length ?? 0) > 0 || Boolean(r.did)).length,
    registeredDevices: rows.filter((r) => r.status === 'Registered').length,
    onlineExtensions: rows.filter((r) => r.onlineStatus === 'Online').length,
    offlineDevices: rows.filter((r) => r.onlineStatus === 'Offline').length,
    unassignedExtensions: rows.filter((r) =>
      extensionNeedsBusinessSetup({
        extension: r.extension,
        displayName: r.displayName,
        hasLinkedUser: Boolean(r.linkedUser),
        status: r.status,
      }),
    ).length,
    mobileApps: rows.filter((r) => r.hasMobileApp).length,
    deskPhones: rows.filter((r) => r.hasDeskPhone).length,
  };
}

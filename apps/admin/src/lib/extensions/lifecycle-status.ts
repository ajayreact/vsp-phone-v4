/**
 * Standardized Extension Workspace lifecycle — one canonical state per extension,
 * derived from existing hub/detail fields (no new backend enum). Keeps colors/labels
 * consistent across the hub table, overview header, and quick actions.
 */
export type LifecycleState =
  | 'NeedsSetup'
  | 'Ready'
  | 'Provisioning'
  | 'Registered'
  | 'Online'
  | 'Offline'
  | 'Disabled'
  | 'Archived';

export type LifecycleInput = {
  archived: boolean;
  disabled: boolean;
  hasDevice: boolean;
  /** Backend hub status: Registered | Provisioned | NoDevice | RegistrationFailed | Inactive | Archived */
  provisioningStatus: string;
  /** Online | Offline */
  registrationStatus: string;
  /** e.g. "Needs Setup" from extensionNeedsBusinessSetup */
  needsSetup?: boolean;
};

export function resolveLifecycleState(input: LifecycleInput): LifecycleState {
  if (input.archived) return 'Archived';
  if (input.disabled) return 'Disabled';
  if (!input.hasDevice) return 'NeedsSetup';
  if (input.needsSetup) return 'NeedsSetup';
  if (input.registrationStatus === 'Online') return 'Online';
  if (input.provisioningStatus === 'RegistrationFailed') return 'Offline';
  if (input.provisioningStatus === 'Registered') return 'Registered';
  if (input.provisioningStatus === 'Provisioned') return 'Provisioning';
  return 'Ready';
}

export const LIFECYCLE_LABELS: Record<LifecycleState, string> = {
  NeedsSetup: 'Needs Setup',
  Ready: 'Ready',
  Provisioning: 'Provisioning',
  Registered: 'Registered',
  Online: 'Online',
  Offline: 'Offline',
  Disabled: 'Disabled',
  Archived: 'Archived',
};

export const LIFECYCLE_EMOJI: Record<LifecycleState, string> = {
  NeedsSetup: '🟡',
  Ready: '🔵',
  Provisioning: '🟡',
  Registered: '🟢',
  Online: '🟢',
  Offline: '🔴',
  Disabled: '⚪',
  Archived: '📦',
};

export const LIFECYCLE_TONE_CLASSES: Record<LifecycleState, { bg: string; text: string }> = {
  NeedsSetup: { bg: 'bg-amber-500/10 ring-amber-500/20', text: 'text-amber-700 dark:text-amber-400' },
  Ready: { bg: 'bg-sky-500/10 ring-sky-500/20', text: 'text-sky-700 dark:text-sky-400' },
  Provisioning: { bg: 'bg-amber-500/10 ring-amber-500/20', text: 'text-amber-700 dark:text-amber-400' },
  Registered: { bg: 'bg-emerald-500/10 ring-emerald-500/20', text: 'text-emerald-700 dark:text-emerald-400' },
  Online: { bg: 'bg-emerald-500/10 ring-emerald-500/20', text: 'text-emerald-700 dark:text-emerald-400' },
  Offline: { bg: 'bg-red-500/10 ring-red-500/20', text: 'text-red-700 dark:text-red-400' },
  Disabled: { bg: 'bg-muted ring-border', text: 'text-muted-foreground' },
  Archived: { bg: 'bg-slate-500/10 ring-slate-500/20', text: 'text-slate-600 dark:text-slate-400' },
};

/** Convenience wrapper from an ExtensionHubRow-shaped object. */
export function lifecycleFromHubRow(row: {
  archived?: boolean;
  lineStatus?: 'ACTIVE' | 'INACTIVE';
  device?: unknown;
  status: string;
  onlineStatus: 'Online' | 'Offline';
  statusLabel: string;
}): LifecycleState {
  return resolveLifecycleState({
    archived: Boolean(row.archived),
    disabled: row.lineStatus === 'INACTIVE',
    hasDevice: Boolean(row.device),
    provisioningStatus: row.status,
    registrationStatus: row.onlineStatus,
    needsSetup: row.statusLabel === 'Needs Setup',
  });
}

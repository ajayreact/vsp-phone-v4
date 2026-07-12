'use client';

import type { ExtensionHubStatus } from '../../../lib/hooks/queries/use-extension-hub';
import { cn } from '../../../lib/utils/cn';

export type RegistrationDisplay = {
  emoji: string;
  label: string;
  tone: 'online' | 'registering' | 'offline' | 'none';
};

export function resolveRegistrationDisplay(
  status: ExtensionHubStatus,
  onlineStatus: 'Online' | 'Offline',
): RegistrationDisplay {
  if (status === 'NoDevice') {
    return { emoji: '⚪', label: 'No Device', tone: 'none' };
  }
  if (status === 'Provisioned') {
    return { emoji: '🟡', label: 'Registering', tone: 'registering' };
  }
  if (status === 'RegistrationFailed') {
    return { emoji: '🔴', label: 'Offline', tone: 'offline' };
  }
  if (onlineStatus === 'Online') {
    return { emoji: '🟢', label: 'Online', tone: 'online' };
  }
  return { emoji: '🔴', label: 'Offline', tone: 'offline' };
}

const TONE_STYLES: Record<RegistrationDisplay['tone'], { bg: string; text: string }> = {
  online: {
    bg: 'bg-emerald-500/10 ring-emerald-500/20',
    text: 'text-emerald-700 dark:text-emerald-400',
  },
  registering: {
    bg: 'bg-amber-500/10 ring-amber-500/20',
    text: 'text-amber-700 dark:text-amber-400',
  },
  offline: {
    bg: 'bg-red-500/10 ring-red-500/20',
    text: 'text-red-700 dark:text-red-400',
  },
  none: {
    bg: 'bg-muted ring-border',
    text: 'text-muted-foreground',
  },
};

export function ExtensionStatusChip({
  status,
  onlineStatus,
}: {
  status: ExtensionHubStatus;
  onlineStatus: 'Online' | 'Offline';
}) {
  const display = resolveRegistrationDisplay(status, onlineStatus);
  const style = TONE_STYLES[display.tone];

  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        style.bg,
        style.text,
      )}
      title={`Registration: ${display.label}`}
    >
      <span aria-hidden="true">{display.emoji}</span>
      <span>{display.label}</span>
    </span>
  );
}

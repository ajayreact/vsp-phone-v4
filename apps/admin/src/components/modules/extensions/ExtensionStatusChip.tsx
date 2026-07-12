'use client';

import type { ExtensionHubStatus } from '../../../lib/hooks/queries/use-extension-hub';
import { cn } from '../../../lib/utils/cn';

const STATUS_STYLES: Record<
  ExtensionHubStatus,
  { dot: string; bg: string; text: string }
> = {
  Registered: {
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-500/10 ring-emerald-500/20',
    text: 'text-emerald-700 dark:text-emerald-400',
  },
  Provisioned: {
    dot: 'bg-amber-500',
    bg: 'bg-amber-500/10 ring-amber-500/20',
    text: 'text-amber-700 dark:text-amber-400',
  },
  NoDevice: {
    dot: 'bg-zinc-400',
    bg: 'bg-muted ring-border',
    text: 'text-muted-foreground',
  },
  RegistrationFailed: {
    dot: 'bg-red-500',
    bg: 'bg-red-500/10 ring-red-500/20',
    text: 'text-red-700 dark:text-red-400',
  },
};

export function ExtensionStatusChip({
  status,
  label,
  registrationLabel,
  onlineStatus,
}: {
  status: ExtensionHubStatus;
  label: string;
  registrationLabel?: string;
  onlineStatus?: 'Online' | 'Offline';
}) {
  const style = STATUS_STYLES[status];
  return (
    <div className="flex flex-col gap-1">
      <span
        className={cn(
          'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
          style.bg,
          style.text,
        )}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
        {label}
      </span>
      {registrationLabel ? (
        <span className="text-[11px] text-muted-foreground">{registrationLabel}</span>
      ) : null}
      {onlineStatus ? (
        <span className="text-[11px] font-medium text-muted-foreground">{onlineStatus}</span>
      ) : null}
    </div>
  );
}

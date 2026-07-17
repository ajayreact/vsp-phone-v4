'use client';

import type { ReactNode } from 'react';
import type { ExtensionHubRow } from '../../../lib/hooks/queries/use-extension-hub';
import {
  LIFECYCLE_EMOJI,
  LIFECYCLE_LABELS,
  LIFECYCLE_TONE_CLASSES,
  lifecycleFromHubRow,
} from '../../../lib/extensions/lifecycle-status';
import { cn } from '../../../lib/utils/cn';

function LifecycleBadge({ row }: { row: ExtensionHubRow }) {
  const state = lifecycleFromHubRow(row);
  const tone = LIFECYCLE_TONE_CLASSES[state];
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        tone.bg,
        tone.text,
      )}
      title={`Extension status: ${LIFECYCLE_LABELS[state]}`}
    >
      <span aria-hidden="true">{LIFECYCLE_EMOJI[state]}</span>
      <span>{LIFECYCLE_LABELS[state]}</span>
    </span>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 truncate text-sm text-foreground', mono && 'font-mono')} title={value}>
        {value}
      </dd>
    </div>
  );
}

/** Sticky summary panel — stays visible across every Configure tab (the Extension Workspace's single source of truth). */
export function ExtensionOverviewHeader({
  row,
  actions,
}: {
  row: ExtensionHubRow;
  actions?: ReactNode;
}) {
  const userLabel = row.linkedUser?.displayName || row.linkedUser?.email || 'Unassigned';
  const deviceLabel = row.device?.deviceLabel || row.device?.name || 'No device';
  const lastRegistration = row.lastRegistrationAt
    ? new Date(row.lastRegistrationAt).toLocaleString()
    : 'Never';
  const created = row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—';

  return (
    <div className="sticky top-0 z-10 mb-4 rounded-xl border border-border bg-card/95 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <LifecycleBadge row={row} />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-foreground">{row.displayName}</p>
            <p className="font-mono text-xs text-muted-foreground">Ext. {row.extension}</p>
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-xs sm:grid-cols-4">
        <Stat label="User" value={userLabel} />
        <Stat label="Primary DID" value={row.did?.formatted ?? 'Unassigned'} mono />
        <Stat label="Registration Status" value={row.registrationLabel} />
        <Stat label="Device Status" value={deviceLabel} />
        <Stat label="Provision Status" value={row.provisionLabel} />
        <Stat label="Last Registration" value={lastRegistration} />
        <Stat label="Created" value={created} />
      </dl>
    </div>
  );
}

'use client';

import {
  Archive,
  KeyRound,
  Phone,
  PhoneIncoming,
  Plus,
  Settings,
  Voicemail,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { ActivityEvent } from '../../../lib/hooks/queries/use-extension-activity';
import { Skeleton } from '../../ui/Skeleton';

function iconFor(action: string): ReactNode {
  if (action.startsWith('pbx.extension.create') || action.startsWith('pbx.extension.auto_provision') || action.startsWith('pbx.extension.full_auto_provision')) {
    return <Plus className="h-3.5 w-3.5" />;
  }
  if (action.startsWith('pbx.extension.archive') || action.startsWith('pbx.extension.unarchive')) {
    return <Archive className="h-3.5 w-3.5" />;
  }
  if (action.startsWith('pbx.did.') || action.startsWith('pbx.extension.did_')) {
    return <PhoneIncoming className="h-3.5 w-3.5" />;
  }
  if (action.startsWith('pbx.sip.')) {
    return <KeyRound className="h-3.5 w-3.5" />;
  }
  if (action.startsWith('pbx.voicemail.')) {
    return <Voicemail className="h-3.5 w-3.5" />;
  }
  if (action === 'pbx.call.last') {
    return <Phone className="h-3.5 w-3.5" />;
  }
  return <Settings className="h-3.5 w-3.5" />;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Vertical timeline of extension lifecycle events, newest first — replaces raw activity log panels. */
export function ActivityTimeline({
  events,
  loading,
}: {
  events: ActivityEvent[] | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!events?.length) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No activity recorded yet for this extension.
      </div>
    );
  }

  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span className="absolute -left-[27px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
            {iconFor(event.action)}
          </span>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{event.label}</p>
            <span className="text-xs text-muted-foreground" title={new Date(event.at).toLocaleString()}>
              {relativeTime(event.at)}
            </span>
          </div>
          {event.detail ? <p className="mt-0.5 text-xs text-muted-foreground">{event.detail}</p> : null}
        </li>
      ))}
    </ol>
  );
}

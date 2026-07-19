'use client';

import { StatusBadge } from '../../ui/Badge';
import { cn } from '../../../lib/utils/cn';

export type NocStatItem = {
  label: string;
  value: string | number;
  tone?: 'online' | 'warning' | 'offline' | 'healthy' | 'error';
  hint?: string;
};

export function NocStatGrid({ items, className }: { items: NocStatItem[]; className?: string }) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4', className)}>
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
            {item.tone ? <StatusBadge status={item.tone} /> : null}
          </div>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{item.value}</p>
          {item.hint ? <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}

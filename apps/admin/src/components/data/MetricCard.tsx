import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils/cn';

export function MetricCard({
  label,
  value,
  change,
  changeType = 'neutral',
  icon: Icon,
  hint,
}: {
  label: string;
  value: string | number;
  change?: string;
  changeType?: 'up' | 'down' | 'neutral';
  icon?: LucideIcon;
  hint?: string;
}) {
  const changeColor =
    changeType === 'up' ? 'text-success' : changeType === 'down' ? 'text-destructive' : 'text-muted-foreground';

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-elevated)]">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
          {change ? <p className={cn('text-xs font-medium', changeColor)}>{change}</p> : null}
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {Icon ? (
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  trend,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  trend?: string;
}) {
  return (
    <MetricCard
      label={label}
      value={value}
      hint={hint}
      change={trend}
      icon={undefined}
    />
  );
}

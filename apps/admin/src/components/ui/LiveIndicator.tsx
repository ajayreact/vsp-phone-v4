import { cn } from '../../lib/utils/cn';

export function LiveIndicator({
  label = 'Live',
  status = 'online',
  className,
}: {
  label?: string;
  status?: 'online' | 'offline' | 'degraded';
  className?: string;
}) {
  const colors = {
    online: 'bg-success',
    offline: 'bg-muted-foreground',
    degraded: 'bg-warning',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground',
        className,
      )}
    >
      <span className="relative flex h-2 w-2">
        {status === 'online' ? (
          <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-40', colors[status])} />
        ) : null}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', colors[status])} />
      </span>
      {label}
    </span>
  );
}

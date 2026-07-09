import { cn } from '../../lib/utils/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
}

export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground',
        className,
      )}
    >
      {initials || '?'}
    </div>
  );
}

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card/90 text-card-foreground shadow-[var(--shadow-card)] backdrop-blur-sm',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  title,
  description,
  action,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn('flex items-start justify-between gap-4 border-b border-border px-6 py-5', className)}
      {...props}
    >
      <div className="space-y-1">
        {title ? <h3 className="text-base font-semibold tracking-tight">{title}</h3> : null}
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        {children}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 py-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('border-t border-border px-6 py-4 bg-muted/30 rounded-b-2xl', className)} {...props} />
  );
}

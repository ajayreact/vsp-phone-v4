import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-muted text-muted-foreground',
        primary: 'bg-accent text-accent-foreground',
        success: 'bg-success/10 text-success ring-1 ring-success/20',
        warning: 'bg-warning/10 text-warning ring-1 ring-warning/20',
        destructive: 'bg-destructive/10 text-destructive ring-1 ring-destructive/20',
        outline: 'border border-border text-muted-foreground bg-card',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function StatusBadge({
  status,
}: {
  status: 'active' | 'inactive' | 'pending' | 'online' | 'offline' | 'warning' | 'error' | 'healthy';
}) {
  const map = {
    active: { label: 'Active', variant: 'success' as const },
    online: { label: 'Online', variant: 'success' as const },
    healthy: { label: 'Healthy', variant: 'success' as const },
    inactive: { label: 'Inactive', variant: 'default' as const },
    offline: { label: 'Offline', variant: 'default' as const },
    pending: { label: 'Pending', variant: 'warning' as const },
    warning: { label: 'Warning', variant: 'warning' as const },
    error: { label: 'Error', variant: 'destructive' as const },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

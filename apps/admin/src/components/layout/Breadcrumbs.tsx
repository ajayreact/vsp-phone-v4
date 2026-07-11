'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { getModuleByHref } from '../../lib/navigation';
import { usePortal } from '../../lib/portal/PortalProvider';
import { cn } from '../../lib/utils/cn';

export function Breadcrumbs() {
  const pathname = usePathname();
  const portal = usePortal();
  const module = getModuleByHref(pathname, portal);
  const crumbs = module?.breadcrumb ?? ['Portal'];

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      <Link
        href="/dashboard"
        className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <Home className="h-3.5 w-3.5" />
        <span className="sr-only">Home</span>
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={`${crumb}-${i}`} className="flex items-center gap-1.5">
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
          <span
            className={cn(
              i === crumbs.length - 1
                ? 'font-medium text-foreground'
                : 'text-muted-foreground',
            )}
          >
            {crumb}
          </span>
        </span>
      ))}
    </nav>
  );
}

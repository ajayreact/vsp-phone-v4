'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { getModuleByHref } from '../../lib/navigation/config';
import { cn } from '../../lib/utils/cn';

export function Breadcrumbs() {
  const pathname = usePathname();
  const module = getModuleByHref(pathname);
  const crumbs = module?.breadcrumb ?? ['Portal'];

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
      <Link href="/dashboard" className="hover:text-foreground">
        Home
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={`${crumb}-${i}`} className="flex items-center gap-1">
          <ChevronRight className="h-4 w-4" />
          <span className={cn(i === crumbs.length - 1 && 'font-medium text-foreground')}>
            {crumb}
          </span>
        </span>
      ))}
    </nav>
  );
}

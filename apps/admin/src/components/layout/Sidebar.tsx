'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  NAV_GROUP_LABELS,
  filterNavByPermissions,
} from '../../lib/navigation/config';
import type { NavGroup } from '../../types/navigation';
import { cn } from '../../lib/utils/cn';
import { usePermissions } from '../../lib/auth/AuthProvider';

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const permissions = usePermissions();
  const items = filterNavByPermissions(permissions);

  const groups = items.reduce<Record<NavGroup, typeof items>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {} as Record<NavGroup, typeof items>);

  const orderedGroups = (Object.keys(NAV_GROUP_LABELS) as NavGroup[]).filter(
    (g) => groups[g]?.length,
  );

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className="flex h-14 items-center border-b border-sidebar-border px-3">
        {!collapsed ? (
          <div className="px-2">
            <p className="text-sm font-semibold">VSP Phone</p>
            <p className="text-xs text-muted-foreground">Admin Portal</p>
          </div>
        ) : (
          <div className="mx-auto text-sm font-bold text-primary">V</div>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {orderedGroups.map((group) => (
          <div key={group} className="mb-4">
            {!collapsed ? (
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {NAV_GROUP_LABELS[group]}
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {groups[group].map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                        active
                          ? 'bg-sidebar-accent font-medium text-accent-foreground'
                          : 'hover:bg-muted',
                        collapsed && 'justify-center px-2',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed ? <span>{item.label}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!collapsed ? <span>Collapse</span> : null}
        </button>
      </div>
    </aside>
  );
}

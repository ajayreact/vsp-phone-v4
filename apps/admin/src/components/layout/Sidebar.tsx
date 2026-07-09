'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, Phone } from 'lucide-react';
import { motion } from 'framer-motion';
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
        'flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200 ease-out',
        collapsed ? 'w-[72px]' : 'w-64',
      )}
    >
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Phone className="h-4 w-4" />
        </div>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">VSP Phone</p>
            <p className="truncate text-[11px] text-muted-foreground">Admin Console</p>
          </div>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {orderedGroups.map((group) => (
          <div key={group} className="mb-6">
            {!collapsed ? (
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {NAV_GROUP_LABELS[group]}
              </p>
            ) : (
              <div className="mb-2 h-px bg-border" />
            )}
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
                        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
                        active
                          ? 'bg-primary/10 text-primary'
                          : 'text-sidebar-fg hover:bg-sidebar-accent hover:text-foreground',
                        collapsed && 'justify-center px-2',
                      )}
                    >
                      {active ? (
                        <motion.span
                          layoutId="sidebar-active"
                          className="absolute inset-0 rounded-xl bg-primary/10"
                          transition={{ duration: 0.15 }}
                        />
                      ) : null}
                      <Icon className={cn('relative h-4 w-4 shrink-0', active && 'text-primary')} />
                      {!collapsed ? <span className="relative truncate">{item.label}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!collapsed ? <span>Collapse</span> : null}
        </button>
      </div>
    </aside>
  );
}

'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Radio } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  NAV_GROUP_LABELS,
  NAV_GROUP_ORDER,
  filterNavByPermissions,
} from '../../lib/navigation';
import { getPortalLabel } from '../../lib/portal/detect-portal';
import { usePortal } from '../../lib/portal/PortalProvider';
import type { NavGroup } from '../../types/navigation';
import { cn } from '../../lib/utils/cn';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { useOpsHealth } from '../../lib/hooks/queries/use-ops';
import { LiveIndicator } from '../ui/LiveIndicator';

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const permissions = usePermissions();
  const portal = usePortal();
  const items = filterNavByPermissions(permissions, portal);
  const health = useOpsHealth();
  const sidebarStatus =
    portal === 'ops' && health.data?.readiness
      ? health.data.readiness.ready
        ? { label: 'Platform online', status: 'online' as const }
        : { label: 'Platform degraded', status: 'degraded' as const }
      : { label: 'Session active', status: 'online' as const };

  const groups = items.reduce<Partial<Record<NavGroup, typeof items>>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group]!.push(item);
    return acc;
  }, {});

  const orderedGroups = NAV_GROUP_ORDER.filter((g) => groups[g]?.length);

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200 ease-out',
        collapsed ? 'w-[72px]' : 'w-64',
      )}
    >
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Radio className="h-4 w-4" />
        </div>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">VSP Phone</p>
            <p className="truncate text-[11px] text-muted-foreground">{getPortalLabel(portal)}</p>
          </div>
        ) : null}
      </div>

      {!collapsed ? (
        <div className="border-b border-sidebar-border px-4 py-3">
          <LiveIndicator label={sidebarStatus.label} status={sidebarStatus.status} className="w-full justify-center" />
        </div>
      ) : null}

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
              {groups[group]!.map((item) => {
                const Icon = item.icon;
                const tab = searchParams.get('tab');
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`) ||
                  (item.id === 'number-marketplace' && pathname === '/telnyx-numbers' && tab === 'search') ||
                  (item.id === 'telnyx-numbers' && pathname === '/telnyx-numbers' && tab !== 'search');
                const isPrimary = item.primary;
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
                        active
                          ? 'bg-primary/10 text-primary'
                          : isPrimary
                            ? 'text-primary hover:bg-primary/5'
                            : 'text-sidebar-fg hover:bg-sidebar-accent hover:text-foreground',
                        collapsed && 'justify-center px-2',
                        isPrimary && !active && 'ring-1 ring-primary/20',
                      )}
                    >
                      {active ? (
                        <motion.span
                          layoutId="sidebar-active"
                          className="absolute inset-0 rounded-xl bg-primary/10"
                          transition={{ duration: 0.15 }}
                        />
                      ) : null}
                      <Icon className={cn('relative h-4 w-4 shrink-0', (active || isPrimary) && 'text-primary')} />
                      {!collapsed ? (
                        <span className="relative truncate">
                          {item.label}
                          {isPrimary ? (
                            <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                          ) : null}
                        </span>
                      ) : null}
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

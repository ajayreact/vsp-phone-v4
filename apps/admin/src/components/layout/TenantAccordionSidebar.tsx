'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Radio } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getTenantNavSections } from '../../lib/navigation';
import { getPortalLabel } from '../../lib/portal/detect-portal';
import { usePortal } from '../../lib/portal/PortalProvider';
import { cn } from '../../lib/utils/cn';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { useOpsHealth } from '../../lib/hooks/queries/use-ops';
import { LiveIndicator } from '../ui/LiveIndicator';
import type { TenantNavSectionId } from '../../types/navigation';
import { Button } from '../ui/Button';

const STORAGE_KEY = 'vsp-tenant-nav-expanded-section';

function sectionForPath(pathname: string, sectionIds: TenantNavSectionId[]): TenantNavSectionId | null {
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) return 'dashboard';
  if (pathname.startsWith('/organization')) return 'organization';
  if (pathname.startsWith('/people')) return 'people';
  if (pathname.startsWith('/phone-numbers')) return 'phone-numbers';
  if (pathname.startsWith('/call-flow')) return 'call-flow';
  if (pathname.startsWith('/communication')) return 'communication';
  if (pathname.startsWith('/reports')) return 'reports';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/contact-center')) return 'contact-center';
  return sectionIds[0] ?? null;
}

export function TenantAccordionSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const permissions = usePermissions();
  const portal = usePortal();
  const health = useOpsHealth();
  const sections = useMemo(() => getTenantNavSections(permissions, portal), [permissions, portal]);
  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);

  const [expanded, setExpanded] = useState<TenantNavSectionId | null>(() => {
    if (typeof window === 'undefined') return 'dashboard';
    const stored = window.localStorage.getItem(STORAGE_KEY) as TenantNavSectionId | null;
    if (stored && sectionIds.includes(stored)) return stored;
    return sectionForPath(pathname, sectionIds) ?? 'dashboard';
  });

  useEffect(() => {
    const active = sectionForPath(pathname, sectionIds);
    if (active) setExpanded(active);
  }, [pathname, sectionIds]);

  useEffect(() => {
    if (expanded) window.localStorage.setItem(STORAGE_KEY, expanded);
  }, [expanded]);

  const toggleSection = useCallback((id: TenantNavSectionId) => {
    setExpanded((prev) => (prev === id ? prev : id));
  }, []);

  const sidebarStatus = { label: 'Session active', status: 'online' as const };

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
        <>
          <div className="border-b border-sidebar-border px-3 py-3">
            <LiveIndicator label={sidebarStatus.label} status={sidebarStatus.status} className="w-full justify-center" />
          </div>
          <div className="border-b border-sidebar-border px-3 py-3">
            <Link href="/people/provision">
              <Button size="sm" className="w-full shadow-sm">
                <Plus className="h-4 w-4" />
                Provision Employee
              </Button>
            </Link>
          </div>
        </>
      ) : null}

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => {
          const isOpen = expanded === section.id;
          const isSingleItem = section.items.length === 1 && section.id === 'dashboard';

          if (isSingleItem) {
            const item = section.items[0]!;
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <ul key={section.id} className="space-y-0.5">
                <li>
                  <Link
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
                      active ? 'bg-primary/10 text-primary' : 'text-sidebar-fg hover:bg-sidebar-accent',
                      collapsed && 'justify-center px-2',
                    )}
                  >
                    <Icon className={cn('relative h-4 w-4 shrink-0', active && 'text-primary')} />
                    {!collapsed ? <span className="relative truncate">{item.label}</span> : null}
                  </Link>
                </li>
              </ul>
            );
          }

          return (
            <div key={section.id} className="mb-2">
              {!collapsed ? (
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                >
                  <span>{section.label}</span>
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')} />
                </button>
              ) : (
                <div className="mb-2 h-px bg-border" />
              )}
              {(isOpen || collapsed) ? (
                <ul className="space-y-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const isPrimary = item.primary;
                    return (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          title={collapsed ? item.label : undefined}
                          className={cn(
                            'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150',
                            active
                              ? 'bg-primary/10 text-primary'
                              : isPrimary
                                ? 'text-primary hover:bg-primary/5'
                                : 'text-sidebar-fg hover:bg-sidebar-accent hover:text-foreground',
                            collapsed ? 'justify-center px-2 py-2.5' : 'pl-4',
                            isPrimary && !active && 'ring-1 ring-primary/20',
                          )}
                        >
                          {active ? (
                            <motion.span
                              layoutId="tenant-sidebar-active"
                              className="absolute inset-0 rounded-xl bg-primary/10"
                              transition={{ duration: 0.15 }}
                            />
                          ) : null}
                          <Icon className={cn('relative h-4 w-4 shrink-0', (active || isPrimary) && 'text-primary')} />
                          {!collapsed ? (
                            <span className="relative truncate text-[13px]">
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
              ) : null}
            </div>
          );
        })}
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

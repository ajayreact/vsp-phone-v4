'use client';

import { useState, type ReactNode } from 'react';
import { Breadcrumbs } from './Breadcrumbs';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { TenantAccordionSidebar } from './TenantAccordionSidebar';
import { isTenantAccordionNav } from '../../lib/navigation';
import { usePortal } from '../../lib/portal/PortalProvider';

/** Enterprise application shell — sidebar + header + content. */
export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const portal = usePortal();
  const useAccordion = isTenantAccordionNav(portal);

  const SidebarComponent = useAccordion ? TenantAccordionSidebar : Sidebar;

  return (
    <div className="gradient-mesh flex h-screen overflow-hidden">
      <div className="hidden lg:block">
        <SidebarComponent collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      </div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-50 h-full w-64 shadow-[var(--shadow-elevated)]">
            <SidebarComponent collapsed={false} onToggle={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <div className="flex items-center gap-3 border-b border-border bg-muted/20 px-4 py-2.5 sm:px-6">
          <button
            type="button"
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            Menu
          </button>
          <Breadcrumbs />
        </div>
        <main className="flex-1 overflow-y-auto bg-background">{children}</main>
      </div>
    </div>
  );
}

/** @deprecated Use AppShell */
export const PortalShell = AppShell;

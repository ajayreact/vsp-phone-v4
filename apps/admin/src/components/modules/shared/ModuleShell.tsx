'use client';

import { Plus, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMemo, type ReactNode } from 'react';
import { usePortal } from '../../../lib/portal/PortalProvider';
import { getModuleById } from '../../../lib/navigation';
import { hasPermission } from '../../../lib/rbac/permissions';
import { usePermissions } from '../../../lib/auth/AuthProvider';
import type { ModuleDefinition } from '../../../types/navigation';
import { DataTable, type Column } from '../../data/DataTable';
import { EmptyState } from '../../data/EmptyState';
import { PermissionDenied } from '../../data/PermissionDenied';
import { getPortalLabel } from '../../../lib/portal/detect-portal';
import { SearchBar } from '../../data/SearchBar';
import { QueryState } from '../../feedback/QueryState';
import { PageContainer, PageHeader } from '../../layout/PageHeader';
import { Button } from '../../ui/Button';
import { Skeleton } from '../../ui/Skeleton';

const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.18 },
};

type RowBase = { id: string };

export function withRowIds<T extends Record<string, unknown>>(rows: T[]): (T & RowBase)[] {
  return rows.map((r, i) => ({
    ...r,
    id: String(r.id ?? r.publicId ?? r.uuid ?? `${i}`),
  }));
}

export function useModuleAccess(moduleId: string): {
  module: ModuleDefinition | undefined;
  allowed: boolean;
} {
  const permissions = usePermissions();
  const portal = usePortal();
  const module = getModuleById(moduleId, portal);
  const allowed = module ? hasPermission(permissions, module.permission) : false;
  return { module, allowed };
}

export function ModuleAccessGate({
  moduleId,
  children,
}: {
  moduleId: string;
  children: (ctx: { module: ModuleDefinition }) => ReactNode;
}) {
  const portal = usePortal();
  const { module, allowed } = useModuleAccess(moduleId);
  if (!module) {
    return (
      <PageContainer>
        <EmptyState
          title="Module unavailable"
          description={`"${moduleId}" is not registered for ${getPortalLabel(portal)}. Use admin.vspphone.com for platform administration.`}
        />
      </PageContainer>
    );
  }
  if (!allowed) {
    return (
      <PageContainer>
        <PermissionDenied module={module.label} />
      </PageContainer>
    );
  }
  return <>{children({ module })}</>;
}

export function ModuleListShell<T extends RowBase>({
  module,
  query,
  columns,
  search,
  onSearchChange,
  searchPlaceholder,
  emptyTitle,
  emptyDescription,
  primaryAction,
  headerActions,
  filterRows,
}: {
  module: ModuleDefinition;
  query: {
    data?: T[];
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
    isFetching: boolean;
    refetch: () => void;
  };
  columns: Column<T>[];
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  primaryAction?: ReactNode;
  headerActions?: ReactNode;
  filterRows?: (rows: T[], search: string) => T[];
}) {
  const rows = useMemo(() => {
    const data = (query.data ?? []) as T[];
    if (!search?.trim() || !filterRows) return data;
    return filterRows(data, search);
  }, [query.data, search, filterRows]);

  return (
    <PageContainer>
      <motion.div {...fadeIn}>
        <PageHeader
          title={module.label}
          description={module.description}
          actions={
            headerActions ?? (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
                  <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                {primaryAction}
              </div>
            )
          }
        />

        {onSearchChange ? (
          <div className="mb-6 max-w-lg">
            <SearchBar
              value={search ?? ''}
              onChange={onSearchChange}
              placeholder={searchPlaceholder ?? `Search ${module.label.toLowerCase()}…`}
            />
          </div>
        ) : null}

        <QueryState
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={!rows.length}
          empty={
            <EmptyState
              title={emptyTitle ?? `No ${module.label.toLowerCase()} yet`}
              description={emptyDescription ?? `Create your first ${module.label.toLowerCase()} entry to get started.`}
              action={primaryAction}
            />
          }
          skeleton={<Skeleton className="h-64 w-full rounded-2xl" />}
        >
          <DataTable columns={columns} data={rows} />
        </QueryState>
      </motion.div>
    </PageContainer>
  );
}

export function defaultSearchFilter<T extends Record<string, unknown>>(rows: T[], search: string): T[] {
  const q = search.toLowerCase();
  return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
}

export function CreateButton({
  label,
  onClick,
  disabled,
  disabledReason,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  if (!onClick && !disabled) return null;

  return (
    <Button
      size="sm"
      onClick={onClick}
      disabled={disabled ?? !onClick}
      title={disabled && disabledReason ? disabledReason : undefined}
    >
      <Plus className="h-4 w-4" />
      {label}
    </Button>
  );
}

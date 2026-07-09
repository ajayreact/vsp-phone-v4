'use client';

import { ChevronDown } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils/cn';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { ActionDropdown, type ActionItem } from './ActionDropdown';
import { EmptyState } from './EmptyState';

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
};

export function DataTable<T extends { id: string }>({
  columns,
  data,
  loading = false,
  pageSize = 10,
  emptyTitle = 'No records found',
  emptyDescription = 'Get started by creating your first record.',
  emptyAction,
  rowActions,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
}: {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  rowActions?: (row: T) => ActionItem[];
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}) {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const pageCount = Math.max(1, Math.ceil(data.length / pageSize));
  const rows = useMemo(() => {
    const start = page * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, page, pageSize]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!data.length) {
    return (
      <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-muted/50 backdrop-blur-sm">
            <tr>
              {selectable ? (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={rows.length > 0 && rows.every((r) => selectedIds.includes(r.id))}
                    onChange={(e) => {
                      if (!onSelectionChange) return;
                      if (e.target.checked) {
                        onSelectionChange([...new Set([...selectedIds, ...rows.map((r) => r.id)])]);
                      } else {
                        onSelectionChange(selectedIds.filter((id) => !rows.some((r) => r.id === id)));
                      }
                    }}
                  />
                </th>
              ) : null}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                    col.className,
                  )}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => {
                        if (sortKey === col.key) {
                          setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                        } else {
                          setSortKey(col.key);
                          setSortDir('asc');
                        }
                      }}
                    >
                      {col.header}
                      <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
              <th className="w-12 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr
                key={row.id}
                className="transition-colors hover:bg-muted/40"
              >
                {selectable ? (
                  <td className="px-4 py-3.5">
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.id}`}
                      checked={selectedIds.includes(row.id)}
                      onChange={(e) => {
                        if (!onSelectionChange) return;
                        onSelectionChange(
                          e.target.checked
                            ? [...selectedIds, row.id]
                            : selectedIds.filter((id) => id !== row.id),
                        );
                      }}
                    />
                  </td>
                ) : null}
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-4 py-3.5', col.className)}>
                    {col.cell(row)}
                  </td>
                ))}
                <td className="px-4 py-3.5">
                  {rowActions ? (
                    <ActionDropdown
                      items={rowActions(row)}
                    />
                  ) : (
                    <ActionDropdown
                      items={[
                        { id: 'view', label: 'View details' },
                        { id: 'edit', label: 'Edit' },
                        { id: 'delete', label: 'Delete', destructive: true },
                      ]}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
        <span>
          Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, data.length)} of {data.length}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

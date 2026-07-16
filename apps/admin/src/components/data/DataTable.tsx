'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  /** Optional value used for client-side sorting when the cell is not a plain field. */
  sortValue?: (row: T) => string | number | null | undefined;
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

  useEffect(() => {
    if (page > pageCount - 1) setPage(0);
  }, [page, pageCount]);

  const rows = useMemo(() => {
    let sorted = data;
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      sorted = [...data].sort((a, b) => {
        const av = col?.sortValue ? col.sortValue(a) : (a as Record<string, unknown>)[sortKey];
        const bv = col?.sortValue ? col.sortValue(b) : (b as Record<string, unknown>)[sortKey];
        const as = av == null ? '' : String(av);
        const bs = bv == null ? '' : String(bv);
        const cmp = as.localeCompare(bs, undefined, { numeric: true, sensitivity: 'base' });
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    const start = page * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [columns, data, page, pageSize, sortKey, sortDir]);

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
        <table className="w-full min-w-[1100px] text-sm">
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
                    'px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap',
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
                      <ChevronDown
                        className={cn(
                          'h-3.5 w-3.5 opacity-40',
                          sortKey === col.key && 'opacity-100',
                          sortKey === col.key && sortDir === 'desc' && 'rotate-180',
                        )}
                      />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
              {rowActions ? (
                <th className="w-12 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Actions
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr
                key={row.id}
                className="transition-colors hover:bg-muted/40"
              >
                {selectable ? (
                  <td className="px-3 py-2.5">
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
                  <td key={col.key} className={cn('px-3 py-2.5 align-middle', col.className)}>
                    {col.cell(row)}
                  </td>
                ))}
                {rowActions ? (
                  <td className="px-3 py-2.5">
                    <ActionDropdown items={rowActions(row)} />
                  </td>
                ) : null}
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

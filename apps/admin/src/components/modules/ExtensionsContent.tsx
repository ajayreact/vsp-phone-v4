'use client';

import { useState } from 'react';
import {
  defaultSearchFilter,
  ModuleAccessGate,
  ModuleListShell,
  withRowIds,
} from './shared/ModuleShell';
import { useCreateTenantExtension } from '../../lib/hooks/queries/use-tenant-mutations';
import { useTenantDevices, useTenantExtensions } from '../../lib/hooks/queries/use-tenant';
import { PERMISSIONS } from '../../lib/rbac/permissions';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { Input } from '../ui/Input';
import { SlideOver } from '../ui/SlideOver';
import { Button } from '../ui/Button';
import { useLineOptionsFromDevices, WriteCreateButton } from './shared/TenantCreateForms';

type ExtensionRow = Record<string, unknown> & { id: string };

const columns: Column<ExtensionRow>[] = [
  {
    key: 'extension',
    header: 'Extension',
    sortable: true,
    cell: (r) => <span className="font-mono font-medium">{String(r.extension ?? '')}</span>,
  },
  {
    key: 'line',
    header: 'Line',
    cell: (r) => {
      const line = r.line as { name?: string } | undefined;
      return line?.name ?? '—';
    },
  },
  {
    key: 'status',
    header: 'Status',
    cell: (r) => <StatusBadge status={String(r.status ?? 'ACTIVE') === 'ACTIVE' ? 'active' : 'pending'} />,
  },
];

function ExtensionCreateSlideOver({
  open,
  onClose,
  lineOptions,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  lineOptions: { id: string; label: string }[];
  isPending: boolean;
  onSubmit: (values: { lineId: string; extension: string }) => Promise<void>;
}) {
  const [lineId, setLineId] = useState('');
  const [extension, setExtension] = useState('');
  const [error, setError] = useState<string | null>(null);
  const noLines = lineOptions.length === 0;

  const reset = () => {
    setLineId('');
    setExtension('');
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    setError(null);
    try {
      await onSubmit({ lineId, extension: extension.trim() });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  };

  return (
    <SlideOver
      open={open}
      onClose={handleClose}
      title="Add Extension"
      description="Assign an extension number to a line."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={isPending || !lineId || !extension.trim() || noLines}>
            {isPending ? 'Saving…' : 'Create'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {noLines ? (
          <p className="text-sm text-muted-foreground">
            No lines are available yet. Provision a device or user line before adding extensions.
          </p>
        ) : (
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Line *</span>
            <select
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              value={lineId}
              onChange={(e) => setLineId(e.target.value)}
            >
              <option value="">Select a line…</option>
              {lineOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Extension *</span>
          <Input value={extension} onChange={(e) => setExtension(e.target.value)} placeholder="101" />
        </label>
      </div>
    </SlideOver>
  );
}

export function ExtensionsContent() {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const query = useTenantExtensions(search);
  const devicesQuery = useTenantDevices();
  const create = useCreateTenantExtension();
  const lineOptions = useLineOptionsFromDevices(devicesQuery.data ?? []);
  const rows = withRowIds(query.data ?? []) as ExtensionRow[];

  return (
    <ModuleAccessGate moduleId="extensions">
      {({ module }) => (
        <>
          <ModuleListShell
            module={module}
            query={{ ...query, data: rows }}
            columns={columns}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search extensions…"
            emptyTitle="No extensions"
            emptyDescription="Add extension numbers and assign them to lines."
            primaryAction={
              <WriteCreateButton
                writePermission={PERMISSIONS.TENANT_EXTENSIONS_WRITE}
                label="Add Extension"
                onClick={() => setOpen(true)}
              />
            }
            filterRows={(data, q) => defaultSearchFilter(data, q)}
          />
          <ExtensionCreateSlideOver
            open={open}
            onClose={() => setOpen(false)}
            lineOptions={lineOptions}
            isPending={create.isPending}
            onSubmit={async (values) => {
              await create.mutateAsync(values);
            }}
          />
        </>
      )}
    </ModuleAccessGate>
  );
}

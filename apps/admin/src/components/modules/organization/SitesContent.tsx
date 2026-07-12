'use client';

import { useState } from 'react';
import type { Column } from '../../data/DataTable';
import {
  useCreateTenantSite,
  useDeleteTenantSite,
  useTenantSites,
  useUpdateTenantSite,
} from '../../../lib/hooks/queries/use-tenant-organization';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { SlideOver } from '../../ui/SlideOver';
import { StatusBadge } from '../../ui/Badge';
import {
  CreateButton,
  ModuleAccessGate,
  ModuleListShell,
  withRowIds,
} from '../shared/ModuleShell';

type SiteRow = {
  id: string;
  name: string;
  code: string;
  city?: string | null;
  state?: string | null;
  status: string;
};

const emptyForm = {
  name: '',
  code: '',
  address: '',
  city: '',
  state: '',
  country: '',
  postalCode: '',
  description: '',
  businessHours: '',
};

export function SitesContent() {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SiteRow | null>(null);
  const [form, setForm] = useState(emptyForm);

  const query = useTenantSites(search);
  const createSite = useCreateTenantSite();
  const updateSite = useUpdateTenantSite();
  const deleteSite = useDeleteTenantSite();
  const rows = withRowIds(query.data ?? []) as SiteRow[];

  const columns: Column<SiteRow>[] = [
    { key: 'name', header: 'Name', sortable: true, cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'code', header: 'Code', cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
    {
      key: 'location',
      header: 'Location',
      cell: (r) => [r.city, r.state].filter(Boolean).join(', ') || '—',
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <StatusBadge status={r.status === 'ACTIVE' ? 'active' : 'pending'} />,
    },
    {
      key: 'actions',
      header: '',
      cell: (r) => (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(r);
              setForm({
                name: r.name,
                code: r.code,
                address: '',
                city: r.city ?? '',
                state: r.state ?? '',
                country: '',
                postalCode: '',
                description: '',
                businessHours: '',
              });
              setOpen(true);
            }}
          >
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void deleteSite.mutateAsync(r.id)}
            disabled={deleteSite.isPending}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const submit = async () => {
    if (editing) {
      await updateSite.mutateAsync({ id: editing.id, payload: form });
    } else {
      await createSite.mutateAsync(form);
    }
    setOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  return (
    <ModuleAccessGate moduleId="organization-sites">
      {({ module }) => (
        <>
          <ModuleListShell
            module={module}
            query={{ ...query, data: rows }}
            columns={columns}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search sites…"
            emptyTitle="No sites"
            emptyDescription="Create sites to organize devices, numbers, and users by location."
            primaryAction={
              <CreateButton
                label="Add Site"
                onClick={() => {
                  setEditing(null);
                  setForm(emptyForm);
                  setOpen(true);
                }}
              />
            }
          />

          <SlideOver
            open={open}
            onClose={() => setOpen(false)}
            title={editing ? 'Edit Site' : 'New Site'}
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => void submit()} disabled={createSite.isPending || updateSite.isPending}>
                  {editing ? 'Save' : 'Create'}
                </Button>
              </div>
            }
          >
            <div className="space-y-4">
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Name</span>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Code</span>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="main-office" />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Address</span>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium">City</span>
                  <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </label>
                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium">State</span>
                  <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
                </label>
              </div>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Business hours</span>
                <Input value={form.businessHours} onChange={(e) => setForm({ ...form, businessHours: e.target.value })} placeholder="Mon-Fri 9-5" />
              </label>
            </div>
          </SlideOver>
        </>
      )}
    </ModuleAccessGate>
  );
}

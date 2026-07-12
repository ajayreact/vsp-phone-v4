'use client';

import { useState } from 'react';
import type { Column } from '../../data/DataTable';
import {
  useCreateTenantDepartment,
  useDeleteTenantDepartment,
  useTenantDepartments,
  useUpdateTenantDepartment,
} from '../../../lib/hooks/queries/use-tenant-organization';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { SlideOver } from '../../ui/SlideOver';
import {
  CreateButton,
  ModuleAccessGate,
  ModuleListShell,
  withRowIds,
} from '../shared/ModuleShell';

type DepartmentRow = {
  id: string;
  name: string;
  deviceCount: number;
};

export function DepartmentsContent() {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [name, setName] = useState('');

  const query = useTenantDepartments(search);
  const createDept = useCreateTenantDepartment();
  const updateDept = useUpdateTenantDepartment();
  const deleteDept = useDeleteTenantDepartment();
  const rows = withRowIds(query.data ?? []) as DepartmentRow[];

  const columns: Column<DepartmentRow>[] = [
    { key: 'name', header: 'Department', sortable: true, cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'deviceCount', header: 'Devices', cell: (r) => r.deviceCount },
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
              setName(r.name);
              setOpen(true);
            }}
          >
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void deleteDept.mutateAsync(r.id)}
            disabled={deleteDept.isPending}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const submit = async () => {
    if (editing) {
      await updateDept.mutateAsync({ id: editing.id, payload: { name } });
    } else {
      await createDept.mutateAsync({ name });
    }
    setOpen(false);
    setEditing(null);
    setName('');
  };

  return (
    <ModuleAccessGate moduleId="organization-departments">
      {({ module }) => (
        <>
          <ModuleListShell
            module={module}
            query={{ ...query, data: rows }}
            columns={columns}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search departments…"
            emptyTitle="No departments"
            emptyDescription="Organize users and devices by department."
            primaryAction={
              <CreateButton
                label="Add Department"
                onClick={() => {
                  setEditing(null);
                  setName('');
                  setOpen(true);
                }}
              />
            }
          />

          <SlideOver
            open={open}
            onClose={() => setOpen(false)}
            title={editing ? 'Edit Department' : 'New Department'}
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => void submit()} disabled={createDept.isPending || updateDept.isPending || !name.trim()}>
                  {editing ? 'Save' : 'Create'}
                </Button>
              </div>
            }
          >
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Name</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sales" />
            </label>
          </SlideOver>
        </>
      )}
    </ModuleAccessGate>
  );
}

'use client';

import { Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  useApproveFirmware,
  useCreateProvisioningTemplate,
  useDeleteProvisioningTemplate,
  useEnrollDevice,
  useReprovisionDevice,
} from '../../lib/hooks/queries/use-device-mutations';
import {
  useTenantFirmware,
  useTenantProvisioningTemplates,
} from '../../lib/hooks/queries/use-device-mutations';
import { useTenantDevices, useTenantExtensions } from '../../lib/hooks/queries/use-tenant';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { PERMISSIONS, hasPermission } from '../../lib/rbac/permissions';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SlideOver } from '../ui/SlideOver';
import { ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';
import { WriteCreateButton } from './shared/TenantCreateForms';

type Tab = 'devices' | 'templates' | 'firmware';
type DeviceRow = Record<string, unknown> & { id: string };
type TemplateRow = Record<string, unknown> & { id: string };

const MANUFACTURERS = ['GRANDSTREAM', 'YEALINK', 'FANVIL', 'POLY', 'CISCO', 'SNOM', 'OTHER'] as const;
const TEMPLATE_KINDS = ['OFFICE', 'RECEPTION', 'CONFERENCE_ROOM', 'EXECUTIVE', 'WAREHOUSE', 'CALL_CENTER', 'CUSTOM'] as const;

const deviceColumns: Column<DeviceRow>[] = [
  { key: 'name', header: 'Device', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
  { key: 'manufacturer', header: 'Manufacturer', cell: (r) => String(r.manufacturer ?? '—') },
  { key: 'mac', header: 'MAC', cell: (r) => <span className="font-mono text-xs">{String(r.macAddress ?? '—')}</span> },
  { key: 'firmware', header: 'Firmware', cell: (r) => String(r.firmwareVersion ?? '—') },
  {
    key: 'provisioning',
    header: 'Provisioning',
    cell: (r) => <StatusBadge status={String(r.provisioningStatus ?? '').toLowerCase() === 'provisioned' ? 'active' : 'pending'} />,
  },
  {
    key: 'registration',
    header: 'Registration',
    cell: (r) => {
      const sip = r.sipEndpoint as { registrationStatus?: string } | undefined;
      return <StatusBadge status={sip?.registrationStatus === 'REGISTERED' ? 'online' : 'offline'} />;
    },
  },
];

const templateColumns: Column<TemplateRow>[] = [
  { key: 'name', header: 'Template', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
  { key: 'kind', header: 'Kind', cell: (r) => String(r.templateKind ?? 'CUSTOM') },
  { key: 'manufacturer', header: 'Manufacturer', cell: (r) => String(r.manufacturer ?? '—') },
  { key: 'modelFamily', header: 'Model family', cell: (r) => String(r.modelFamily ?? '—') },
  { key: 'default', header: 'Default', cell: (r) => (r.isDefault ? 'Yes' : '—') },
  {
    key: 'devices',
    header: 'Devices',
    cell: (r) => String((r._count as { devices?: number })?.devices ?? 0),
  },
];

export function ProvisioningContent() {
  const permissions = usePermissions();
  const canWrite = hasPermission(permissions, PERMISSIONS.PROVISIONING_ADMIN) || hasPermission(permissions, PERMISSIONS.TENANT_DEVICES_WRITE);

  const [tab, setTab] = useState<Tab>('devices');
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [enrollForm, setEnrollForm] = useState({
    name: '',
    mac: '',
    lineId: '',
    manufacturer: 'GRANDSTREAM',
    model: '',
    modelFamily: 'grp261x',
    firmwareChannel: 'stable',
  });

  const [templateForm, setTemplateForm] = useState({
    name: '',
    description: '',
    templateKind: 'OFFICE',
    manufacturer: 'GRANDSTREAM',
    modelFamily: 'grp261x',
    isDefault: false,
  });

  const devicesQuery = useTenantDevices();
  const templatesQuery = useTenantProvisioningTemplates();
  const firmwareQuery = useTenantFirmware();
  const extensionsQuery = useTenantExtensions();

  const enroll = useEnrollDevice();
  const reprovision = useReprovisionDevice();
  const createTemplate = useCreateProvisioningTemplate();
  const deleteTemplate = useDeleteProvisioningTemplate();
  const approveFirmware = useApproveFirmware();

  const deviceRows = withRowIds(devicesQuery.data ?? []) as DeviceRow[];
  const templateRows = withRowIds(templatesQuery.data ?? []) as TemplateRow[];
  const extensions = (extensionsQuery.data ?? []) as { line?: { id?: string }; extension?: string; lineId?: string }[];

  const handleEnroll = async () => {
    setError(null);
    try {
      await enroll.mutateAsync({
        name: enrollForm.name,
        mac: enrollForm.mac,
        lineId: enrollForm.lineId,
        manufacturer: enrollForm.manufacturer,
        model: enrollForm.model || undefined,
        modelFamily: enrollForm.modelFamily || undefined,
        firmwareChannel: enrollForm.firmwareChannel,
      });
      setEnrollOpen(false);
      setEnrollForm({ name: '', mac: '', lineId: '', manufacturer: 'GRANDSTREAM', model: '', modelFamily: 'grp261x', firmwareChannel: 'stable' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enrollment failed');
    }
  };

  const handleCreateTemplate = async () => {
    setError(null);
    try {
      await createTemplate.mutateAsync({
        name: templateForm.name,
        description: templateForm.description || undefined,
        templateKind: templateForm.templateKind,
        manufacturer: templateForm.manufacturer,
        modelFamily: templateForm.modelFamily || undefined,
        isDefault: templateForm.isDefault,
        config: {
          ringTimeout: templateForm.templateKind === 'RECEPTION' ? 30 : 25,
          callWaiting: true,
          codecPriority: ['opus', 'g722', 'pcmu'],
        },
      });
      setTemplateOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Template create failed');
    }
  };

  const tabButton = (id: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
    >
      {label}
    </button>
  );

  return (
    <ModuleAccessGate moduleId="provisioning">
      {({ module }) => (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
            {tabButton('devices', 'Registration monitor')}
            {tabButton('templates', 'Templates')}
            {tabButton('firmware', 'Firmware')}
            {canWrite && tab === 'devices' ? (
              <div className="ml-auto">
                <WriteCreateButton
                  writePermission={PERMISSIONS.TENANT_DEVICES_WRITE}
                  label="Enroll device"
                  onClick={() => setEnrollOpen(true)}
                />
              </div>
            ) : null}
            {canWrite && tab === 'templates' ? (
              <div className="ml-auto">
                <WriteCreateButton
                  writePermission={PERMISSIONS.PROVISIONING_ADMIN}
                  label="New template"
                  onClick={() => setTemplateOpen(true)}
                />
              </div>
            ) : null}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {tab === 'devices' ? (
            <ModuleListShell
              module={{ ...module, label: 'Provisioned devices', description: 'Zero-touch enrollment and registration status' }}
              query={{ ...devicesQuery, data: deviceRows }}
              columns={[
                ...deviceColumns,
                ...(canWrite
                  ? [{
                      key: 'actions',
                      header: '',
                      cell: (r: DeviceRow) => (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              await reprovision.mutateAsync(r.id);
                            } catch (e) {
                              setError(e instanceof Error ? e.message : 'Reprovision failed');
                            }
                          }}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      ),
                    }]
                  : []),
              ]}
              emptyTitle="No provisioned devices"
              emptyDescription="Enroll desk phones via zero-touch provisioning to begin monitoring registrations."
            />
          ) : null}

          {tab === 'templates' ? (
            <ModuleListShell
              module={{ ...module, label: 'Provisioning templates', description: 'Reusable configuration profiles by site role' }}
              query={{ ...templatesQuery, data: templateRows }}
              columns={[
                ...templateColumns,
                ...(canWrite
                  ? [{
                      key: 'actions',
                      header: '',
                      cell: (r: TemplateRow) => (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (!confirm('Delete this template?')) return;
                            try {
                              await deleteTemplate.mutateAsync(String(r.id));
                            } catch (e) {
                              setError(e instanceof Error ? e.message : 'Delete failed');
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ),
                    }]
                  : []),
              ]}
              emptyTitle="No provisioning templates"
              emptyDescription="Create office, reception, or call center templates for consistent device rollout."
            />
          ) : null}

          {tab === 'firmware' ? (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 font-medium">Firmware catalog</h3>
              {firmwareQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading firmware releases…</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-2 pr-4">Manufacturer</th>
                        <th className="py-2 pr-4">Model family</th>
                        <th className="py-2 pr-4">Version</th>
                        <th className="py-2 pr-4">Channel</th>
                        <th className="py-2 pr-4">Approved</th>
                        {canWrite ? <th className="py-2">Actions</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {(firmwareQuery.data?.releases ?? []).map((r) => (
                        <tr key={String(r.id)} className="border-b border-border/50">
                          <td className="py-2 pr-4">{String(r.manufacturer)}</td>
                          <td className="py-2 pr-4 font-mono text-xs">{String(r.modelFamily)}</td>
                          <td className="py-2 pr-4">{String(r.version)}</td>
                          <td className="py-2 pr-4">{String(r.channel)}</td>
                          <td className="py-2 pr-4">
                            <StatusBadge status={r.approved ? 'active' : 'pending'} />
                          </td>
                          {canWrite ? (
                            <td className="py-2">
                              {!r.approved ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      await approveFirmware.mutateAsync({ releaseId: String(r.id) });
                                    } catch (e) {
                                      setError(e instanceof Error ? e.message : 'Approve failed');
                                    }
                                  }}
                                >
                                  <ShieldCheck className="mr-1 h-4 w-4" /> Approve
                                </Button>
                              ) : null}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}

          <SlideOver open={enrollOpen} onClose={() => setEnrollOpen(false)} title="Zero-touch enrollment">
            <div className="space-y-4 text-sm">
              <label className="block space-y-1.5">
                <span className="font-medium">Device name *</span>
                <Input value={enrollForm.name} onChange={(e) => setEnrollForm({ ...enrollForm, name: e.target.value })} />
              </label>
              <label className="block space-y-1.5">
                <span className="font-medium">MAC address *</span>
                <Input className="font-mono" value={enrollForm.mac} onChange={(e) => setEnrollForm({ ...enrollForm, mac: e.target.value })} placeholder="AA:BB:CC:DD:EE:FF" />
              </label>
              <label className="block space-y-1.5">
                <span className="font-medium">Extension / line *</span>
                <select
                  className="h-10 w-full rounded-xl border border-border bg-background px-3"
                  value={enrollForm.lineId}
                  onChange={(e) => setEnrollForm({ ...enrollForm, lineId: e.target.value })}
                >
                  <option value="">Select line…</option>
                  {extensions.map((ext, i) => (
                    <option key={i} value={ext.line?.id ?? ext.lineId ?? ''}>
                      {ext.extension} — line
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="font-medium">Manufacturer</span>
                <select
                  className="h-10 w-full rounded-xl border border-border bg-background px-3"
                  value={enrollForm.manufacturer}
                  onChange={(e) => setEnrollForm({ ...enrollForm, manufacturer: e.target.value })}
                >
                  {MANUFACTURERS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="font-medium">Model family</span>
                <Input value={enrollForm.modelFamily} onChange={(e) => setEnrollForm({ ...enrollForm, modelFamily: e.target.value })} />
              </label>
              <label className="block space-y-1.5">
                <span className="font-medium">Firmware channel</span>
                <select
                  className="h-10 w-full rounded-xl border border-border bg-background px-3"
                  value={enrollForm.firmwareChannel}
                  onChange={(e) => setEnrollForm({ ...enrollForm, firmwareChannel: e.target.value })}
                >
                  <option value="stable">Stable</option>
                  <option value="n-1">N-1</option>
                  <option value="emergency">Emergency</option>
                </select>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEnrollOpen(false)}>Cancel</Button>
              <Button onClick={handleEnroll} disabled={!enrollForm.name || !enrollForm.mac || !enrollForm.lineId || enroll.isPending}>
                Enroll
              </Button>
            </div>
          </SlideOver>

          <SlideOver open={templateOpen} onClose={() => setTemplateOpen(false)} title="Create provisioning template">
            <div className="space-y-4 text-sm">
              <label className="block space-y-1.5">
                <span className="font-medium">Name *</span>
                <Input value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} />
              </label>
              <label className="block space-y-1.5">
                <span className="font-medium">Description</span>
                <Input value={templateForm.description} onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} />
              </label>
              <label className="block space-y-1.5">
                <span className="font-medium">Template kind</span>
                <select
                  className="h-10 w-full rounded-xl border border-border bg-background px-3"
                  value={templateForm.templateKind}
                  onChange={(e) => setTemplateForm({ ...templateForm, templateKind: e.target.value })}
                >
                  {TEMPLATE_KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="font-medium">Manufacturer</span>
                <select
                  className="h-10 w-full rounded-xl border border-border bg-background px-3"
                  value={templateForm.manufacturer}
                  onChange={(e) => setTemplateForm({ ...templateForm, manufacturer: e.target.value })}
                >
                  {MANUFACTURERS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="font-medium">Model family</span>
                <Input value={templateForm.modelFamily} onChange={(e) => setTemplateForm({ ...templateForm, modelFamily: e.target.value })} />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={templateForm.isDefault} onChange={(e) => setTemplateForm({ ...templateForm, isDefault: e.target.checked })} />
                Default template for manufacturer
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTemplateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateTemplate} disabled={!templateForm.name || createTemplate.isPending}>
                <Plus className="mr-1 h-4 w-4" /> Create
              </Button>
            </div>
          </SlideOver>
        </div>
      )}
    </ModuleAccessGate>
  );
}

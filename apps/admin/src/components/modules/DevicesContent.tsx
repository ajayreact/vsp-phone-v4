'use client';

import {
  Download,
  Eye,
  Pencil,
  Power,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  useBulkDeleteDevices,
  useBulkImportDevices,
  useBulkProvisionDevices,
  useBulkRebootDevices,
  useCreateTenantDevice,
  useDeleteTenantDevice,
  useReprovisionDevice,
  useRollbackDeviceConfig,
  useUpdateTenantDevice,
} from '../../lib/hooks/queries/use-device-mutations';
import { useTenantDevices, useTenantExtensions } from '../../lib/hooks/queries/use-tenant';
import { formatExtensionLabel } from '../../lib/extensions/format-extension-label';
import { deviceRepository } from '../../lib/repositories/device.repository';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { PERMISSIONS, hasPermission } from '../../lib/rbac/permissions';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SlideOver } from '../ui/SlideOver';
import {
  defaultSearchFilter,
  ModuleAccessGate,
  ModuleListShell,
  withRowIds,
} from './shared/ModuleShell';
import { WriteCreateButton } from './shared/TenantCreateForms';

type DeviceRow = Record<string, unknown> & { id: string };

const MANUFACTURERS = ['GRANDSTREAM', 'YEALINK', 'FANVIL', 'POLY', 'CISCO', 'SNOM', 'OTHER'] as const;
const DEVICE_TYPES = ['DESK_PHONE', 'WEBRTC', 'MOBILE', 'SIP'] as const;

type DeviceForm = {
  name: string;
  deviceType: string;
  manufacturer: string;
  model: string;
  macAddress: string;
  lineId: string;
  serialNumber: string;
  assetTag: string;
  location: string;
  modelFamily: string;
  transport: string;
  tlsEnabled: boolean;
  srtpEnabled: boolean;
};

const emptyForm: DeviceForm = {
  name: '',
  deviceType: 'DESK_PHONE',
  manufacturer: 'GRANDSTREAM',
  model: '',
  macAddress: '',
  lineId: '',
  serialNumber: '',
  assetTag: '',
  location: '',
  modelFamily: 'grp261x',
  transport: 'UDP',
  tlsEnabled: false,
  srtpEnabled: false,
};

function userLabel(row: DeviceRow): string {
  const user = row.user as { email?: string; profile?: { displayName?: string } } | undefined;
  const line = row.line as { user?: { email?: string; profile?: { displayName?: string } } } | undefined;
  const u = user ?? line?.user;
  return u?.profile?.displayName ?? u?.email ?? '—';
}

function extensionLabel(row: DeviceRow): string {
  const line = row.line as { extension?: { extension?: string }; name?: string } | undefined;
  const ext = line?.extension?.extension;
  if (!ext) return '—';
  return formatExtensionLabel(ext, line?.name);
}

function registrationStatus(row: DeviceRow): string {
  const sip = row.sipEndpoint as { registrationStatus?: string } | undefined;
  return sip?.registrationStatus ?? 'UNREGISTERED';
}

function statusTone(status: string): 'online' | 'offline' | 'pending' | 'active' {
  const s = status.toLowerCase();
  if (s === 'registered' || s === 'online') return 'online';
  if (s === 'inactive') return 'offline';
  if (s === 'provisioning' || s === 'pending') return 'pending';
  return 'offline';
}

function DeviceFormFields({
  form,
  setForm,
  extensions,
  editMode,
}: {
  form: DeviceForm;
  setForm: (f: DeviceForm) => void;
  extensions: { id: string; lineId?: string; extension?: string; line?: { name?: string } }[];
  editMode?: boolean;
}) {
  return (
    <div className="space-y-4">
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Name *</span>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      {!editMode ? (
        <>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Device type *</span>
            <select
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              value={form.deviceType}
              onChange={(e) => setForm({ ...form, deviceType: e.target.value })}
            >
              {DEVICE_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace('_', ' ')}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Manufacturer</span>
            <select
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              value={form.manufacturer}
              onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
            >
              {MANUFACTURERS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">MAC address</span>
            <Input
              value={form.macAddress}
              onChange={(e) => setForm({ ...form, macAddress: e.target.value })}
              placeholder="AA:BB:CC:DD:EE:FF"
              className="font-mono"
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Assign to extension</span>
            <select
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              value={form.lineId}
              onChange={(e) => setForm({ ...form, lineId: e.target.value })}
            >
              <option value="">Unassigned</option>
              {extensions.map((ext) => (
                <option key={ext.id} value={ext.lineId ?? ext.id}>
                  {formatExtensionLabel(String(ext.extension ?? ''), (ext.line as { name?: string })?.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Model family</span>
            <Input value={form.modelFamily} onChange={(e) => setForm({ ...form, modelFamily: e.target.value })} placeholder="grp261x" />
          </label>
        </>
      ) : null}
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Model</span>
        <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Serial number</span>
        <Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Asset tag</span>
        <Input value={form.assetTag} onChange={(e) => setForm({ ...form, assetTag: e.target.value })} />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Location</span>
        <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Transport</span>
        <select
          className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
          value={form.transport}
          onChange={(e) => setForm({ ...form, transport: e.target.value })}
        >
          <option value="UDP">UDP</option>
          <option value="TCP">TCP</option>
          <option value="TLS">TLS</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.tlsEnabled} onChange={(e) => setForm({ ...form, tlsEnabled: e.target.checked })} />
        TLS enabled
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.srtpEnabled} onChange={(e) => setForm({ ...form, srtpEnabled: e.target.checked })} />
        SRTP enabled
      </label>
    </div>
  );
}

export function DevicesContent() {
  const permissions = usePermissions();
  const canWrite = hasPermission(permissions, PERMISSIONS.TENANT_DEVICES_WRITE);
  const canProvision = hasPermission(permissions, PERMISSIONS.PROVISIONING_ADMIN) || canWrite;

  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<DeviceRow | null>(null);
  const [detailRow, setDetailRow] = useState<DeviceRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [configPreview, setConfigPreview] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const query = useTenantDevices(search);
  const extensionsQuery = useTenantExtensions();
  const create = useCreateTenantDevice();
  const update = useUpdateTenantDevice();
  const remove = useDeleteTenantDevice();
  const bulkImport = useBulkImportDevices();
  const bulkDelete = useBulkDeleteDevices();
  const bulkProvision = useBulkProvisionDevices();
  const bulkReboot = useBulkRebootDevices();
  const reprovision = useReprovisionDevice();
  const rollback = useRollbackDeviceConfig();

  const rows = withRowIds(query.data ?? []) as DeviceRow[];
  const extensions = (extensionsQuery.data ?? []) as {
    id: string;
    lineId?: string;
    extension?: string;
    line?: { id?: string; name?: string };
  }[];

  const extOptions = useMemo(
    () =>
      extensions.map((e) => ({
        id: e.id,
        lineId: e.line?.id ?? e.lineId,
        extension: String(e.extension ?? ''),
        line: e.line,
      })),
    [extensions],
  );

  const columns: Column<DeviceRow>[] = useMemo(
    () => [
      {
        key: 'select',
        header: '',
        cell: (r) => (
          <input
            type="checkbox"
            checked={selected.has(r.id)}
            onChange={(e) => {
              const next = new Set(selected);
              if (e.target.checked) next.add(r.id);
              else next.delete(r.id);
              setSelected(next);
            }}
          />
        ),
      },
      { key: 'name', header: 'Name', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
      { key: 'manufacturer', header: 'Manufacturer', cell: (r) => String(r.manufacturer ?? '—') },
      { key: 'model', header: 'Model', cell: (r) => String(r.model ?? '—') },
      { key: 'mac', header: 'MAC', cell: (r) => <span className="font-mono text-xs">{String(r.macAddress ?? '—')}</span> },
      { key: 'extension', header: 'Extension', cell: (r) => extensionLabel(r) },
      { key: 'user', header: 'User', cell: (r) => userLabel(r) },
      { key: 'site', header: 'Site', cell: (r) => String((r.site as { name?: string })?.name ?? '—') },
      { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={statusTone(String(r.status ?? ''))} /> },
      {
        key: 'provisioning',
        header: 'Provisioning',
        cell: (r) => <StatusBadge status={statusTone(String(r.provisioningStatus ?? 'pending'))} />,
      },
      {
        key: 'registration',
        header: 'Registration',
        cell: (r) => <StatusBadge status={statusTone(registrationStatus(r))} />,
      },
      {
        key: 'actions',
        header: '',
        cell: (r) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setDetailRow(r)} title="Details">
              <Eye className="h-4 w-4" />
            </Button>
            {canWrite ? (
              <Button variant="ghost" size="sm" onClick={() => openEdit(r)} title="Edit">
                <Pencil className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [canWrite, selected],
  );

  const openEdit = (row: DeviceRow) => {
    setForm({
      name: String(row.name ?? ''),
      deviceType: String(row.deviceType ?? 'DESK_PHONE'),
      manufacturer: String(row.manufacturer ?? 'GRANDSTREAM'),
      model: String(row.model ?? ''),
      macAddress: String(row.macAddress ?? ''),
      lineId: String((row.line as { id?: string })?.id ?? ''),
      serialNumber: String(row.serialNumber ?? ''),
      assetTag: String(row.assetTag ?? ''),
      location: String(row.location ?? ''),
      modelFamily: String((row.provisioningMeta as { modelFamily?: string })?.modelFamily ?? 'grp261x'),
      transport: String(row.transport ?? 'UDP'),
      tlsEnabled: Boolean(row.tlsEnabled),
      srtpEnabled: Boolean(row.srtpEnabled),
    });
    setEditRow(row);
    setError(null);
  };

  const handleCreate = async () => {
    setError(null);
    try {
      await create.mutateAsync({
        name: form.name,
        deviceType: form.deviceType,
        manufacturer: form.manufacturer,
        model: form.model || undefined,
        macAddress: form.macAddress || undefined,
        lineId: form.lineId || undefined,
        serialNumber: form.serialNumber || undefined,
        assetTag: form.assetTag || undefined,
        location: form.location || undefined,
        modelFamily: form.modelFamily || undefined,
        transport: form.transport,
        tlsEnabled: form.tlsEnabled,
        srtpEnabled: form.srtpEnabled,
      });
      setCreateOpen(false);
      setForm(emptyForm);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    }
  };

  const handleUpdate = async () => {
    if (!editRow) return;
    setError(null);
    try {
      await update.mutateAsync({
        id: editRow.id,
        payload: {
          name: form.name,
          manufacturer: form.manufacturer,
          model: form.model || undefined,
          serialNumber: form.serialNumber || undefined,
          assetTag: form.assetTag || undefined,
          location: form.location || undefined,
          transport: form.transport,
          tlsEnabled: form.tlsEnabled,
          srtpEnabled: form.srtpEnabled,
        },
      });
      setEditRow(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const handleImport = async () => {
    setError(null);
    try {
      const parsed = JSON.parse(importText) as Record<string, unknown>[];
      if (!Array.isArray(parsed)) throw new Error('Expected JSON array');
      await bulkImport.mutateAsync(parsed);
      setImportOpen(false);
      setImportText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    }
  };

  const handleExport = async () => {
    setBusy(true);
    try {
      const blob = await deviceRepository.exportCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'devices.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  const selectedIds = Array.from(selected);

  const runBulk = async (action: 'provision' | 'reboot' | 'delete') => {
    if (!selectedIds.length) return;
    setBusy(true);
    setError(null);
    try {
      if (action === 'provision') await bulkProvision.mutateAsync(selectedIds);
      if (action === 'reboot') await bulkReboot.mutateAsync(selectedIds);
      if (action === 'delete') await bulkDelete.mutateAsync(selectedIds);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk action failed');
    } finally {
      setBusy(false);
    }
  };

  const detailMeta = detailRow?.provisioningMeta as Record<string, unknown> | undefined;

  return (
    <ModuleAccessGate moduleId="devices">
      {({ module }) => (
        <>
          <ModuleListShell
            module={module}
            query={{ ...query, data: rows }}
            columns={columns}
            search={search}
            onSearchChange={setSearch}
            emptyTitle="No devices in inventory"
            emptyDescription="Add desk phones, softphones, or mobile endpoints to begin provisioning."
            filterRows={(data, q) => defaultSearchFilter(data, q)}
            headerActions={
              canWrite ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
                    <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                  <WriteCreateButton
                    writePermission={PERMISSIONS.TENANT_DEVICES_WRITE}
                    label="Add device"
                    onClick={() => { setCreateOpen(true); setForm(emptyForm); setError(null); }}
                  />
                  <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                    <Upload className="mr-1 h-4 w-4" /> Import
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExport} disabled={busy}>
                    <Download className="mr-1 h-4 w-4" /> Export
                  </Button>
                  {selectedIds.length > 0 && canProvision ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => runBulk('provision')} disabled={busy}>
                        <RefreshCw className="mr-1 h-4 w-4" /> Provision ({selectedIds.length})
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => runBulk('reboot')} disabled={busy}>
                        <Power className="mr-1 h-4 w-4" /> Reboot ({selectedIds.length})
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => runBulk('delete')} disabled={busy}>
                        <Trash2 className="mr-1 h-4 w-4" /> Delete ({selectedIds.length})
                      </Button>
                    </>
                  ) : null}
                </div>
              ) : undefined
            }
          />

          {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}

          <SlideOver open={createOpen} onClose={() => setCreateOpen(false)} title="Add device">
            <DeviceFormFields form={form} setForm={setForm} extensions={extOptions} />
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!form.name || create.isPending}>Create</Button>
            </div>
          </SlideOver>

          <SlideOver open={Boolean(editRow)} onClose={() => setEditRow(null)} title="Edit device">
            <DeviceFormFields form={form} setForm={setForm} extensions={extOptions} editMode />
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditRow(null)}>Cancel</Button>
              <Button onClick={handleUpdate} disabled={update.isPending}>Save</Button>
            </div>
          </SlideOver>

          <SlideOver open={Boolean(detailRow)} onClose={() => { setDetailRow(null); setConfigPreview(null); }} title="Device details" width="lg">
            {detailRow ? (
              <div className="space-y-6 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-muted-foreground">Name</span><p className="font-medium">{String(detailRow.name)}</p></div>
                  <div><span className="text-muted-foreground">MAC</span><p className="font-mono">{String(detailRow.macAddress ?? '—')}</p></div>
                  <div><span className="text-muted-foreground">Manufacturer</span><p>{String(detailRow.manufacturer ?? '—')}</p></div>
                  <div><span className="text-muted-foreground">Model</span><p>{String(detailRow.model ?? '—')}</p></div>
                  <div><span className="text-muted-foreground">Firmware</span><p>{String(detailRow.firmwareVersion ?? '—')}</p></div>
                  <div><span className="text-muted-foreground">Extension</span><p>{extensionLabel(detailRow)}</p></div>
                  <div><span className="text-muted-foreground">User</span><p>{userLabel(detailRow)}</p></div>
                  <div><span className="text-muted-foreground">Site</span><p>{String((detailRow.site as { name?: string })?.name ?? '—')}</p></div>
                  <div><span className="text-muted-foreground">Status</span><p>{String(detailRow.status)}</p></div>
                  <div><span className="text-muted-foreground">Provisioning</span><p>{String(detailRow.provisioningStatus)}</p></div>
                  <div><span className="text-muted-foreground">Registration</span><p>{registrationStatus(detailRow)}</p></div>
                  <div><span className="text-muted-foreground">IP address</span><p className="font-mono">{String(detailMeta?.ipAddress ?? detailRow.ipAddress ?? '—')}</p></div>
                  <div><span className="text-muted-foreground">Transport</span><p>{String(detailRow.transport ?? 'UDP')} {detailRow.tlsEnabled ? '+ TLS' : ''} {detailRow.srtpEnabled ? '+ SRTP' : ''}</p></div>
                  <div><span className="text-muted-foreground">Config version</span><p>{String(detailMeta?.configVersion ?? '—')}</p></div>
                  <div><span className="text-muted-foreground">Prov URL</span><p className="break-all font-mono text-xs">{String(detailRow.provUrl ?? '—')}</p></div>
                </div>

                {canProvision ? (
                  <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                    <Button size="sm" variant="outline" onClick={async () => {
                      try {
                        await reprovision.mutateAsync(detailRow.id);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Reprovision failed');
                      }
                    }}>
                      <RefreshCw className="mr-1 h-4 w-4" /> Reprovision
                    </Button>
                    <Button size="sm" variant="outline" onClick={async () => {
                      try {
                        const preview = await deviceRepository.previewConfig(detailRow.id);
                        setConfigPreview(preview.content);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Preview failed');
                      }
                    }}>
                      <Eye className="mr-1 h-4 w-4" /> Preview config
                    </Button>
                    {detailMeta?.configVersion && Number(detailMeta.configVersion) > 1 ? (
                      <Button size="sm" variant="outline" onClick={async () => {
                        try {
                          await rollback.mutateAsync({
                            deviceId: detailRow.id,
                            targetConfigVersion: Number(detailMeta.configVersion) - 1,
                          });
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'Rollback failed');
                        }
                      }}>
                        <RotateCcw className="mr-1 h-4 w-4" /> Rollback
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={async () => {
                      try {
                        await deviceRepository.rebootDevice(detailRow.id);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Reboot failed');
                      }
                    }}>
                      <Power className="mr-1 h-4 w-4" /> Reboot
                    </Button>
                    {canWrite ? (
                      <Button size="sm" variant="destructive" onClick={async () => {
                        if (!confirm('Delete this device?')) return;
                        await remove.mutateAsync(detailRow.id);
                        setDetailRow(null);
                      }}>
                        <Trash2 className="mr-1 h-4 w-4" /> Delete
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {configPreview ? (
                  <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/30 p-3 text-xs">{configPreview}</pre>
                ) : null}

                {(detailRow.configHistory as Record<string, unknown>[] | undefined)?.length ? (
                  <div>
                    <h4 className="mb-2 font-medium">Configuration history</h4>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {(detailRow.configHistory as Record<string, unknown>[]).slice(0, 5).map((h, i) => (
                        <li key={i}>v{String(h.configVersion)} — {String(h.artifactHash ?? '').slice(0, 12)}… @ {String(h.ts ?? '')}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </SlideOver>

          <SlideOver open={importOpen} onClose={() => setImportOpen(false)} title="Bulk import devices">
            <p className="mb-3 text-sm text-muted-foreground">Paste a JSON array of device rows (name, deviceType, macAddress, extension, manufacturer, model).</p>
            <textarea
              className="min-h-48 w-full rounded-xl border border-border bg-background p-3 font-mono text-xs"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={'[\n  { "name": "Desk 101", "deviceType": "DESK_PHONE", "macAddress": "AA:BB:CC:DD:EE:FF", "extension": "101" }\n]'}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
              <Button onClick={handleImport} disabled={bulkImport.isPending}>Import</Button>
            </div>
          </SlideOver>
        </>
      )}
    </ModuleAccessGate>
  );
}

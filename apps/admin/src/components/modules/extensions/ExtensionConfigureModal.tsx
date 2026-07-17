'use client';

import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  useCreateTenantDevice,
  useDeleteTenantDevice,
  useRebootDevice,
  useReprovisionDevice,
} from '../../../lib/hooks/queries/use-device-mutations';
import {
  emptyExtensionConfigureForm,
  extensionDetailMatchesRow,
  mapExtensionDetailToForm,
  normalizeConfigureTab,
  useExtensionDetail,
  useExtensionMobileQr,
  useExtensionRestartRegistration,
  useExtensionUnassignDid,
  type ConfigureTabId,
  type ExtensionConfigureFormState,
  type ExtensionHubRow,
  type ExtensionMobileQrResult,
} from '../../../lib/hooks/queries/use-extension-hub';
import { useTenantDepartments } from '../../../lib/hooks/queries/use-tenant-organization';
import { useUpdateTenantExtension } from '../../../lib/hooks/queries/use-tenant-mutations';
import { useTenantUsers } from '../../../lib/hooks/queries/use-tenant';
import { deviceRepository } from '../../../lib/repositories/device.repository';
import { queryKeys } from '../../../lib/query/query-keys';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Modal } from '../../ui/Modal';
import { Skeleton } from '../../ui/Skeleton';
import { DeviceModelFields, emptyDeviceModelForm } from './DeviceModelFields';
import { ExtensionQrPanel } from './ExtensionQrPanel';
import { ExtensionStatusChip } from './ExtensionStatusChip';

type ModalTabId = ReturnType<typeof normalizeConfigureTab>;

/** Extension Workspace onboard order — Identity → User → DID → Softphone → SIP → Desk → … */
const TABS: { id: ModalTabId; label: string }[] = [
  { id: 'general', label: 'Identity & User' },
  { id: 'did', label: 'DID' },
  { id: 'devices', label: 'Softphone' },
  { id: 'sip', label: 'SIP Credentials' },
  { id: 'desk', label: 'Desk Phone' },
  { id: 'voicemail', label: 'Voicemail' },
  { id: 'recording', label: 'Recording' },
  { id: 'callFeatures', label: 'Call Routing' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'activity', label: 'Audit History' },
];

const DIRTY_FIELDS: Record<ModalTabId, (keyof ExtensionConfigureFormState)[]> = {
  general: ['displayName', 'description', 'departmentId', 'linkedUserId', 'callerIdName', 'language', 'timezone'],
  sip: [],
  devices: [],
  desk: [],
  did: ['callerIdName', 'cnam', 'emergencyAddress'],
  voicemail: ['pin', 'voicemailNotifyEmail', 'voicemailEnabled', 'voicemailGreeting'],
  callFeatures: [
    'callForwardEnabled',
    'callForwardDestination',
    'dndEnabled',
    'followMeEnabled',
    'callWaitingEnabled',
    'ringTimeout',
  ],
  recording: ['recordingEnabled'],
  permissions: [
    'inboundEnabled',
    'outboundEnabled',
    'internationalCalling',
    'internalCalls',
    'emergencyCalls',
  ],
  activity: [],
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {hint ? <span className="block text-xs font-normal text-muted-foreground">{hint}</span> : null}
      {children}
    </label>
  );
}

function DetailTabSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading extension settings">
      <p className="text-sm text-muted-foreground">Loading…</p>
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-xl" />
      ))}
    </div>
  );
}

function DetailTabError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <p className="font-medium text-destructive">Unable to load extension settings.</p>
      <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function UnsavedChangesDialog({
  open,
  onSave,
  onDiscard,
  onCancel,
  saving,
}: {
  open: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close dialog" onClick={onCancel} />
      <div
        role="dialog"
        aria-labelledby="unsaved-title"
        className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-background p-5 shadow-xl"
      >
        <h2 id="unsaved-title" className="text-base font-semibold">
          You have unsaved changes
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">Save your changes before leaving this tab?</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={onSave} disabled={saving}>
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={onDiscard} disabled={saving}>
            Discard
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ExtensionConfigureModal({
  open,
  onClose,
  row,
  onSaved,
  initialTab = 'general',
}: {
  open: boolean;
  onClose: () => void;
  row: ExtensionHubRow | null;
  onSaved?: () => void;
  initialTab?: ConfigureTabId;
}) {
  const [tab, setTab] = useState<ModalTabId>(() => normalizeConfigureTab(initialTab));
  const [form, setForm] = useState<ExtensionConfigureFormState>(emptyExtensionConfigureForm);
  const [baseline, setBaseline] = useState<ExtensionConfigureFormState>(emptyExtensionConfigureForm);
  const [detailReady, setDetailReady] = useState(false);
  const [deviceForm, setDeviceForm] = useState(emptyDeviceModelForm);
  const [qr, setQr] = useState<ExtensionMobileQrResult | null>(null);
  const [deskDevice, setDeskDevice] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingTab, setPendingTab] = useState<ModalTabId | 'close' | null>(null);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const queryClient = useQueryClient();
  const activeExtensionIdRef = useRef<string | null>(null);
  const detailQuery = useExtensionDetail(row?.id ?? '', open && Boolean(row?.id));

  useEffect(() => {
    activeExtensionIdRef.current = open && row ? row.id : null;
  }, [open, row?.id]);

  const usersQuery = useTenantUsers();
  const departmentsQuery = useTenantDepartments();
  const updateExt = useUpdateTenantExtension();
  const createDevice = useCreateTenantDevice();
  const deleteDevice = useDeleteTenantDevice();
  const unassignDid = useExtensionUnassignDid();
  const mobileQr = useExtensionMobileQr();
  const restartReg = useExtensionRestartRegistration();
  const reboot = useRebootDevice();
  const reprovision = useReprovisionDevice();

  const patchForm = useCallback((patch: Partial<ExtensionConfigureFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const invalidateDetail = useCallback(() => {
    if (row?.id) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tenant.extensionDetail(row.id) });
    }
  }, [queryClient, row?.id]);

  useLayoutEffect(() => {
    if (!open || !row) return;
    setTab(normalizeConfigureTab(initialTab));
    setDeviceForm({
      ...emptyDeviceModelForm,
      name: row.device?.deviceLabel || row.device?.name || `${row.displayName} Phone`,
      manufacturer: row.device?.manufacturer ?? 'GRANDSTREAM',
      model: row.device?.model ?? '',
    });
    setQr(null);
    setDeskDevice(null);
    setError(null);
    setPendingTab(null);
    setUnsavedOpen(false);

    const cached = queryClient.getQueryData<Record<string, unknown>>(
      queryKeys.tenant.extensionDetail(row.id),
    );
    if (extensionDetailMatchesRow(cached, row.id)) {
      const mapped = mapExtensionDetailToForm(row, cached);
      setForm(mapped);
      setBaseline(mapped);
      setDetailReady(true);
      return;
    }

    setDetailReady(false);
  }, [open, row, initialTab, queryClient]);

  useEffect(() => {
    if (!open || !row || !detailQuery.data || detailReady) return;
    if (!extensionDetailMatchesRow(detailQuery.data, row.id)) return;
    const mapped = mapExtensionDetailToForm(row, detailQuery.data);
    setForm(mapped);
    setBaseline(mapped);
    setDetailReady(true);
  }, [open, row, detailQuery.data, detailReady]);

  const retryDetail = useCallback(() => {
    setDetailReady(false);
    void detailQuery.refetch();
  }, [detailQuery]);

  const loadQr = useCallback(async () => {
    if (!row) return;
    const extensionId = row.id;
    try {
      const res = await mobileQr.mutateAsync(extensionId);
      if (activeExtensionIdRef.current !== extensionId) return;
      setQr(res);
    } catch (e) {
      if (activeExtensionIdRef.current !== extensionId) return;
      setError(e instanceof Error ? e.message : 'QR generation failed');
    }
  }, [mobileQr, row]);

  useEffect(() => {
    if (!open || !row || (tab !== 'sip' && tab !== 'devices')) return;
    void loadQr();
  }, [open, row?.id, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !row || tab !== 'desk' || !row.hasDeskPhone || !row.device?.id) {
      return;
    }
    let cancelled = false;
    void deviceRepository
      .getDevice(row.device.id)
      .then((d) => {
        if (!cancelled) setDeskDevice(d);
      })
      .catch(() => {
        if (!cancelled) setDeskDevice(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, row, tab]);

  const isTabDirty = useCallback(
    (targetTab: ModalTabId) => {
      if (!detailReady && targetTab !== 'sip' && targetTab !== 'devices' && targetTab !== 'desk' && targetTab !== 'activity') {
        return false;
      }
      return DIRTY_FIELDS[targetTab].some((field) => form[field] !== baseline[field]);
    },
    [baseline, detailReady, form],
  );

  const anyDirty = useMemo(
    () => TABS.some((t) => isTabDirty(t.id)),
    [isTabDirty],
  );

  const commitBaseline = useCallback(() => {
    setBaseline({ ...form });
  }, [form]);

  const saveAll = async (andProvision: boolean) => {
    if (!row) return;
    setError(null);
    try {
      await updateExt.mutateAsync({
        id: row.id,
        payload: {
          displayName: form.displayName,
          description: form.description || null,
          departmentId: form.departmentId || null,
          userId: form.linkedUserId || null,
          callerIdName: form.callerIdName || form.cnam || undefined,
          emergencyCallerIdName: form.emergencyAddress || undefined,
          inboundEnabled: form.inboundEnabled,
          outboundEnabled: form.outboundEnabled,
          recordingEnabled: form.recordingEnabled,
          voicemailEnabled: form.voicemailEnabled,
          settings: {
            pin: form.pin || undefined,
            voicemailNotifyEmail: form.voicemailNotifyEmail || undefined,
            callForwardEnabled: form.callForwardEnabled,
            callForwardDestination: form.callForwardDestination || undefined,
            dndEnabled: form.dndEnabled,
            followMeEnabled: form.followMeEnabled,
          },
        },
      });

      // Assigned DID is not editable here — platform assignment / Remove DID only.

      if (andProvision) {
        if (row.hasDeskPhone && row.device?.id) {
          await reprovision.mutateAsync(row.device.id);
        } else if (deviceForm.macAddress.trim()) {
          await createDevice.mutateAsync({
            name: deviceForm.name || `${row.displayName} Phone`,
            deviceType: 'DESK_PHONE',
            lineId: row.lineId,
            manufacturer: deviceForm.manufacturer,
            model: deviceForm.model,
            modelFamily: deviceForm.modelFamily,
            macAddress: deviceForm.macAddress,
            serialNumber: deviceForm.serialNumber,
            assetTag: deviceForm.assetTag,
            location: deviceForm.location,
            transport: deviceForm.transport,
            tlsEnabled: deviceForm.tlsEnabled,
            srtpEnabled: deviceForm.srtpEnabled,
            firmwareChannel: deviceForm.firmwareChannel,
          });
        } else {
          await restartReg.mutateAsync(row.id);
        }
      }

      commitBaseline();
      invalidateDetail();
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      throw e;
    }
  };

  const removeDid = async () => {
    if (!row?.did) return;
    setError(null);
    try {
      await unassignDid.mutateAsync(row.id);
      patchForm({ selectedDidId: '' });
      setBaseline((b) => ({ ...b, selectedDidId: '' }));
      invalidateDetail();
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed');
    }
  };

  const provisionDeskPhone = async () => {
    if (!row) return;
    setError(null);
    try {
      await createDevice.mutateAsync({
        name: deviceForm.name || `${row.displayName} Phone`,
        deviceType: 'DESK_PHONE',
        lineId: row.lineId,
        manufacturer: deviceForm.manufacturer,
        model: deviceForm.model,
        modelFamily: deviceForm.modelFamily,
        macAddress: deviceForm.macAddress,
        serialNumber: deviceForm.serialNumber,
        assetTag: deviceForm.assetTag,
        location: deviceForm.location,
        transport: deviceForm.transport,
        tlsEnabled: deviceForm.tlsEnabled,
        srtpEnabled: deviceForm.srtpEnabled,
        firmwareChannel: deviceForm.firmwareChannel,
      });
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Provision failed');
    }
  };

  const requestTabChange = (next: ModalTabId) => {
    if (next === tab) return;
    if (isTabDirty(tab)) {
      setPendingTab(next);
      setUnsavedOpen(true);
    } else {
      setTab(next);
    }
  };

  const requestClose = () => {
    if (anyDirty) {
      setPendingTab('close');
      setUnsavedOpen(true);
    } else {
      onClose();
    }
  };

  const handleUnsavedSave = async () => {
    try {
      await saveAll(false);
      setUnsavedOpen(false);
      if (pendingTab === 'close') {
        setPendingTab(null);
        onClose();
      } else if (pendingTab) {
        setTab(pendingTab);
        setPendingTab(null);
      }
    } catch {
      /* error state set by save */
    }
  };

  const handleUnsavedDiscard = () => {
    setForm({ ...baseline });
    setUnsavedOpen(false);
    if (pendingTab === 'close') {
      setPendingTab(null);
      onClose();
    } else if (pendingTab) {
      setTab(pendingTab);
      setPendingTab(null);
    }
  };

  const users = usersQuery.data ?? [];
  const departments = (departmentsQuery.data ?? []) as { id: string; name: string }[];
  const detailLoading = !detailReady && detailQuery.isPending;
  const detailLoadError =
    !detailReady && detailQuery.isError && !extensionDetailMatchesRow(detailQuery.data, row?.id ?? '');

  const line = detailQuery.data?.line as Record<string, unknown> | undefined;
  const devices = (line?.devices as Record<string, unknown>[] | undefined) ?? [];
  const primarySip = (devices[0]?.sipEndpoint as Record<string, unknown> | undefined) ?? null;
  const provUrl = String(deskDevice?.provUrl ?? '');

  const copyProvUrl = async () => {
    if (!provUrl) return;
    await navigator.clipboard.writeText(provUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const saving =
    updateExt.isPending ||
    createDevice.isPending ||
    reprovision.isPending ||
    restartReg.isPending;

  const footer = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button variant="ghost" onClick={requestClose} disabled={saving}>
        Cancel
      </Button>
      <Button variant="outline" onClick={() => void saveAll(false)} disabled={saving || !detailReady}>
        Save
      </Button>
      <Button onClick={() => void saveAll(true)} disabled={saving || !detailReady}>
        Save &amp; Provision
      </Button>
    </div>
  );

  return (
    <>
      <Modal
        open={open && Boolean(row)}
        onClose={requestClose}
        title={row ? `Configure ${row.label}` : 'Configure extension'}
        description="Manage identity, SIP, devices, DIDs, and call features for this extension."
        size="full"
        footer={footer}
      >
        <div className="mb-5 flex flex-wrap gap-1 border-b border-border pb-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`rounded-lg px-2.5 py-1.5 text-xs sm:text-sm ${
                tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => requestTabChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {row ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
            <ExtensionStatusChip
              status={row.status}
              onlineStatus={row.onlineStatus}
              statusLabel={row.statusLabel}
            />
            <span className="font-mono text-muted-foreground">{row.extension}</span>
            {row.did ? <span className="font-mono">{row.did.formatted}</span> : null}
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {tab !== 'sip' && tab !== 'devices' && tab !== 'desk' && tab !== 'activity' ? (
          detailLoading ? (
            <DetailTabSkeleton />
          ) : detailLoadError ? (
            <DetailTabError onRetry={retryDetail} />
          ) : null
        ) : null}

        {detailReady || tab === 'sip' || tab === 'devices' || tab === 'desk' || tab === 'activity' ? (
          <>
            {tab === 'general' && row ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Extension Number">
                  <Input value={row.extension} readOnly className="bg-muted/40 font-mono" />
                </Field>
                <Field
                  label="User Name"
                  hint="Identification name shown as Extension Name in the hub (e.g. Reception, Sales, Ajay). Rename anytime."
                >
                  <Input
                    value={form.displayName}
                    onChange={(e) => patchForm({ displayName: e.target.value })}
                    placeholder={`Extension ${row.extension}`}
                  />
                </Field>
                <Field label="First Name">
                  <Input value={form.firstName} readOnly className="bg-muted/40" />
                </Field>
                <Field label="Last Name">
                  <Input value={form.lastName} readOnly className="bg-muted/40" />
                </Field>
                <Field label="Email">
                  <Input value={form.email} readOnly className="bg-muted/40" />
                </Field>
                <Field label="Caller ID Name">
                  <Input value={form.callerIdName} onChange={(e) => patchForm({ callerIdName: e.target.value })} />
                </Field>
                <Field label="Outbound Caller ID">
                  <Input value={form.outboundCallerId} readOnly className="bg-muted/40 font-mono" />
                </Field>
                <Field label="Language">
                  <select
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    value={form.language}
                    onChange={(e) => patchForm({ language: e.target.value })}
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                  </select>
                </Field>
                <Field label="Timezone">
                  <Input value={form.timezone} onChange={(e) => patchForm({ timezone: e.target.value })} />
                </Field>
                <Field
                  label="Assigned User"
                  hint="Optional account linked to this extension. Leave blank for Unassigned."
                >
                  <select
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    value={form.linkedUserId}
                    onChange={(e) => patchForm({ linkedUserId: e.target.value })}
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName || u.name || u.email}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Department">
                  <select
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    value={form.departmentId}
                    onChange={(e) => patchForm({ departmentId: e.target.value })}
                  >
                    <option value="">None</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            ) : null}

            {tab === 'sip' && row ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  <Field label="Username">
                    <Input value={String(primarySip?.authUsername ?? row.extension)} readOnly className="bg-muted/40 font-mono" />
                  </Field>
                  <Field label="Authentication ID">
                    <Input value={String(primarySip?.authUsername ?? row.extension)} readOnly className="bg-muted/40 font-mono" />
                  </Field>
                  <Field label="Password">
                    <Input value="Issued via QR / enroll token" readOnly className="bg-muted/40" />
                  </Field>
                  <Field label="Domain">
                    <Input value={String(primarySip?.aor ?? '—').split('@')[1] ?? '—'} readOnly className="bg-muted/40 font-mono" />
                  </Field>
                  <Field label="Registrar">
                    <Input value={String(primarySip?.aor ?? '—').split('@')[1] ?? '—'} readOnly className="bg-muted/40 font-mono" />
                  </Field>
                  <Field label="Transport">
                    <Input value="UDP / TLS (device dependent)" readOnly className="bg-muted/40" />
                  </Field>
                </div>
                <ExtensionQrPanel
                  row={row}
                  qr={qr}
                  loading={mobileQr.isPending}
                  onRegenerate={() => void loadQr()}
                  hasExistingMobile={row.hasMobileApp}
                />
              </div>
            ) : null}

            {tab === 'devices' && row ? (
              <div className="space-y-5">
                <div className="rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {devices.length ? (
                        devices.map((d) => (
                          <tr key={String(d.id)} className="border-b border-border/60">
                            <td className="px-3 py-2">{String(d.deviceType ?? '—')}</td>
                            <td className="px-3 py-2">{String(d.name ?? '—')}</td>
                            <td className="px-3 py-2">
                              {String(
                                (d.sipEndpoint as { registrationStatus?: string } | undefined)?.registrationStatus ??
                                  '—',
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={deleteDevice.isPending}
                                onClick={() =>
                                  void deleteDevice
                                    .mutateAsync(String(d.id))
                                    .then(() => {
                                      invalidateDetail();
                                      onSaved?.();
                                    })
                                    .catch((e: unknown) =>
                                      setError(e instanceof Error ? e.message : 'Remove device failed'),
                                    )
                                }
                              >
                                Remove Device
                              </Button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                            No devices assigned
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border p-4 text-sm">
                    <p className="font-medium">Softphone</p>
                    <p className="mt-1 text-muted-foreground">
                      {row.hasMobileApp || devices.some((d) => d.deviceType === 'WEBRTC') ? 'Configured' : 'Not set'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border p-4 text-sm">
                    <p className="font-medium">Mobile App</p>
                    <p className="mt-1 text-muted-foreground">{row.hasMobileApp ? 'Configured' : 'Not set'}</p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => setTab('sip')}>
                      Open QR
                    </Button>
                  </div>
                  <div className="rounded-xl border border-border p-4 text-sm">
                    <p className="font-medium">Desk Phone</p>
                    <p className="mt-1 text-muted-foreground">{row.hasDeskPhone ? 'Configured' : 'Not set'}</p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => setTab('desk')}>
                      {row.hasDeskPhone ? 'Manage' : 'Add Device'}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {tab === 'desk' && row ? (
              <div className="space-y-5">
                {row.hasDeskPhone && deskDevice ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Vendor">
                      <Input value={String(deskDevice.manufacturer ?? '—')} readOnly className="bg-muted/40" />
                    </Field>
                    <Field label="Model">
                      <Input value={String(deskDevice.model ?? '—')} readOnly className="bg-muted/40" />
                    </Field>
                    <Field label="MAC Address">
                      <Input value={String(deskDevice.macAddress ?? '—')} readOnly className="bg-muted/40 font-mono" />
                    </Field>
                    <Field label="Provision URL">
                      <div className="flex gap-2">
                        <Input value={provUrl || '—'} readOnly className="bg-muted/40 font-mono text-xs" />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={!provUrl}
                          onClick={() => void copyProvUrl()}
                          aria-label="Copy provision URL"
                        >
                          {copiedUrl ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </Field>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <Button
                        variant="outline"
                        disabled={!row.device?.id || reprovision.isPending}
                        onClick={() => row.device?.id && void reprovision.mutateAsync(row.device.id).then(() => onSaved?.())}
                      >
                        Regenerate Config
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!row.device?.id || reboot.isPending}
                        onClick={() => row.device?.id && void reboot.mutateAsync(row.device.id)}
                      >
                        Reboot Device
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Add a desk phone for this extension. Provision URL is available after the device is created.
                    </p>
                    <DeviceModelFields form={deviceForm} setForm={setDeviceForm} deskPhone />
                    <Button onClick={() => void provisionDeskPhone()} disabled={createDevice.isPending}>
                      Add Device
                    </Button>
                  </>
                )}
              </div>
            ) : null}

            {tab === 'did' && row ? (
              <div className="space-y-4 max-w-xl">
                <p className="text-sm text-muted-foreground">
                  DID is read-only here (One DID ↔ One Extension). Platform Admin assigns numbers to
                  your tenant and auto-creates this extension. Removing a DID keeps the extension and
                  marks it Inactive.
                </p>
                <Field label="Assigned Number">
                  {row.did ? (
                    <Input value={row.did.formatted} readOnly className="bg-muted/40 font-mono" />
                  ) : (
                    <Input value="No DID assigned" readOnly className="bg-muted/40 font-mono" />
                  )}
                </Field>
                <Field label="CNAM">
                  <Input value={form.cnam} onChange={(e) => patchForm({ cnam: e.target.value, callerIdName: e.target.value })} />
                </Field>
                <Field label="Emergency Address">
                  <Input
                    value={form.emergencyAddress}
                    onChange={(e) => patchForm({ emergencyAddress: e.target.value })}
                    placeholder="Service address for E911"
                  />
                </Field>
                {row.did ? (
                  <Button variant="outline" onClick={() => void removeDid()} disabled={unassignDid.isPending}>
                    Remove DID (mark extension Inactive)
                  </Button>
                ) : null}
              </div>
            ) : null}

            {tab === 'voicemail' && row ? (
              <div className="space-y-4 max-w-xl">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.voicemailEnabled}
                    onChange={(e) => patchForm({ voicemailEnabled: e.target.checked })}
                  />
                  Enable voicemail
                </label>
                <Field label="PIN">
                  <Input
                    type="password"
                    autoComplete="off"
                    value={form.pin}
                    onChange={(e) => patchForm({ pin: e.target.value })}
                  />
                </Field>
                <Field label="Email Notifications">
                  <Input
                    type="email"
                    value={form.voicemailNotifyEmail}
                    onChange={(e) => patchForm({ voicemailNotifyEmail: e.target.value })}
                  />
                </Field>
                <Field label="Greeting">
                  <Input
                    value={form.voicemailGreeting}
                    onChange={(e) => patchForm({ voicemailGreeting: e.target.value })}
                    placeholder="Default system greeting"
                  />
                </Field>
              </div>
            ) : null}

            {tab === 'callFeatures' && row ? (
              <div className="space-y-4 max-w-xl">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.callForwardEnabled}
                    onChange={(e) => patchForm({ callForwardEnabled: e.target.checked })}
                  />
                  Call Forward
                </label>
                <Field label="Forward Destination">
                  <Input
                    value={form.callForwardDestination}
                    onChange={(e) => patchForm({ callForwardDestination: e.target.value })}
                    placeholder="Extension or E.164"
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.dndEnabled}
                    onChange={(e) => patchForm({ dndEnabled: e.target.checked })}
                  />
                  Do Not Disturb
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.callWaitingEnabled}
                    onChange={(e) => patchForm({ callWaitingEnabled: e.target.checked })}
                  />
                  Call Waiting
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.followMeEnabled}
                    onChange={(e) => patchForm({ followMeEnabled: e.target.checked })}
                  />
                  Follow Me
                </label>
                <Field label="Ring Timeout (seconds)">
                  <Input
                    value={form.ringTimeout}
                    onChange={(e) => patchForm({ ringTimeout: e.target.value })}
                    type="number"
                    min={5}
                    max={120}
                  />
                </Field>
              </div>
            ) : null}

            {tab === 'recording' && row ? (
              <div className="space-y-4 max-w-xl">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.recordingEnabled}
                    onChange={(e) => patchForm({ recordingEnabled: e.target.checked })}
                  />
                  Recording Enabled
                </label>
                <Field label="Storage">
                  <Input value="Tenant recording storage" readOnly className="bg-muted/40" />
                </Field>
                <Link
                  href={`/reports/cdr?extension=${encodeURIComponent(row.extension)}`}
                  className="inline-flex text-sm text-primary underline"
                >
                  Download Recordings / Call History
                </Link>
              </div>
            ) : null}

            {tab === 'permissions' && row ? (
              <div className="space-y-3 max-w-xl">
                {(
                  [
                    ['outboundEnabled', 'Outbound Calling'],
                    ['inboundEnabled', 'Internal / Inbound Calls'],
                    ['internationalCalling', 'International Calling'],
                    ['internalCalls', 'Internal Calls'],
                    ['emergencyCalls', 'Emergency Calls'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form[key]}
                      onChange={(e) => patchForm({ [key]: e.target.checked })}
                      disabled={key === 'internationalCalling' || key === 'internalCalls' || key === 'emergencyCalls'}
                    />
                    {label}
                    {key === 'internationalCalling' || key === 'emergencyCalls' ? (
                      <span className="text-xs text-muted-foreground">(managed by tenant policy)</span>
                    ) : null}
                  </label>
                ))}
              </div>
            ) : null}

            {tab === 'activity' && row ? (
              <div className="space-y-4 text-sm">
                <div className="rounded-xl border border-border p-4">
                  <h3 className="font-medium">Registration History</h3>
                  <p className="mt-2 text-muted-foreground">
                    Last registration:{' '}
                    {row.lastRegistrationAt
                      ? new Date(row.lastRegistrationAt).toLocaleString()
                      : 'Never'}
                  </p>
                  <p className="mt-1 text-muted-foreground">Status: {row.registrationLabel}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => void restartReg.mutateAsync(row.id).then(() => onSaved?.())}
                  >
                    Restart Registration
                  </Button>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <h3 className="font-medium">Recent Calls</h3>
                  <p className="mt-2 text-muted-foreground">
                    {row.lastCallRelative ? `Last call ${row.lastCallRelative}` : 'No calls yet'}
                  </p>
                  <Link
                    href={`/reports/cdr?extension=${encodeURIComponent(row.extension)}`}
                    className="mt-3 inline-flex text-primary underline"
                  >
                    Open call history
                  </Link>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <h3 className="font-medium">Audit Log</h3>
                  <p className="mt-2 text-muted-foreground">
                    Extension configuration changes are recorded in tenant audit logs.
                  </p>
                  <Link href="/settings/audit" className="mt-3 inline-flex text-primary underline">
                    View audit log
                  </Link>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </Modal>

      <UnsavedChangesDialog
        open={unsavedOpen}
        onSave={() => void handleUnsavedSave()}
        onDiscard={handleUnsavedDiscard}
        onCancel={() => {
          setUnsavedOpen(false);
          setPendingTab(null);
        }}
        saving={saving}
      />
    </>
  );
}

/** @deprecated Use ExtensionConfigureModal */
export const ExtensionConfigureDrawer = ExtensionConfigureModal;

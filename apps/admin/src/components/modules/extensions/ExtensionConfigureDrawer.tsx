'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateTenantDevice } from '../../../lib/hooks/queries/use-device-mutations';
import { useTenantDepartments } from '../../../lib/hooks/queries/use-tenant-organization';
import { useTenantUsers } from '../../../lib/hooks/queries/use-tenant';
import { useUpdateTenantExtension } from '../../../lib/hooks/queries/use-tenant-mutations';
import {
  useExtensionDetail,
  useExtensionMobileQr,
  useExtensionRestartRegistration,
  useExtensionUnassignDid,
  extensionDetailMatchesRow,
  mapExtensionDetailToForm,
  type ConfigureTabId,
  type ExtensionConfigureFormState,
  type ExtensionHubRow,
  type ExtensionMobileQrResult,
} from '../../../lib/hooks/queries/use-extension-hub';
import { queryKeys } from '../../../lib/query/query-keys';
import { useTenantDids } from '../../../lib/hooks/queries/use-tenant';
import { useAssignDid } from '../../../lib/hooks/queries/use-dids';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { SlideOver } from '../../ui/SlideOver';
import { Skeleton } from '../../ui/Skeleton';
import { DeviceModelFields, emptyDeviceModelForm } from './DeviceModelFields';
import { ExtensionQrPanel } from './ExtensionQrPanel';
import { ExtensionStatusChip } from './ExtensionStatusChip';

const TABS: { id: ConfigureTabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'general', label: 'General' },
  { id: 'phone', label: 'Phone' },
  { id: 'mobile', label: 'Mobile App' },
  { id: 'desk', label: 'Desk Phone' },
  { id: 'voicemail', label: 'Voicemail' },
  { id: 'callHandling', label: 'Call Handling' },
  { id: 'advanced', label: 'Advanced' },
];

const DETAIL_TABS: ConfigureTabId[] = ['general', 'phone', 'voicemail', 'callHandling', 'advanced'];

const TAB_FIELDS: Record<ConfigureTabId, (keyof ExtensionConfigureFormState)[]> = {
  overview: [],
  general: ['displayName', 'description', 'departmentId'],
  phone: ['callerIdName'],
  mobile: [],
  desk: [],
  voicemail: ['pin', 'voicemailNotifyEmail'],
  callHandling: ['callForwardEnabled', 'callForwardDestination', 'dndEnabled', 'recordingEnabled'],
  advanced: ['linkedUserId'],
};

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

function OverviewTab({
  row,
  onSetUpPhone,
  onRestartRegistration,
}: {
  row: ExtensionHubRow;
  onSetUpPhone: () => void;
  onRestartRegistration: () => void;
}) {
  const hasNumber = Boolean(row.did);
  const hasPhone = row.status !== 'NoDevice';
  const needsBusinessSetup = row.statusLabel === 'Needs Setup';
  const needsPhoneSetup = !hasPhone;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
        <dl className="space-y-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Extension</dt>
            <dd className="mt-0.5 text-base font-semibold">{row.label}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current Number</dt>
            <dd className="mt-0.5 font-mono">{row.did?.formatted ?? 'No phone number assigned'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</dt>
            <dd className="mt-1">
              <ExtensionStatusChip
                status={row.status}
                onlineStatus={row.onlineStatus}
                statusLabel={row.statusLabel}
              />
            </dd>
          </div>
        </dl>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium">Extension Status</h3>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <span aria-hidden="true">{hasNumber ? '✓' : '✗'}</span>
            {hasNumber ? 'Phone number assigned' : 'No phone number assigned'}
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true">{hasPhone ? '✓' : '✗'}</span>
            {hasPhone ? 'Softphone / device ready' : 'No phone connected'}
          </li>
        </ul>
      </div>

      {needsPhoneSetup ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/10 p-4">
          <h3 className="text-sm font-medium">Next Step</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            This extension isn&apos;t connected to a phone yet.
          </p>
          <Button size="sm" className="mt-3" onClick={onSetUpPhone}>
            Set Up Phone
          </Button>
        </div>
      ) : needsBusinessSetup ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/10 p-4">
          <h3 className="text-sm font-medium">Next Step</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasNumber
              ? 'Infrastructure is ready. Complete display name, user, and voicemail PIN under General, Advanced, and Voicemail.'
              : 'Complete display name and user details under General and Advanced. A phone number can be assigned later by Platform.'}
          </p>
        </div>
      ) : null}

      <div className="space-y-2 text-sm">
        <h3 className="font-medium">Quick Links</h3>
        <Link
          href={`/reports/cdr?extension=${encodeURIComponent(row.extension)}`}
          className="block text-primary underline"
        >
          View call history
        </Link>
        <button
          type="button"
          className="block text-primary underline"
          onClick={onRestartRegistration}
        >
          Restart registration
        </button>
      </div>
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

export function ExtensionConfigureDrawer({
  open,
  onClose,
  row,
  onSaved,
  initialTab = 'overview',
  onSetUpPhone,
}: {
  open: boolean;
  onClose: () => void;
  row: ExtensionHubRow | null;
  onSaved?: () => void;
  initialTab?: ConfigureTabId;
  onSetUpPhone?: () => void;
}) {
  const [tab, setTab] = useState<ConfigureTabId>(initialTab);
  const [form, setForm] = useState<ExtensionConfigureFormState>(() => ({
    displayName: '',
    description: '',
    departmentId: '',
    linkedUserId: '',
    callerIdName: '',
    pin: '',
    callForwardEnabled: false,
    callForwardDestination: '',
    dndEnabled: false,
    voicemailNotifyEmail: '',
    recordingEnabled: false,
    selectedDidId: '',
  }));
  const [baseline, setBaseline] = useState<ExtensionConfigureFormState>(() => ({
    displayName: '',
    description: '',
    departmentId: '',
    linkedUserId: '',
    callerIdName: '',
    pin: '',
    callForwardEnabled: false,
    callForwardDestination: '',
    dndEnabled: false,
    voicemailNotifyEmail: '',
    recordingEnabled: false,
    selectedDidId: '',
  }));
  const [detailReady, setDetailReady] = useState(false);
  const [deviceForm, setDeviceForm] = useState(emptyDeviceModelForm);
  const [qr, setQr] = useState<ExtensionMobileQrResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingTab, setPendingTab] = useState<ConfigureTabId | 'close' | null>(null);
  const [unsavedOpen, setUnsavedOpen] = useState(false);

  const queryClient = useQueryClient();
  const activeExtensionIdRef = useRef<string | null>(null);
  const detailQuery = useExtensionDetail(row?.id ?? '', open && Boolean(row?.id));

  useEffect(() => {
    activeExtensionIdRef.current = open && row ? row.id : null;
  }, [open, row?.id]);

  const usersQuery = useTenantUsers();
  const departmentsQuery = useTenantDepartments();
  const didsQuery = useTenantDids();
  const updateExt = useUpdateTenantExtension();
  const createDevice = useCreateTenantDevice();
  const assignDid = useAssignDid();
  const unassignDid = useExtensionUnassignDid();
  const mobileQr = useExtensionMobileQr();
  const restartReg = useExtensionRestartRegistration();

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
    setTab(initialTab);
    setDeviceForm({
      ...emptyDeviceModelForm,
      name: row.device?.deviceLabel || row.device?.name || `${row.displayName} Phone`,
      manufacturer: row.device?.manufacturer ?? 'GRANDSTREAM',
      model: row.device?.model ?? '',
    });
    setQr(null);
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

  useEffect(() => {
    if (!open || !row || tab !== 'mobile') return;
    void loadQr();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id, tab]);

  const loadQr = async () => {
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
  };

  const isTabDirty = useCallback(
    (targetTab: ConfigureTabId) => {
      if (DETAIL_TABS.includes(targetTab) && !detailReady) return false;
      const fields = TAB_FIELDS[targetTab];
      return fields.some((field) => form[field] !== baseline[field]);
    },
    [baseline, detailReady, form],
  );

  const commitBaseline = useCallback(() => {
    setBaseline({ ...form });
  }, [form]);

  const saveGeneral = async () => {
    if (!row) return;
    setError(null);
    try {
      await updateExt.mutateAsync({
        id: row.id,
        payload: {
          displayName: form.displayName,
          description: form.description || null,
          departmentId: form.departmentId || null,
        },
      });
      commitBaseline();
      invalidateDetail();
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const saveAdvanced = async () => {
    if (!row) return;
    setError(null);
    try {
      await updateExt.mutateAsync({
        id: row.id,
        payload: {
          userId: form.linkedUserId || null,
        },
      });
      setBaseline((b) => ({ ...b, linkedUserId: form.linkedUserId }));
      invalidateDetail();
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const saveVoicemail = async () => {
    if (!row) return;
    setError(null);
    try {
      await updateExt.mutateAsync({
        id: row.id,
        payload: {
          settings: {
            pin: form.pin || undefined,
            voicemailNotifyEmail: form.voicemailNotifyEmail || undefined,
          },
        },
      });
      setBaseline((b) => ({
        ...b,
        pin: form.pin,
        voicemailNotifyEmail: form.voicemailNotifyEmail,
      }));
      invalidateDetail();
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const saveCallHandling = async () => {
    if (!row) return;
    setError(null);
    try {
      // TODO(recording-save): recordingEnabled is stored on RecordingPolicy, not LineTelephonySettings.
      // Load uses recordingPolicy.recordingEnabled; save path still PATCHes settings until API is wired.
      await updateExt.mutateAsync({
        id: row.id,
        payload: {
          settings: {
            callForwardEnabled: form.callForwardEnabled,
            callForwardDestination: form.callForwardDestination || undefined,
            dndEnabled: form.dndEnabled,
            recordingEnabled: form.recordingEnabled,
          } as Record<string, unknown>,
        },
      });
      setBaseline((b) => ({
        ...b,
        callForwardEnabled: form.callForwardEnabled,
        callForwardDestination: form.callForwardDestination,
        dndEnabled: form.dndEnabled,
        recordingEnabled: form.recordingEnabled,
      }));
      invalidateDetail();
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const saveCallerId = async () => {
    if (!row) return;
    setError(null);
    try {
      await updateExt.mutateAsync({
        id: row.id,
        payload: { callerIdName: form.callerIdName || undefined },
      });
      setBaseline((b) => ({ ...b, callerIdName: form.callerIdName }));
      invalidateDetail();
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const replaceDid = async () => {
    if (!row || !form.selectedDidId) return;
    setError(null);
    try {
      await assignDid.mutateAsync({
        id: form.selectedDidId,
        payload: {
          destinationType: 'EXTENSION',
          destinationId: row.id,
          callerIdName: form.callerIdName || form.displayName,
        },
      });
      setBaseline((b) => ({ ...b, selectedDidId: form.selectedDidId }));
      invalidateDetail();
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Replace failed');
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

  const requestTabChange = (next: ConfigureTabId) => {
    if (next === tab) return;
    if (isTabDirty(tab)) {
      setPendingTab(next);
      setUnsavedOpen(true);
    } else {
      setTab(next);
    }
  };

  const requestClose = () => {
    if (isTabDirty(tab)) {
      setPendingTab('close');
      setUnsavedOpen(true);
    } else {
      onClose();
    }
  };

  const handleUnsavedSave = async () => {
    try {
      if (tab === 'general') await saveGeneral();
      else if (tab === 'phone' && form.callerIdName !== baseline.callerIdName) await saveCallerId();
      else if (tab === 'voicemail') await saveVoicemail();
      else if (tab === 'callHandling') await saveCallHandling();
      else if (tab === 'advanced') await saveAdvanced();

      setUnsavedOpen(false);
      if (pendingTab === 'close') {
        setPendingTab(null);
        onClose();
      } else if (pendingTab) {
        setTab(pendingTab);
        setPendingTab(null);
      }
    } catch {
      /* error state set by save handlers */
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
  const dids = (didsQuery.data ?? []) as { id: string; number: string }[];

  const canReplaceDid = Boolean(
    form.selectedDidId && form.selectedDidId !== (row?.did?.id ?? ''),
  );
  const callerIdDirty = form.callerIdName !== baseline.callerIdName;
  const needsDetailForTab = DETAIL_TABS.includes(tab);
  const detailLoading = needsDetailForTab && !detailReady && detailQuery.isPending;
  const detailLoadError =
    needsDetailForTab &&
    !detailReady &&
    detailQuery.isError &&
    !extensionDetailMatchesRow(detailQuery.data, row?.id ?? '');

  const footer = useMemo(() => {
    if (needsDetailForTab && !detailReady) return null;
    if (tab === 'general') {
      return (
        <Button onClick={() => void saveGeneral()} disabled={updateExt.isPending || !isTabDirty('general')}>
          Save
        </Button>
      );
    }
    if (tab === 'phone') {
      return (
        <div className="flex flex-wrap gap-2">
          {row?.did ? (
            <Button variant="outline" onClick={() => void removeDid()} disabled={unassignDid.isPending}>
              Remove Number
            </Button>
          ) : null}
          {canReplaceDid ? (
            <Button onClick={() => void replaceDid()} disabled={assignDid.isPending}>
              Replace Number
            </Button>
          ) : null}
          {callerIdDirty ? (
            <Button variant="outline" onClick={() => void saveCallerId()} disabled={updateExt.isPending}>
              Save Caller ID
            </Button>
          ) : null}
        </div>
      );
    }
    if (tab === 'desk') {
      return (
        <Button onClick={() => void provisionDeskPhone()} disabled={createDevice.isPending}>
          Provision Desk Phone
        </Button>
      );
    }
    if (tab === 'voicemail') {
      return (
        <Button onClick={() => void saveVoicemail()} disabled={updateExt.isPending || !isTabDirty('voicemail')}>
          Save
        </Button>
      );
    }
    if (tab === 'callHandling') {
      return (
        <Button
          onClick={() => void saveCallHandling()}
          disabled={updateExt.isPending || !isTabDirty('callHandling')}
        >
          Save
        </Button>
      );
    }
    if (tab === 'advanced') {
      return (
        <Button onClick={() => void saveAdvanced()} disabled={updateExt.isPending || !isTabDirty('advanced')}>
          Save
        </Button>
      );
    }
    return null;
  }, [
    tab,
    needsDetailForTab,
    detailReady,
    updateExt.isPending,
    isTabDirty,
    row?.did,
    unassignDid.isPending,
    canReplaceDid,
    assignDid.isPending,
    callerIdDirty,
    createDevice.isPending,
  ]);

  const handleSetUpPhoneFromOverview = () => {
    onClose();
    onSetUpPhone?.();
  };

  return (
    <>
      <SlideOver
        open={open}
        onClose={requestClose}
        title={row ? `Configure ${row.label}` : 'Configure extension'}
        description="Change settings for this extension."
        width="xl"
        footer={footer}
      >
        <div className="mb-4 flex flex-wrap gap-1 border-b border-border pb-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`rounded-lg px-2.5 py-1.5 text-xs sm:text-sm ${tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
              onClick={() => requestTabChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {tab === 'overview' && row ? (
          <OverviewTab
            row={row}
            onSetUpPhone={handleSetUpPhoneFromOverview}
            onRestartRegistration={() => void restartReg.mutateAsync(row.id).then(() => onSaved?.())}
          />
        ) : null}

        {tab === 'general' && row ? (
          detailLoading ? (
            <DetailTabSkeleton />
          ) : detailLoadError ? (
            <DetailTabError onRetry={retryDetail} />
          ) : detailReady ? (
          <div className="space-y-4">
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Extension</span>
              <Input value={row.extension} readOnly className="bg-muted/40 font-mono" />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Display name</span>
              <Input
                value={form.displayName}
                onChange={(e) => patchForm({ displayName: e.target.value })}
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Description</span>
              <Input
                value={form.description}
                onChange={(e) => patchForm({ description: e.target.value })}
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Department</span>
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
            </label>
          </div>
          ) : null
        ) : null}

        {tab === 'phone' && row ? (
          detailLoading ? (
            <DetailTabSkeleton />
          ) : detailLoadError ? (
            <DetailTabError onRetry={retryDetail} />
          ) : detailReady ? (
          <div className="space-y-4">
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Current number</span>
              <Input
                value={row.did?.formatted ?? 'No number assigned'}
                readOnly
                className="bg-muted/40 font-mono"
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Caller ID name</span>
              <Input
                value={form.callerIdName}
                onChange={(e) => patchForm({ callerIdName: e.target.value })}
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Replace with</span>
              <select
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                value={form.selectedDidId}
                onChange={(e) => patchForm({ selectedDidId: e.target.value })}
              >
                <option value="">Select number…</option>
                {dids.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.number}
                  </option>
                ))}
              </select>
            </label>
          </div>
          ) : null
        ) : null}

        {tab === 'mobile' && row ? (
          <ExtensionQrPanel
            row={row}
            qr={qr}
            loading={mobileQr.isPending}
            onRegenerate={() => void loadQr()}
            hasExistingMobile={row.hasMobileApp}
          />
        ) : null}

        {tab === 'desk' && row ? (
          <DeviceModelFields form={deviceForm} setForm={setDeviceForm} deskPhone />
        ) : null}

        {tab === 'voicemail' && row ? (
          detailLoading ? (
            <DetailTabSkeleton />
          ) : detailLoadError ? (
            <DetailTabError onRetry={retryDetail} />
          ) : detailReady ? (
          <div className="space-y-4">
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Voicemail PIN</span>
              <Input
                value={form.pin}
                onChange={(e) => patchForm({ pin: e.target.value })}
                type="password"
                autoComplete="off"
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Notify email</span>
              <Input
                value={form.voicemailNotifyEmail}
                onChange={(e) => patchForm({ voicemailNotifyEmail: e.target.value })}
                type="email"
              />
            </label>
          </div>
          ) : null
        ) : null}

        {tab === 'callHandling' && row ? (
          detailLoading ? (
            <DetailTabSkeleton />
          ) : detailLoadError ? (
            <DetailTabError onRetry={retryDetail} />
          ) : detailReady ? (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.callForwardEnabled}
                onChange={(e) => patchForm({ callForwardEnabled: e.target.checked })}
              />
              Enable call forward
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Forward destination</span>
              <Input
                value={form.callForwardDestination}
                onChange={(e) => patchForm({ callForwardDestination: e.target.value })}
                placeholder="Extension or E.164"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.dndEnabled}
                onChange={(e) => patchForm({ dndEnabled: e.target.checked })}
              />
              Do not disturb
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.recordingEnabled}
                onChange={(e) => patchForm({ recordingEnabled: e.target.checked })}
              />
              Enable call recording for this extension
            </label>
            <p className="text-xs text-muted-foreground">
              Recording policy is applied at the line level and respects tenant compliance settings.
            </p>
          </div>
          ) : null
        ) : null}

        {tab === 'advanced' && row ? (
          detailLoading ? (
            <DetailTabSkeleton />
          ) : detailLoadError ? (
            <DetailTabError onRetry={retryDetail} />
          ) : detailReady ? (
          <div className="space-y-4 text-sm">
            <label className="block space-y-1.5">
              <span className="font-medium">Linked user (optional)</span>
              <select
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                value={form.linkedUserId}
                onChange={(e) => patchForm({ linkedUserId: e.target.value })}
              >
                <option value="">No user linked</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName || u.name || u.email}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="outline"
              disabled
              title="Archive will be available when backend lifecycle support is added"
              className="w-full justify-center opacity-60"
            >
              Archive Extension
            </Button>
          </div>
          ) : null
        ) : null}
      </SlideOver>

      <UnsavedChangesDialog
        open={unsavedOpen}
        onSave={() => void handleUnsavedSave()}
        onDiscard={handleUnsavedDiscard}
        onCancel={() => {
          setUnsavedOpen(false);
          setPendingTab(null);
        }}
        saving={updateExt.isPending}
      />
    </>
  );
}

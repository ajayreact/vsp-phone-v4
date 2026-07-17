'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Eye, EyeOff, QrCode, Star } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  useCreateTenantDevice,
  useDeleteTenantDevice,
  useMakePrimaryDevice,
  useRebootDevice,
  useReprovisionDevice,
} from '../../../lib/hooks/queries/use-device-mutations';
import {
  emptyExtensionConfigureForm,
  extensionDetailMatchesRow,
  mapExtensionDetailToForm,
  normalizeConfigureTab,
  useArchiveExtension,
  useDisableExtension,
  useEnableExtension,
  useExtensionDetail,
  useExtensionMobileQr,
  useExtensionRestartRegistration,
  useExtensionUnassignDid,
  useUnarchiveExtension,
  type ConfigureTabId,
  type ExtensionConfigureFormState,
  type ExtensionHubRow,
  type ExtensionMobileQrResult,
} from '../../../lib/hooks/queries/use-extension-hub';
import { useExtensionActivity } from '../../../lib/hooks/queries/use-extension-activity';
import { useAssignDid } from '../../../lib/hooks/queries/use-dids';
import { useTenantDepartments } from '../../../lib/hooks/queries/use-tenant-organization';
import { useUpdateTenantExtension } from '../../../lib/hooks/queries/use-tenant-mutations';
import { useTenantDids, useTenantUsers } from '../../../lib/hooks/queries/use-tenant';
import { useRevealSipPassword, useResetSipPassword, useSipCredentials } from '../../../lib/hooks/queries/use-sip-credentials';
import { formatPhoneDisplay } from '../../../lib/extensions/format-extension-label';
import { deviceRepository } from '../../../lib/repositories/device.repository';
import { tenantRepository } from '../../../lib/repositories/tenant.repository';
import { queryKeys } from '../../../lib/query/query-keys';
import { useToast } from '../../../lib/toast/ToastProvider';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Modal } from '../../ui/Modal';
import { Skeleton } from '../../ui/Skeleton';
import { ActivityTimeline } from './ActivityTimeline';
import { emptyDeviceModelForm } from './DeviceModelFields';
import { ExtensionOverviewHeader } from './ExtensionOverviewHeader';
import { ExtensionQrPanel } from './ExtensionQrPanel';
import { ExtensionQuickActionsMenu, type QuickActionHandlers } from './ExtensionQuickActionsMenu';

type ModalTabId = ReturnType<typeof normalizeConfigureTab>;

const HARDWARE_BRANDS = ['GRANDSTREAM', 'YEALINK', 'FANVIL', 'CISCO', 'POLY', 'SNOM'] as const;
type AddDeviceChoice = 'MOBILE' | 'WEBRTC' | (typeof HARDWARE_BRANDS)[number];
const ADD_DEVICE_CHOICES: { id: AddDeviceChoice; label: string }[] = [
  { id: 'MOBILE', label: 'Mobile App' },
  { id: 'WEBRTC', label: 'WebRTC' },
  { id: 'GRANDSTREAM', label: 'Grandstream' },
  { id: 'YEALINK', label: 'Yealink' },
  { id: 'FANVIL', label: 'Fanvil' },
  { id: 'CISCO', label: 'Cisco' },
  { id: 'POLY', label: 'Poly' },
  { id: 'SNOM', label: 'Snom' },
];

/** Extension Workspace tabs — the Configure modal is the single source of truth for one employee's setup. */
const TABS: { id: ModalTabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'did', label: 'DID' },
  { id: 'devices', label: 'Device' },
  { id: 'desk', label: 'Provisioning' },
  { id: 'voicemail', label: 'Voicemail' },
  { id: 'callFeatures', label: 'Call Features' },
  { id: 'recording', label: 'Recording' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'activity', label: 'Activity' },
];

const DIRTY_FIELDS: Record<ModalTabId, (keyof ExtensionConfigureFormState)[]> = {
  general: ['displayName', 'description', 'departmentId', 'linkedUserId', 'callerIdName', 'language', 'timezone'],
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
  const [didPickerOpen, setDidPickerOpen] = useState(false);
  const [didSearch, setDidSearch] = useState('');
  const [didBusy, setDidBusy] = useState(false);
  const [addDeviceChoice, setAddDeviceChoice] = useState<AddDeviceChoice>('WEBRTC');
  const [visitedTabs, setVisitedTabs] = useState<Set<ModalTabId>>(() => new Set([normalizeConfigureTab(initialTab)]));
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [saveProgress, setSaveProgress] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const toast = useToast();
  const router = useRouter();
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
  const makePrimaryDevice = useMakePrimaryDevice();
  const unassignDid = useExtensionUnassignDid();
  const assignDid = useAssignDid();
  const mobileQr = useExtensionMobileQr();
  const restartReg = useExtensionRestartRegistration();
  const reboot = useRebootDevice();
  const reprovision = useReprovisionDevice();
  const disableExt = useDisableExtension();
  const enableExt = useEnableExtension();
  const archiveExt = useArchiveExtension();
  const unarchiveExt = useUnarchiveExtension();
  const revealSipPassword = useRevealSipPassword();
  const resetSipPassword = useResetSipPassword();
  const availableDidsQuery = useTenantDids(didSearch, { enabled: visitedTabs.has('did') });
  const sipCredentialsQuery = useSipCredentials(row?.lineId ?? '', open && visitedTabs.has('devices') && Boolean(row?.lineId));
  const activityQuery = useExtensionActivity(row?.id ?? '', open && visitedTabs.has('activity') && Boolean(row?.id));

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
    const startTab = normalizeConfigureTab(initialTab);
    setTab(startTab);
    setVisitedTabs(new Set([startTab]));
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
    setDidPickerOpen(false);
    setDidSearch('');
    setAddDeviceChoice('WEBRTC');
    setRevealedPassword(null);
    setSaveProgress(null);

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
    if (!open || !row || tab !== 'devices') return;
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
      if (!detailReady && targetTab !== 'devices' && targetTab !== 'desk' && targetTab !== 'activity') {
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
    setSaveProgress('Saving configuration…');
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
          setSaveProgress('Regenerating config…');
          await reprovision.mutateAsync(row.device.id);
          setSaveProgress('Pushing to device…');
          if (row.onlineStatus === 'Online') {
            setSaveProgress('Rebooting…');
            await reboot.mutateAsync(row.device.id);
          }
        } else if (deviceForm.macAddress.trim()) {
          setSaveProgress('Provisioning new device…');
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
          setSaveProgress('Restarting registration…');
          await restartReg.mutateAsync(row.id);
        }
      }

      commitBaseline();
      invalidateDetail();
      onSaved?.();
      toast.success(andProvision ? 'Configuration Saved & Provisioned' : 'Configuration Saved');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Save failed';
      setError(message);
      toast.error('Save Failed', { description: message });
      throw e;
    } finally {
      setSaveProgress(null);
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
      toast.success('DID Removed');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Remove failed';
      setError(message);
      toast.error('Remove DID Failed', { description: message });
    }
  };

  /** Assign or change the DID bound to this extension — Change swaps by unassigning first (One DID ↔ One Extension). */
  const assignSelectedDid = async (phoneNumberId: string) => {
    if (!row) return;
    setError(null);
    setDidBusy(true);
    try {
      if (row.did && row.did.id !== phoneNumberId) {
        await unassignDid.mutateAsync(row.id);
      }
      await assignDid.mutateAsync({
        id: phoneNumberId,
        payload: {
          destinationType: 'EXTENSION',
          destinationId: row.id,
          callerIdName: form.callerIdName || form.cnam || undefined,
        },
      });
      void queryClient.invalidateQueries({ queryKey: ['tenant', 'extensionHub'] });
      invalidateDetail();
      setDidPickerOpen(false);
      setDidSearch('');
      onSaved?.();
      toast.success('DID Assigned');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Assign DID failed';
      setError(message);
      toast.error('Assign DID Failed', { description: message });
    } finally {
      setDidBusy(false);
    }
  };

  /** Unified Add Device — Mobile App / WebRTC create a softphone stub; hardware brands require a MAC address. */
  const addDeviceGeneric = async () => {
    if (!row) return;
    const isHardware = (HARDWARE_BRANDS as readonly string[]).includes(addDeviceChoice);
    if (isHardware && !deviceForm.macAddress.trim()) {
      setError('MAC address is required for hardware devices.');
      return;
    }
    setError(null);
    try {
      await createDevice.mutateAsync({
        name:
          deviceForm.name ||
          `${row.displayName} ${isHardware ? 'Phone' : addDeviceChoice === 'MOBILE' ? 'Mobile' : 'Softphone'}`,
        deviceType: isHardware ? 'DESK_PHONE' : addDeviceChoice,
        lineId: row.lineId,
        manufacturer: isHardware ? addDeviceChoice : undefined,
        model: isHardware ? deviceForm.model : undefined,
        macAddress: isHardware ? deviceForm.macAddress : undefined,
        transport: isHardware ? deviceForm.transport : undefined,
      });
      toast.success('Device Added');
      invalidateDetail();
      onSaved?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Add device failed';
      setError(message);
      toast.error('Add Device Failed', { description: message });
    }
  };

  const requestTabChange = (next: ModalTabId) => {
    if (next === tab) return;
    if (isTabDirty(tab)) {
      setPendingTab(next);
      setUnsavedOpen(true);
    } else {
      setTab(next);
      setVisitedTabs((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
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
        setVisitedTabs((prev) => (prev.has(pendingTab) ? prev : new Set(prev).add(pendingTab)));
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
      setVisitedTabs((prev) => (prev.has(pendingTab) ? prev : new Set(prev).add(pendingTab)));
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
  const provUrl = String(deskDevice?.provUrl ?? '');

  const availableUnassignedDids = useMemo(() => {
    type PickRow = { id: string; number: string; line?: { extension?: { extension?: string } } | null; routed?: boolean; routing?: unknown };
    const all = (availableDidsQuery.data as PickRow[] | undefined) ?? [];
    return all.filter((d) => {
      if (row?.did?.id === d.id) return false;
      return !d.line?.extension?.extension && !d.routed && !d.routing;
    });
  }, [availableDidsQuery.data, row?.did?.id]);

  const copyProvUrl = async () => {
    if (!provUrl) return;
    await navigator.clipboard.writeText(provUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const copyToClipboard = useCallback(
    async (text: string, successLabel: string) => {
      if (!text) {
        toast.error(`Nothing to copy for ${successLabel.toLowerCase()}`);
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        toast.success(successLabel);
      } catch (e) {
        toast.error('Copy failed', { description: e instanceof Error ? e.message : undefined });
      }
    },
    [toast],
  );

  const makeDevicePrimary = useCallback(
    (deviceId: string) => {
      void makePrimaryDevice
        .mutateAsync(deviceId)
        .then(() => {
          toast.success('Primary Device Changed');
          invalidateDetail();
          onSaved?.();
        })
        .catch((e: unknown) => toast.error('Make Primary Failed', { description: e instanceof Error ? e.message : undefined }));
    },
    [makePrimaryDevice, invalidateDetail, onSaved, toast],
  );

  const doRevealSipPassword = useCallback(() => {
    if (!row?.lineId) return;
    void revealSipPassword
      .mutateAsync(row.lineId)
      .then((res) => setRevealedPassword(res.password))
      .catch((e: unknown) => toast.error('Reveal Password Failed', { description: e instanceof Error ? e.message : undefined }));
  }, [revealSipPassword, row?.lineId, toast]);

  const doResetSipPassword = useCallback(() => {
    if (!row?.lineId) return;
    if (!window.confirm('Resetting the SIP password will sign out the currently registered device until it re-registers with the new password. Continue?')) {
      return;
    }
    void resetSipPassword
      .mutateAsync(row.lineId)
      .then((res) => {
        setRevealedPassword(res.password);
        toast.success('SIP Password Reset');
        void queryClient.invalidateQueries({ queryKey: queryKeys.tenant.sipCredentials(row.lineId) });
      })
      .catch((e: unknown) => toast.error('Reset Password Failed', { description: e instanceof Error ? e.message : undefined }));
  }, [resetSipPassword, row?.lineId, toast, queryClient]);

  const quickActionHandlers: QuickActionHandlers = useMemo(
    () => ({
      onOpenSoftphone: () => router.push('/softphone'),
      onCopyExtension: () => void copyToClipboard(row?.extension ?? '', 'Extension Copied'),
      onCopySipUsername: () => {
        if (!row?.lineId) return;
        void tenantRepository
          .getSipCredentials(row.lineId)
          .then((creds) => copyToClipboard(creds.username, 'SIP Username Copied'))
          .catch((e: unknown) => toast.error('Could not load SIP username', { description: e instanceof Error ? e.message : undefined }));
      },
      onCopyProvisionUrl: () => {
        if (!row?.device?.id) return;
        void deviceRepository
          .getDevice(row.device.id)
          .then((d) => copyToClipboard(String((d as Record<string, unknown>).provUrl ?? ''), 'Provision URL Copied'))
          .catch((e: unknown) => toast.error('Could not load provision URL', { description: e instanceof Error ? e.message : undefined }));
      },
      onGenerateQr: () => {
        requestTabChange('devices');
        void loadQr();
      },
      onResetSipPassword: doResetSipPassword,
      onRestartRegistration: () => {
        if (!row?.id) return;
        void restartReg
          .mutateAsync(row.id)
          .then(() => {
            toast.success('Registration Restarted');
            onSaved?.();
          })
          .catch((e: unknown) => toast.error('Restart Registration Failed', { description: e instanceof Error ? e.message : undefined }));
      },
      onReProvisionDevice: () => {
        if (!row?.device?.id) return;
        void reprovision
          .mutateAsync(row.device.id)
          .then(() => {
            toast.success('Provision Successful');
            onSaved?.();
          })
          .catch((e: unknown) => toast.error('Re-Provision Failed', { description: e instanceof Error ? e.message : undefined }));
      },
      onRebootDeskPhone: () => {
        if (!row?.device?.id) return;
        void reboot
          .mutateAsync(row.device.id)
          .then(() => toast.success('Reboot Command Sent'))
          .catch((e: unknown) => toast.error('Reboot Failed', { description: e instanceof Error ? e.message : undefined }));
      },
      onDisableExtension: () => {
        if (!row?.id) return;
        void disableExt
          .mutateAsync(row.id)
          .then(() => {
            toast.success('Extension Disabled');
            onSaved?.();
          })
          .catch((e: unknown) => toast.error('Disable Failed', { description: e instanceof Error ? e.message : undefined }));
      },
      onEnableExtension: () => {
        if (!row?.id) return;
        void enableExt
          .mutateAsync(row.id)
          .then(() => {
            toast.success('Extension Enabled');
            onSaved?.();
          })
          .catch((e: unknown) => toast.error('Enable Failed', { description: e instanceof Error ? e.message : undefined }));
      },
      onArchiveExtension: () => {
        if (!row?.id) return;
        void archiveExt
          .mutateAsync(row.id)
          .then(() => {
            toast.success('Extension Archived');
            onSaved?.();
          })
          .catch((e: unknown) => toast.error('Archive Failed', { description: e instanceof Error ? e.message : undefined }));
      },
      onUnarchiveExtension: () => {
        if (!row?.id) return;
        void unarchiveExt
          .mutateAsync(row.id)
          .then(() => {
            toast.success('Extension Restored');
            onSaved?.();
          })
          .catch((e: unknown) => toast.error('Restore Failed', { description: e instanceof Error ? e.message : undefined }));
      },
    }),
    [
      router,
      row,
      copyToClipboard,
      toast,
      doResetSipPassword,
      restartReg,
      reprovision,
      reboot,
      disableExt,
      enableExt,
      archiveExt,
      unarchiveExt,
      onSaved,
    ],
  );

  const saving =
    updateExt.isPending ||
    createDevice.isPending ||
    reprovision.isPending ||
    reboot.isPending ||
    restartReg.isPending;

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs font-medium text-muted-foreground" aria-live="polite">
        {saveProgress ?? ''}
      </span>
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
    </div>
  );

  return (
    <>
      <Modal
        open={open && Boolean(row)}
        onClose={requestClose}
        title={row ? `Configure ${row.label}` : 'Configure extension'}
        description="One screen for this employee — identity, DID, devices, provisioning, voicemail, and call features."
        size="full"
        footer={footer}
      >
        {row ? (
          <ExtensionOverviewHeader
            row={row}
            actions={<ExtensionQuickActionsMenu row={row} handlers={quickActionHandlers} />}
          />
        ) : null}

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

        {error ? (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {tab !== 'devices' && tab !== 'desk' && tab !== 'activity' ? (
          detailLoading ? (
            <DetailTabSkeleton />
          ) : detailLoadError ? (
            <DetailTabError onRetry={retryDetail} />
          ) : null
        ) : null}

        {detailReady || tab === 'devices' || tab === 'desk' || tab === 'activity' ? (
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

            {tab === 'devices' && row ? (
              <div className="space-y-6">
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Manufacturer</th>
                        <th className="px-3 py-2">Model</th>
                        <th className="px-3 py-2">MAC</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Last Seen</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {devices.length ? (
                        devices.map((d) => {
                          const deviceId = String(d.id);
                          const isPrimary = Boolean(d.isPrimary);
                          const lastSeen = (d.lastSeenAt as string | null | undefined) ?? null;
                          return (
                            <tr key={deviceId} className="border-b border-border/60">
                              <td className="px-3 py-2">{String(d.deviceType ?? '—')}</td>
                              <td className="px-3 py-2">
                                <span className="inline-flex items-center gap-1.5">
                                  {String(d.name ?? '—')}
                                  {isPrimary ? (
                                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-label="Primary device" />
                                  ) : null}
                                </span>
                              </td>
                              <td className="px-3 py-2">{String(d.manufacturer ?? '—')}</td>
                              <td className="px-3 py-2">{String(d.model ?? '—')}</td>
                              <td className="px-3 py-2 font-mono text-xs">{String(d.macAddress ?? '—')}</td>
                              <td className="px-3 py-2">
                                {String(
                                  (d.sipEndpoint as { registrationStatus?: string } | undefined)?.registrationStatus ??
                                    '—',
                                )}
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                {lastSeen ? new Date(lastSeen).toLocaleString() : 'Never'}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-2">
                                  {!isPrimary && devices.length > 1 ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={makePrimaryDevice.isPending}
                                      onClick={() => makeDevicePrimary(deviceId)}
                                    >
                                      Make Primary
                                    </Button>
                                  ) : null}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={deleteDevice.isPending}
                                    onClick={() =>
                                      void deleteDevice
                                        .mutateAsync(deviceId)
                                        .then(() => {
                                          invalidateDetail();
                                          onSaved?.();
                                          toast.success('Device Removed');
                                        })
                                        .catch((e: unknown) => {
                                          const message = e instanceof Error ? e.message : 'Remove device failed';
                                          setError(message);
                                          toast.error('Remove Device Failed', { description: message });
                                        })
                                    }
                                  >
                                    Remove Device
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                            No devices assigned
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-xl border border-border p-4">
                  <p className="mb-3 text-sm font-medium">Add Device</p>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="block space-y-1.5 text-sm">
                      <span className="font-medium">Type</span>
                      <select
                        className="h-10 w-48 rounded-xl border border-border bg-background px-3 text-sm"
                        value={addDeviceChoice}
                        onChange={(e) => {
                          const next = e.target.value as AddDeviceChoice;
                          setAddDeviceChoice(next);
                          if ((HARDWARE_BRANDS as readonly string[]).includes(next)) {
                            setDeviceForm((f) => ({ ...f, manufacturer: next }));
                          }
                        }}
                      >
                        {ADD_DEVICE_CHOICES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(HARDWARE_BRANDS as readonly string[]).includes(addDeviceChoice) ? (
                      <>
                        <label className="block space-y-1.5 text-sm">
                          <span className="font-medium">MAC Address</span>
                          <Input
                            value={deviceForm.macAddress}
                            onChange={(e) => setDeviceForm((f) => ({ ...f, macAddress: e.target.value }))}
                            placeholder="AA:BB:CC:DD:EE:FF"
                            className="w-48 font-mono"
                          />
                        </label>
                        <label className="block space-y-1.5 text-sm">
                          <span className="font-medium">Model</span>
                          <Input
                            value={deviceForm.model}
                            onChange={(e) => setDeviceForm((f) => ({ ...f, model: e.target.value }))}
                            className="w-40"
                          />
                        </label>
                      </>
                    ) : null}
                    <Button onClick={() => void addDeviceGeneric()} disabled={createDevice.isPending}>
                      Add Device
                    </Button>
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">SIP Credentials</p>
                      {sipCredentialsQuery.isFetching ? (
                        <span className="text-xs text-muted-foreground">Loading…</span>
                      ) : null}
                    </div>
                    <Field label="Username">
                      <div className="flex gap-2">
                        <Input
                          value={sipCredentialsQuery.data?.username ?? row.extension}
                          readOnly
                          className="bg-muted/40 font-mono"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() =>
                            void copyToClipboard(sipCredentialsQuery.data?.username ?? row.extension, 'Username Copied')
                          }
                          aria-label="Copy SIP username"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </Field>
                    <Field label="Password" hint="Hidden by default — reveal only when needed.">
                      <div className="flex gap-2">
                        <Input
                          type={revealedPassword ? 'text' : 'password'}
                          value={revealedPassword ?? '••••••••••••'}
                          readOnly
                          className="bg-muted/40 font-mono"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={revealSipPassword.isPending}
                          onClick={() => (revealedPassword ? setRevealedPassword(null) : doRevealSipPassword())}
                          aria-label={revealedPassword ? 'Hide password' : 'Reveal password'}
                        >
                          {revealedPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={!revealedPassword}
                          onClick={() => revealedPassword && void copyToClipboard(revealedPassword, 'Password Copied')}
                          aria-label="Copy password"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </Field>
                    <Field label="Domain">
                      <Input value={sipCredentialsQuery.data?.domain ?? '—'} readOnly className="bg-muted/40 font-mono" />
                    </Field>
                    <Field label="Outbound Proxy">
                      <Input value={sipCredentialsQuery.data?.outboundProxy ?? '—'} readOnly className="bg-muted/40 font-mono" />
                    </Field>
                    <Field label="Transport">
                      <Input value={sipCredentialsQuery.data?.transport ?? 'UDP'} readOnly className="bg-muted/40" />
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={resetSipPassword.isPending} onClick={doResetSipPassword}>
                        Reset Password
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void loadQr()} disabled={mobileQr.isPending}>
                        <QrCode className="h-4 w-4" />
                        Generate QR
                      </Button>
                    </div>
                  </div>
                  <ExtensionQrPanel
                    row={row}
                    qr={qr}
                    loading={mobileQr.isPending}
                    onRegenerate={() => void loadQr()}
                    hasExistingMobile={row.hasMobileApp}
                  />
                </div>
              </div>
            ) : null}

            {tab === 'desk' && row ? (
              <div className="space-y-5">
                {row.hasDeskPhone && deskDevice ? (
                  <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Vendor">
                        <Input value={String(deskDevice.manufacturer ?? '—')} readOnly className="bg-muted/40" />
                      </Field>
                      <Field label="Model">
                        <Input value={String(deskDevice.model ?? '—')} readOnly className="bg-muted/40" />
                      </Field>
                      <Field label="Firmware">
                        <Input value={String(deskDevice.firmwareVersion ?? '—')} readOnly className="bg-muted/40" />
                      </Field>
                      <Field label="MAC Address">
                        <Input value={String(deskDevice.macAddress ?? '—')} readOnly className="bg-muted/40 font-mono" />
                      </Field>
                      <Field label="Configuration Version">
                        <Input value={String(deskDevice.version ?? deskDevice.configVersion ?? '—')} readOnly className="bg-muted/40" />
                      </Field>
                      <Field label="Last Provision">
                        <Input
                          value={
                            deskDevice.lastProvisionedAt
                              ? new Date(String(deskDevice.lastProvisionedAt)).toLocaleString()
                              : 'Never'
                          }
                          readOnly
                          className="bg-muted/40"
                        />
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
                          onClick={() =>
                            row.device?.id &&
                            void reprovision
                              .mutateAsync(row.device.id)
                              .then(() => {
                                onSaved?.();
                                toast.success('Provision Successful');
                              })
                              .catch((e: unknown) =>
                                toast.error('Regenerate Config Failed', { description: e instanceof Error ? e.message : undefined }),
                              )
                          }
                        >
                          Regenerate Config
                        </Button>
                        <Button
                          variant="outline"
                          disabled={!row.device?.id || reprovision.isPending}
                          onClick={() =>
                            row.device?.id &&
                            void reprovision
                              .mutateAsync(row.device.id)
                              .then(() => {
                                onSaved?.();
                                toast.success('Re-Provision Successful');
                              })
                              .catch((e: unknown) =>
                                toast.error('Re-Provision Failed', { description: e instanceof Error ? e.message : undefined }),
                              )
                          }
                        >
                          Re-Provision
                        </Button>
                        <Button
                          variant="outline"
                          disabled={!row.device?.id || reboot.isPending}
                          onClick={() =>
                            row.device?.id &&
                            void reboot
                              .mutateAsync(row.device.id)
                              .then(() => toast.success('Reboot Command Sent'))
                              .catch((e: unknown) =>
                                toast.error('Reboot Failed', { description: e instanceof Error ? e.message : undefined }),
                              )
                          }
                        >
                          Reboot Device
                        </Button>
                      </div>
                    </div>
                    {provUrl ? (
                      <div className="flex flex-col items-center gap-2 rounded-xl border border-border p-3">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(provUrl)}`}
                          alt="Provisioning URL QR code"
                          width={160}
                          height={160}
                          className="rounded-lg"
                        />
                        <span className="text-xs text-muted-foreground">Scan to provision</span>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    <p className="mb-3 font-medium text-foreground">No desk phone yet.</p>
                    <p className="mb-4">Add a desk phone from the Device tab to see its vendor, model, MAC, and provisioning URL here.</p>
                    <Button variant="outline" onClick={() => setTab('devices')}>
                      Go to Device tab
                    </Button>
                  </div>
                )}
              </div>
            ) : null}

            {tab === 'did' && row ? (
              <div className="space-y-4 max-w-xl">
                <p className="text-sm text-muted-foreground">
                  One DID ↔ One Extension. Numbers are assigned to your tenant by Platform Admin, then bound to an
                  extension here. Assign, change, or remove the number for this extension without leaving Configure.
                </p>
                <Field label="Primary DID">
                  {row.did ? (
                    <Input value={row.did.formatted} readOnly className="bg-muted/40 font-mono" />
                  ) : (
                    <Input value="No DID assigned" readOnly className="bg-muted/40 font-mono" />
                  )}
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setDidPickerOpen((v) => !v)}>
                    {row.did ? 'Change DID' : 'Assign DID'}
                  </Button>
                  {row.did ? (
                    <Button variant="outline" onClick={() => void removeDid()} disabled={unassignDid.isPending}>
                      Remove DID (mark extension Inactive)
                    </Button>
                  ) : null}
                </div>

                {didPickerOpen ? (
                  <div className="rounded-xl border border-border p-3">
                    <Input
                      placeholder="Search available numbers…"
                      value={didSearch}
                      onChange={(e) => setDidSearch(e.target.value)}
                      className="mb-3"
                    />
                    <div className="max-h-56 space-y-1 overflow-y-auto">
                      {availableDidsQuery.isLoading ? (
                        <p className="px-1 py-2 text-sm text-muted-foreground">Loading…</p>
                      ) : availableUnassignedDids.length ? (
                        availableUnassignedDids.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            disabled={didBusy}
                            onClick={() => void assignSelectedDid(d.id)}
                            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm font-mono hover:bg-muted disabled:opacity-50"
                          >
                            <span>{formatPhoneDisplay(String(d.number))}</span>
                            <span className="text-xs text-primary">Select</span>
                          </button>
                        ))
                      ) : (
                        <p className="px-1 py-2 text-sm text-muted-foreground">
                          No unassigned numbers. Ask Platform Admin to assign more DIDs to your tenant.
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}

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

                <div className="mt-2 rounded-xl border border-dashed border-border bg-muted/20 p-4 opacity-70">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-muted-foreground">Secondary DIDs</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Coming soon
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Multiple DIDs per extension are not yet supported. This section is reserved for future
                    secondary-number assignment.
                  </p>
                  <Button variant="outline" size="sm" className="mt-3" disabled>
                    Add Secondary DID
                  </Button>
                </div>
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">Activity Timeline</h3>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={restartReg.isPending}
                      onClick={() =>
                        void restartReg
                          .mutateAsync(row.id)
                          .then(() => {
                            onSaved?.();
                            toast.success('Registration Restarted');
                          })
                          .catch((e: unknown) =>
                            toast.error('Restart Registration Failed', {
                              description: e instanceof Error ? e.message : undefined,
                            }),
                          )
                      }
                    >
                      Restart Registration
                    </Button>
                    <Link
                      href={`/reports/cdr?extension=${encodeURIComponent(row.extension)}`}
                      className="text-xs text-primary underline"
                    >
                      Open call history
                    </Link>
                  </div>
                </div>
                <ActivityTimeline events={activityQuery.data} loading={activityQuery.isLoading} />
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

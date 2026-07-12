'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCreateTenantDevice } from '../../../lib/hooks/queries/use-device-mutations';
import { useTenantDepartments } from '../../../lib/hooks/queries/use-tenant-organization';
import { useTenantUsers } from '../../../lib/hooks/queries/use-tenant';
import { useUpdateTenantExtension } from '../../../lib/hooks/queries/use-tenant-mutations';
import {
  useExtensionMobileQr,
  useExtensionUnassignDid,
  type ConfigureTabId,
  type ExtensionHubRow,
  type ExtensionMobileQrResult,
} from '../../../lib/hooks/queries/use-extension-hub';
import { useTenantDids } from '../../../lib/hooks/queries/use-tenant';
import { useAssignDid } from '../../../lib/hooks/queries/use-dids';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { SlideOver } from '../../ui/SlideOver';
import { DeviceModelFields, emptyDeviceModelForm } from './DeviceModelFields';
import { ExtensionQrPanel } from './ExtensionQrPanel';
import { ExtensionStatusChip } from './ExtensionStatusChip';

const TABS: { id: ConfigureTabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'phone', label: 'Phone Number' },
  { id: 'mobile', label: 'Mobile App' },
  { id: 'desk', label: 'Desk Phone' },
  { id: 'voicemail', label: 'Voicemail' },
  { id: 'callForward', label: 'Call Forward' },
  { id: 'recording', label: 'Recording' },
  { id: 'security', label: 'Security' },
  { id: 'advanced', label: 'Advanced' },
];

export function ExtensionConfigureDrawer({
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
  const [tab, setTab] = useState<ConfigureTabId>(initialTab);
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [linkedUserId, setLinkedUserId] = useState('');
  const [callerIdName, setCallerIdName] = useState('');
  const [pin, setPin] = useState('');
  const [callForwardEnabled, setCallForwardEnabled] = useState(false);
  const [callForwardDestination, setCallForwardDestination] = useState('');
  const [dndEnabled, setDndEnabled] = useState(false);
  const [voicemailNotifyEmail, setVoicemailNotifyEmail] = useState('');
  const [recordingEnabled, setRecordingEnabled] = useState(false);
  const [selectedDidId, setSelectedDidId] = useState('');
  const [deviceForm, setDeviceForm] = useState(emptyDeviceModelForm);
  const [qr, setQr] = useState<ExtensionMobileQrResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const usersQuery = useTenantUsers();
  const departmentsQuery = useTenantDepartments();
  const didsQuery = useTenantDids();
  const updateExt = useUpdateTenantExtension();
  const createDevice = useCreateTenantDevice();
  const assignDid = useAssignDid();
  const unassignDid = useExtensionUnassignDid();
  const mobileQr = useExtensionMobileQr();

  useEffect(() => {
    if (!open || !row) return;
    setTab(initialTab);
    setDisplayName(row.displayName);
    setDescription(row.description ?? '');
    setDepartmentId(row.department?.id ?? '');
    setLinkedUserId(row.linkedUser?.id ?? '');
    setDeviceForm({
      ...emptyDeviceModelForm,
      name: row.device?.deviceLabel || row.device?.name || `${row.displayName} Phone`,
      manufacturer: row.device?.manufacturer ?? 'GRANDSTREAM',
      model: row.device?.model ?? '',
    });
    setSelectedDidId(row.did?.id ?? '');
    setQr(null);
    setError(null);
  }, [open, row, initialTab]);

  useEffect(() => {
    if (!open || !row || tab !== 'mobile') return;
    void loadQr();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id, tab]);

  const loadQr = async () => {
    if (!row) return;
    try {
      const res = await mobileQr.mutateAsync(row.id);
      setQr(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'QR generation failed');
    }
  };

  const saveGeneral = async () => {
    if (!row) return;
    setError(null);
    try {
      await updateExt.mutateAsync({
        id: row.id,
        payload: {
          displayName,
          description: description || null,
          departmentId: departmentId || null,
          userId: linkedUserId || null,
        },
      });
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const saveTelephony = async (extra?: Record<string, unknown>) => {
    if (!row) return;
    setError(null);
    try {
      await updateExt.mutateAsync({
        id: row.id,
        payload: {
          callerIdName: callerIdName || undefined,
          settings: {
            pin: pin || undefined,
            callForwardEnabled,
            callForwardDestination: callForwardDestination || undefined,
            dndEnabled,
            voicemailNotifyEmail: voicemailNotifyEmail || undefined,
            ...extra,
          },
        },
      });
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const saveDid = async () => {
    if (!row || !selectedDidId) return;
    setError(null);
    try {
      await assignDid.mutateAsync({
        id: selectedDidId,
        payload: {
          destinationType: 'EXTENSION',
          destinationId: row.id,
          callerIdName: displayName,
        },
      });
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assign failed');
    }
  };

  const removeDid = async () => {
    if (!row?.did) return;
    setError(null);
    try {
      await unassignDid.mutateAsync(row.id);
      setSelectedDidId('');
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

  const users = usersQuery.data ?? [];
  const departments = (departmentsQuery.data ?? []) as { id: string; name: string }[];
  const dids = (didsQuery.data ?? []) as { id: string; number: string }[];

  const footer = (() => {
    if (tab === 'general') {
      return (
        <Button onClick={() => void saveGeneral()} disabled={updateExt.isPending}>
          Save
        </Button>
      );
    }
    if (tab === 'phone') {
      return (
        <div className="flex gap-2">
          {row?.did ? (
            <Button variant="outline" onClick={() => void removeDid()} disabled={unassignDid.isPending}>
              Remove Number
            </Button>
          ) : null}
          <Button onClick={() => void saveDid()} disabled={assignDid.isPending || !selectedDidId}>
            Assign Number
          </Button>
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
    if (['voicemail', 'callForward', 'recording', 'security', 'advanced'].includes(tab)) {
      return (
        <Button onClick={() => void saveTelephony()} disabled={updateExt.isPending}>
          Save
        </Button>
      );
    }
    return null;
  })();

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={row ? `Configure ${row.label}` : 'Configure extension'}
      description="All extension settings in one place — no navigation required."
      width="xl"
      footer={footer}
    >
      {row ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/20 p-3">
          <ExtensionStatusChip
            status={row.status}
            label={row.statusLabel}
            registrationLabel={row.registrationLabel}
            onlineStatus={row.onlineStatus}
          />
          {row.did ? <span className="font-mono text-sm">{row.did.formatted}</span> : null}
          {row.device?.deviceLabel ? <span className="text-sm">{row.device.deviceLabel}</span> : null}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-1 border-b border-border pb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rounded-lg px-2.5 py-1.5 text-xs sm:text-sm ${tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
            onClick={() => setTab(t.id)}
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

      {tab === 'general' && row ? (
        <div className="space-y-4">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Extension</span>
            <Input value={row.extension} readOnly className="bg-muted/40 font-mono" />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Display name</span>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Description</span>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Department</span>
            <select
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">None</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Linked user (optional)</span>
            <select
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              value={linkedUserId}
              onChange={(e) => setLinkedUserId(e.target.value)}
            >
              <option value="">No user linked</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName || u.name || u.email}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {tab === 'phone' && row ? (
        <div className="space-y-4">
          <p className="text-sm">
            Current:{' '}
            <span className="font-mono font-medium">{row.did?.formatted ?? 'No number assigned'}</span>
          </p>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Assign DID</span>
            <select
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              value={selectedDidId}
              onChange={(e) => setSelectedDidId(e.target.value)}
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
      ) : null}

      {tab === 'mobile' && row ? (
        <ExtensionQrPanel row={row} qr={qr} loading={mobileQr.isPending} onRegenerate={() => void loadQr()} />
      ) : null}

      {tab === 'desk' && row ? <DeviceModelFields form={deviceForm} setForm={setDeviceForm} deskPhone /> : null}

      {tab === 'voicemail' && row ? (
        <div className="space-y-4">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Voicemail notify email</span>
            <Input
              value={voicemailNotifyEmail}
              onChange={(e) => setVoicemailNotifyEmail(e.target.value)}
              type="email"
            />
          </label>
        </div>
      ) : null}

      {tab === 'callForward' && row ? (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={callForwardEnabled}
              onChange={(e) => setCallForwardEnabled(e.target.checked)}
            />
            Enable call forward
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Forward destination</span>
            <Input
              value={callForwardDestination}
              onChange={(e) => setCallForwardDestination(e.target.value)}
              placeholder="Extension or E.164"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={dndEnabled} onChange={(e) => setDndEnabled(e.target.checked)} />
            Do not disturb
          </label>
        </div>
      ) : null}

      {tab === 'recording' && row ? (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={recordingEnabled}
              onChange={(e) => setRecordingEnabled(e.target.checked)}
            />
            Enable call recording for this extension
          </label>
          <p className="text-xs text-muted-foreground">
            Recording policy is applied at the line level and respects tenant compliance settings.
          </p>
        </div>
      ) : null}

      {tab === 'security' && row ? (
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Voicemail PIN</span>
          <Input value={pin} onChange={(e) => setPin(e.target.value)} type="password" autoComplete="off" />
        </label>
      ) : null}

      {tab === 'advanced' && row ? (
        <div className="space-y-4 text-sm">
          <label className="block space-y-1.5">
            <span className="font-medium">Caller ID name</span>
            <Input value={callerIdName} onChange={(e) => setCallerIdName(e.target.value)} />
          </label>
          <Link href={`/reports/cdr?extension=${encodeURIComponent(row.extension)}`} className="text-primary underline">
            View call history for {row.label}
          </Link>
        </div>
      ) : null}
    </SlideOver>
  );
}

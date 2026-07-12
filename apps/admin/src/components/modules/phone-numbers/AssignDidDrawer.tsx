'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDidDestinations, useAssignDid } from '../../../lib/hooks/queries/use-dids';
import { useTenantDevices, useTenantExtensions } from '../../../lib/hooks/queries/use-tenant';
import { SlideOver } from '../../ui/SlideOver';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Skeleton } from '../../ui/Skeleton';
import { formatExtensionLabel } from '../../../lib/extensions/format-extension-label';
import {
  DID_DESTINATION_OPTIONS,
  emptyAssignDidForm,
  type AssignDidForm,
  type DidDestinationType,
} from './did-types';

type DidRecord = {
  id: string;
  number: string;
  line?: {
    id?: string;
    name?: string;
    extension?: { extension?: string };
    user?: { profile?: { displayName?: string; firstName?: string; lastName?: string }; email?: string };
  } | null;
  routing?: {
    destinationType?: string;
    destinationLineId?: string | null;
  } | null;
};

function formatPhone(number: string) {
  const digits = number.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return number;
}

function routingLabel(did: DidRecord, extensions: Record<string, unknown>[]) {
  if (did.routing?.destinationType) return String(did.routing.destinationType);
  if (did.line?.extension?.extension) {
    return formatExtensionLabel(did.line.extension.extension, did.line.name);
  }
  return 'Not assigned';
}

export function AssignDidDrawer({
  open,
  onClose,
  did,
  onSaved,
  defaultDestinationType,
  defaultDestinationId,
  defaultCallerIdName,
}: {
  open: boolean;
  onClose: () => void;
  did: DidRecord | null;
  onSaved?: () => void;
  defaultDestinationType?: DidDestinationType;
  defaultDestinationId?: string;
  defaultCallerIdName?: string;
}) {
  const [form, setForm] = useState<AssignDidForm>(emptyAssignDidForm);
  const [error, setError] = useState<string | null>(null);
  const destinations = useDidDestinations(form.destinationType, open);
  const assign = useAssignDid();
  const extensionsQuery = useTenantExtensions();
  const devicesQuery = useTenantDevices();

  useEffect(() => {
    if (!open || !did) return;
    const extRows = extensionsQuery.data ?? [];
    const destinationType = defaultDestinationType ?? 'EXTENSION';
    let destinationId = defaultDestinationId ?? '';
    if (!destinationId && destinationType === 'EXTENSION' && did.line?.id) {
      const match = extRows.find((e) => (e.line as { id?: string } | undefined)?.id === did.line?.id);
      destinationId = match?.id ?? '';
    } else if (!destinationId) {
      destinationId = did.line?.id ?? '';
    }
    setForm({
      destinationType,
      destinationId,
      callerIdName: defaultCallerIdName ?? '',
      siteId: '',
    });
    setError(null);
  }, [open, did, defaultDestinationType, defaultDestinationId, defaultCallerIdName, extensionsQuery.data]);

  const preview = useMemo(() => {
    if (!did) return null;
    const dest = destinations.data?.find((d) => d.id === form.destinationId);
    const extRow = (extensionsQuery.data ?? []).find((e) => {
      const line = e.line as { id?: string } | undefined;
      return line?.id === form.destinationId || e.id === form.destinationId;
    });
    const ext = extRow?.extension as string | undefined;
    const lineId = (extRow?.line as { id?: string } | undefined)?.id ?? form.destinationId;
    const device = (devicesQuery.data ?? []).find((d) => (d.line as { id?: string })?.id === lineId);
    const userLine = did.line?.user;
    const person =
      dest?.label?.split('—')[1]?.trim() ??
      userLine?.profile?.displayName ??
      userLine?.email ??
      '—';
    return {
      number: formatPhone(did.number),
      destination: dest?.label ?? (ext ? formatExtensionLabel(ext, (extRow?.line as { name?: string })?.name) : 'Select destination'),
      person,
      device: device ? String(device.name ?? 'Desk Phone') : ext ? 'Desk Phone' : '—',
      status: device ? String(device.status ?? 'ONLINE') : ext ? 'READY' : '—',
    };
  }, [did, form.destinationId, destinations.data, extensionsQuery.data, devicesQuery.data]);

  const save = async () => {
    if (!did || !form.destinationId) {
      setError('Select a destination');
      return;
    }
    setError(null);
    try {
      await assign.mutateAsync({
        id: did.id,
        payload: {
          destinationType: form.destinationType,
          destinationId: form.destinationId,
          callerIdName: form.callerIdName || undefined,
          siteId: form.siteId || undefined,
        },
      });
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to assign routing');
    }
  };

  return (
    <SlideOver open={open} onClose={onClose} title="Assign phone number">
      {did ? (
        <div className="space-y-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Phone number</p>
            <p className="font-mono text-lg font-semibold">{formatPhone(did.number)}</p>
            <p className="text-sm text-muted-foreground">Current: {routingLabel(did, extensionsQuery.data ?? [])}</p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Route to</p>
            <div className="grid grid-cols-2 gap-2">
              {DID_DESTINATION_OPTIONS.map((opt) => (
                <label
                  key={opt.type}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                    form.destinationType === opt.type ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <input
                    type="radio"
                    name="destType"
                    checked={form.destinationType === opt.type}
                    onChange={() => setForm({ ...form, destinationType: opt.type, destinationId: '' })}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Select target</span>
            {destinations.isLoading ? (
              <Skeleton className="h-10 w-full rounded-xl" />
            ) : (
              <select
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                value={form.destinationId}
                onChange={(e) => setForm({ ...form, destinationId: e.target.value })}
              >
                <option value="">Choose…</option>
                {(destinations.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Caller ID name</span>
            <Input
              value={form.callerIdName}
              onChange={(e) => setForm({ ...form, callerIdName: e.target.value })}
              placeholder="Display name on outbound calls"
            />
          </label>

          {preview ? (
            <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
              <div className="space-y-1 font-mono">
                <p>{preview.number}</p>
                <p className="text-muted-foreground">↓</p>
                <p>{preview.destination}</p>
                <p className="text-muted-foreground">↓</p>
                <p>{preview.person}</p>
                <p className="text-muted-foreground">↓</p>
                <p>{preview.device}</p>
                <p className="text-muted-foreground">↓</p>
                <p className="font-semibold text-emerald-600">{preview.status}</p>
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={assign.isPending}>
              {assign.isPending ? 'Saving…' : 'Save routing'}
            </Button>
          </div>
        </div>
      ) : null}
    </SlideOver>
  );
}

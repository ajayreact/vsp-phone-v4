'use client';

import { Loader2 } from 'lucide-react';
import type { MacCheckResult } from '../../../lib/devices/check-mac';
import { normalizeMac } from '../../../lib/devices/check-mac';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Modal } from '../../ui/Modal';

export type DeviceConfirmAction = 'remove' | 'reprovision' | 'reset';

const CONFIRM_COPY: Record<
  DeviceConfirmAction,
  {
    title: string;
    description: string;
    bullets?: string[];
    note?: string;
    confirmLabel: string;
  }
> = {
  remove: {
    title: 'Remove Device',
    description: 'This will:',
    bullets: [
      'Remove this desk phone',
      'Release the MAC address',
      'Remove provisioning',
      'Clear SIP registration',
    ],
    note: 'You can add this phone again later.',
    confirmLabel: 'Remove Device',
  },
  reprovision: {
    title: 'Reprovision Device',
    description:
      'Generate a new provisioning configuration and instruct the phone to download it again.',
    confirmLabel: 'Reprovision',
  },
  reset: {
    title: 'Reset Provisioning',
    description: 'Reset provisioning tokens and registration state.',
    note: 'The phone must reprovision after reboot.',
    confirmLabel: 'Reset Provisioning',
  },
};

export function DeviceActionConfirmModal({
  action,
  open,
  busy,
  onClose,
  onConfirm,
}: {
  action: DeviceConfirmAction | null;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!action) return null;
  const copy = CONFIRM_COPY[action];

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={copy.title}
      size="lg"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={action === 'remove' ? 'destructive' : 'default'}
            disabled={busy}
            aria-busy={busy}
            onClick={onConfirm}
          >
            {busy ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                Working…
              </>
            ) : (
              copy.confirmLabel
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-foreground">{copy.description}</p>
        {copy.bullets ? (
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {copy.bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        {copy.note ? <p className="text-muted-foreground">{copy.note}</p> : null}
      </div>
    </Modal>
  );
}

export function MacValidationFeedback({
  macCheck,
  macAddress,
  macFieldError,
}: {
  macCheck: MacCheckResult;
  macAddress: string;
  macFieldError: string | null;
}) {
  const normalizedLength = normalizeMac(macAddress).length;

  if (macCheck.status === 'checking') {
    return (
      <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
        Checking MAC address…
      </p>
    );
  }

  if (macFieldError) {
    return (
      <p className="text-xs text-destructive" role="alert">
        {macFieldError}
      </p>
    );
  }

  if (macCheck.status === 'available' && normalizedLength === 12) {
    return (
      <p className="text-xs text-emerald-600 dark:text-emerald-400" role="status">
        {macCheck.message ?? 'MAC address available.'}
      </p>
    );
  }

  return null;
}

export function HardwareMacField({
  id,
  label,
  value,
  onChange,
  macCheck,
  macFieldError,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  macCheck: MacCheckResult;
  macFieldError: string | null;
  disabled?: boolean;
}) {
  return (
    <label htmlFor={id} className="block min-w-[12rem] flex-1 space-y-1.5 text-sm sm:max-w-xs">
      <span className="font-medium">{label}</span>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="AA:BB:CC:DD:EE:FF"
        className="font-mono"
        aria-invalid={Boolean(macFieldError)}
        aria-describedby={`${id}-feedback`}
        autoComplete="off"
        spellCheck={false}
      />
      <div id={`${id}-feedback`}>
        <MacValidationFeedback macCheck={macCheck} macAddress={value} macFieldError={macFieldError} />
      </div>
    </label>
  );
}

export function ReplaceDevicePanel({
  model,
  onModelChange,
  macAddress,
  onMacChange,
  macCheck,
  macFieldError,
  busy,
  canSave,
  onSave,
  onCancel,
}: {
  model: string;
  onModelChange: (value: string) => void;
  macAddress: string;
  onMacChange: (value: string) => void;
  macCheck: MacCheckResult;
  macFieldError: string | null;
  busy: boolean;
  canSave: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <section
      className="rounded-xl border border-border bg-muted/10 p-4 sm:p-5"
      aria-labelledby="replace-device-heading"
    >
      <h3 id="replace-device-heading" className="text-sm font-medium">
        Replace Device
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter the new desk phone details. The current device will be removed when you save.
      </p>
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
        <HardwareMacField
          id="replace-device-mac"
          label="New MAC"
          value={macAddress}
          onChange={onMacChange}
          macCheck={macCheck}
          macFieldError={macFieldError}
          disabled={busy}
        />
        <label htmlFor="replace-device-model" className="block min-w-[10rem] space-y-1.5 text-sm sm:max-w-xs">
          <span className="font-medium">Device Model</span>
          <Input
            id="replace-device-model"
            value={model}
            disabled={busy}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder="GRP2601"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onSave} disabled={busy || !canSave} aria-busy={busy}>
            {busy ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              'Save'
            )}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    </section>
  );
}

export function hardwareMacCanSubmit(macAddress: string, macCheck: MacCheckResult): boolean {
  return normalizeMac(macAddress).length === 12 && macCheck.status === 'available';
}

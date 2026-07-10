'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { usePermissions } from '../../../lib/auth/AuthProvider';
import { hasPermission } from '../../../lib/rbac/permissions';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { SlideOver } from '../../ui/SlideOver';
import { CreateButton } from './ModuleShell';

export function WriteCreateButton({
  writePermission,
  label,
  onClick,
  disabled,
  disabledReason,
}: {
  writePermission: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const permissions = usePermissions();
  if (!hasPermission(permissions, writePermission)) return null;
  if (!onClick) return null;

  return (
    <CreateButton
      label={label}
      onClick={onClick}
      disabled={disabled}
      disabledReason={disabledReason}
    />
  );
}

export function NameCodeCreateSlideOver({
  open,
  onClose,
  title,
  description,
  nameLabel = 'Name',
  codeLabel = 'Code',
  submitLabel = 'Create',
  isPending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  nameLabel?: string;
  codeLabel?: string;
  submitLabel?: string;
  isPending: boolean;
  onSubmit: (values: { name: string; code: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setCode('');
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    setError(null);
    try {
      await onSubmit({ name: name.trim(), code: code.trim() });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  };

  return (
    <SlideOver
      open={open}
      onClose={handleClose}
      title={title}
      description={description}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={isPending || !name.trim() || !code.trim()}>
            {isPending ? 'Saving…' : submitLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">{nameLabel} *</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">{codeLabel} *</span>
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
      </div>
    </SlideOver>
  );
}

export function LineSelectCreateSlideOver({
  open,
  onClose,
  title,
  description,
  submitLabel = 'Create',
  isPending,
  lineOptions,
  extraFields,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  submitLabel?: string;
  isPending: boolean;
  lineOptions: { id: string; label: string }[];
  extraFields?: ReactNode;
  onSubmit: (values: { lineId: string }) => Promise<void>;
}) {
  const [lineId, setLineId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setLineId('');
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    setError(null);
    try {
      await onSubmit({ lineId });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  };

  const noLines = lineOptions.length === 0;

  return (
    <SlideOver
      open={open}
      onClose={handleClose}
      title={title}
      description={description}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={isPending || !lineId || noLines}>
            {isPending ? 'Saving…' : submitLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {noLines ? (
          <p className="text-sm text-muted-foreground">
            No lines are available yet. Provision a device or user line before creating this resource.
          </p>
        ) : (
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Line *</span>
            <select
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              value={lineId}
              onChange={(e) => setLineId(e.target.value)}
            >
              <option value="">Select a line…</option>
              {lineOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {extraFields}
      </div>
    </SlideOver>
  );
}

/** Collect unique lines from tenant device records for create forms. */
export function useLineOptionsFromDevices(devices: Record<string, unknown>[]): { id: string; label: string }[] {
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const device of devices) {
      const line = device.line as { id?: string; name?: string } | undefined;
      if (line?.id) {
        map.set(line.id, line.name ?? line.id);
      }
    }
    return [...map.entries()].map(([id, label]) => ({ id, label }));
  }, [devices]);
}

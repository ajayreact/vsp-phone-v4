'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';

export type LifecycleDialogKind = 'reset_pbx' | 'reset_tenant' | 'delete';

function expectedPhrase(kind: LifecycleDialogKind, name: string): string {
  switch (kind) {
    case 'reset_pbx':
      return `RESET PBX ${name}`;
    case 'reset_tenant':
      return `RESET ${name}`;
    case 'delete':
      return `DELETE ${name}`;
  }
}

const RESET_TENANT_KEEP = [
  'Tenant',
  'Tenant ID',
  'Tenant Slug',
  'Assigned DIDs',
  'Platform Ownership',
  'System Roles',
  'System Permissions',
];

const RESET_TENANT_REMOVE = [
  'Users',
  'Tenant Admin',
  'Extensions',
  'Devices',
  'SIP Credentials',
  'WebRTC',
  'API Keys',
  'Organization',
  'Sites',
  'Business Hours',
  'Holidays',
  'Queues',
  'Ring Groups',
  'IVRs',
  'Voicemail',
  'Greetings',
  'Presence',
  'BLF',
  'Contacts',
  'Call History',
  'Recordings Metadata',
];

const COPY: Record<
  LifecycleDialogKind,
  { title: string; warning: string; requireAck: boolean }
> = {
  reset_pbx: {
    title: 'Reset PBX',
    warning: 'Removes PBX configuration only. Users, organization, API keys, and DID ownership are kept.',
    requireAck: false,
  },
  reset_tenant: {
    title: 'Reset Tenant (Re-Onboarding)',
    warning:
      'Prepares this tenant for onboarding again. The tenant is NOT deleted. Assigned DIDs stay owned by this tenant.',
    requireAck: true,
  },
  delete: {
    title: 'Delete Tenant',
    warning:
      'Soft-deletes the tenant and releases all DIDs back to Platform Inventory. Audit logs and billing history are kept. Never hard-deletes.',
    requireAck: true,
  },
};

export function TenantLifecycleConfirmDialog({
  open,
  kind,
  tenantName,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  kind: LifecycleDialogKind;
  tenantName: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (payload: { confirmPhrase: string; acknowledged: boolean }) => void;
}) {
  const [phrase, setPhrase] = useState('');
  const [ack, setAck] = useState(false);
  const copy = COPY[kind];
  const expected = useMemo(() => expectedPhrase(kind, tenantName.trim()), [kind, tenantName]);
  const matched = phrase.trim() === expected;
  const canSubmit = matched && (!copy.requireAck || ack) && !busy;

  useEffect(() => {
    if (!open) return;
    setPhrase('');
    setAck(false);
  }, [open, kind, tenantName]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-destructive/40 bg-background p-5 shadow-xl"
      >
        <h2 className="text-lg font-semibold text-destructive">{copy.title}</h2>
        <p className="mt-1 text-sm">
          <span className="text-muted-foreground">Tenant</span>{' '}
          <span className="font-medium">{tenantName}</span>
        </p>
        <p className="mt-3 text-sm text-muted-foreground">{copy.warning}</p>

        {kind === 'reset_tenant' ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">This operation will KEEP</p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {RESET_TENANT_KEEP.map((item) => (
                  <li key={item}>✓ {item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm font-semibold text-destructive">This operation will REMOVE</p>
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {RESET_TENANT_REMOVE.map((item) => (
                  <li key={item}>✓ {item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs sm:col-span-2">
              <p className="font-semibold text-foreground">Phone Numbers</p>
              <p className="mt-1 text-muted-foreground">
                Assigned DIDs remain owned by this tenant. They become <span className="font-mono">UNASSIGNED</span>.
                They are <strong>not</strong> returned to Platform Inventory.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            {kind === 'reset_pbx' ? (
              <>
                <p>
                  <span className="font-semibold text-foreground">Keeps:</span> Tenant, Users, Roles, API Keys,
                  Organization, DID ownership (unassigned from extensions)
                </p>
                <p>
                  <span className="font-semibold text-foreground">Removes:</span> Extensions, Devices, SIP, Queues,
                  IVRs, Voicemail, Call History, Recordings metadata, Contacts
                </p>
              </>
            ) : (
              <>
                <p>
                  <span className="font-semibold text-foreground">Keeps:</span> Audit logs, billing history,
                  soft-deleted tenant row
                </p>
                <p>
                  <span className="font-semibold text-foreground">Effects:</span> Status DELETED, users/API keys
                  disabled, DIDs released to Platform Inventory
                </p>
              </>
            )}
          </div>
        )}

        <label className="mt-4 block text-sm font-medium">
          Type <span className="font-mono text-destructive">{expected}</span> to confirm
          <Input
            className="mt-1.5 font-mono text-sm"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        {copy.requireAck ? (
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>I understand this operation cannot be undone.</span>
          </label>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!canSubmit}
            onClick={() => onConfirm({ confirmPhrase: phrase.trim(), acknowledged: ack })}
          >
            {busy ? 'Working…' : copy.title}
          </Button>
        </div>
      </div>
    </div>
  );
}

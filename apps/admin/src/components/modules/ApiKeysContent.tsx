'use client';

import { useState } from 'react';
import { usePortal } from '../../lib/portal/PortalProvider';
import {
  useCreatePlatformApiKey,
  usePlatformApiKeys,
  useRevokePlatformApiKey,
} from '../../lib/hooks/queries/use-platform';
import {
  useCreateTenantApiKey,
  useRevokeTenantApiKey,
  useTenantApiKeys,
} from '../../lib/hooks/queries/use-tenant-organization';
import type { PlatformApiKeyRecord } from '../../types/portal';
import { Badge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SlideOver } from '../ui/SlideOver';
import {
  CreateButton,
  ModuleAccessGate,
  ModuleListShell,
  withRowIds,
} from './shared/ModuleShell';

type ApiKeyRow = PlatformApiKeyRecord & { id: string };

const columns: Column<ApiKeyRow>[] = [
  { key: 'name', header: 'Name', sortable: true, cell: (r) => <span className="font-medium">{r.name}</span> },
  {
    key: 'tenant',
    header: 'Tenant',
    cell: (r) => <span className="text-muted-foreground">{r.tenantId ? r.tenantId.slice(0, 8) + '…' : 'Platform'}</span>,
  },
  { key: 'scopes', header: 'Scopes', cell: (r) => r.scopes.join(', ') || '—' },
  { key: 'created', header: 'Created', cell: (r) => new Date(r.createdAt).toLocaleDateString() },
  {
    key: 'lastUsed',
    header: 'Last Used',
    cell: (r) => (r.lastUsedAt ? new Date(r.lastUsedAt).toLocaleDateString() : '—'),
  },
  {
    key: 'expires',
    header: 'Expires',
    cell: (r) => (r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : '—'),
  },
  {
    key: 'enabled',
    header: 'Enabled',
    cell: (r) => <Badge variant="outline">{r.status === 'ACTIVE' ? 'Yes' : 'No'}</Badge>,
  },
];

export function ApiKeysContent() {
  const portal = usePortal();
  const isTenant = portal === 'tenant';
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<string | null>(null);

  const platformQuery = usePlatformApiKeys(undefined, !isTenant);
  const tenantQuery = useTenantApiKeys(isTenant);
  const createPlatformKey = useCreatePlatformApiKey();
  const revokePlatformKey = useRevokePlatformApiKey();
  const createTenantKey = useCreateTenantApiKey();
  const revokeTenantKey = useRevokeTenantApiKey();

  const query = isTenant ? tenantQuery : platformQuery;
  const createKey = isTenant ? createTenantKey : createPlatformKey;
  const revokeKey = isTenant ? revokeTenantKey : revokePlatformKey;
  const rows = withRowIds((query.data ?? []) as PlatformApiKeyRecord[]) as ApiKeyRow[];

  const create = async () => {
    const result = await createKey.mutateAsync({
      name,
      scopes: isTenant ? ['tenant:read'] : ['platform:read'],
    } as never);
    setSecret((result as { secret?: string }).secret ?? null);
    setName('');
  };

  return (
    <ModuleAccessGate moduleId={isTenant ? 'settings-api-keys' : 'api-keys'}>
      {({ module }) => (
        <>
          <ModuleListShell
            module={module}
            query={{ ...query, data: rows }}
            columns={[
              ...columns,
              {
                key: 'actions',
                header: '',
                cell: (r) =>
                  r.status === 'ACTIVE' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void revokeKey.mutateAsync(r.id)}
                      disabled={revokeKey.isPending}
                    >
                      Delete
                    </Button>
                  ) : null,
              },
            ]}
            emptyTitle="No API keys"
            emptyDescription={
              isTenant
                ? 'Create API keys for tenant integrations and automation.'
                : 'Create API keys for platform integrations and automation.'
            }
            primaryAction={<CreateButton label="Create API Key" onClick={() => setOpen(true)} />}
          />

          <SlideOver
            open={open}
            onClose={() => {
              setOpen(false);
              setSecret(null);
              setName('');
            }}
            title="Create API Key"
            description="The secret is shown once. Store it securely."
            footer={
              secret ? (
                <Button onClick={() => setOpen(false)}>Done</Button>
              ) : (
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => void create()} disabled={!name.trim() || createKey.isPending}>
                    {createKey.isPending ? 'Creating…' : 'Create'}
                  </Button>
                </div>
              )
            }
          >
            {secret ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Copy this secret now. It will not be shown again.</p>
                <code className="block break-all rounded-xl bg-muted p-3 text-xs">{secret}</code>
              </div>
            ) : (
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Key name</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Production integration" />
              </label>
            )}
          </SlideOver>
        </>
      )}
    </ModuleAccessGate>
  );
}

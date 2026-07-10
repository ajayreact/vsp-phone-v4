'use client';

import { useState } from 'react';
import {
  useCreatePlatformApiKey,
  usePlatformApiKeys,
  useRevokePlatformApiKey,
} from '../../lib/hooks/queries/use-platform';
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
  { key: 'prefix', header: 'Key Prefix', cell: (r) => <span className="font-mono text-xs">{r.keyPrefix}…</span> },
  { key: 'scopes', header: 'Scopes', cell: (r) => r.scopes.join(', ') },
  { key: 'status', header: 'Status', cell: (r) => <Badge variant="outline">{r.status}</Badge> },
  { key: 'created', header: 'Created', cell: (r) => new Date(r.createdAt).toLocaleDateString() },
];

export function ApiKeysContent() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const query = usePlatformApiKeys();
  const createKey = useCreatePlatformApiKey();
  const revokeKey = useRevokePlatformApiKey();
  const rows = withRowIds(query.data ?? []) as ApiKeyRow[];

  const create = async () => {
    const result = await createKey.mutateAsync({ name, scopes: ['platform:read'] });
    setSecret(result.secret);
    setName('');
  };

  return (
    <ModuleAccessGate moduleId="api-keys">
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
                      Revoke
                    </Button>
                  ) : null,
              },
            ]}
            emptyTitle="No API keys"
            emptyDescription="Create API keys for platform integrations and automation."
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

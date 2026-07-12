'use client';

import { useMemo, useState } from 'react';
import { useTenantDids } from '../../../lib/hooks/queries/use-tenant';
import { ModuleAccessGate } from '../shared/ModuleShell';
import { PageContainer, PageHeader } from '../../layout/PageHeader';
import { QueryState } from '../../feedback/QueryState';
import { Button } from '../../ui/Button';
import { Skeleton } from '../../ui/Skeleton';
import { AssignDidDrawer } from './AssignDidDrawer';
import { formatExtensionLabel } from '../../../lib/extensions/format-extension-label';

type DidRow = Record<string, unknown> & {
  id: string;
  number: string;
  routing?: { destinationType?: string } | null;
  line?: { extension?: { extension?: string }; user?: { profile?: { displayName?: string } } };
};

export function DidRoutingContent() {
  const query = useTenantDids();
  const [assignDid, setAssignDid] = useState<DidRow | null>(null);

  const rows = useMemo(() => (query.data ?? []) as DidRow[], [query.data]);

  return (
    <ModuleAccessGate moduleId="did-routing">
      {({ module }) => (
        <PageContainer>
          <PageHeader title={module.label} description={module.description} />
          <QueryState
            isLoading={query.isLoading}
            isError={query.isError}
            error={query.error}
            onRetry={() => void query.refetch()}
            isEmpty={!rows.length}
            skeleton={<Skeleton className="h-64 w-full rounded-2xl" />}
          >
            <div className="space-y-3">
              {rows.map((did) => {
                const ext = did.line?.extension?.extension;
                const name = (did.line as { name?: string })?.name ?? did.line?.user?.profile?.displayName;
                const dest =
                  did.routing?.destinationType ??
                  (ext ? formatExtensionLabel(ext, name) : 'Unassigned');
                return (
                  <button
                    key={did.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-4 text-left transition-colors hover:bg-muted/40"
                    onClick={() => setAssignDid(did)}
                  >
                    <div>
                      <p className="font-mono font-semibold">{String(did.number)}</p>
                      <p className="text-sm text-muted-foreground">↓ {dest}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setAssignDid(did); }}>
                      Edit
                    </Button>
                  </button>
                );
              })}
            </div>
          </QueryState>
          <AssignDidDrawer
            open={Boolean(assignDid)}
            did={assignDid}
            onClose={() => setAssignDid(null)}
            onSaved={() => void query.refetch()}
          />
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}

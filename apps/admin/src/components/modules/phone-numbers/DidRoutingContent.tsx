'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useTenantDids } from '../../../lib/hooks/queries/use-tenant';
import { formatExtensionLabel } from '../../../lib/extensions/format-extension-label';
import { ModuleAccessGate } from '../shared/ModuleShell';
import { PageContainer, PageHeader } from '../../layout/PageHeader';
import { QueryState } from '../../feedback/QueryState';
import { Button } from '../../ui/Button';
import { Skeleton } from '../../ui/Skeleton';

type DidRow = Record<string, unknown> & {
  id: string;
  number: string;
  routing?: { destinationType?: string } | null;
  line?: {
    name?: string;
    extension?: { id?: string; extension?: string };
    user?: { profile?: { displayName?: string } };
  };
};

export function DidRoutingContent() {
  const query = useTenantDids();
  const rows = useMemo(() => (query.data ?? []) as DidRow[], [query.data]);

  return (
    <ModuleAccessGate moduleId="did-routing">
      {({ module }) => (
        <PageContainer>
          <PageHeader
            title={module.label}
            description="Read-only routing view. DID assignment is performed by Platform Admin; configure each extension from the Extensions workspace."
          />
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
                const extId = did.line?.extension?.id;
                const name =
                  did.line?.name ?? did.line?.user?.profile?.displayName;
                const dest =
                  did.routing?.destinationType ??
                  (ext ? formatExtensionLabel(ext, name) : 'Unassigned');
                return (
                  <div
                    key={did.id}
                    className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-4"
                  >
                    <div>
                      <p className="font-mono font-semibold">{String(did.number)}</p>
                      <p className="text-sm text-muted-foreground">↓ {dest}</p>
                    </div>
                    {extId ? (
                      <Link href={`/extensions?configure=${extId}&tab=did`}>
                        <Button size="sm" variant="outline">
                          Configure extension
                        </Button>
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">Awaiting platform assign</span>
                    )}
                  </div>
                );
              })}
            </div>
          </QueryState>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}

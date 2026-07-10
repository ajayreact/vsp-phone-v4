'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useParams } from 'next/navigation';
import { IvrFlowBuilder } from '../ivr/IvrFlowBuilder';
import {
  useIvrDetail,
  usePublishIvr,
  useSaveIvrDraft,
  useSimulateIvr,
} from '../../lib/hooks/queries/use-ivr-routing-mutations';
import { PERMISSIONS, hasPermission } from '../../lib/rbac/permissions';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';

export function IvrBuilderPage() {
  const params = useParams();
  const id = String(params.id ?? '');
  const permissions = usePermissions();
  const canWrite = hasPermission(permissions, PERMISSIONS.TENANT_IVR_WRITE);

  const query = useIvrDetail(id);
  const saveDraft = useSaveIvrDraft();
  const publish = usePublishIvr();
  const simulate = useSimulateIvr();

  const ivr = query.data as Record<string, unknown> | undefined;

  if (query.isLoading) {
    return <div className="p-8 text-muted-foreground">Loading IVR builder…</div>;
  }

  if (query.isError || !ivr) {
    return <div className="p-8 text-red-600">Failed to load IVR flow.</div>;
  }

  const flow = (ivr.draftFlowJson ?? ivr.publishedFlowJson) as Record<string, unknown> | null;

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <Link href="/ivr">
          <Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />Back</Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold">{String(ivr.name ?? 'IVR Builder')}</h1>
          <p className="text-sm text-muted-foreground">
            {String(ivr.code ?? '')} · v{String(ivr.publishedVersion ?? 0)} ·{' '}
            <StatusBadge status={String(ivr.flowStatus) === 'PUBLISHED' ? 'active' : 'pending'} />
          </p>
        </div>
      </div>

      <IvrFlowBuilder
        initialFlow={flow as { nodes: never[]; edges: never[] } | null}
        canWrite={canWrite}
        isSaving={saveDraft.isPending}
        isPublishing={publish.isPending}
        onSave={async (f) => {
          await saveDraft.mutateAsync({ id, flow: f as Record<string, unknown> });
        }}
        onPublish={async () => {
          await publish.mutateAsync({ id });
        }}
        onSimulate={async (digits) => {
          const result = await simulate.mutateAsync({
            id,
            payload: { digits: digits.split('').filter(Boolean) },
          });
          return result;
        }}
      />
    </div>
  );
}

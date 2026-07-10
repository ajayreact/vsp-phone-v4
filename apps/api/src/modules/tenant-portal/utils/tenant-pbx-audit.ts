import type { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';

export async function auditPbxMutation(
  audit: EnterpriseAuditService,
  params: {
    tenantId: string;
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await audit.append({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    actorType: 'user',
    action: params.action,
    resourceType: params.entityType,
    resourceId: params.entityId,
    detail: params.metadata,
  });
}

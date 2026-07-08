import { Injectable } from '@nestjs/common';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';

/** Phase 16 — security-sensitive audit events (immutable append-only). */
@Injectable()
export class SecurityAuditService {
  constructor(private readonly audit: EnterpriseAuditService) {}

  login(params: { tenantId: string; userId: string; email: string }): void {
    void this.audit.append({
      tenantId: params.tenantId,
      actorUserId: params.userId,
      actorType: 'user',
      action: 'security.auth.login',
      resourceType: 'user',
      resourceId: params.userId,
      detail: { email: params.email },
    });
  }

  logout(params: { tenantId: string; userId: string }): void {
    void this.audit.append({
      tenantId: params.tenantId,
      actorUserId: params.userId,
      actorType: 'user',
      action: 'security.auth.logout',
      resourceType: 'session',
      resourceId: params.userId,
    });
  }

  failedLogin(params: { email: string; reason: string; tenantId?: string }): void {
    void this.audit.append({
      tenantId: params.tenantId ?? '00000000-0000-4000-8000-000000000000',
      actorType: 'system',
      action: 'security.auth.failed',
      resourceType: 'user',
      detail: { email: params.email, reason: params.reason },
    });
  }

  permissionDenied(params: {
    tenantId: string;
    userId?: string;
    permission: string;
    resourceType: string;
    resourceId?: string;
  }): void {
    void this.audit.append({
      tenantId: params.tenantId,
      actorUserId: params.userId,
      actorType: params.userId ? 'user' : 'system',
      action: 'security.permission.denied',
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      detail: { permission: params.permission },
    });
  }

  adminAction(params: {
    tenantId: string;
    userId: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    detail?: Record<string, unknown>;
  }): void {
    void this.audit.append({
      tenantId: params.tenantId,
      actorUserId: params.userId,
      actorType: 'admin',
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      detail: params.detail,
    });
  }
}

import {
  ForbiddenException,
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import type { Request } from 'express';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { SecurityAuditService } from '../audit/security-audit.service';

/** Kamailio REGISTER plane — tenant resolved from AOR in handler, not body tenantId. */
export function isKamailioAorResolvedTelecomPath(path: string): boolean {
  const p = path.split('?')[0] ?? path;
  return (
    p.endsWith('/auth/sip-digest') ||
    p.endsWith('/authenticate') ||
    p.endsWith('/register') ||
    p.endsWith('/unregister')
  );
}

/** Phase 16 — tenant/line ownership checks before telecom handlers execute. */
@Injectable()
export class TelecomAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly securityAudit: SecurityAuditService,
  ) {}

  isEnforced(): boolean {
    return String(this.config.get('SECURITY_ENFORCE_TELECOM') ?? 'false').toLowerCase() === 'true';
  }

  async assertTenantContext(tenantId: string | undefined): Promise<void> {
    if (!this.isEnforced()) return;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }
  }

  async assertLineOwnership(lineId: string | undefined, tenantId: string | undefined): Promise<void> {
    if (!this.isEnforced() || !lineId || !tenantId) return;
    if (!this.prisma.connected) return;

    const line = await this.prisma.line.findFirst({
      where: { id: lineId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!line) {
      this.securityAudit.permissionDenied({
        tenantId,
        permission: 'telecom:line:access',
        resourceType: 'line',
        resourceId: lineId,
      });
      throw new ForbiddenException('Line not accessible for tenant');
    }
  }

  async assertExtensionOwnership(
    extension: string | undefined,
    tenantId: string | undefined,
  ): Promise<void> {
    if (!this.isEnforced() || !extension || !tenantId) return;
    if (!this.prisma.connected) return;

    const ext = await this.prisma.extension.findFirst({
      where: { extension, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!ext) {
      this.securityAudit.permissionDenied({
        tenantId,
        permission: 'telecom:extension:access',
        resourceType: 'extension',
        resourceId: extension,
      });
      throw new ForbiddenException('Extension not accessible for tenant');
    }
  }
}

/** Interceptor — validates tenantId/lineId/extension on telecom POST bodies. */
@Injectable()
export class TelecomAuthorizationInterceptor implements NestInterceptor {
  constructor(private readonly authz: TelecomAuthorizationService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.method !== 'POST') return next.handle();

    const path = req.originalUrl || req.url || '';
    if (isKamailioAorResolvedTelecomPath(path)) {
      return next.handle();
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const tenantId = typeof body.tenantId === 'string' ? body.tenantId : undefined;
    const lineId = typeof body.lineId === 'string' ? body.lineId : undefined;
    const extension =
      typeof body.extension === 'string'
        ? body.extension
        : typeof body.callerExtension === 'string'
          ? body.callerExtension
          : undefined;

    return new Observable((subscriber) => {
      void (async () => {
        try {
          await this.authz.assertTenantContext(tenantId);
          await this.authz.assertLineOwnership(lineId, tenantId);
          await this.authz.assertExtensionOwnership(extension, tenantId);
          next.handle().subscribe(subscriber);
        } catch (err) {
          subscriber.error(err);
        }
      })();
    });
  }
}

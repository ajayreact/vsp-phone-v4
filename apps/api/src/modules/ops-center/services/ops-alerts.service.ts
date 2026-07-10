import { Injectable, NotFoundException } from '@nestjs/common';
import { OpsAlertSeverity, OpsAlertStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';

@Injectable()
export class OpsAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  async list(params: { tenantId?: string; status?: OpsAlertStatus; severity?: OpsAlertSeverity; limit?: number }) {
    if (!this.prisma.connected) return [];
    const limit = Math.min(params.limit ?? 100, 500);
    return this.prisma.opsAlert.findMany({
      where: {
        ...(params.tenantId ? { tenantId: params.tenantId } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.severity ? { severity: params.severity } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async create(params: {
    tenantId?: string;
    severity: OpsAlertSeverity;
    title: string;
    message: string;
    source: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.opsAlert.create({
      data: {
        id: randomUUID(),
        tenantId: params.tenantId,
        severity: params.severity,
        title: params.title,
        message: params.message,
        source: params.source,
        status: OpsAlertStatus.OPEN,
        metadata: params.metadata as object | undefined,
      },
    });
  }

  async acknowledge(id: string, actorUserId: string, note?: string) {
    const alert = await this.findAlert(id);
    const updated = await this.prisma.opsAlert.update({
      where: { id },
      data: {
        status: OpsAlertStatus.ACKNOWLEDGED,
        acknowledgedAt: new Date(),
        acknowledgedBy: actorUserId,
      },
    });
    await this.auditAction(alert.tenantId, actorUserId, 'ops.alert.acknowledged', id, { note });
    return updated;
  }

  async resolve(id: string, actorUserId: string, note?: string) {
    const alert = await this.findAlert(id);
    const updated = await this.prisma.opsAlert.update({
      where: { id },
      data: {
        status: OpsAlertStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedBy: actorUserId,
      },
    });
    await this.auditAction(alert.tenantId, actorUserId, 'ops.alert.resolved', id, { note });
    return updated;
  }

  async escalate(id: string, actorUserId: string) {
    const alert = await this.findAlert(id);
    const updated = await this.prisma.opsAlert.update({
      where: { id },
      data: { status: OpsAlertStatus.ESCALATED, escalatedAt: new Date() },
    });
    await this.auditAction(alert.tenantId, actorUserId, 'ops.alert.escalated', id, {});
    return updated;
  }

  async silence(id: string, actorUserId: string, minutes: number) {
    const alert = await this.findAlert(id);
    const until = new Date(Date.now() + minutes * 60_000);
    const updated = await this.prisma.opsAlert.update({
      where: { id },
      data: { status: OpsAlertStatus.SILENCED, silencedUntil: until },
    });
    await this.auditAction(alert.tenantId, actorUserId, 'ops.alert.silenced', id, { minutes });
    return updated;
  }

  private async findAlert(id: string) {
    const alert = await this.prisma.opsAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Alert not found');
    return alert;
  }

  private async auditAction(
    tenantId: string | null | undefined,
    actorUserId: string,
    action: string,
    resourceId: string,
    detail: Record<string, unknown>,
  ) {
    if (!tenantId) return;
    await this.audit.append({
      tenantId,
      actorUserId,
      actorType: 'admin',
      action,
      resourceType: 'ops_alert',
      resourceId,
      detail,
    });
  }
}

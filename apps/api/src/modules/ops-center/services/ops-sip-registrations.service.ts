import { Injectable, NotFoundException } from '@nestjs/common';
import { SIPEndpointStatus } from '@prisma/client';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { KamailioRpcClient } from '../clients/kamailio-rpc.client';

@Injectable()
export class OpsSipRegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly kamailio: KamailioRpcClient,
    private readonly audit: EnterpriseAuditService,
  ) {}

  async list(params: { tenantId?: string; limit?: number; search?: string }) {
    if (!this.prisma.connected) return [];

    const where: Record<string, unknown> = { deletedAt: null };
    if (params.tenantId) where.tenantId = params.tenantId;

    const rows = await this.prisma.sIPEndpoint.findMany({
      where,
      orderBy: { lastRegisteredAt: 'desc' },
      take: Math.min(params.limit ?? 500, 500),
      include: {
        tenant: { select: { name: true } },
        line: { include: { extension: true } },
        devices: {
          where: { deletedAt: null },
          take: 1,
          include: {
            line: { include: { extension: true } },
          },
        },
      },
    });

    let kamailioContacts: Map<string, Record<string, unknown>> = new Map();
    if (this.kamailio.isConfigured()) {
      const dump = await this.kamailio.tryCall('ul.dump', []);
      if (dump.ok && dump.result && typeof dump.result === 'object') {
        kamailioContacts = this.parseUlDump(dump.result);
      }
    }

    const mapped = rows.map((r) => {
      const cfg = (r.registrationConfig ?? {}) as Record<string, unknown>;
      const contact = kamailioContacts.get(r.aor.toLowerCase()) ?? kamailioContacts.get(r.authUsername.toLowerCase());
      const device = r.devices[0];
      const ext = r.line?.extension?.extension ?? device?.line?.extension?.extension ?? null;

      return {
        id: r.id,
        publicId: r.publicId,
        tenantId: r.tenantId,
        tenantName: r.tenant.name,
        extension: ext,
        username: r.authUsername,
        aor: r.aor,
        device: device?.name ?? null,
        deviceType: device?.deviceType ?? null,
        ip: contact?.received ? String(contact.received).split(':')[0] : (cfg.lastIp as string | undefined) ?? null,
        port: contact?.received ? Number(String(contact.received).split(':')[1]) : (cfg.lastPort as number | undefined) ?? null,
        transport: String(contact?.socket ?? cfg.transport ?? 'UDP'),
        tls: Boolean(cfg.tls ?? String(contact?.socket ?? '').includes('tls')),
        userAgent: String(contact?.user_agent ?? cfg.userAgent ?? '—'),
        firmware: String(cfg.firmware ?? '—'),
        registrationTime: r.lastRegisteredAt?.toISOString() ?? null,
        expires: contact?.expires ? new Date(Number(contact.expires) * 1000).toISOString() : null,
        latencyMs: typeof cfg.latencyMs === 'number' ? cfg.latencyMs : null,
        packetLossPct: typeof cfg.packetLossPct === 'number' ? cfg.packetLossPct : null,
        jitterMs: typeof cfg.jitterMs === 'number' ? cfg.jitterMs : null,
        status: r.registrationStatus,
        registrationStatus: r.registrationStatus,
        lastRegisteredAt: r.lastRegisteredAt?.toISOString() ?? null,
      };
    });

    if (params.search?.trim()) {
      const q = params.search.trim().toLowerCase();
      return mapped.filter(
        (r) =>
          r.username.toLowerCase().includes(q) ||
          (r.extension ?? '').includes(q) ||
          (r.device ?? '').toLowerCase().includes(q) ||
          r.tenantName.toLowerCase().includes(q),
      );
    }

    return mapped;
  }

  async refresh(endpointId: string, actorUserId: string) {
    const row = await this.findEndpoint(endpointId);
    await this.audit.append({
      tenantId: row.tenantId,
      actorUserId,
      actorType: 'admin',
      action: 'ops.sip.registration.refresh',
      resourceType: 'sip_endpoint',
      resourceId: endpointId,
      detail: {},
    });
    return { ok: true, endpointId };
  }

  async unregister(endpointId: string, actorUserId: string, reason?: string) {
    const row = await this.findEndpoint(endpointId);
    if (this.kamailio.isConfigured()) {
      await this.kamailio.tryCall('ul.rm', [row.aor]);
    }
    await this.prisma.sIPEndpoint.update({
      where: { id: endpointId },
      data: { registrationStatus: SIPEndpointStatus.UNREGISTERED, lastRegisteredAt: null },
    });
    await this.audit.append({
      tenantId: row.tenantId,
      actorUserId,
      actorType: 'admin',
      action: 'ops.sip.registration.unregister',
      resourceType: 'sip_endpoint',
      resourceId: endpointId,
      detail: { reason },
    });
    return { ok: true };
  }

  async forceReregister(endpointId: string, actorUserId: string) {
    const row = await this.findEndpoint(endpointId);
    const keys = await this.redis.scanKeys(`vsp:auth:sip:${row.authUsername}:*`, 50);
    for (const key of keys) {
      await this.redis.del(key);
    }
    await this.audit.append({
      tenantId: row.tenantId,
      actorUserId,
      actorType: 'admin',
      action: 'ops.sip.registration.force_reregister',
      resourceType: 'sip_endpoint',
      resourceId: endpointId,
      detail: {},
    });
    return { ok: true };
  }

  private async findEndpoint(id: string) {
    const row = await this.prisma.sIPEndpoint.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new NotFoundException('SIP endpoint not found');
    return row;
  }

  private parseUlDump(result: unknown): Map<string, Record<string, unknown>> {
    const map = new Map<string, Record<string, unknown>>();
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      const obj = node as Record<string, unknown>;
      const aor = obj.AoR ?? obj.aor;
      if (typeof aor === 'string') {
        map.set(aor.toLowerCase(), obj);
      }
      Object.values(obj).forEach(walk);
    };
    walk(result);
    return map;
  }
}

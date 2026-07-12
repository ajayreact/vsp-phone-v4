import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { tenantScope } from '../utils/tenant.util';

export type TenantSearchResult = {
  id: string;
  type: string;
  label: string;
  subtitle: string;
  href: string;
};

@Injectable()
export class TenantSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(tenantId: string, query: string): Promise<TenantSearchResult[]> {
    const q = query.trim();
    if (!q || q.length < 2 || !this.prisma.connected) return [];

    const scope = tenantScope(tenantId);
    const contains = { contains: q, mode: 'insensitive' as const };

    const [users, extensions, devices, dids, queues, ivrs] = await Promise.all([
      this.prisma.user.findMany({
        where: { ...scope, deletedAt: null, OR: [{ email: contains }, { profile: { displayName: contains } }] },
        include: { profile: { select: { displayName: true } } },
        take: 8,
      }),
      this.prisma.extension.findMany({
        where: { ...scope, deletedAt: null, OR: [{ extension: contains }, { line: { name: contains } }] },
        include: { line: { include: { user: { include: { profile: true } } } } },
        take: 8,
      }),
      this.prisma.device.findMany({
        where: { ...scope, deletedAt: null, OR: [{ name: contains }, { macAddress: contains }] },
        take: 8,
      }),
      this.prisma.phoneNumber.findMany({
        where: { ...scope, deletedAt: null, number: contains },
        take: 8,
      }),
      this.prisma.queue.findMany({
        where: { ...scope, deletedAt: null, OR: [{ name: contains }, { code: contains }] },
        take: 8,
      }),
      this.prisma.iVR.findMany({
        where: { ...scope, deletedAt: null, OR: [{ name: contains }, { extension: contains }] },
        take: 8,
      }),
    ]);

    const results: TenantSearchResult[] = [];

    for (const u of users) {
      results.push({
        id: u.id,
        type: 'User',
        label: u.profile?.displayName ?? u.email,
        subtitle: u.email,
        href: '/people/users',
      });
    }
    for (const e of extensions) {
      const user = e.line?.user;
      const name =
        user?.profile?.displayName ??
        user?.email ??
        e.line?.name ??
        e.extension;
      results.push({
        id: e.id,
        type: 'Extension',
        label: `${e.extension} — ${name}`,
        subtitle: 'Extension',
        href: '/people/extensions',
      });
    }
    for (const d of devices) {
      results.push({
        id: d.id,
        type: 'Device',
        label: d.name,
        subtitle: d.macAddress ?? d.deviceType,
        href: '/people/devices',
      });
    }
    for (const n of dids) {
      results.push({
        id: n.id,
        type: 'DID',
        label: n.number,
        subtitle: 'Phone number',
        href: '/phone-numbers/my-numbers',
      });
    }
    for (const qe of queues) {
      results.push({
        id: qe.id,
        type: 'Queue',
        label: qe.name,
        subtitle: qe.code ?? 'Call queue',
        href: '/call-flow/queues',
      });
    }
    for (const i of ivrs) {
      results.push({
        id: i.id,
        type: 'IVR',
        label: i.name,
        subtitle: i.extension ?? 'Auto attendant',
        href: '/call-flow/ivr',
      });
    }

    return results.slice(0, 20);
  }
}

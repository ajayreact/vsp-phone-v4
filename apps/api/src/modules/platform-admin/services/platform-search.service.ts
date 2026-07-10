import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../telecom/prisma/prisma.service';

export type SearchResultItem = {
  type: 'tenant' | 'user' | 'number' | 'extension';
  id: string;
  label: string;
  subtitle: string;
  href: string;
};

@Injectable()
export class PlatformSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: string, limit = 20): Promise<SearchResultItem[]> {
    if (!this.prisma.connected || !query.trim()) return [];

    const q = query.trim();
    const take = Math.min(limit, 50);
    const results: SearchResultItem[] = [];

    const tenants = await this.prisma.tenant.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
          { slug: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 5,
    });
    for (const t of tenants) {
      results.push({
        type: 'tenant',
        id: t.id,
        label: t.displayName || t.name,
        subtitle: t.slug,
        href: `/tenants`,
      });
    }

    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { profile: { displayName: { contains: q, mode: 'insensitive' } } },
        ],
      },
      include: { tenant: { select: { name: true } }, profile: true },
      take: 5,
    });
    for (const u of users) {
      results.push({
        type: 'user',
        id: u.id,
        label: u.profile?.displayName ?? u.email,
        subtitle: `${u.email} · ${u.tenant.name}`,
        href: `/users`,
      });
    }

    const numbers = await this.prisma.phoneNumber.findMany({
      where: {
        deletedAt: null,
        number: { contains: q.replace(/\D/g, ''), mode: 'insensitive' },
      },
      include: { tenant: { select: { name: true } } },
      take: 5,
    });
    for (const n of numbers) {
      results.push({
        type: 'number',
        id: n.id,
        label: n.number,
        subtitle: n.tenant.name,
        href: `/telnyx-numbers`,
      });
    }

    const extensions = await this.prisma.extension.findMany({
      where: {
        deletedAt: null,
        extension: { contains: q, mode: 'insensitive' },
      },
      include: { tenant: { select: { name: true } } },
      take: 5,
    });
    for (const e of extensions) {
      results.push({
        type: 'extension',
        id: e.id,
        label: `Ext ${e.extension}`,
        subtitle: e.tenant.name,
        href: `/extensions`,
      });
    }

    return results.slice(0, take);
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { ContactType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type {
  BulkContactIdsDto,
  CreateContactDto,
  ImportContactsCsvDto,
  RecordRecentContactDto,
  SearchContactsDto,
  UpdateContactDto,
} from '../dto/tenant-contacts.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { newPublicId, tenantScope } from '../utils/tenant.util';

const contactInclude = {
  line: { select: { id: true, name: true, presence: true, extension: true } },
} satisfies Prisma.ContactInclude;

@Injectable()
export class TenantContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  async list(tenantId: string, userId: string, query?: SearchContactsDto) {
    if (!this.prisma.connected) return [];

    const limit = Math.min(query?.limit ?? 200, 500);
    const where: Prisma.ContactWhereInput = {
      ...tenantScope(tenantId),
      OR: [
        { type: { in: [ContactType.COMPANY, ContactType.SHARED] } },
        { type: ContactType.PERSONAL, userId },
      ],
    };

    if (query?.type) where.type = query.type;
    if (query?.favoritesOnly) where.favorite = true;
    if (query?.department) where.department = query.department;
    if (query?.search?.trim()) {
      const q = query.search.trim();
      where.AND = [
        {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { company: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q, mode: 'insensitive' } },
            { extension: { contains: q, mode: 'insensitive' } },
            { department: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    return this.prisma.contact.findMany({
      where,
      include: contactInclude,
      orderBy: [{ favorite: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
      take: limit,
    });
  }

  async getDirectory(tenantId: string, search?: string) {
    if (!this.prisma.connected) return { contacts: [], users: [] };

    const contacts = await this.list(tenantId, '', { search, limit: 300 });

    const userWhere: Prisma.UserWhereInput = { tenantId, deletedAt: null };
    if (search?.trim()) {
      const q = search.trim();
      userWhere.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { profile: { displayName: { contains: q, mode: 'insensitive' } } },
        { lines: { some: { extension: { extension: { contains: q, mode: 'insensitive' } } } } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where: userWhere,
      include: {
        profile: true,
        lines: {
          where: { deletedAt: null },
          include: { extension: true, presence: true },
        },
      },
      take: 300,
    });

    const directoryUsers = users.map((u) => ({
      userId: u.id,
      email: u.email,
      displayName: u.profile?.displayName ?? u.email,
      department: null,
      title: null,
      lines: u.lines.map((l) => ({
        lineId: l.id,
        name: l.name,
        extension: l.extension?.extension ?? null,
        presence: l.presence?.status ?? 'OFFLINE',
      })),
    }));

    return { contacts, users: directoryUsers };
  }

  async getById(tenantId: string, id: string) {
    const row = await this.prisma.contact.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include: contactInclude,
    });
    if (!row) throw new NotFoundException('Contact not found');
    return row;
  }

  async create(tenantId: string, userId: string, dto: CreateContactDto) {
    const contact = await this.prisma.contact.create({
      data: {
        id: randomUUID(),
        publicId: newPublicId('ctc'),
        tenantId,
        userId: dto.type === ContactType.PERSONAL ? userId : dto.type ? undefined : userId,
        type: dto.type ?? ContactType.PERSONAL,
        firstName: dto.firstName,
        lastName: dto.lastName,
        company: dto.company,
        department: dto.department,
        phone: dto.phone,
        directNumber: dto.directNumber,
        mobile: dto.mobile,
        email: dto.email,
        extension: dto.extension,
        photoUrl: dto.photoUrl,
        location: dto.location,
        notes: dto.notes,
        lineId: dto.lineId,
        favorite: dto.favorite ?? false,
        speedDial: dto.speedDial,
        createdBy: userId,
      },
      include: contactInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.contact.create',
      entityType: 'Contact',
      entityId: contact.id,
      metadata: { publicId: contact.publicId },
    });
    return contact;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateContactDto) {
    await this.getById(tenantId, id);
    const contact = await this.prisma.contact.update({
      where: { id },
      data: { ...dto, updatedBy: userId },
      include: contactInclude,
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.contact.update',
      entityType: 'Contact',
      entityId: id,
      metadata: { publicId: contact.publicId },
    });
    return contact;
  }

  async remove(tenantId: string, userId: string, id: string) {
    const row = await this.getById(tenantId, id);
    await this.prisma.contact.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.contact.delete',
      entityType: 'Contact',
      entityId: id,
      metadata: { publicId: row.publicId },
    });
    return { ok: true };
  }

  async bulkDelete(tenantId: string, userId: string, dto: BulkContactIdsDto) {
    await this.prisma.contact.updateMany({
      where: { id: { in: dto.contactIds }, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.contact.bulk_delete',
      entityType: 'Contact',
      entityId: dto.contactIds[0] ?? tenantId,
      metadata: { count: dto.contactIds.length },
    });
    return { deleted: dto.contactIds.length };
  }

  async listFavorites(tenantId: string, userId: string) {
    return this.list(tenantId, userId, { favoritesOnly: true, limit: 100 });
  }

  async listSpeedDial(tenantId: string, userId: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.contact.findMany({
      where: {
        tenantId,
        deletedAt: null,
        speedDial: { not: null },
        OR: [{ userId }, { type: { in: [ContactType.COMPANY, ContactType.SHARED] } }],
      },
      orderBy: { speedDial: 'asc' },
      take: 100,
    });
  }

  async listRecent(tenantId: string, userId: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.contactRecent.findMany({
      where: { tenantId, userId },
      include: { contact: true, line: { include: { extension: true, presence: true } } },
      orderBy: { dialedAt: 'desc' },
      take: 50,
    });
  }

  async recordRecent(tenantId: string, userId: string, dto: RecordRecentContactDto) {
    const row = await this.prisma.contactRecent.create({
      data: {
        id: randomUUID(),
        tenantId,
        userId,
        contactId: dto.contactId,
        lineId: dto.lineId,
        label: dto.label,
        number: dto.number,
      },
    });
    return row;
  }

  async importCsv(tenantId: string, userId: string, dto: ImportContactsCsvDto) {
    const results: { row: number; ok: boolean; error?: string }[] = [];
    for (let i = 0; i < dto.rows.length; i++) {
      const r = dto.rows[i];
      try {
        await this.create(tenantId, userId, {
          firstName: r.firstName ?? r.first_name ?? r.name ?? 'Unknown',
          lastName: r.lastName ?? r.last_name,
          company: r.company,
          department: r.department,
          phone: r.phone,
          directNumber: r.directNumber ?? r.direct_number,
          mobile: r.mobile,
          email: r.email,
          extension: r.extension,
          type: (r.type?.toUpperCase() as ContactType) ?? ContactType.COMPANY,
        });
        results.push({ row: i + 1, ok: true });
      } catch (e) {
        results.push({ row: i + 1, ok: false, error: e instanceof Error ? e.message : 'Import failed' });
      }
    }
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.contact.import',
      entityType: 'Contact',
      entityId: tenantId,
      metadata: { rows: dto.rows.length, imported: results.filter((x) => x.ok).length },
    });
    return { results };
  }

  async exportCsv(tenantId: string, userId: string): Promise<string> {
    const rows = await this.list(tenantId, userId, { limit: 500 });
    const header = 'firstName,lastName,company,department,phone,directNumber,mobile,email,extension,favorite,speedDial,type';
    const lines = rows.map((c) =>
      [
        c.firstName,
        c.lastName ?? '',
        c.company ?? '',
        c.department ?? '',
        c.phone ?? '',
        c.directNumber ?? '',
        c.mobile ?? '',
        c.email ?? '',
        c.extension ?? '',
        c.favorite ? 'true' : 'false',
        c.speedDial ?? '',
        c.type,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    return [header, ...lines].join('\n');
  }

  async getDirectoryIntegrations(tenantId: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.directoryIntegration.findMany({
      where: { tenantId, deletedAt: null },
    });
  }

  async getReports(tenantId: string) {
    if (!this.prisma.connected) return { total: 0, favorites: 0, speedDial: 0, byType: {} };
    const [total, favorites, speedDial, byTypeRaw] = await Promise.all([
      this.prisma.contact.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.contact.count({ where: { tenantId, deletedAt: null, favorite: true } }),
      this.prisma.contact.count({ where: { tenantId, deletedAt: null, speedDial: { not: null } } }),
      this.prisma.contact.groupBy({ by: ['type'], where: { tenantId, deletedAt: null }, _count: true }),
    ]);
    const byType: Record<string, number> = {};
    for (const g of byTypeRaw) byType[g.type] = g._count;
    return { total, favorites, speedDial, byType };
  }
}

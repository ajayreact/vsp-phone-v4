import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NumberReservationStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { TelnyxNumbersService } from '../../carrier-admin/services/telnyx-numbers.service';
import type { TelnyxNumberResponseDto } from '../../carrier-admin/dto/telnyx-numbers.dto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type { MarketplaceSearchQueryDto } from '../dto/tenant-marketplace.dto';
import { NumberNotificationsService } from '../../carrier-admin/services/number-notifications.service';

const RESERVATION_TTL_MS = 24 * 60 * 60 * 1000;

export type MarketplaceNumberRecord = TelnyxNumberResponseDto & {
  reservationStatus?: 'available' | 'reserved' | 'reserved_by_you' | 'pending';
  reservationExpiresAt?: string | null;
  reservationId?: string | null;
  estimatedAvailability?: string;
  upfrontCost?: number;
  phoneNumberType?: string;
};

@Injectable()
export class TenantMarketplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: TelnyxNumbersService,
    private readonly audit: EnterpriseAuditService,
    private readonly notifications: NumberNotificationsService,
  ) {}

  async getDashboard(tenantId: string) {
    const [myNumbers, pending, rejected, reservations, recentlyAssigned] = await Promise.all([
      this.prisma.connected
        ? this.prisma.phoneNumber.count({ where: { tenantId, deletedAt: null } })
        : Promise.resolve(0),
      this.prisma.connected
        ? this.prisma.numberRequest.count({ where: { tenantId, status: 'PENDING' } })
        : Promise.resolve(0),
      this.prisma.connected
        ? this.prisma.numberRequest.count({ where: { tenantId, status: 'REJECTED' } })
        : Promise.resolve(0),
      this.prisma.connected
        ? this.prisma.numberReservation.count({
            where: { tenantId, status: NumberReservationStatus.ACTIVE, expiresAt: { gt: new Date() } },
          })
        : Promise.resolve(0),
      this.getRecentlyAssigned(tenantId, 5),
    ]);

    const available = (await this.numbers.listMarketplaceInventory()).length;

    return {
      myNumbers,
      availableNumbers: available,
      pendingRequests: pending,
      rejectedRequests: rejected,
      activeReservations: reservations,
      recentlyAssigned,
    };
  }

  async searchInventory(
    tenantId: string,
    userId: string,
    query: MarketplaceSearchQueryDto,
  ): Promise<MarketplaceNumberRecord[]> {
    let rows = await this.numbers.listMarketplaceInventory(query.search);

    if (query.countryCode?.trim()) {
      const cc = query.countryCode.trim().toUpperCase();
      rows = rows.filter((r) => r.region.toUpperCase().includes(cc) || r.number.startsWith(`+${cc === 'US' ? '1' : ''}`));
    }
    if (query.state?.trim()) {
      const s = query.state.trim().toLowerCase();
      rows = rows.filter((r) => r.region.toLowerCase().includes(s));
    }
    if (query.city?.trim()) {
      const c = query.city.trim().toLowerCase();
      rows = rows.filter((r) => r.region.toLowerCase().includes(c));
    }
    if (query.postalCode?.trim()) {
      const z = query.postalCode.trim();
      rows = rows.filter((r) => r.region.includes(z));
    }
    if (query.areaCode?.trim()) {
      const ac = query.areaCode.trim().replace(/\D/g, '');
      rows = rows.filter((r) => r.number.replace(/\D/g, '').includes(ac));
    }
    if (query.prefix?.trim()) {
      const p = query.prefix.trim().replace(/\D/g, '');
      rows = rows.filter((r) => r.number.replace(/\D/g, '').startsWith(p));
    }
    if (query.contains?.trim()) {
      const c = query.contains.trim().replace(/\D/g, '');
      rows = rows.filter((r) => r.number.replace(/\D/g, '').includes(c));
    }
    if (query.phoneNumberType?.trim()) {
      const t = query.phoneNumberType.trim().toLowerCase();
      rows = rows.filter((r) => (r as MarketplaceNumberRecord).phoneNumberType?.toLowerCase() === t || this.inferType(r) === t);
    }
    if (query.voice) rows = rows.filter(() => true);
    if (query.sms) rows = rows.filter((r) => r.smsEnabled);
    if (query.mms) rows = rows.filter((r) => r.mmsEnabled);
    if (query.emergency) rows = rows.filter((r) => r.emergencyEnabled);
    if (query.vanity) rows = rows.filter((r) => /[A-Z]{3,}/i.test(r.number));

    const sortBy = query.sortBy ?? 'number';
    const sortDir = query.sortDir === 'desc' ? -1 : 1;
    rows.sort((a, b) => {
      const av = sortBy === 'monthlyCost' ? a.monthlyCost : sortBy === 'region' ? a.region : a.number;
      const bv = sortBy === 'monthlyCost' ? b.monthlyCost : sortBy === 'region' ? b.region : b.number;
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });

    const limit = query.limit ?? 100;
    rows = rows.slice(0, limit);

    const activeReservations = this.prisma.connected
      ? await this.prisma.numberReservation.findMany({
          where: { status: NumberReservationStatus.ACTIVE, expiresAt: { gt: new Date() } },
        })
      : [];

    const reservationByNumber = new Map(activeReservations.map((r) => [r.phoneNumber, r]));

    return rows.map((r) => {
      const reservation = reservationByNumber.get(r.number);
      let reservationStatus: MarketplaceNumberRecord['reservationStatus'] = 'available';
      if (reservation) {
        reservationStatus = reservation.tenantId === tenantId ? 'reserved_by_you' : 'reserved';
      }
      return {
        ...r,
        phoneNumberType: this.inferType(r),
        upfrontCost: 0,
        reservationStatus,
        reservationExpiresAt: reservation?.expiresAt.toISOString() ?? null,
        reservationId: reservation?.tenantId === tenantId ? reservation.id : null,
        estimatedAvailability: reservation ? 'Reserved' : 'Immediate',
      };
    });
  }

  async reserve(tenantId: string, userId: string, phoneNumber: string, countryCode = 'US') {
    const normalized = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber.replace(/\D/g, '')}`;
    const inventory = await this.numbers.findInventoryNumberByE164(normalized);
    if (!inventory) throw new BadRequestException('Number is not available in platform inventory');

    const existing = await this.prisma.numberReservation.findFirst({
      where: {
        phoneNumber: normalized,
        status: NumberReservationStatus.ACTIVE,
        expiresAt: { gt: new Date() },
      },
    });
    if (existing && existing.tenantId !== tenantId) {
      throw new ConflictException('Number is already reserved by another tenant');
    }
    if (existing && existing.tenantId === tenantId) {
      return this.toReservationResponse(existing);
    }

    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
    const reservation = await this.prisma.numberReservation.create({
      data: {
        id: randomUUID(),
        tenantId,
        phoneNumber: normalized,
        countryCode,
        status: NumberReservationStatus.ACTIVE,
        expiresAt,
        reservedBy: userId,
      },
    });

    await this.audit.append({
      tenantId,
      actorUserId: userId,
      actorType: 'admin',
      action: 'marketplace.number.reserved',
      resourceType: 'number_reservation',
      resourceId: reservation.id,
      detail: { phoneNumber: normalized, expiresAt: expiresAt.toISOString() },
    });

    await this.notifications.notify(tenantId, {
      userId,
      type: 'reservation_confirmed',
      title: 'Number reserved',
      body: `${normalized} is held for 24 hours while you complete your request.`,
      metadata: { phoneNumber: normalized, reservationId: reservation.id, expiresAt: expiresAt.toISOString() },
    });

    return this.toReservationResponse(reservation);
  }

  async cancelReservation(tenantId: string, userId: string, reservationId: string) {
    const reservation = await this.prisma.numberReservation.findFirst({
      where: { id: reservationId, tenantId },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (reservation.status !== NumberReservationStatus.ACTIVE) {
      throw new BadRequestException('Reservation is not active');
    }

    await this.prisma.numberReservation.update({
      where: { id: reservationId },
      data: { status: NumberReservationStatus.RELEASED },
    });

    await this.audit.append({
      tenantId,
      actorUserId: userId,
      actorType: 'admin',
      action: 'marketplace.reservation.cancelled',
      resourceType: 'number_reservation',
      resourceId: reservationId,
      detail: { phoneNumber: reservation.phoneNumber },
    });

    return { ok: true };
  }

  async listFavorites(tenantId: string, userId: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.numberFavorite.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addFavorite(tenantId: string, userId: string, phoneNumber: string) {
    const normalized = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber.replace(/\D/g, '')}`;
    await this.prisma.numberFavorite.upsert({
      where: { tenantId_userId_phoneNumber: { tenantId, userId, phoneNumber: normalized } },
      create: { id: randomUUID(), tenantId, userId, phoneNumber: normalized },
      update: {},
    });
    return { phoneNumber: normalized };
  }

  async removeFavorite(tenantId: string, userId: string, phoneNumber: string) {
    const normalized = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber.replace(/\D/g, '')}`;
    await this.prisma.numberFavorite.deleteMany({
      where: { tenantId, userId, phoneNumber: normalized },
    });
    return { ok: true };
  }

  async listSavedSearches(tenantId: string, userId: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.numberSavedSearch.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSavedSearch(tenantId: string, userId: string, name: string, filters: Record<string, unknown>) {
    return this.prisma.numberSavedSearch.create({
      data: { id: randomUUID(), tenantId, userId, name, filters: filters as object },
    });
  }

  async deleteSavedSearch(tenantId: string, userId: string, id: string) {
    const row = await this.prisma.numberSavedSearch.findFirst({ where: { id, tenantId, userId } });
    if (!row) throw new NotFoundException('Saved search not found');
    await this.prisma.numberSavedSearch.delete({ where: { id } });
    return { ok: true };
  }

  async getRecentlyAssigned(tenantId: string, limit = 10) {
    if (!this.prisma.connected) return [];

    const assignments = await this.prisma.numberAssignment.findMany({
      where: { tenantId, deletedAt: null, effectiveTo: null },
      include: {
        phoneNumber: { select: { id: true, number: true, status: true } },
      },
      orderBy: { effectiveFrom: 'desc' },
      take: limit,
    });

    return assignments.map((a) => ({
      id: a.id,
      phoneNumberId: a.phoneNumberId,
      number: a.phoneNumber.number,
      status: a.phoneNumber.status,
      assignedAt: a.effectiveFrom.toISOString(),
    }));
  }

  async getRequestHistory(tenantId: string, requestId: string) {
    const entries = await this.audit.query({
      tenantId,
      limit: 100,
      actionPrefix: 'marketplace.',
    });
    return entries.filter(
      (e) =>
        e.resourceId === requestId ||
        (e.detail as Record<string, unknown> | undefined)?.requestId === requestId,
    );
  }

  private inferType(r: TelnyxNumberResponseDto): string {
    const digits = r.number.replace(/\D/g, '');
    if (digits.startsWith('1800') || digits.startsWith('1888') || digits.startsWith('1877')) return 'toll_free';
    if (digits.length > 11) return 'mobile';
    return 'local';
  }

  private toReservationResponse(row: {
    id: string;
    phoneNumber: string;
    countryCode: string;
    status: string;
    expiresAt: Date;
  }) {
    return {
      id: row.id,
      phoneNumber: row.phoneNumber,
      countryCode: row.countryCode,
      status: row.status,
      expiresAt: row.expiresAt.toISOString(),
    };
  }
}

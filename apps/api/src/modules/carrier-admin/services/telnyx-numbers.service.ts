import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CarrierType,
  NumberReservationStatus,
  PhoneNumberStatus,
  Prisma,
  RouteDestinationType,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { normalizePhoneDigits, phoneMatchesDigitFilters } from '../../../common/query-param.util';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { ExtensionAutoProvisionService } from '../../tenant-portal/services/extension-auto-provision.service';
import {
  DEFAULT_EXTENSION_START,
  resolveBulkExtensionTarget,
} from '../../tenant-portal/utils/extension-auto-provision.util';
import {
  assertCanBindDidToLine,
  detachDidFromPriorExtension,
  markLineActiveOnDidAttach,
} from '../../tenant-portal/utils/did-extension-binding';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type {
  AssignTelnyxNumberDto,
  BulkAssignTelnyxNumbersDto,
  BulkEmergencyUpdateDto,
  BulkPurchaseTelnyxNumbersDto,
  BulkReleaseTelnyxNumbersDto,
  BulkReserveTelnyxNumbersDto,
  BulkTagTelnyxNumbersDto,
  ListTelnyxNumbersQueryDto,
  PurchaseTelnyxNumberDto,
  SearchAvailableNumbersQueryDto,
  TelnyxDashboardDto,
  TelnyxNumberResponseDto,
  TelnyxSyncStatusDto,
  UpdateTelnyxNumberDto,
} from '../dto/telnyx-numbers.dto';
import { TelnyxApiClient, type TelnyxPhoneNumberApi, type TelnyxSearchParams } from '../telnyx-api.client';

export type StoredTelnyxMeta = {
  telnyxId?: string;
  connectionType?: string;
  connectionId?: string;
  voiceProfile?: string;
  messagingProfile?: string;
  messagingProfileId?: string;
  smsEnabled?: boolean;
  mmsEnabled?: boolean;
  emergencyEnabled?: boolean;
  emergencyAddress?: string;
  cnam?: string;
  region?: string;
  monthlyCost?: number;
  assignedIvr?: string | null;
  assignedQueue?: string | null;
  assignedSiteId?: string | null;
  assignedDepartment?: string | null;
  assignedRingGroup?: string | null;
  assignedVoicemail?: string | null;
  assignedConference?: string | null;
  forwardTo?: string | null;
  tags?: string[];
  notes?: string;
  purchasedAt?: string;
  regulatoryBundle?: string;
  reserved?: boolean;
};

type SyncState = {
  lastSyncAt: string | null;
  status: 'idle' | 'running' | 'success' | 'failed';
  lastError?: string | null;
  added: number;
  updated: number;
  failed: number;
  conflicts: number;
};

function normalizeE164(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw.startsWith('+') ? raw : `+${digits}`;
}

function metaFromTelnyxApi(row: TelnyxPhoneNumberApi): StoredTelnyxMeta {
  const rawFeatures = row.features;
  const features = Array.isArray(rawFeatures)
    ? rawFeatures
        .map((f) => (typeof f === 'object' && f && 'name' in f ? String(f.name) : String(f)))
        .map((f) => f.toLowerCase())
    : [];
  const region =
    row.region_information?.find((r) => r.region_type === 'state')?.region_name ??
    row.region_information?.[0]?.region_name ??
    'US';
  return {
    telnyxId: row.id,
    connectionType: row.connection_name ?? 'SIP',
    connectionId: row.connection_id,
    voiceProfile: row.connection_name,
    messagingProfile: row.messaging_profile_name,
    messagingProfileId: row.messaging_profile_id,
    smsEnabled: features.some((f) => f.includes('sms')),
    mmsEnabled: features.some((f) => f.includes('mms')),
    emergencyEnabled: Boolean(row.emergency_enabled) || features.some((f) => f.includes('emergency') || f.includes('e911')),
    cnam: row.caller_id_name,
    region,
    monthlyCost: Number(row.cost_information?.monthly_cost ?? 0),
    purchasedAt: row.created_at ?? new Date().toISOString(),
    tags: row.tags ?? [],
  };
}

@Injectable()
export class TelnyxNumbersService {
  private readonly logger = new Logger(TelnyxNumbersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telnyx: TelnyxApiClient,
    private readonly config: ConfigService,
    private readonly audit: EnterpriseAuditService,
    private readonly extensionAutoProvision: ExtensionAutoProvisionService,
  ) {}

  async getDashboard(): Promise<TelnyxDashboardDto> {
    const rows = await this.list({});
    let assigned = 0;
    let available = 0;
    let porting = 0;
    let released = 0;
    let smsEnabled = 0;
    let voiceEnabled = 0;
    let emergencyEnabled = 0;
    let monthlyCost = 0;

    for (const r of rows) {
      monthlyCost += r.monthlyCost;
      if (r.status === 'porting') porting += 1;
      else if (r.status === 'released') released += 1;
      else if (r.assignedTenantId && r.status === 'active') assigned += 1;
      else if (r.status === 'available') available += 1;
      if (r.smsEnabled) smsEnabled += 1;
      if (r.connectionType) voiceEnabled += 1;
      if (r.emergencyEnabled) emergencyEnabled += 1;
    }

    const reserved = this.prisma.connected
      ? await this.prisma.numberReservation.count({
          where: { status: NumberReservationStatus.ACTIVE, expiresAt: { gt: new Date() } },
        })
      : 0;

    return {
      totalNumbers: rows.length,
      assigned,
      available,
      reserved,
      pendingPort: rows.filter((r) => r.status === 'pending').length,
      porting,
      released,
      smsEnabled,
      voiceEnabled,
      emergencyEnabled,
      monthlyCost,
      inventoryValue: monthlyCost,
    };
  }

  async getSyncStatus(): Promise<TelnyxSyncStatusDto> {
    const state = await this.loadSyncState();
    return {
      lastSyncAt: state.lastSyncAt,
      status: state.status,
      lastError: state.lastError ?? null,
      added: state.added,
      updated: state.updated,
      failed: state.failed,
      conflicts: state.conflicts,
    };
  }

  async triggerSync(actorUserId?: string): Promise<TelnyxSyncStatusDto> {
    await this.syncFromTelnyxIfEnabled(true);
    const status = await this.getSyncStatus();
    const inventoryTenantId = await this.resolveInventoryTenantId();
    this.logAudit(inventoryTenantId, actorUserId, 'telnyx.sync.manual', 'telnyx_inventory', undefined, status as unknown as Record<string, unknown>);
    return status;
  }

  async list(query: ListTelnyxNumbersQueryDto): Promise<TelnyxNumberResponseDto[]> {
    if (!this.prisma.connected) return [];

    try {
      await this.syncFromTelnyxIfEnabled(false);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(`Telnyx inventory sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const where: Prisma.PhoneNumberWhereInput = {
      deletedAt: null,
      carrier: { carrierType: CarrierType.TELNYX, deletedAt: null },
    };

    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { number: { contains: q, mode: 'insensitive' } },
        { tenant: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const rows = await this.prisma.phoneNumber.findMany({
      where,
      include: {
        tenant: { select: { id: true, name: true } },
        line: { include: { extension: true } },
        carrier: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    let mapped = await Promise.all(rows.map(async (r) => this.toResponse(r, await this.loadMeta(r))));

    if (query.status && query.status !== 'all') {
      mapped = mapped.filter((r) => r.status === query.status);
    }
    if (query.region?.trim()) {
      const region = query.region.trim().toLowerCase();
      mapped = mapped.filter((r) => r.region.toLowerCase().includes(region));
    }
    if (query.tag?.trim()) {
      const tag = query.tag.trim().toLowerCase();
      mapped = mapped.filter((r) => r.tags?.some((t) => t.toLowerCase().includes(tag)));
    }

    return mapped;
  }

  async listMarketplaceInventory(search?: string): Promise<TelnyxNumberResponseDto[]> {
    if (!this.prisma.connected) return [];
    const inventoryTenantId = await this.resolveInventoryTenantId();

    const where: Prisma.PhoneNumberWhereInput = {
      deletedAt: null,
      tenantId: inventoryTenantId,
      carrier: { carrierType: CarrierType.TELNYX, deletedAt: null },
      lineId: null,
    };

    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { number: { contains: q, mode: 'insensitive' } },
        { tenant: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const rows = await this.prisma.phoneNumber.findMany({
      where,
      include: {
        tenant: { select: { id: true, name: true } },
        line: { include: { extension: true } },
        carrier: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const mapped = await Promise.all(rows.map(async (r) => this.toResponse(r, await this.loadMeta(r))));
    // Inventory tenant only — never expose numbers assigned to customer tenants.
    return mapped.filter((n) => n.status === 'available' && !n.assignedExtension && !n.assignedTenantId);
  }

  async findInventoryNumberByE164(e164: string): Promise<TelnyxNumberResponseDto | null> {
    const normalized = normalizeE164(e164);
    const inventoryTenantId = await this.resolveInventoryTenantId();
    const row = await this.prisma.phoneNumber.findFirst({
      where: {
        number: normalized,
        deletedAt: null,
        tenantId: inventoryTenantId,
        carrier: { carrierType: CarrierType.TELNYX },
      },
      include: {
        tenant: { select: { id: true, name: true } },
        line: { include: { extension: true } },
        carrier: true,
      },
    });
    if (!row) return null;
    const meta = await this.loadMeta(row);
    const response = this.toResponse(row, meta);
    if (response.status !== 'available' && !response.assignedExtension) return null;
    return response;
  }

  async getById(id: string): Promise<TelnyxNumberResponseDto> {
    const row = await this.findRow(id);
    const meta = await this.loadMeta(row);
    return this.toResponse(row, meta);
  }

  async getHistory(id: string) {
    const row = await this.findRow(id);
    const assignments = await this.prisma.numberAssignment.findMany({
      where: { phoneNumberId: id, deletedAt: null },
      include: { tenant: { select: { name: true } } },
      orderBy: { effectiveFrom: 'desc' },
      take: 100,
    });

    const reservations = await this.prisma.numberReservation.findMany({
      where: { phoneNumber: row.number },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const auditEntries = await this.audit.query({
      tenantId: row.tenantId,
      limit: 50,
      actionPrefix: 'telnyx.',
    });

    return {
      assignments: assignments.map((a) => ({
        id: a.id,
        tenantId: a.tenantId,
        tenantName: a.tenant.name,
        effectiveFrom: a.effectiveFrom.toISOString(),
        effectiveTo: a.effectiveTo?.toISOString() ?? null,
      })),
      reservations: reservations.map((r) => ({
        id: r.id,
        status: r.status,
        expiresAt: r.expiresAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
      audit: auditEntries.filter(
        (e) => e.resourceId === id || (e.detail as Record<string, unknown> | undefined)?.phoneNumber === row.number,
      ),
    };
  }

  async searchAvailable(query: SearchAvailableNumbersQueryDto) {
    if (!this.telnyx.enabled) {
      throw new BadRequestException('TELNYX_API_KEY is not configured');
    }

    const merged = {
      ...query,
      nationalDestinationCode: query.nationalDestinationCode ?? query.areaCode,
      contains: query.contains ?? query.vanity ?? query.search,
      startsWith: query.startsWith ?? query.prefix,
    };

    const features: string[] = [];
    if (merged.voice) features.push('voice');
    if (merged.sms) features.push('sms');
    if (merged.mms) features.push('mms');
    if (merged.emergency) features.push('emergency');

    const contains = normalizePhoneDigits(merged.contains) || undefined;
    const endsWith = normalizePhoneDigits(merged.endsWith) || undefined;
    const startsWith = normalizePhoneDigits(merged.startsWith) || undefined;

    const params: TelnyxSearchParams = {
      countryCode: merged.countryCode ?? 'US',
      administrativeArea: merged.administrativeArea,
      locality: merged.locality,
      postalCode: merged.postalCode,
      nationalDestinationCode: merged.nationalDestinationCode,
      phoneNumberType: merged.phoneNumberType as TelnyxSearchParams['phoneNumberType'],
      features: features.length ? features : undefined,
      limit: merged.limit ?? 50,
      startsWith,
      endsWith,
      contains,
      bestEffort: merged.bestEffort,
      quickship: merged.quickship,
    };

    let rows = await this.telnyx.searchAvailableNumbers(params);

    rows = rows.filter((r) =>
      phoneMatchesDigitFilters(r.phone_number, {
        contains,
        endsWith,
        startsWith,
      }),
    );

    if (merged.quickship) {
      rows = rows.filter((r) => r.quickship === true);
    }

    return rows.map((r) => {
      const meta = metaFromTelnyxApi(r);
      const resultFeatures: string[] = [];
      if (meta.smsEnabled) resultFeatures.push('sms');
      if (meta.mmsEnabled) resultFeatures.push('mms');
      if (meta.emergencyEnabled) resultFeatures.push('emergency');
      resultFeatures.push('voice');
      return {
        phoneNumber: r.phone_number,
        region: meta.region ?? 'US',
        monthlyCost: meta.monthlyCost ?? 0,
        upfrontCost: Number(r.cost_information?.upfront_cost ?? 0),
        features: resultFeatures,
        phoneNumberType: r.phone_number_type ?? query.phoneNumberType ?? 'local',
        reservable: r.reservable ?? true,
        quickship: r.quickship ?? false,
        vanityFormat: r.vanity_format ?? null,
        regulatoryRequirements: [],
      };
    });
  }

  async reserve(dto: { phoneNumber: string; countryCode?: string; monthlyCost?: number }, actorUserId?: string) {
    if (!this.prisma.connected) throw new BadRequestException('Database unavailable');

    const e164 = normalizeE164(dto.phoneNumber);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const existing = await this.prisma.numberReservation.findFirst({
      where: { phoneNumber: e164, status: NumberReservationStatus.ACTIVE, expiresAt: { gt: new Date() } },
    });
    if (existing) {
      return {
        id: existing.id,
        phoneNumber: existing.phoneNumber,
        countryCode: existing.countryCode,
        status: existing.status,
        expiresAt: existing.expiresAt.toISOString(),
      };
    }

    const reservation = await this.prisma.numberReservation.create({
      data: {
        id: randomUUID(),
        phoneNumber: e164,
        countryCode: dto.countryCode ?? 'US',
        status: NumberReservationStatus.ACTIVE,
        expiresAt,
        reservedBy: actorUserId,
      },
    });

    const inventoryTenantId = await this.resolveInventoryTenantId();
    this.logAudit(inventoryTenantId, actorUserId, 'telnyx.number.reserved', 'number_reservation', reservation.id, {
      phoneNumber: e164,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      id: reservation.id,
      phoneNumber: reservation.phoneNumber,
      countryCode: reservation.countryCode,
      status: reservation.status,
      expiresAt: reservation.expiresAt.toISOString(),
    };
  }

  async purchase(dto: PurchaseTelnyxNumberDto, actorUserId?: string): Promise<TelnyxNumberResponseDto> {
    const inventoryTenantId = await this.resolveInventoryTenantId();

    if (dto.reservationId) {
      const reservation = await this.prisma.numberReservation.findFirst({
        where: { id: dto.reservationId, status: NumberReservationStatus.ACTIVE },
      });
      if (!reservation) throw new BadRequestException('Reservation not found or expired');
      if (reservation.expiresAt < new Date()) {
        await this.prisma.numberReservation.update({
          where: { id: reservation.id },
          data: { status: NumberReservationStatus.EXPIRED },
        });
        throw new BadRequestException('Reservation has expired');
      }
      dto.phoneNumber = dto.phoneNumber ?? reservation.phoneNumber;
    }

    let e164 = dto.phoneNumber ? normalizeE164(dto.phoneNumber) : '';
    let meta: StoredTelnyxMeta = {
      region: dto.region ?? 'US',
      voiceProfile: dto.voiceProfile,
      purchasedAt: new Date().toISOString(),
      monthlyCost: 0,
      smsEnabled: false,
      mmsEnabled: false,
      emergencyEnabled: false,
      connectionType: 'SIP',
      tags: [],
    };

    if (this.telnyx.enabled) {
      try {
        const purchased = await this.telnyx.purchaseNumber({
          phoneNumber: dto.phoneNumber,
          countryCode: dto.countryCode,
          region: dto.region,
          connectionId: dto.connectionId,
          messagingProfileId: dto.messagingProfileId,
        });
        e164 = normalizeE164(purchased.phone_number ?? e164);
        meta = { ...meta, ...metaFromTelnyxApi(purchased) };
      } catch (err) {
        throw new BadRequestException(
          `Telnyx purchase failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else if (!e164) {
      throw new BadRequestException('phoneNumber is required when TELNYX_API_KEY is not configured');
    }

    const carrier = await this.ensureTelnyxCarrier(inventoryTenantId);
    const existing = await this.prisma.phoneNumber.findFirst({
      where: { number: e164, deletedAt: null },
    });
    if (existing) {
      if (dto.reservationId) {
        await this.prisma.numberReservation.update({
          where: { id: dto.reservationId },
          data: { status: NumberReservationStatus.CONVERTED },
        });
      }
      return this.getById(existing.id);
    }

    const id = randomUUID();
    const created = await this.prisma.phoneNumber.create({
      data: {
        id,
        publicId: this.buildPublicId(meta),
        tenantId: inventoryTenantId,
        carrierId: carrier.id,
        number: e164,
        status: PhoneNumberStatus.PORTING,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      include: {
        tenant: { select: { id: true, name: true } },
        line: { include: { extension: true } },
        carrier: true,
      },
    });

    await this.persistMeta(carrier.id, created.id, meta);

    if (dto.reservationId) {
      await this.prisma.numberReservation.update({
        where: { id: dto.reservationId },
        data: { status: NumberReservationStatus.CONVERTED, telnyxId: meta.telnyxId ?? null },
      });
    }

    await this.syncFromTelnyxIfEnabled(false);

    this.logAudit(inventoryTenantId, actorUserId, 'telnyx.number.purchased', 'phone_number', id, {
      phoneNumber: e164,
      telnyxId: meta.telnyxId,
    });

    return this.toResponse(created, meta);
  }

  async update(id: string, dto: UpdateTelnyxNumberDto, actorUserId?: string): Promise<TelnyxNumberResponseDto> {
    const row = await this.findRow(id);
    const meta = await this.loadMeta(row);

    if (dto.voiceProfile !== undefined) meta.voiceProfile = dto.voiceProfile;
    if (dto.messagingProfile !== undefined) meta.messagingProfile = dto.messagingProfile;
    if (dto.smsEnabled !== undefined) meta.smsEnabled = dto.smsEnabled;
    if (dto.emergencyEnabled !== undefined) meta.emergencyEnabled = dto.emergencyEnabled;
    if (dto.emergencyAddress !== undefined) meta.emergencyAddress = dto.emergencyAddress;
    if (dto.cnam !== undefined) meta.cnam = dto.cnam;
    if (dto.notes !== undefined) meta.notes = dto.notes;
    if (dto.tags !== undefined) meta.tags = dto.tags;

    if (this.telnyx.enabled && meta.telnyxId) {
      const patch: Record<string, unknown> = {};
      if (dto.connectionId) patch.connection_id = dto.connectionId;
      if (dto.cnam) patch.caller_id_name = dto.cnam;
      if (Object.keys(patch).length) await this.telnyx.updateNumber(meta.telnyxId, patch);
    }

    await this.prisma.phoneNumber.update({
      where: { id },
      data: {
        updatedBy: actorUserId,
        status: row.status === PhoneNumberStatus.PORTING ? PhoneNumberStatus.ACTIVE : row.status,
      },
    });
    await this.persistMeta(row.carrierId!, id, meta);

    this.logAudit(row.tenantId, actorUserId, 'telnyx.number.updated', 'phone_number', id, { fields: Object.keys(dto) });

    return this.getById(id);
  }

  async assign(
    id: string,
    dto: AssignTelnyxNumberDto,
    actorUserId?: string,
    options?: { allocateFrom?: number },
  ): Promise<TelnyxNumberResponseDto> {
    const row = await this.findRow(id);
    const meta = await this.loadMeta(row);

    meta.assignedIvr = dto.ivr ?? null;
    meta.assignedQueue = dto.queue ?? null;
    meta.assignedSiteId = dto.siteId ?? null;
    meta.assignedDepartment = dto.department ?? null;
    meta.assignedRingGroup = dto.ringGroup ?? null;
    meta.assignedVoicemail = dto.voicemail ?? null;
    meta.assignedConference = dto.conference ?? null;
    meta.forwardTo = dto.forwardTo ?? null;

    // Single atomic unit: detach prior tenant → lock → allocate/create PBX stub → DID bind.
    // Any failure rolls back the entire provisioning unit (no orphan Line/SIP/VM).
    const { assignedExtension, priorTenantId } = await this.prisma.$transaction(
      async (tx) => {
        // Cross-tenant / reassign: prior extension stays (Inactive); no data leak via routes.
        const prior = await detachDidFromPriorExtension(tx, {
          phoneNumberId: id,
          actorUserId,
          nextTenantId: dto.tenantId,
        });

        // Move number onto target tenant before creating that tenant's extension stub.
        await tx.phoneNumber.update({
          where: { id },
          data: {
            tenantId: dto.tenantId,
            siteId: dto.siteId ?? null,
            lineId: null,
            status: PhoneNumberStatus.ACTIVE,
            updatedBy: actorUserId,
          },
        });

        await this.extensionAutoProvision.lockTenantExtensionAllocation(tx, dto.tenantId);

        const extensionNumber =
          dto.extension?.trim() ||
          (await this.extensionAutoProvision.allocateNextExtensionNumber(
            dto.tenantId,
            options?.allocateFrom ?? DEFAULT_EXTENSION_START,
            tx,
          ));

        const ext = await this.extensionAutoProvision.ensureFullyProvisionedExtension(
          dto.tenantId,
          extensionNumber,
          actorUserId,
          { phoneNumberId: id },
          tx,
        );
        const lineId = ext.lineId;
        const extensionId = ext.id;

        await assertCanBindDidToLine(tx, {
          tenantId: dto.tenantId,
          phoneNumberId: id,
          lineId,
        });

        await tx.phoneNumber.update({
          where: { id },
          data: { lineId, updatedBy: actorUserId },
        });
        await markLineActiveOnDidAttach(tx, lineId, actorUserId);

        await tx.numberAssignment.create({
          data: {
            id: randomUUID(),
            tenantId: dto.tenantId,
            phoneNumberId: id,
            siteId: dto.siteId ?? null,
            lineId,
            effectiveFrom: new Date(),
            createdBy: actorUserId,
          },
        });

        const phone = await tx.phoneNumber.findUnique({ where: { id } });
        const existingRoute = await tx.inboundRoute.findFirst({
          where: { tenantId: dto.tenantId, phoneNumberId: id, deletedAt: null },
          orderBy: { priority: 'asc' },
        });
        const routeData = {
          destinationType: RouteDestinationType.EXTENSION,
          destinationLineId: lineId,
          destinationExtensionId: extensionId,
          destinationQueueId: null,
          destinationIvrId: null,
          destinationRingGroupId: null,
          destinationVoicemailId: null,
          destinationConferenceId: null,
          openHoursDestinationType: null,
          openHoursDestinationId: null,
          enabled: true,
          updatedBy: actorUserId,
        };
        if (existingRoute) {
          await tx.inboundRoute.update({ where: { id: existingRoute.id }, data: routeData });
        } else {
          await tx.inboundRoute.create({
            data: {
              id: randomUUID(),
              tenantId: dto.tenantId,
              name: `DID ${phone?.number ?? id}`,
              phoneNumberId: id,
              priority: 100,
              enabled: true,
              createdBy: actorUserId,
              ...routeData,
            },
          });
        }

        return {
          assignedExtension: ext.extension,
          priorTenantId: prior.priorTenantId,
        };
      },
      { timeout: 60_000 },
    );

    await this.persistMeta(row.carrierId!, id, meta);
    const updated = await this.findRow(id);
    const response = this.toResponse(updated, meta);
    response.assignedExtension = assignedExtension;

    this.logAudit(dto.tenantId, actorUserId, 'telnyx.number.assigned', 'phone_number', id, {
      extension: assignedExtension,
      siteId: dto.siteId,
      priorTenantId: priorTenantId !== dto.tenantId ? priorTenantId : null,
    });
    if (priorTenantId && priorTenantId !== dto.tenantId) {
      this.logAudit(priorTenantId, actorUserId, 'telnyx.number.unassigned', 'phone_number', id, {
        reason: 'reassigned_to_tenant',
        nextTenantId: dto.tenantId,
      });
    }

    return response;
  }

  async reassign(id: string, dto: AssignTelnyxNumberDto, actorUserId?: string): Promise<TelnyxNumberResponseDto> {
    return this.assign(id, dto, actorUserId);
  }

  async suspend(id: string, actorUserId?: string): Promise<TelnyxNumberResponseDto> {
    const row = await this.findRow(id);
    await this.prisma.phoneNumber.update({
      where: { id },
      data: { status: PhoneNumberStatus.INACTIVE, updatedBy: actorUserId },
    });
    this.logAudit(row.tenantId, actorUserId, 'telnyx.number.suspended', 'phone_number', id);
    return this.getById(id);
  }

  async activate(id: string, actorUserId?: string): Promise<TelnyxNumberResponseDto> {
    const row = await this.findRow(id);
    await this.prisma.phoneNumber.update({
      where: { id },
      data: { status: PhoneNumberStatus.ACTIVE, updatedBy: actorUserId },
    });
    this.logAudit(row.tenantId, actorUserId, 'telnyx.number.activated', 'phone_number', id);
    return this.getById(id);
  }

  async release(id: string, actorUserId?: string): Promise<void> {
    const row = await this.findRow(id);
    const meta = await this.loadMeta(row);

    if (this.telnyx.enabled && meta.telnyxId) {
      try {
        await this.telnyx.releaseNumber(meta.telnyxId);
      } catch (err) {
        this.logger.warn(`Telnyx release failed for ${meta.telnyxId}: ${String(err)}`);
        throw new BadRequestException(`Telnyx release failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await detachDidFromPriorExtension(tx, { phoneNumberId: id, actorUserId });
      await tx.phoneNumber.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedBy: actorUserId,
          lineId: null,
          status: PhoneNumberStatus.INACTIVE,
        },
      });
    });

    this.logAudit(row.tenantId, actorUserId, 'telnyx.number.released', 'phone_number', id, { phoneNumber: row.number });
  }

  async bulkAssign(dto: BulkAssignTelnyxNumbersDto, actorUserId?: string) {
    const succeeded: TelnyxNumberResponseDto[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    const sortedIds = [...dto.ids].sort();
    for (let i = 0; i < sortedIds.length; i += 1) {
      const id = sortedIds[i]!;
      const target = resolveBulkExtensionTarget(dto, i);
      try {
        if (target.mode === 'explicit') {
          // Explicit extensions[i] may intentionally target an existing extension.
          succeeded.push(
            await this.assign(
              id,
              { tenantId: dto.tenantId, siteId: dto.siteId, extension: target.extension },
              actorUserId,
            ),
          );
        } else {
          // startExtension / blank: next free >= base under assign's advisory lock (never silent reuse).
          succeeded.push(
            await this.assign(
              id,
              { tenantId: dto.tenantId, siteId: dto.siteId },
              actorUserId,
              { allocateFrom: target.startFrom },
            ),
          );
        }
      } catch (err) {
        failed.push({ id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { succeeded, failed };
  }

  async bulkRelease(dto: BulkReleaseTelnyxNumbersDto, actorUserId?: string) {
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    for (const id of dto.ids) {
      try {
        await this.release(id, actorUserId);
        succeeded.push(id);
      } catch (err) {
        failed.push({ id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { succeeded, failed };
  }

  async bulkPurchase(dto: BulkPurchaseTelnyxNumbersDto, actorUserId?: string) {
    const succeeded: TelnyxNumberResponseDto[] = [];
    const failed: Array<{ phoneNumber: string; error: string }> = [];
    for (const phoneNumber of dto.phoneNumbers) {
      try {
        succeeded.push(
          await this.purchase(
            { phoneNumber, countryCode: dto.countryCode, connectionId: dto.connectionId },
            actorUserId,
          ),
        );
      } catch (err) {
        failed.push({ phoneNumber, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { succeeded, failed };
  }

  async bulkReserve(dto: BulkReserveTelnyxNumbersDto, actorUserId?: string) {
    const succeeded: unknown[] = [];
    const failed: Array<{ phoneNumber: string; error: string }> = [];
    for (const phoneNumber of dto.phoneNumbers) {
      try {
        succeeded.push(await this.reserve({ phoneNumber, countryCode: dto.countryCode }, actorUserId));
      } catch (err) {
        failed.push({ phoneNumber, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { succeeded, failed };
  }

  async bulkTag(dto: BulkTagTelnyxNumbersDto, actorUserId?: string) {
    const updated: TelnyxNumberResponseDto[] = [];
    for (const id of dto.ids) {
      const row = await this.findRow(id);
      const meta = await this.loadMeta(row);
      meta.tags = [...new Set([...(meta.tags ?? []), ...dto.tags])];
      await this.persistMeta(row.carrierId!, id, meta);
      updated.push(await this.getById(id));
    }
    const inventoryTenantId = await this.resolveInventoryTenantId();
    this.logAudit(inventoryTenantId, actorUserId, 'telnyx.numbers.bulk_tagged', 'telnyx_inventory', undefined, {
      ids: dto.ids,
      tags: dto.tags,
    });
    return updated;
  }

  async bulkEmergencyUpdate(dto: BulkEmergencyUpdateDto, actorUserId?: string) {
    const updated: TelnyxNumberResponseDto[] = [];
    for (const id of dto.ids) {
      updated.push(
        await this.update(
          id,
          { emergencyAddress: dto.emergencyAddress, emergencyEnabled: dto.emergencyEnabled ?? true },
          actorUserId,
        ),
      );
    }
    return updated;
  }

  private async syncFromTelnyxIfEnabled(manual = false): Promise<void> {
    if (!this.telnyx.enabled || !this.prisma.connected) return;

    const inventoryTenantId = await this.resolveInventoryTenantId();
    const carrier = await this.ensureTelnyxCarrier(inventoryTenantId);
    const state: SyncState = {
      lastSyncAt: null,
      status: 'running',
      added: 0,
      updated: 0,
      failed: 0,
      conflicts: 0,
    };
    await this.persistSyncState(carrier.id, state);

    try {
      const remote = await this.telnyx.listAllPhoneNumbers();
      const remoteNumbers = new Set(remote.map((r) => normalizeE164(r.phone_number)));

      for (const remoteRow of remote) {
        try {
          const e164 = normalizeE164(remoteRow.phone_number);
          const meta = metaFromTelnyxApi(remoteRow);
          const existing = await this.prisma.phoneNumber.findFirst({
            where: { number: e164, deletedAt: null },
          });
          if (existing) {
            await this.persistMeta(carrier.id, existing.id, { ...(await this.loadMeta(existing)), ...meta });
            if (existing.status === PhoneNumberStatus.PORTING) {
              await this.prisma.phoneNumber.update({
                where: { id: existing.id },
                data: { status: PhoneNumberStatus.ACTIVE },
              });
            }
            state.updated += 1;
            continue;
          }
          const id = randomUUID();
          await this.prisma.phoneNumber.create({
            data: {
              id,
              publicId: this.buildPublicId(meta),
              tenantId: inventoryTenantId,
              carrierId: carrier.id,
              number: e164,
              status: PhoneNumberStatus.ACTIVE,
            },
          });
          await this.persistMeta(carrier.id, id, meta);
          state.added += 1;
        } catch (err) {
          state.failed += 1;
          this.logger.warn(`Sync skip ${remoteRow.phone_number}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const localRows = await this.prisma.phoneNumber.findMany({
        where: { carrierId: carrier.id, deletedAt: null },
      });
      for (const local of localRows) {
        if (!remoteNumbers.has(local.number)) {
          state.conflicts += 1;
        }
      }

      state.status = 'success';
      state.lastSyncAt = new Date().toISOString();
    } catch (err) {
      state.status = 'failed';
      state.lastError = err instanceof Error ? err.message : String(err);
      state.lastSyncAt = new Date().toISOString();
      if (manual) throw err;
    } finally {
      await this.persistSyncState(carrier.id, state);
    }
  }

  private buildPublicId(meta: StoredTelnyxMeta): string {
    return meta.telnyxId ? `telnyx:${meta.telnyxId}` : `local:${randomUUID()}`;
  }

  /**
   * Platform Inventory Tenant only — never fall back to "oldest tenant".
   * Misconfiguration must fail loudly so purchased DIDs never attach to a customer.
   */
  async resolveInventoryTenantId(): Promise<string> {
    const settings = await this.prisma.platformSettings.findFirst();
    const configured =
      settings?.inventoryTenantId?.trim() ||
      this.config.get<string>('VSP_PLATFORM_INVENTORY_TENANT_ID')?.trim();

    if (!configured) {
      throw new BadRequestException(
        'Platform Inventory Tenant is not configured. Set platformSettings.inventoryTenantId or VSP_PLATFORM_INVENTORY_TENANT_ID to the dedicated inventory tenant (e.g. Platform Inventory).',
      );
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: configured, deletedAt: null },
    });
    if (!tenant) {
      throw new BadRequestException(
        `Platform Inventory Tenant not found: ${configured}. Create/restore the inventory tenant and update configuration.`,
      );
    }
    return tenant.id;
  }

  private async ensureTelnyxCarrier(tenantId: string) {
    const existing = await this.prisma.carrier.findFirst({
      where: { tenantId, carrierType: CarrierType.TELNYX, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing;

    return this.prisma.carrier.create({
      data: {
        id: randomUUID(),
        publicId: `carrier-telnyx-${tenantId.slice(0, 8)}`,
        tenantId,
        name: 'Telnyx',
        code: 'telnyx',
        carrierType: CarrierType.TELNYX,
        configuration: { sipHost: this.config.get('TELNYX_SIP_HOST', 'sip.telnyx.com') },
      },
    });
  }

  private metaKey(phoneNumberId: string): string {
    return `pn:${phoneNumberId}`;
  }

  private async loadMeta(row: {
    id: string;
    carrierId: string | null;
    publicId: string;
    createdAt: Date;
  }): Promise<StoredTelnyxMeta> {
    if (!row.carrierId) {
      return { purchasedAt: row.createdAt.toISOString(), region: 'US', monthlyCost: 0, tags: [] };
    }
    const carrier = await this.prisma.carrier.findUnique({ where: { id: row.carrierId } });
    const cfg = (carrier?.configuration ?? {}) as Record<string, unknown>;
    const inventory = (cfg.telnyxInventory ?? {}) as Record<string, StoredTelnyxMeta>;
    const fromStore = inventory[this.metaKey(row.id)];
    const telnyxId = row.publicId.startsWith('telnyx:') ? row.publicId.slice(7) : fromStore?.telnyxId;
    return {
      purchasedAt: row.createdAt.toISOString(),
      region: 'US',
      monthlyCost: 0,
      smsEnabled: false,
      mmsEnabled: false,
      emergencyEnabled: false,
      connectionType: 'SIP',
      tags: [],
      ...fromStore,
      telnyxId,
    };
  }

  private async persistMeta(carrierId: string, phoneNumberId: string, meta: StoredTelnyxMeta): Promise<void> {
    const carrier = await this.prisma.carrier.findUnique({ where: { id: carrierId } });
    if (!carrier) return;
    const cfg = { ...((carrier.configuration ?? {}) as Record<string, unknown>) };
    const inventory = { ...((cfg.telnyxInventory ?? {}) as Record<string, StoredTelnyxMeta>) };
    inventory[this.metaKey(phoneNumberId)] = meta;
    cfg.telnyxInventory = inventory;
    await this.prisma.carrier.update({
      where: { id: carrierId },
      data: { configuration: cfg as Prisma.InputJsonValue },
    });
  }

  private async loadSyncState(): Promise<SyncState> {
    const inventoryTenantId = await this.resolveInventoryTenantId();
    const carrier = await this.ensureTelnyxCarrier(inventoryTenantId);
    const cfg = (carrier.configuration ?? {}) as Record<string, unknown>;
    const sync = cfg.telnyxSync as SyncState | undefined;
    return (
      sync ?? {
        lastSyncAt: null,
        status: 'idle',
        added: 0,
        updated: 0,
        failed: 0,
        conflicts: 0,
      }
    );
  }

  private async persistSyncState(carrierId: string, state: SyncState): Promise<void> {
    const carrier = await this.prisma.carrier.findUnique({ where: { id: carrierId } });
    if (!carrier) return;
    const cfg = { ...((carrier.configuration ?? {}) as Record<string, unknown>) };
    cfg.telnyxSync = state;
    await this.prisma.carrier.update({
      where: { id: carrierId },
      data: { configuration: cfg as Prisma.InputJsonValue },
    });
  }

  private async findRow(id: string) {
    const row = await this.prisma.phoneNumber.findFirst({
      where: { id, deletedAt: null },
      include: {
        tenant: { select: { id: true, name: true } },
        line: { include: { extension: true } },
        carrier: true,
      },
    });
    if (!row) throw new NotFoundException('Phone number not found');
    return row;
  }

  private toResponse(
    row: {
      id: string;
      number: string;
      status: PhoneNumberStatus;
      tenantId: string;
      siteId?: string | null;
      lineId: string | null;
      createdAt: Date;
      tenant: { id: string; name: string };
      line: { extension: { extension: string } | null } | null;
    },
    meta?: StoredTelnyxMeta,
  ): TelnyxNumberResponseDto {
    const m = meta ?? { purchasedAt: row.createdAt.toISOString(), region: 'US', monthlyCost: 0, tags: [] };
    const assigned = Boolean(row.lineId);
    const inventoryTenantId = this.config.get<string>('VSP_PLATFORM_INVENTORY_TENANT_ID');
    const isInventory = inventoryTenantId ? row.tenantId === inventoryTenantId : !assigned;

    let status: TelnyxNumberResponseDto['status'] = 'available';
    if (row.status === PhoneNumberStatus.PORTING) status = 'porting';
    else if (row.status === PhoneNumberStatus.INACTIVE) status = 'suspended';
    else if (assigned || (!isInventory && row.tenantId)) status = 'active';
    else status = 'available';

    return {
      id: row.id,
      number: row.number,
      e164: row.number,
      telnyxId: m.telnyxId ?? null,
      connectionType: m.connectionType ?? 'SIP',
      connectionId: m.connectionId ?? null,
      voiceProfile: m.voiceProfile,
      messagingProfile: m.messagingProfile,
      smsEnabled: Boolean(m.smsEnabled),
      mmsEnabled: Boolean(m.mmsEnabled),
      emergencyEnabled: Boolean(m.emergencyEnabled),
      emergencyAddress: m.emergencyAddress ?? null,
      cnam: m.cnam ?? null,
      assignedTenantId: assigned || !isInventory ? row.tenant.id : null,
      assignedTenantName: assigned || !isInventory ? row.tenant.name : null,
      assignedSiteId: m.assignedSiteId ?? row.siteId ?? null,
      assignedExtension: row.line?.extension?.extension ?? null,
      assignedIvr: m.assignedIvr ?? null,
      assignedQueue: m.assignedQueue ?? null,
      assignedRingGroup: m.assignedRingGroup ?? null,
      assignedVoicemail: m.assignedVoicemail ?? null,
      assignedConference: m.assignedConference ?? null,
      forwardTo: m.forwardTo ?? null,
      region: m.region ?? 'US',
      monthlyCost: m.monthlyCost ?? 0,
      purchasedAt: m.purchasedAt ?? row.createdAt.toISOString(),
      status,
      tags: m.tags ?? [],
      notes: m.notes ?? null,
      regulatoryBundle: m.regulatoryBundle ?? null,
    };
  }

  private logAudit(
    tenantId: string,
    actorUserId: string | undefined,
    action: string,
    resourceType: string,
    resourceId?: string,
    detail?: Record<string, unknown>,
  ): void {
    void this.audit.append({
      tenantId,
      actorUserId,
      actorType: actorUserId ? 'admin' : 'system',
      action,
      resourceType,
      resourceId,
      detail,
    });
  }
}


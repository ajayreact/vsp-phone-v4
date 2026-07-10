import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CarrierType, NumberReservationStatus, PhoneNumberStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type {
  AssignTelnyxNumberDto,
  BulkAssignTelnyxNumbersDto,
  BulkReleaseTelnyxNumbersDto,
  ListTelnyxNumbersQueryDto,
  PurchaseTelnyxNumberDto,
  TelnyxNumberResponseDto,
  UpdateTelnyxNumberDto,
} from '../dto/telnyx-numbers.dto';
import { TelnyxApiClient, type TelnyxPhoneNumberApi } from '../telnyx-api.client';

type StoredTelnyxMeta = {
  telnyxId?: string;
  connectionType?: string;
  voiceProfile?: string;
  smsEnabled?: boolean;
  mmsEnabled?: boolean;
  emergencyEnabled?: boolean;
  region?: string;
  monthlyCost?: number;
  assignedIvr?: string | null;
  assignedQueue?: string | null;
  purchasedAt?: string;
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
    ? rawFeatures.map((f) => (typeof f === 'object' && f && 'name' in f ? String(f.name) : String(f))).map((f) => f.toLowerCase())
    : [];
  const region =
    row.region_information?.find((r) => r.region_type === 'state')?.region_name ??
    row.region_information?.[0]?.region_name ??
    'US';
  return {
    telnyxId: row.id,
    connectionType: row.connection_name ?? 'SIP',
    voiceProfile: row.messaging_profile_name ?? row.connection_name,
    smsEnabled: features.some((f) => f.includes('sms')),
    mmsEnabled: features.some((f) => f.includes('mms')),
    emergencyEnabled: features.some((f) => f.includes('emergency') || f.includes('e911')),
    region,
    monthlyCost: Number(row.cost_information?.monthly_cost ?? 0),
    purchasedAt: row.created_at ?? new Date().toISOString(),
  };
}

@Injectable()
export class TelnyxNumbersService {
  private readonly logger = new Logger(TelnyxNumbersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telnyx: TelnyxApiClient,
    private readonly config: ConfigService,
  ) {}

  async list(query: ListTelnyxNumbersQueryDto): Promise<TelnyxNumberResponseDto[]> {
    if (!this.prisma.connected) return [];

    try {
      await this.syncFromTelnyxIfEnabled();
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(
        `Telnyx inventory sync failed — returning PostgreSQL rows only: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
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

    let mapped = rows.map((r) => this.toResponse(r));

    if (query.status && query.status !== 'all') {
      mapped = mapped.filter((r) => r.status === query.status);
    }

    if (query.region?.trim()) {
      const region = query.region.trim().toLowerCase();
      mapped = mapped.filter((r) => r.region.toLowerCase().includes(region));
    }

    return mapped;
  }

  async purchase(dto: PurchaseTelnyxNumberDto, actorUserId?: string): Promise<TelnyxNumberResponseDto> {
    const inventoryTenantId = await this.resolveInventoryTenantId();

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
    };

    if (this.telnyx.enabled) {
      const purchased = await this.telnyx.purchaseNumber({
        phoneNumber: dto.phoneNumber,
        countryCode: dto.countryCode,
        region: dto.region,
        connectionId: dto.connectionId,
      });
      e164 = normalizeE164(purchased.phone_number);
      meta = { ...meta, ...metaFromTelnyxApi(purchased) };
    } else if (!e164) {
      throw new BadRequestException('phoneNumber is required when TELNYX_API_KEY is not configured');
    }

    const carrier = await this.ensureTelnyxCarrier(inventoryTenantId);
    const existing = await this.prisma.phoneNumber.findFirst({
      where: { number: e164, deletedAt: null },
    });
    if (existing) {
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
    return this.toResponse(created, meta);
  }

  async update(id: string, dto: UpdateTelnyxNumberDto, actorUserId?: string): Promise<TelnyxNumberResponseDto> {
    const row = await this.findRow(id);
    const meta = await this.loadMeta(row);

    if (dto.voiceProfile !== undefined) meta.voiceProfile = dto.voiceProfile;
    if (dto.smsEnabled !== undefined) meta.smsEnabled = dto.smsEnabled;
    if (dto.emergencyEnabled !== undefined) meta.emergencyEnabled = dto.emergencyEnabled;

    if (this.telnyx.enabled && meta.telnyxId) {
      const patch: Record<string, unknown> = {};
      if (dto.connectionId) patch.connection_id = dto.connectionId;
      await this.telnyx.updateNumber(meta.telnyxId, patch);
    }

    await this.prisma.phoneNumber.update({
      where: { id },
      data: { updatedBy: actorUserId, status: row.status === PhoneNumberStatus.PORTING ? PhoneNumberStatus.ACTIVE : row.status },
    });
    await this.persistMeta(row.carrierId!, id, meta);
    return this.getById(id);
  }

  async assign(id: string, dto: AssignTelnyxNumberDto, actorUserId?: string): Promise<TelnyxNumberResponseDto> {
    const row = await this.findRow(id);
    const meta = await this.loadMeta(row);

    let lineId: string | null = null;
    let assignedExtension: string | null = null;

    if (dto.extension) {
      const ext = await this.prisma.extension.findFirst({
        where: { tenantId: dto.tenantId, extension: dto.extension, deletedAt: null },
      });
      if (!ext) throw new NotFoundException(`Extension ${dto.extension} not found for tenant`);
      lineId = ext.lineId;
      assignedExtension = ext.extension;
    }

    meta.assignedIvr = dto.ivr ?? null;
    meta.assignedQueue = dto.queue ?? null;

    await this.prisma.$transaction(async (tx) => {
      await tx.phoneNumber.update({
        where: { id },
        data: {
          tenantId: dto.tenantId,
          lineId,
          status: PhoneNumberStatus.ACTIVE,
          updatedBy: actorUserId,
        },
      });
      await tx.numberAssignment.create({
        data: {
          id: randomUUID(),
          tenantId: dto.tenantId,
          phoneNumberId: id,
          lineId,
          effectiveFrom: new Date(),
          createdBy: actorUserId,
        },
      });
    });

    await this.persistMeta(row.carrierId!, id, meta);
    const updated = await this.findRow(id);
    const response = this.toResponse(updated, meta);
    response.assignedExtension = assignedExtension;
    return response;
  }

  async release(id: string, actorUserId?: string): Promise<void> {
    const row = await this.findRow(id);
    const meta = await this.loadMeta(row);

    if (this.telnyx.enabled && meta.telnyxId) {
      try {
        await this.telnyx.releaseNumber(meta.telnyxId);
      } catch (err) {
        this.logger.warn(`Telnyx release failed for ${meta.telnyxId}: ${String(err)}`);
      }
    }

    await this.prisma.phoneNumber.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: actorUserId,
        lineId: null,
        status: PhoneNumberStatus.INACTIVE,
      },
    });
  }

  async bulkAssign(dto: BulkAssignTelnyxNumbersDto, actorUserId?: string): Promise<TelnyxNumberResponseDto[]> {
    const results: TelnyxNumberResponseDto[] = [];
    for (const id of dto.ids) {
      results.push(
        await this.assign(
          id,
          { tenantId: dto.tenantId, extension: dto.extension },
          actorUserId,
        ),
      );
    }
    return results;
  }

  async bulkRelease(dto: BulkReleaseTelnyxNumbersDto, actorUserId?: string): Promise<void> {
    for (const id of dto.ids) {
      await this.release(id, actorUserId);
    }
  }

  async getById(id: string): Promise<TelnyxNumberResponseDto> {
    const row = await this.findRow(id);
    const meta = await this.loadMeta(row);
    return this.toResponse(row, meta);
  }

  private async syncFromTelnyxIfEnabled(): Promise<void> {
    if (!this.telnyx.enabled || !this.prisma.connected) return;

    const inventoryTenantId = await this.resolveInventoryTenantId();
    const carrier = await this.ensureTelnyxCarrier(inventoryTenantId);
    const remote = await this.telnyx.listAllPhoneNumbers();

    for (const remoteRow of remote) {
      try {
        const e164 = normalizeE164(remoteRow.phone_number);
        const meta = metaFromTelnyxApi(remoteRow);
        const existing = await this.prisma.phoneNumber.findFirst({
          where: { number: e164, deletedAt: null },
        });
        if (existing) {
          await this.persistMeta(carrier.id, existing.id, { ...(await this.loadMeta(existing)), ...meta });
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
      } catch (err) {
        this.logger.warn(
          `Skipping Telnyx number ${remoteRow.phone_number ?? remoteRow.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private buildPublicId(meta: StoredTelnyxMeta): string {
    return meta.telnyxId ? `telnyx:${meta.telnyxId}` : `local:${randomUUID()}`;
  }

  private async resolveInventoryTenantId(): Promise<string> {
    const configured = this.config.get<string>('VSP_PLATFORM_INVENTORY_TENANT_ID')?.trim();
    if (configured) {
      const tenant = await this.prisma.tenant.findFirst({
        where: { id: configured, deletedAt: null },
      });
      if (!tenant) {
        throw new BadRequestException(
          `VSP_PLATFORM_INVENTORY_TENANT_ID does not match an active tenant: ${configured}`,
        );
      }
      return tenant.id;
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (!tenant) throw new BadRequestException('No tenant available for platform inventory');
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

  private async loadMeta(row: { id: string; carrierId: string | null; publicId: string; createdAt: Date }): Promise<StoredTelnyxMeta> {
    if (!row.carrierId) {
      return { purchasedAt: row.createdAt.toISOString(), region: 'US', monthlyCost: 0 };
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
      lineId: string | null;
      createdAt: Date;
      tenant: { id: string; name: string };
      line: { extension: { extension: string } | null } | null;
    },
    meta?: StoredTelnyxMeta,
  ): TelnyxNumberResponseDto {
    const m = meta ?? { purchasedAt: row.createdAt.toISOString(), region: 'US', monthlyCost: 0 };
    const assigned = Boolean(row.lineId);
    const inventoryTenant = this.config.get<string>('VSP_PLATFORM_INVENTORY_TENANT_ID');
    const isInventory = inventoryTenant ? row.tenantId === inventoryTenant : !assigned;

    let status: TelnyxNumberResponseDto['status'] = 'available';
    if (row.status === PhoneNumberStatus.PORTING) status = 'porting';
    else if (row.status === PhoneNumberStatus.INACTIVE) status = 'released';
    else if (assigned) status = 'active';
    else if (!isInventory && row.tenantId) status = 'active';
    else status = 'available';

    return {
      id: row.id,
      number: row.number,
      e164: row.number,
      connectionType: m.connectionType ?? 'SIP',
      voiceProfile: m.voiceProfile,
      smsEnabled: Boolean(m.smsEnabled),
      mmsEnabled: Boolean(m.mmsEnabled),
      emergencyEnabled: Boolean(m.emergencyEnabled),
      assignedTenantId: assigned || !isInventory ? row.tenant.id : null,
      assignedTenantName: assigned || !isInventory ? row.tenant.name : null,
      assignedExtension: row.line?.extension?.extension ?? null,
      assignedIvr: m.assignedIvr ?? null,
      assignedQueue: m.assignedQueue ?? null,
      region: m.region ?? 'US',
      monthlyCost: m.monthlyCost ?? 0,
      purchasedAt: m.purchasedAt ?? row.createdAt.toISOString(),
      status,
    };
  }

  async searchAvailable(query: {
    countryCode?: string;
    administrativeArea?: string;
    locality?: string;
    phoneNumberType?: string;
    search?: string;
  }): Promise<Array<{ phoneNumber: string; region: string; monthlyCost: number; features: string[] }>> {
    if (!this.telnyx.enabled) return [];

    const type = query.phoneNumberType as 'local' | 'toll_free' | 'mobile' | 'national' | undefined;
    const rows = await this.telnyx.searchAvailableNumbers({
      countryCode: query.countryCode ?? 'US',
      administrativeArea: query.administrativeArea,
      locality: query.locality,
      phoneNumberType: type,
      limit: 50,
    });

    let mapped = rows.map((r) => {
      const meta = metaFromTelnyxApi(r);
      const features: string[] = [];
      if (meta.smsEnabled) features.push('sms');
      if (meta.mmsEnabled) features.push('mms');
      if (meta.emergencyEnabled) features.push('emergency');
      return {
        phoneNumber: r.phone_number,
        region: meta.region ?? 'US',
        monthlyCost: meta.monthlyCost ?? 0,
        features,
      };
    });

    if (query.search?.trim()) {
      const q = query.search.trim();
      mapped = mapped.filter((r) => r.phoneNumber.includes(q));
    }

    return mapped;
  }

  async reserve(dto: { phoneNumber: string; countryCode?: string }, actorUserId?: string) {
    if (!this.prisma.connected) {
      throw new BadRequestException('Database unavailable');
    }

    const e164 = normalizeE164(dto.phoneNumber);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

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

    return {
      id: reservation.id,
      phoneNumber: reservation.phoneNumber,
      countryCode: reservation.countryCode,
      status: reservation.status,
      expiresAt: reservation.expiresAt.toISOString(),
    };
  }
}

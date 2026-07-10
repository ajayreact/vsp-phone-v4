import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeviceStatus } from '@prisma/client';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import {
  REGISTRATION_EVENTS,
  type RegistrationCreatedPayload,
  type RegistrationRemovedPayload,
} from '../../telecom/events/registration.events';
import { ProvisioningAuditService } from '../audit/provisioning-audit.service';
import type { FirmwareChannel } from '../firmware/firmware-catalog.service';
import { ConfigGeneratorService, type DeviceRenderInput } from '../generator/config-generator.service';
import { ProvisioningRedisService } from '../redis/provisioning-redis.service';
import { ArtifactStoreService } from '../store/artifact-store.service';
import { isValidMac, normalizeMac } from '../vault/provisioning-vault.service';

export interface MacLookupResult {
  tenantId: string;
  deviceId: string;
  mac: string;
}

/** Phase 11 — render, download, rollback, reprovision orchestration. */
@Injectable()
export class ProvisioningOrchestratorService {
  private readonly platformDomain: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: ProvisioningRedisService,
    private readonly generator: ConfigGeneratorService,
    private readonly store: ArtifactStoreService,
    private readonly audit: ProvisioningAuditService,
    private readonly config: ConfigService,
  ) {
    this.platformDomain = config.get<string>('SIP_PLATFORM_DOMAIN', 'vsp.internal');
  }

  async lookupMac(macRaw: string): Promise<MacLookupResult | null> {
    const mac = normalizeMac(macRaw);
    if (!isValidMac(mac)) return null;

    const indexed = await this.redis.get(this.redis.macIndexKey(mac));
    if (indexed) {
      try {
        const parsed = JSON.parse(indexed) as { tenantId: string; deviceId: string };
        return { tenantId: parsed.tenantId, deviceId: parsed.deviceId, mac };
      } catch {
        /* fall through */
      }
    }

    if (!this.prisma.connected) return null;
    const device = await this.prisma.device.findFirst({
      where: { macAddress: mac, deletedAt: null },
      select: { id: true, tenantId: true },
    });
    if (!device) return null;
    await this.redis.set(
      this.redis.macIndexKey(mac),
      JSON.stringify({ tenantId: device.tenantId, deviceId: device.id }),
    );
    return { tenantId: device.tenantId, deviceId: device.id, mac };
  }

  async quarantineUnknownMac(macRaw: string, meta: { srcIp?: string; userAgent?: string }): Promise<void> {
    const mac = normalizeMac(macRaw);
    await this.redis.setex(
      this.redis.quarantineKey(mac),
      86400,
      JSON.stringify({ mac, ...meta, ts: new Date().toISOString() }),
    );
    await this.audit.log('provisioning.quarantined', { mac, ...meta });
  }

  async renderDevice(deviceId: string, tenantId?: string): Promise<{
    artifactHash: string;
    configVersion: number;
    objectKey: string;
  }> {
    const ctx = await this.loadRenderContext(deviceId, tenantId);
    const nextVersion = ctx.configVersion + 1;
    const rendered = await this.generator.generate({ ...ctx, configVersion: nextVersion });
    await this.updateMetaAfterRender(ctx.tenantId, deviceId, rendered);
    await this.audit.log('provisioning.rendered', {
      tenantId: ctx.tenantId,
      deviceId,
      mac: ctx.mac,
      configVersion: nextVersion,
      artifactHash: rendered.artifactHash,
    });
    return rendered;
  }

  async reprovision(tenantId: string, deviceId: string): Promise<{ artifactHash: string; configVersion: number }> {
    const rendered = await this.renderDevice(deviceId, tenantId);
    await this.audit.log('provisioning.reprovision', {
      tenantId,
      deviceId,
      configVersion: rendered.configVersion,
      artifactHash: rendered.artifactHash,
    });
    return rendered;
  }

  async rollback(
    tenantId: string,
    deviceId: string,
    targetConfigVersion: number,
  ): Promise<{ artifactHash: string; configVersion: number }> {
    const history = await this.redis.lrange(this.redis.artifactHistoryKey(tenantId, deviceId), 0, 49);
    const match = history
      .map((h) => JSON.parse(h) as { configVersion: string; artifactHash: string; objectKey: string })
      .find((h) => Number(h.configVersion) === targetConfigVersion);
    if (!match) {
      throw new NotFoundException('Configuration version not found in history');
    }
    const metaKey = this.redis.deviceMetaKey(tenantId, deviceId);
    await this.redis.hset(metaKey, 'configVersion', match.configVersion);
    await this.redis.hset(metaKey, 'artifactHash', match.artifactHash);
    await this.redis.hset(metaKey, 'objectKey', match.objectKey);
    await this.audit.log('provisioning.rollback', {
      tenantId,
      deviceId,
      configVersion: targetConfigVersion,
      artifactHash: match.artifactHash,
    });
    return { artifactHash: match.artifactHash, configVersion: targetConfigVersion };
  }

  async serveConfig(macRaw: string, meta: { srcIp?: string; userAgent?: string }): Promise<string> {
    const lookup = await this.lookupMac(macRaw);
    if (!lookup) {
      await this.quarantineUnknownMac(macRaw, meta);
      throw new NotFoundException('Unknown device');
    }

    const deviceMeta = await this.redis.hgetall(this.redis.deviceMetaKey(lookup.tenantId, lookup.deviceId));
    let objectKey = deviceMeta.objectKey;
    if (!objectKey) {
      const rendered = await this.renderDevice(lookup.deviceId, lookup.tenantId);
      objectKey = rendered.objectKey;
    }

    const xml = await this.store.readArtifact(objectKey);
    if (!xml) {
      const rendered = await this.renderDevice(lookup.deviceId, lookup.tenantId);
      const fresh = await this.store.readArtifact(rendered.objectKey);
      if (!fresh) throw new NotFoundException('Configuration artifact missing');
      await this.audit.log('provisioning.downloaded', {
        tenantId: lookup.tenantId,
        deviceId: lookup.deviceId,
        mac: lookup.mac,
        artifactHash: rendered.artifactHash,
        ...meta,
      });
      return fresh;
    }

    await this.audit.log('provisioning.downloaded', {
      tenantId: lookup.tenantId,
      deviceId: lookup.deviceId,
      mac: lookup.mac,
      artifactHash: deviceMeta.artifactHash,
      ...meta,
    });
    return xml;
  }

  @OnEvent(REGISTRATION_EVENTS.CREATED)
  @OnEvent(REGISTRATION_EVENTS.REFRESHED)
  async onRegistration(payload: RegistrationCreatedPayload): Promise<void> {
    await this.syncDeviceStatus(payload.tenantId, payload.deviceId, DeviceStatus.REGISTERED);
  }

  @OnEvent(REGISTRATION_EVENTS.UNREGISTERED)
  @OnEvent(REGISTRATION_EVENTS.EXPIRED)
  async onUnregister(payload: RegistrationRemovedPayload): Promise<void> {
    if (!payload.deviceId) return;
    await this.syncDeviceStatus(payload.tenantId, payload.deviceId, DeviceStatus.UNREGISTERED);
  }

  private async syncDeviceStatus(
    tenantId: string,
    deviceId: string,
    status: DeviceStatus,
  ): Promise<void> {
    const metaKey = this.redis.deviceMetaKey(tenantId, deviceId);
    await this.redis.hset(metaKey, 'lastStatus', status);
    await this.redis.hset(metaKey, 'lastStatusAt', new Date().toISOString());
    await this.audit.log('provisioning.status_sync', { tenantId, deviceId, status });
  }

  private async updateMetaAfterRender(
    tenantId: string,
    deviceId: string,
    rendered: { artifactHash: string; objectKey: string; templateVersion: string; configVersion: number },
  ): Promise<void> {
    const metaKey = this.redis.deviceMetaKey(tenantId, deviceId);
    await this.redis.hset(metaKey, 'configVersion', String(rendered.configVersion));
    await this.redis.hset(metaKey, 'artifactHash', rendered.artifactHash);
    await this.redis.hset(metaKey, 'objectKey', rendered.objectKey);
    await this.redis.hset(metaKey, 'templateVersion', rendered.templateVersion);
    await this.redis.lpush(
      this.redis.artifactHistoryKey(tenantId, deviceId),
      JSON.stringify({
        configVersion: String(rendered.configVersion),
        artifactHash: rendered.artifactHash,
        objectKey: rendered.objectKey,
        templateVersion: rendered.templateVersion,
        ts: new Date().toISOString(),
      }),
    );
  }

  private async loadRenderContext(deviceId: string, tenantId?: string): Promise<DeviceRenderInput & { tenantId: string }> {
    if (!this.prisma.connected) {
      throw new NotFoundException('Database unavailable');
    }
    const device = await this.prisma.device.findFirst({
      where: {
        id: deviceId,
        deletedAt: null,
        ...(tenantId ? { tenantId } : {}),
      },
      include: {
        sipEndpoint: true,
        line: {
          include: {
            extension: true,
            user: true,
            tenant: { include: { settings: true } },
          },
        },
        assignments: { where: { deletedAt: null, effectiveTo: null }, take: 1 },
      },
    });
    if (!device?.sipEndpoint || !device.line?.extension) {
      throw new NotFoundException('Desk phone with line assignment required');
    }

    const meta = await this.redis.hgetall(this.redis.deviceMetaKey(device.tenantId, deviceId));
    const mac = device.macAddress ?? meta.mac;
    if (!mac) throw new NotFoundException('Device MAC missing');

    const realm = `${device.line.tenant.slug}.sip.${this.platformDomain}`;
    return {
      tenantId: device.tenantId,
      deviceId: device.id,
      mac,
      deviceName: device.name,
      modelFamily: meta.modelFamily || 'grp261x',
      manufacturer: device.manufacturer ?? undefined,
      sipEndpointId: device.sipEndpoint.id,
      authUsername: device.sipEndpoint.authUsername,
      aor: device.sipEndpoint.aor,
      displayName: device.line.user.username ?? device.line.user.email ?? device.line.name,
      realm,
      configVersion: Number(meta.configVersion ?? '0'),
      firmwareChannel: (meta.firmwareChannel as FirmwareChannel) || 'stable',
      timezone: device.line.tenant.settings?.timezone ?? 'America/New_York',
      language: device.line.tenant.settings?.defaultLanguage ?? 'en',
      siteCode: meta.siteId || device.siteId || undefined,
      transport: device.transport ?? undefined,
      srtpEnabled: device.srtpEnabled,
    };
  }
}

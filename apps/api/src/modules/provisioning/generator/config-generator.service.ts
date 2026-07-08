import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FirmwareChannel } from '../firmware/firmware-catalog.service';
import { FirmwareCatalogService } from '../firmware/firmware-catalog.service';
import { ArtifactStoreService } from '../store/artifact-store.service';
import { TemplateEngineService } from '../templates/template-engine.service';
import { ProvisioningVaultService } from '../vault/provisioning-vault.service';

export interface DeviceRenderInput {
  tenantId: string;
  deviceId: string;
  mac: string;
  deviceName: string;
  modelFamily: string;
  sipEndpointId: string;
  authUsername: string;
  aor: string;
  displayName: string;
  realm: string;
  configVersion: number;
  firmwareChannel: FirmwareChannel;
  timezone: string;
  language: string;
  siteCode?: string;
}

/** Phase 11 — versioned Grandstream configuration generation. */
@Injectable()
export class ConfigGeneratorService {
  constructor(
    private readonly template: TemplateEngineService,
    private readonly store: ArtifactStoreService,
    private readonly firmware: FirmwareCatalogService,
    private readonly vault: ProvisioningVaultService,
    private readonly config: ConfigService,
  ) {}

  async generate(input: DeviceRenderInput): Promise<{
    xml: string;
    artifactHash: string;
    objectKey: string;
    templateVersion: string;
    configVersion: number;
    provUrl: string;
  }> {
    const sipPassword = this.vault.resolveDeskSipPassword(input.sipEndpointId);
    if (!sipPassword) {
      throw new Error('Desk SIP secret missing');
    }
    const adminPassword =
      this.vault.resolveAdminPassword(input.deviceId) ??
      this.vault.issueAdminPassword(input.deviceId);

    const templateVersion = this.template.platformTemplateVersion;
    const release = this.firmware.resolve(input.modelFamily, input.firmwareChannel);
    const provBase = this.template.provBaseUrl();
    const firmwareUrl = release
      ? this.firmware.firmwareUrl(provBase, release)
      : `${provBase}/fw/${input.modelFamily}/stable/grp261x-fw.bin`;

    const artifactHash = this.store.computeArtifactHash({
      mac: input.mac,
      configVersion: input.configVersion,
      templateVersion,
      aor: input.aor,
      authUsername: input.authUsername,
      firmwareChannel: input.firmwareChannel,
      siteCode: input.siteCode ?? '',
    });

    const xml = this.template.render({
      mac: input.mac,
      deviceName: input.deviceName,
      modelFamily: input.modelFamily,
      configVersion: input.configVersion,
      templateVersion,
      adminPassword,
      sipUsername: input.authUsername,
      sipPassword,
      sipServer: this.sipServer(input.realm),
      sipPort: Number(this.config.get('SIP_PORT') ?? '5061'),
      aor: input.aor,
      displayName: input.displayName,
      timezone: input.timezone,
      language: input.language,
      firmwareUrl,
      provServerUrl: `${provBase}/gs/${input.mac}/cfg.xml`,
      tlsValidate: (this.config.get<string>('PROV_TLS_VALIDATE') ?? 'true').toLowerCase() !== 'false',
    });

    const objectKey = this.store.objectKey(input.tenantId, input.mac, artifactHash);
    await this.store.saveArtifact({
      tenantId: input.tenantId,
      mac: input.mac,
      artifactHash,
      xml,
    });

    return {
      xml,
      artifactHash,
      objectKey,
      templateVersion,
      configVersion: input.configVersion,
      provUrl: `${provBase}/gs/${input.mac}/cfg.xml`,
    };
  }

  private sipServer(realm: string): string {
    const explicit = (this.config.get<string>('SIP_REGISTRAR_HOST') || '').trim();
    if (explicit) return explicit;
    return realm.split('@').pop() ?? realm;
  }
}

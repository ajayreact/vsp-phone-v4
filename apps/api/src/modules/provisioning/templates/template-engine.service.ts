import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RenderContext {
  mac: string;
  deviceName: string;
  modelFamily: string;
  configVersion: number;
  templateVersion: string;
  adminPassword: string;
  sipUsername: string;
  sipPassword: string;
  sipServer: string;
  sipPort: number;
  aor: string;
  displayName: string;
  timezone: string;
  language: string;
  firmwareUrl: string;
  provServerUrl: string;
  tlsValidate: boolean;
}

/** Phase 11 — versioned Grandstream XML template engine (TEL-PROV-001). */
@Injectable()
export class TemplateEngineService {
  readonly platformTemplateVersion = '1.0.0';

  constructor(private readonly config: ConfigService) {}

  render(ctx: RenderContext): string {
    const tls = ctx.tlsValidate ? '1' : '0';
    return `<?xml version="1.0" encoding="UTF-8"?>
<gs_provisioning version="1">
  <mac>${ctx.mac}</mac>
  <config_version>${ctx.configVersion}</config_version>
  <template_version>${ctx.templateVersion}</template_version>
  <P1>${escapeXml(ctx.adminPassword)}</P1>
  <P136>${ctx.language}</P136>
  <P64>${escapeXml(ctx.timezone)}</P64>
  <P212>${tls}</P212>
  <P237>${escapeXml(ctx.provServerUrl)}</P237>
  <P192>${escapeXml(ctx.firmwareUrl)}</P192>
  <Account1>
    <Account1Active>1</Account1Active>
    <Account1Name>${escapeXml(ctx.displayName)}</Account1Name>
    <Account1Register>1</Account1Register>
    <Account1UserID>${escapeXml(ctx.sipUsername)}</Account1UserID>
    <Account1Password>${escapeXml(ctx.sipPassword)}</Account1Password>
    <Account1SIPServer>${escapeXml(ctx.sipServer)}</Account1SIPServer>
    <Account1SIPServerPort>${ctx.sipPort}</Account1SIPServerPort>
    <Account1Transport>0</Account1Transport>
    <Account1DisplayName>${escapeXml(ctx.displayName)}</Account1DisplayName>
  </Account1>
</gs_provisioning>`;
  }

  provBaseUrl(): string {
    return (
      this.config.get<string>('PROV_PUBLIC_BASE_URL') ||
      `https://prov.localhost:${this.config.get('PROV_HTTPS_PORT') ?? '3444'}`
    );
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DeviceManufacturer } from '@prisma/client';
import { provVendorPath, resolveProvPublicBaseUrl } from '../url/prov-config-url';
import {
  buildGrandstreamDeskPvalueLines,
  resolveGrandstreamDeskPvalueOptions,
} from './grandstream-desk-pvalues';

export interface RenderContext {
  mac: string;
  deviceName: string;
  modelFamily: string;
  manufacturer?: DeviceManufacturer;
  configVersion: number;
  templateVersion: string;
  adminPassword: string;
  sipUsername: string;
  sipPassword: string;
  sipServer: string;
  sipPort: number;
  grandstreamTransport?: 0 | 1 | 2;
  aor: string;
  displayName: string;
  timezone: string;
  language: string;
  firmwareUrl: string;
  provServerUrl: string;
  provHttpUsername: string;
  provHttpPassword: string;
  /** When false, phone uses MAC-in-URL only (no HTTP Basic on prov edge). */
  embedProvHttpCredentials?: boolean;
  tlsValidate: boolean;
  transport?: string;
  srtpEnabled?: boolean;
}

/** Phase 11 + Phase 3 — multi-vendor provisioning template engine. */
@Injectable()
export class TemplateEngineService {
  readonly platformTemplateVersion = '1.4.0';

  constructor(private readonly config: ConfigService) {}

  render(ctx: RenderContext): string {
    const manufacturer = ctx.manufacturer ?? 'GRANDSTREAM';
    switch (manufacturer) {
      case 'YEALINK':
        return this.renderYealink(ctx);
      case 'FANVIL':
        return this.renderFanvil(ctx);
      case 'POLY':
        return this.renderPoly(ctx);
      case 'CISCO':
        return this.renderCisco(ctx);
      case 'SNOM':
        return this.renderSnom(ctx);
      case 'OTHER':
        return this.renderGenericSip(ctx);
      default:
        return this.renderGrandstream(ctx);
    }
  }

  provBaseUrl(): string {
    return resolveProvPublicBaseUrl({
      ...process.env,
      PROV_PUBLIC_BASE_URL: this.config.get<string>('PROV_PUBLIC_BASE_URL') ?? process.env.PROV_PUBLIC_BASE_URL,
      PROV_HTTPS_PORT: String(this.config.get('PROV_HTTPS_PORT') ?? process.env.PROV_HTTPS_PORT ?? '3444'),
      NODE_ENV: this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV,
      VSP_ENV: this.config.get<string>('VSP_ENV') ?? process.env.VSP_ENV,
    });
  }

  vendorPath(manufacturer: DeviceManufacturer | string): string {
    return provVendorPath(String(manufacturer));
  }

  private renderGrandstream(ctx: RenderContext): string {
    const tlsValidate = ctx.tlsValidate ? '1' : '0';
    const transport = ctx.grandstreamTransport ?? 0;
    // IANA zones (America/New_York) are not valid GRP P64 values; invalid P64 can
    // cause firmware to skip applying later Account P-values (blank SIP Server).
    const timezone = grandstreamTimezone(ctx.timezone);
    const embedHttp = Boolean(ctx.embedProvHttpCredentials);
    const httpCredLines = embedHttp
      ? `    <P1360>${escapeXml(ctx.provHttpUsername)}</P1360>
    <P1361>${escapeXml(ctx.provHttpPassword)}</P1361>
`
      : '';
    // Do not push a firmware URL on every cfg — failed FW fetches distract apply.
    const firmwareLine = ctx.firmwareUrl.trim()
      ? `    <P192>${escapeXml(ctx.firmwareUrl)}</P192>
`
      : '';
    const deskLines = buildGrandstreamDeskPvalueLines(resolveGrandstreamDeskPvalueOptions(this.config));
    return `<?xml version="1.0" encoding="UTF-8"?>
<gs_provision version="1">
  <mac>${ctx.mac}</mac>
  <config version="1">
    <P1>${escapeXml(ctx.adminPassword)}</P1>
    <P64>${escapeXml(timezone)}</P64>
    <P212>2</P212>
    <P8463>${tlsValidate}</P8463>
${httpCredLines}    <P237>${escapeXml(ctx.provServerUrl)}</P237>
${firmwareLine}    <P271>1</P271>
    <P270>${escapeXml(ctx.displayName)}</P270>
    <P31>1</P31>
    <P35>${escapeXml(ctx.sipUsername)}</P35>
    <P36>${escapeXml(ctx.sipUsername)}</P36>
    <P34>${escapeXml(ctx.sipPassword)}</P34>
    <P47>${escapeXml(ctx.sipServer)}</P47>
    <P48>${escapeXml(ctx.sipServer)}</P48>
    <P139>${ctx.sipPort}</P139>
    <P40>${ctx.sipPort}</P40>
    <P130>${transport}</P130>
    <P3>${escapeXml(ctx.displayName)}</P3>
${deskLines}  </config>
</gs_provision>`;
  }

  private renderYealink(ctx: RenderContext): string {
    const transport = ctx.transport === 'TLS' ? '2' : '0';
    return `<?xml version="1.0" encoding="UTF-8"?>
<YealinkConfig version="1">
  <MAC>${ctx.mac}</MAC>
  <config_version>${ctx.configVersion}</config_version>
  <template_version>${ctx.templateVersion}</template_version>
  <common_config>
    <language>${ctx.language}</language>
    <local_time.time_zone>${escapeXml(ctx.timezone)}</local_time.time_zone>
    <auto_provision.server.url>${escapeXml(ctx.provServerUrl)}</auto_provision.server.url>
    <firmware.url>${escapeXml(ctx.firmwareUrl)}</firmware.url>
  </common_config>
  <account index="1">
    <enable>1</enable>
    <label>${escapeXml(ctx.displayName)}</label>
    <display_name>${escapeXml(ctx.displayName)}</display_name>
    <username>${escapeXml(ctx.sipUsername)}</username>
    <password>${escapeXml(ctx.sipPassword)}</password>
    <sip_server_host>${escapeXml(ctx.sipServer)}</sip_server_host>
    <sip_server_port>${ctx.sipPort}</sip_server_port>
    <transport>${transport}</transport>
    <register_on>${ctx.aor}</register_on>
  </account>
</YealinkConfig>`;
  }

  private renderFanvil(ctx: RenderContext): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<FanvilConfig version="1">
  <MAC>${ctx.mac}</MAC>
  <config_version>${ctx.configVersion}</config_version>
  <template_version>${ctx.templateVersion}</template_version>
  <General>
    <Language>${ctx.language}</Language>
    <TimeZone>${escapeXml(ctx.timezone)}</TimeZone>
    <ProvisionURL>${escapeXml(ctx.provServerUrl)}</ProvisionURL>
    <FirmwareURL>${escapeXml(ctx.firmwareUrl)}</FirmwareURL>
  </General>
  <Account1>
    <Enable>1</Enable>
    <Label>${escapeXml(ctx.displayName)}</Label>
    <DisplayName>${escapeXml(ctx.displayName)}</DisplayName>
    <UserName>${escapeXml(ctx.sipUsername)}</UserName>
    <Password>${escapeXml(ctx.sipPassword)}</Password>
    <SIPServer>${escapeXml(ctx.sipServer)}</SIPServer>
    <SIPPort>${ctx.sipPort}</SIPPort>
    <RegisterURI>${escapeXml(ctx.aor)}</RegisterURI>
  </Account1>
</FanvilConfig>`;
  }

  private renderPoly(ctx: RenderContext): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<polyConfig version="1">
  <MAC>${ctx.mac}</MAC>
  <config_version>${ctx.configVersion}</config_version>
  <template_version>${ctx.templateVersion}</template_version>
  <device>
    <language>${ctx.language}</language>
    <timeZone>${escapeXml(ctx.timezone)}</timeZone>
    <provServer>${escapeXml(ctx.provServerUrl)}</provServer>
    <firmwareServer>${escapeXml(ctx.firmwareUrl)}</firmwareServer>
  </device>
  <reg reg.1.label="${escapeXml(ctx.displayName)}"
       reg.1.displayName="${escapeXml(ctx.displayName)}"
       reg.1.auth.userId="${escapeXml(ctx.sipUsername)}"
       reg.1.auth.password="${escapeXml(ctx.sipPassword)}"
       reg.1.server.1.address="${escapeXml(ctx.sipServer)}"
       reg.1.server.1.port="${ctx.sipPort}"
       reg.1.server.1.register="1"/>
</polyConfig>`;
  }

  private renderCisco(ctx: RenderContext): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<CiscoIPPhoneConfiguration version="1">
  <MAC>${ctx.mac}</MAC>
  <config_version>${ctx.configVersion}</config_version>
  <template_version>${ctx.templateVersion}</template_version>
  <devicePool>
    <dateTimeSetting>
      <dateTemplate>M/D/Y</dateTemplate>
      <timeZone>${escapeXml(ctx.timezone)}</timeZone>
    </dateTimeSetting>
    <loadInformation>${escapeXml(ctx.firmwareUrl)}</loadInformation>
    <provisionUrl>${escapeXml(ctx.provServerUrl)}</provisionUrl>
  </devicePool>
  <sipProfile>
    <sipLines>
      <line button="1">
        <featureID>9</featureID>
        <featureLabel>${escapeXml(ctx.displayName)}</featureLabel>
        <authName>${escapeXml(ctx.sipUsername)}</authName>
        <authPassword>${escapeXml(ctx.sipPassword)}</authPassword>
        <name>${escapeXml(ctx.sipUsername)}</name>
        <displayName>${escapeXml(ctx.displayName)}</displayName>
        <proxy>${escapeXml(ctx.sipServer)}</proxy>
        <port>${ctx.sipPort}</port>
        <messageWaitingIndication>1</messageWaitingIndication>
      </line>
    </sipLines>
  </sipProfile>
</CiscoIPPhoneConfiguration>`;
  }

  private renderSnom(ctx: RenderContext): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<snomProvisioning version="1">
  <mac>${ctx.mac}</mac>
  <config_version>${ctx.configVersion}</config_version>
  <template_version>${ctx.templateVersion}</template_version>
  <settings>
    <language>${ctx.language}</language>
    <timezone>${escapeXml(ctx.timezone)}</timezone>
    <setting_server>${escapeXml(ctx.provServerUrl)}</setting_server>
    <firmware_url>${escapeXml(ctx.firmwareUrl)}</firmware_url>
  </settings>
  <identity index="1">
    <active>on</active>
    <display_name>${escapeXml(ctx.displayName)}</display_name>
    <user_name>${escapeXml(ctx.sipUsername)}</user_name>
    <password>${escapeXml(ctx.sipPassword)}</password>
    <registrar>${escapeXml(ctx.sipServer)}</registrar>
    <reg_port>${ctx.sipPort}</reg_port>
    <outbound_proxy>${escapeXml(ctx.sipServer)}</outbound_proxy>
  </identity>
</snomProvisioning>`;
  }

  private renderGenericSip(ctx: RenderContext): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<SipDeviceConfig version="1">
  <MAC>${ctx.mac}</MAC>
  <config_version>${ctx.configVersion}</config_version>
  <template_version>${ctx.templateVersion}</template_version>
  <Device>
    <Name>${escapeXml(ctx.deviceName)}</Name>
    <Language>${ctx.language}</Language>
    <TimeZone>${escapeXml(ctx.timezone)}</TimeZone>
    <ProvisionURL>${escapeXml(ctx.provServerUrl)}</ProvisionURL>
    <FirmwareURL>${escapeXml(ctx.firmwareUrl)}</FirmwareURL>
  </Device>
  <Account index="1">
    <DisplayName>${escapeXml(ctx.displayName)}</DisplayName>
    <AuthUser>${escapeXml(ctx.sipUsername)}</AuthUser>
    <AuthPassword>${escapeXml(ctx.sipPassword)}</AuthPassword>
    <Registrar>${escapeXml(ctx.sipServer)}</Registrar>
    <RegistrarPort>${ctx.sipPort}</RegistrarPort>
    <AOR>${escapeXml(ctx.aor)}</AOR>
    <Transport>${ctx.transport ?? 'UDP'}</Transport>
    <SRTP>${ctx.srtpEnabled ? '1' : '0'}</SRTP>
  </Account>
</SipDeviceConfig>`;
  }
}

/** Grandstream P64 expects offsets like EST5EDT / auto — not IANA names. */
export function grandstreamTimezone(timezone: string): string {
  const tz = timezone.trim();
  if (!tz || tz.includes('/')) return 'auto';
  return tz;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

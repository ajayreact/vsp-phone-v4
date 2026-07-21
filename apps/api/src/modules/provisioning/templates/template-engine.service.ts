import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DeviceManufacturer } from '@prisma/client';
import { provVendorPath, resolveProvPublicBaseUrl } from '../url/prov-config-url';

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
  aor: string;
  displayName: string;
  timezone: string;
  language: string;
  firmwareUrl: string;
  provServerUrl: string;
  provHttpUsername: string;
  provHttpPassword: string;
  tlsValidate: boolean;
  transport?: string;
  srtpEnabled?: boolean;
}

/** Phase 11 + Phase 3 — multi-vendor provisioning template engine. */
@Injectable()
export class TemplateEngineService {
  readonly platformTemplateVersion = '1.1.0';

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
    return `<?xml version="1.0" encoding="UTF-8"?>
<gs_provisioning version="1">
  <mac>${ctx.mac}</mac>
  <config_version>${ctx.configVersion}</config_version>
  <template_version>${ctx.templateVersion}</template_version>
  <P1>${escapeXml(ctx.adminPassword)}</P1>
  <P136>${ctx.language}</P136>
  <P64>${escapeXml(ctx.timezone)}</P64>
  <P212>2</P212>
  <P8463>${tlsValidate}</P8463>
  <P1360>${escapeXml(ctx.provHttpUsername)}</P1360>
  <P1361>${escapeXml(ctx.provHttpPassword)}</P1361>
  <P237>${escapeXml(ctx.provServerUrl)}</P237>
  <P192>${escapeXml(ctx.firmwareUrl)}</P192>
  <Account1>
    <Account1Active>1</Account1Active>
    <AccountName>${escapeXml(ctx.displayName)}</AccountName>
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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

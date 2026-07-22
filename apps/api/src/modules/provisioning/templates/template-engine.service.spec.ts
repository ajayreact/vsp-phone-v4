import { ConfigService } from '@nestjs/config';
import { TemplateEngineService, type RenderContext } from './template-engine.service';

describe('TemplateEngineService.render Grandstream', () => {
  const baseCtx: RenderContext = {
    mac: 'ec74d751e3e7',
    deviceName: 'Desk Phone',
    modelFamily: 'GRP2601',
    configVersion: 1,
    templateVersion: '1.2.0',
    adminPassword: 'admin-secret',
    sipUsername: '100',
    sipPassword: 'sip-secret',
    sipServer: 'sip.vspphone.com',
    sipPort: 5060,
    grandstreamTransport: 0 as const,
    aor: 'sip:100@vsp-internal.sip.vsp.internal',
    displayName: 'Extension 100',
    timezone: 'America/New_York',
    language: 'en',
    firmwareUrl: 'https://prov.vspphone.com/fw/grp2601/stable/grp2601-fw.bin',
    provServerUrl: 'https://prov.vspphone.com/gs/ec74d751e3e7/cfg.xml',
    provHttpUsername: 'ec74d751e3e7',
    provHttpPassword: 'prov-secret',
    tlsValidate: true,
  };

  function renderGrandstream(overrides: Partial<RenderContext> = {}) {
    const config = {
      get: (key: string) => {
        if (key === 'PROV_PUBLIC_BASE_URL') return 'https://prov.vspphone.com';
        if (key === 'PROV_HTTPS_PORT') return '3444';
        return undefined;
      },
    } as ConfigService;
    const engine = new TemplateEngineService(config);
    return engine.render({ ...baseCtx, ...overrides, manufacturer: 'GRANDSTREAM' });
  }

  it('emits Grandstream gs_provision schema with Account 1 P-values', () => {
    const xml = renderGrandstream();

    expect(xml).toContain('<gs_provision version="1">');
    expect(xml).not.toContain('<gs_provisioning');
    expect(xml).not.toContain('<Account1Active>');
    expect(xml).toContain('<mac>ec74d751e3e7</mac>');
    expect(xml).toContain('<P271>1</P271>');
    expect(xml).toContain('<P31>1</P31>');
    expect(xml).toContain('<P35>100</P35>');
    expect(xml).toContain('<P36>100</P36>');
    expect(xml).toContain('<P34>sip-secret</P34>');
    expect(xml).toContain('<P47>sip.vspphone.com</P47>');
    expect(xml).toContain('<P4010>5060</P4010>');
    expect(xml).toContain('<P130>0</P130>');
    expect(xml).toContain('<P1360>ec74d751e3e7</P1360>');
    expect(xml).toContain('<P1361>prov-secret</P1361>');
    expect(xml).toContain('<P237>https://prov.vspphone.com/gs/ec74d751e3e7/cfg.xml</P237>');
  });

  it('maps TLS transport to P130=2 and port 5061', () => {
    const xml = renderGrandstream({ grandstreamTransport: 2, sipPort: 5061 });
    expect(xml).toContain('<P130>2</P130>');
    expect(xml).toContain('<P4010>5061</P4010>');
  });
});

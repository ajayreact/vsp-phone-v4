import { ConfigService } from '@nestjs/config';
import {
  buildGrandstreamDeskPvalueLines,
  resolveGrandstreamDeskPvalueOptions,
} from './grandstream-desk-pvalues';

describe('grandstream-desk-pvalues', () => {
  function config(values: Record<string, string>): ConfigService {
    return {
      get: (key: string) => values[key],
    } as ConfigService;
  }

  it('builds syslog + dial + early dial lines from env', () => {
    const opts = resolveGrandstreamDeskPvalueOptions(
      config({
        GRANDSTREAM_SYSLOG_HOST: '32.196.41.160',
        GRANDSTREAM_SYSLOG_PORT: '514',
        GRANDSTREAM_SYSLOG_LEVEL: '1',
      }),
    );
    const xml = buildGrandstreamDeskPvalueLines(opts);
    expect(xml).toContain('<P207>32.196.41.160:514</P207>');
    expect(xml).toContain('<P208>1</P208>');
    expect(xml).toContain('<P1387>1</P1387>');
    expect(xml).toContain('<P729>1</P729>');
    expect(xml).not.toContain('<P22421>');
    expect(xml).toContain('<P290>');
  });

  it('includes P22421 only when GRANDSTREAM_DESK_FORCE_REBOOT=true', () => {
    const opts = resolveGrandstreamDeskPvalueOptions(
      config({ GRANDSTREAM_DESK_FORCE_REBOOT: 'true' }),
    );
    const xml = buildGrandstreamDeskPvalueLines(opts);
    expect(xml).toContain('<P22421>1</P22421>');

  it('omits syslog when host unset', () => {
    const opts = resolveGrandstreamDeskPvalueOptions(config({}));
    const xml = buildGrandstreamDeskPvalueLines(opts);
    expect(xml).not.toContain('<P207>');
    expect(xml).toContain('<P729>1</P729>');
  });
});

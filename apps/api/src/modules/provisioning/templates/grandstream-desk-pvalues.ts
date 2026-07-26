import type { ConfigService } from '@nestjs/config';

/** Grandstream desk-phone P-values beyond baseline SIP registration (GRP260x). */
export interface GrandstreamDeskPvalueOptions {
  /** Syslog server as IP or host:port (UDP). Empty = omit syslog P-values. */
  syslogServer: string;
  /** 0=None, 1=DEBUG, 2=INFO, 3=WARNING, 4=ERROR */
  syslogLevel: number;
  sendSipLog: boolean;
  /** Account early dial — sends outbound without waiting for # (P729). */
  earlyDial: boolean;
  /** Use # as send key when early dial is off (P772). */
  keyAsSendPound: boolean;
  /** Restrict preferred vocoder to PCMU (P57=0). */
  pcmuOnly: boolean;
  /** Reboot after successful cfg apply (P22421). */
  forceRebootOnProvision: boolean;
  dialPlan: string;
}

const DEFAULT_DIAL_PLAN = '{ x+ | \\+x+ | *x+ | *xx*x+ }';

export function resolveGrandstreamDeskPvalueOptions(
  config: ConfigService,
): GrandstreamDeskPvalueOptions {
  const host = (
    config.get<string>('GRANDSTREAM_SYSLOG_HOST') ??
    config.get<string>('SIP_PUBLIC_IP') ??
    ''
  ).trim();
  const port = String(config.get<string>('GRANDSTREAM_SYSLOG_PORT') ?? '514').trim() || '514';
  const syslogServer = host ? (host.includes(':') ? host : `${host}:${port}`) : '';

  const levelRaw = Number(config.get<string>('GRANDSTREAM_SYSLOG_LEVEL') ?? '1');
  const syslogLevel = Number.isFinite(levelRaw) ? Math.min(4, Math.max(0, levelRaw)) : 1;

  return {
    syslogServer,
    syslogLevel,
    sendSipLog: parseTruthy(config.get<string>('GRANDSTREAM_SYSLOG_SEND_SIP'), true),
    earlyDial: parseTruthy(config.get<string>('GRANDSTREAM_DESK_EARLY_DIAL'), true),
    keyAsSendPound: parseTruthy(config.get<string>('GRANDSTREAM_DESK_KEY_AS_SEND_POUND'), true),
    pcmuOnly: parseTruthy(config.get<string>('GRANDSTREAM_DESK_PCMU_ONLY'), true),
    forceRebootOnProvision: parseTruthy(config.get<string>('GRANDSTREAM_DESK_FORCE_REBOOT'), true),
    dialPlan: (config.get<string>('GRANDSTREAM_DIAL_PLAN') ?? DEFAULT_DIAL_PLAN).trim() || DEFAULT_DIAL_PLAN,
  };
}

/** XML lines inserted into gs_provision config (P-value format). */
export function buildGrandstreamDeskPvalueLines(opts: GrandstreamDeskPvalueOptions): string {
  const lines: string[] = [];

  if (opts.syslogServer) {
    lines.push(`    <P207>${escapeXml(opts.syslogServer)}</P207>`);
    lines.push(`    <P208>${opts.syslogLevel}</P208>`);
    lines.push(`    <P1387>${opts.sendSipLog ? 1 : 0}</P1387>`);
    lines.push(`    <P82307>1</P82307>`);
  }

  lines.push(`    <P290>${escapeXml(opts.dialPlan)}</P290>`);

  if (opts.earlyDial) {
    lines.push('    <P729>1</P729>');
  } else if (opts.keyAsSendPound) {
    lines.push('    <P772>1</P772>');
  }

  if (opts.pcmuOnly) {
    lines.push('    <P57>0</P57>');
  }

  if (opts.forceRebootOnProvision) {
    lines.push('    <P22421>1</P22421>');
  }

  return lines.length ? `${lines.join('\n')}\n` : '';
}

function parseTruthy(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw === '') return defaultValue;
  const v = raw.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return true;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

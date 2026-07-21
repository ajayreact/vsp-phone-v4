/** Grandstream Account1Transport: 0=UDP, 1=TCP, 2=TLS, 3=DNS NAPTR */
export type GrandstreamSipTransportCode = 0 | 1 | 2;

export type DeskPhoneSipEndpoint = {
  port: number;
  grandstreamTransport: GrandstreamSipTransportCode;
};

/**
 * Align desk-phone cfg.xml SIP port/transport with Kamailio listeners:
 * UDP/TCP on 5060, TLS on 5061.
 */
export function resolveDeskPhoneSipEndpoint(opts: {
  transport?: string | null;
  configuredPort?: number;
}): DeskPhoneSipEndpoint {
  const transport = (opts.transport ?? 'UDP').trim().toUpperCase();
  const configured = opts.configuredPort ?? 5060;

  if (transport === 'TLS') {
    return {
      port: configured === 5060 ? 5061 : configured,
      grandstreamTransport: 2,
    };
  }

  if (transport === 'TCP') {
    return {
      port: configured === 5061 ? 5060 : configured,
      grandstreamTransport: 1,
    };
  }

  return {
    port: configured === 5061 ? 5060 : configured,
    grandstreamTransport: 0,
  };
}

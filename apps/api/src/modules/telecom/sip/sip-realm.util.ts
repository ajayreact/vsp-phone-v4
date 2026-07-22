/** ADR-025 tenant SIP realm + optional shared registrar host (SIP_REGISTRAR_HOST). */

export function tenantSipRealm(tenantSlug: string, platformDomain: string): string {
  return `${tenantSlug}.sip.${platformDomain}`;
}

export function normalizeSipHost(value: string): string {
  return value.trim().toLowerCase().replace(/:\d+$/, '');
}

export function isAcceptedDigestRealm(params: {
  realm: string;
  tenantSlug: string;
  platformDomain: string;
  endpointAor: string;
  registrarHost?: string;
}): boolean {
  const realmLc = normalizeSipHost(params.realm);
  const expected = normalizeSipHost(tenantSipRealm(params.tenantSlug, params.platformDomain));
  const platform = normalizeSipHost(params.platformDomain);
  const epHost = extractAorHost(params.endpointAor);
  const registrar = params.registrarHost ? normalizeSipHost(params.registrarHost) : '';

  return (
    realmLc === expected ||
    realmLc === platform ||
    (epHost !== null && realmLc === epHost) ||
    (registrar !== '' && realmLc === registrar)
  );
}

export function extractAorHost(aorOrUri: string): string | null {
  const m = aorOrUri.match(/sip:([^;>@]+@)?([^;>\s]+)/i);
  if (!m) return null;
  return normalizeSipHost(m[2] ?? '');
}

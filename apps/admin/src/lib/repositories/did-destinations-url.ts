/** Path for DID assign dropdown — must match TenantDidsController destinations filter. */
export function buildDidDestinationsPath(type: string, phoneNumberId?: string): string {
  const qs = new URLSearchParams({ type });
  if (phoneNumberId) qs.set('phoneNumberId', phoneNumberId);
  return `/v1/tenant/dids/destinations?${qs.toString()}`;
}

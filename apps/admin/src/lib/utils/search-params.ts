import type { SearchAvailableParams } from '../../types/telecom';

/** Serialize API query params — booleans only when true. */
export function buildSearchQueryParams(params: Record<string, unknown>): URLSearchParams {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'boolean') {
      if (value) searchParams.set(key, 'true');
      continue;
    }
    searchParams.set(key, String(value));
  }
  return searchParams;
}

/** True when at least one Telnyx live-search filter is set. */
export function hasTelnyxSearchFilters(filters: SearchAvailableParams): boolean {
  return Boolean(
    filters.countryCode?.trim() ||
      filters.administrativeArea?.trim() ||
      filters.locality?.trim() ||
      filters.postalCode?.trim() ||
      filters.areaCode?.trim() ||
      filters.nationalDestinationCode?.trim() ||
      filters.prefix?.trim() ||
      filters.contains?.trim() ||
      filters.endsWith?.trim() ||
      filters.startsWith?.trim() ||
      filters.vanity?.trim() ||
      filters.search?.trim() ||
      filters.phoneNumberType?.trim() ||
      filters.voice ||
      filters.sms ||
      filters.mms ||
      filters.emergency ||
      filters.quickship ||
      filters.bestEffort,
  );
}

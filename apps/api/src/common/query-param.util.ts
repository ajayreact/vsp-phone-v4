/** Parse query-string booleans (`true` / `false` / 1 / 0). */
export function parseQueryBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const s = String(value).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return undefined;
}

/** Strip non-digits from phone filter input. */
export function normalizePhoneDigits(value?: string | null): string {
  return (value ?? '').replace(/\D/g, '');
}

export type PhoneDigitFilter = {
  contains?: string;
  endsWith?: string;
  startsWith?: string;
};

/** Server-side digit matching when Telnyx filters are imprecise or absent. */
export function phoneMatchesDigitFilters(
  phoneNumber: string,
  filters: PhoneDigitFilter,
): boolean {
  const digits = normalizePhoneDigits(phoneNumber);
  const contains = normalizePhoneDigits(filters.contains);
  const endsWith = normalizePhoneDigits(filters.endsWith);
  const startsWith = normalizePhoneDigits(filters.startsWith);

  if (contains && !digits.includes(contains)) return false;
  if (endsWith && !digits.endsWith(endsWith)) return false;
  if (startsWith && !digits.startsWith(startsWith)) return false;
  return true;
}

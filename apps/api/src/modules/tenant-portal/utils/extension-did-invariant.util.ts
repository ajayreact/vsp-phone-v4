/** Pure helpers for One DID ↔ One Extension invariant (unit-tested). */

export const TOMBSTONE_EXTENSION_RE = /^(\d{1,5})__del__[a-f0-9]{12}$/i;

/** Parse `102__del__a74638ae8b9e` → `102`. */
export function parseTombstoneExtensionNumber(value: string): string | null {
  const m = value.trim().match(TOMBSTONE_EXTENSION_RE);
  return m ? m[1] : null;
}

/** Extension dial string suitable for reuse (tombstone → original, else numeric extension). */
export function canonicalExtensionNumber(value: string): string | null {
  const fromTombstone = parseTombstoneExtensionNumber(value);
  if (fromTombstone) return fromTombstone;
  const trimmed = value.trim();
  const n = Number.parseInt(trimmed, 10);
  if (Number.isFinite(n) && String(n) === trimmed && n >= 1 && n <= 99_999) {
    return trimmed;
  }
  return null;
}

export function phoneNeedsExtensionRepair(opts: {
  lineId: string | null;
  hasLiveExtension: boolean;
}): boolean {
  if (!opts.lineId) return true;
  return !opts.hasLiveExtension;
}

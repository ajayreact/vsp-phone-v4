/** Pure helpers for Extension-First auto-provision (unit-tested without Nest DI). */

/** Default first extension for a new tenant (100, 101, 102, …). */
export const DEFAULT_EXTENSION_START = 100;

/**
 * Derive `pg_advisory_xact_lock(int, int)` keys from a tenant UUID.
 * PostgreSQL advisory lock keys are int4; UUID hex chunks can exceed INT_MAX
 * (e.g. 0xc8b74757 = 3367454551 → SQLSTATE 22003). Coerce to signed int32.
 * Phone numbers / DIDs must never be passed as advisory keys.
 */
export function tenantAdvisoryLockKeys(tenantId: string): [number, number] {
  const hex = tenantId.replace(/-/g, '');
  const k1 = toPgInt4(Number.parseInt(hex.slice(0, 8), 16) || 1);
  const k2 = toPgInt4(Number.parseInt(hex.slice(8, 16), 16) || 1);
  return [k1 || 1, k2 || 1];
}

/** Coerce to PostgreSQL integer (int4) range via signed 32-bit truncation. */
export function toPgInt4(n: number): number {
  return n | 0;
}

/** Reasonable PBX extension range — never treat E.164 / DID digits as extension ints. */
const MAX_EXTENSION_NUMBER = 99_999;

export function nextAvailableExtensionNumber(
  existing: string[],
  startFrom = DEFAULT_EXTENSION_START,
): string {
  const taken = new Set<number>();
  for (const raw of existing) {
    const trimmed = raw.trim();
    const n = parseInt(trimmed, 10);
    // DIDs like "3367454551" are numeric strings but must not be treated as extensions.
    if (
      Number.isFinite(n) &&
      String(n) === trimmed &&
      n >= 1 &&
      n <= MAX_EXTENSION_NUMBER
    ) {
      taken.add(n);
    }
  }
  let candidate = Math.max(1, Math.floor(startFrom));
  while (taken.has(candidate)) candidate += 1;
  return String(candidate);
}

export function defaultExtensionDisplayName(extension: string): string {
  return `Extension ${extension}`;
}

/** Business-config incomplete → Needs Setup (filter / stats). */
export function extensionNeedsBusinessSetup(opts: {
  extension: string;
  displayName: string;
  hasLinkedUser: boolean;
  status: 'Registered' | 'Provisioned' | 'NoDevice' | 'RegistrationFailed' | 'Inactive' | 'Archived';
}): boolean {
  if (opts.status === 'Inactive' || opts.status === 'Archived') return false;
  if (opts.status === 'NoDevice') return true;
  const incomplete =
    !opts.hasLinkedUser ||
    opts.displayName.trim() === defaultExtensionDisplayName(opts.extension);
  return incomplete;
}

/**
 * Bulk assign target resolution.
 * - Explicit `extensions[i]` → may target an existing extension (intentional).
 * - `startExtension` / shared `extension` → allocate next free >= base (never silent reuse).
 */
export type BulkExtensionTarget =
  | { mode: 'explicit'; extension: string }
  | { mode: 'allocate'; startFrom: number };

export function resolveBulkExtensionTarget(
  dto: {
    extensions?: string[];
    startExtension?: string;
    extension?: string;
  },
  index: number,
): BulkExtensionTarget {
  const explicit = dto.extensions?.[index]?.trim();
  if (explicit) return { mode: 'explicit', extension: explicit };

  if (dto.startExtension?.trim()) {
    const base = parseInt(dto.startExtension.trim(), 10);
    return {
      mode: 'allocate',
      startFrom: Number.isFinite(base) ? base : DEFAULT_EXTENSION_START,
    };
  }

  if (dto.extension?.trim()) {
    const base = parseInt(dto.extension.trim(), 10);
    // Shared single extension across a bulk batch would stack DIDs — allocate from that base instead.
    return {
      mode: 'allocate',
      startFrom: Number.isFinite(base) ? base : DEFAULT_EXTENSION_START,
    };
  }

  return { mode: 'allocate', startFrom: DEFAULT_EXTENSION_START };
}

/** Tombstone extension number so @@unique([tenantId, extension]) frees the original for reuse. */
export function tombstoneExtensionNumber(extension: string, extensionId: string): string {
  const idPart = extensionId.replace(/-/g, '').slice(0, 12);
  return `${extension}__del__${idPart}`;
}

export {
  canonicalExtensionNumber,
  parseTombstoneExtensionNumber,
  phoneNeedsExtensionRepair,
} from './extension-did-invariant.util';

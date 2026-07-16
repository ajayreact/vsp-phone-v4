/** Pure helpers for Extension-First auto-provision (unit-tested without Nest DI). */

/** Default first extension for a new tenant (100, 101, 102, …). */
export const DEFAULT_EXTENSION_START = 100;

export function nextAvailableExtensionNumber(
  existing: string[],
  startFrom = DEFAULT_EXTENSION_START,
): string {
  const taken = new Set<number>();
  for (const raw of existing) {
    const trimmed = raw.trim();
    const n = parseInt(trimmed, 10);
    if (Number.isFinite(n) && String(n) === trimmed) {
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
  status: 'Registered' | 'Provisioned' | 'NoDevice' | 'RegistrationFailed' | 'Inactive';
}): boolean {
  if (opts.status === 'Inactive') return false;
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

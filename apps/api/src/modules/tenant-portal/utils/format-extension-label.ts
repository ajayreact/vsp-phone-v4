/** Shared label: "101 • Reception" or "101" when no display name. */
export function formatExtensionLabel(ext: string, displayName?: string | null): string {
  const trimmed = displayName?.trim();
  if (!trimmed || trimmed === ext || trimmed === `Extension ${ext}`) return ext;
  return `${ext} • ${trimmed}`;
}

export function formatRelativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  const diffMs = Date.now() - at;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Defensive readers for Ops NOC JSON payloads (shape varies by Kamailio/RTPengine version). */

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function pickNumber(source: unknown, keys: string[]): number | null {
  const obj = asRecord(source);
  if (!obj) {
    if (typeof source === 'number' && Number.isFinite(source)) return source;
    return null;
  }
  for (const key of keys) {
    const raw = obj[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
      return Number(raw);
    }
  }
  return null;
}

export function pickString(source: unknown, keys: string[]): string | null {
  const obj = asRecord(source);
  if (!obj) {
    if (typeof source === 'string' && source.trim()) return source.trim();
    return null;
  }
  for (const key of keys) {
    const raw = obj[key];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
    if (typeof raw === 'boolean') return raw ? 'yes' : 'no';
  }
  return null;
}

export function formatUptime(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string' && value.trim()) return value.trim();
  const seconds =
    typeof value === 'number'
      ? value
      : pickNumber(value, ['uptime', 'up_since', 'seconds', 'sec', 'value']);
  if (seconds == null) {
    const nested = asRecord(value);
    if (nested) {
      const pretty = pickString(nested, ['uptime', 'text', 'formatted']);
      if (pretty) return pretty;
    }
    return '—';
  }
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatLatency(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  return `${Math.round(ms)} ms`;
}

export function displayOrDash(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  return String(value);
}

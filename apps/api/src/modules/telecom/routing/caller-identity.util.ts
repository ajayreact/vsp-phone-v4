/** SIP-client-agnostic AoR candidate generation for caller line lookup. */

export function buildRegistrarAorCandidates(
  username: string,
  registrarHost?: string,
): string[] {
  const user = username.trim();
  if (!user) return [];
  const out = new Set<string>();
  if (registrarHost) {
    out.add(`sip:${user}@${registrarHost.trim().toLowerCase()}`);
  }
  return [...out];
}

export function normalizeRegistrationIp(srcIp?: string | null): string | undefined {
  const ip = srcIp?.trim();
  return ip || undefined;
}

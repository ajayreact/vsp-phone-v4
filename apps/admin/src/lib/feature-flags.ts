/** Client-safe feature flags (NEXT_PUBLIC_*). */

/** Extension-first hub landing and navigation (default on). */
export function isExtensionHubEnabled(): boolean {
  return process.env.NEXT_PUBLIC_EXTENSION_HUB !== 'false';
}

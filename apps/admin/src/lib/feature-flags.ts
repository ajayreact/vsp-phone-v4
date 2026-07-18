/** Client-safe feature flags (NEXT_PUBLIC_*). */

/** Extension-first hub landing and navigation (default on). */
export function isExtensionHubEnabled(): boolean {
  return process.env.NEXT_PUBLIC_EXTENSION_HUB !== 'false';
}

/**
 * Developer Tools visibility.
 * Requires platform Developer Mode (settings) OR NEXT_PUBLIC_DEVELOPER_MODE=true,
 * and Platform Super Admin permission (checked by caller).
 */
export function isDeveloperModeEnvEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEVELOPER_MODE === 'true';
}

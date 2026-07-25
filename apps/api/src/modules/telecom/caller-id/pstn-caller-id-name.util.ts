import { defaultExtensionDisplayName } from '../../tenant-portal/utils/extension-auto-provision.util';

export interface PstnCallerIdNameInput {
  extension: string;
  storedCallerIdName?: string | null;
  userProfile?: {
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}

/** True when stored name is the auto-provisioned "Extension {n}" placeholder. */
export function isDefaultExtensionCallerIdName(name: string, extension: string): boolean {
  const trimmed = name.trim();
  return trimmed === defaultExtensionDisplayName(extension.trim());
}

/**
 * Resolve the PSTN-facing display name for outbound calls.
 * Never returns "Extension {n}" — falls back to assigned user profile instead.
 */
export function resolvePstnCallerIdName(input: PstnCallerIdNameInput): string | undefined {
  const ext = input.extension.trim();
  const stored = input.storedCallerIdName?.trim();
  if (stored && !isDefaultExtensionCallerIdName(stored, ext)) {
    return stored;
  }

  const profile = input.userProfile;
  if (!profile) return undefined;

  const displayName = profile.displayName?.trim();
  if (displayName) return displayName;

  const first = profile.firstName?.trim() ?? '';
  const last = profile.lastName?.trim() ?? '';
  const combined = `${first} ${last}`.trim();
  return combined || undefined;
}

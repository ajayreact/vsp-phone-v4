/** Labels that indicate a line still carries a deleted/unassigned user's identity. */
export function userOwnedLineNameCandidates(user: {
  email: string;
  username: string | null;
  profile: { displayName: string; firstName: string; lastName: string } | null;
}): string[] {
  const candidates = new Set<string>();
  const profile = user.profile;

  if (profile?.displayName?.trim()) {
    candidates.add(profile.displayName.trim());
  }

  const fullName = `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim();
  if (fullName) {
    candidates.add(fullName);
  }

  if (user.username?.trim()) {
    candidates.add(user.username.trim());
  }

  if (user.email?.trim()) {
    candidates.add(user.email.trim());
    const localPart = user.email.split('@')[0]?.trim();
    if (localPart) {
      candidates.add(localPart);
    }
  }

  return [...candidates];
}

export function lineNameMatchesUserOwnedLabels(lineName: string, candidates: string[]): boolean {
  const trimmed = lineName.trim();
  if (!trimmed) return false;
  return candidates.some((candidate) => candidate === trimmed);
}

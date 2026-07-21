/** Display name for provisioning when line.user may be unassigned after user delete. */
export function resolveLineDisplayName(line: {
  name: string;
  user: { username: string | null; email: string } | null;
}): string {
  const user = line.user;
  if (user === null) {
    return line.name;
  }
  if (user.username) {
    return user.username;
  }
  return user.email;
}

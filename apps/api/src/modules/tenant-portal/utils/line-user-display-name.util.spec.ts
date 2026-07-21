import { lineNameMatchesUserOwnedLabels, userOwnedLineNameCandidates } from './line-user-display-name.util';

describe('line-user-display-name.util', () => {
  const user = {
    email: 'basha@example.com',
    username: 'basha',
    profile: { displayName: 'Basha', firstName: 'Basha', lastName: '' },
  };

  it('collects display name, username, and email variants', () => {
    expect(userOwnedLineNameCandidates(user)).toEqual(
      expect.arrayContaining(['Basha', 'basha', 'basha@example.com']),
    );
  });

  it('matches line names owned by the deleted user', () => {
    const candidates = userOwnedLineNameCandidates(user);
    expect(lineNameMatchesUserOwnedLabels('Basha', candidates)).toBe(true);
    expect(lineNameMatchesUserOwnedLabels('Reception', candidates)).toBe(false);
  });
});

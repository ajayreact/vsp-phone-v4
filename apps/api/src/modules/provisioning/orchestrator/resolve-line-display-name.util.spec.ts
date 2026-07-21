import { resolveLineDisplayName } from './resolve-line-display-name.util';

describe('resolveLineDisplayName', () => {
  it('falls back to line name when user is unassigned', () => {
    expect(
      resolveLineDisplayName({
        name: 'Extension 102',
        user: null,
      }),
    ).toBe('Extension 102');
  });

  it('prefers username then email when user exists', () => {
    expect(
      resolveLineDisplayName({
        name: 'Extension 102',
        user: { username: 'basha', email: 'basha@example.com' },
      }),
    ).toBe('basha');

    expect(
      resolveLineDisplayName({
        name: 'Extension 102',
        user: { username: null, email: 'basha@example.com' },
      }),
    ).toBe('basha@example.com');
  });
});

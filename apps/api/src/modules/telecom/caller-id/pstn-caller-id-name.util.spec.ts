import { resolvePstnCallerIdName } from './pstn-caller-id-name.util';

describe('resolvePstnCallerIdName', () => {
  it('returns custom caller_id_name when not default extension label', () => {
    expect(
      resolvePstnCallerIdName({
        extension: '100',
        storedCallerIdName: 'VSP Group',
      }),
    ).toBe('VSP Group');
  });

  it('never returns Extension {n} default label', () => {
    expect(
      resolvePstnCallerIdName({
        extension: '100',
        storedCallerIdName: 'Extension 100',
        userProfile: { displayName: 'Ajay Pasala', firstName: 'Ajay', lastName: 'Pasala' },
      }),
    ).toBe('Ajay Pasala');
  });

  it('falls back to user profile display name', () => {
    expect(
      resolvePstnCallerIdName({
        extension: '100',
        storedCallerIdName: 'Extension 100',
        userProfile: { displayName: 'Ajay Pasala', firstName: 'Ajay', lastName: 'Pasala' },
      }),
    ).toBe('Ajay Pasala');
  });

  it('falls back to first + last name when display name empty', () => {
    expect(
      resolvePstnCallerIdName({
        extension: '100',
        storedCallerIdName: 'Extension 100',
        userProfile: { displayName: '', firstName: 'Ajay', lastName: 'Pasala' },
      }),
    ).toBe('Ajay Pasala');
  });

  it('returns undefined when only extension default exists', () => {
    expect(
      resolvePstnCallerIdName({
        extension: '100',
        storedCallerIdName: 'Extension 100',
      }),
    ).toBeUndefined();
  });
});

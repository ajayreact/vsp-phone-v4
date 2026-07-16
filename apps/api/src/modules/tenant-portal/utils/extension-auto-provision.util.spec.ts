import {
  defaultExtensionDisplayName,
  extensionNeedsBusinessSetup,
  nextAvailableExtensionNumber,
  resolveBulkExtensionTarget,
  tombstoneExtensionNumber,
} from './extension-auto-provision.util';

describe('nextAvailableExtensionNumber', () => {
  it('returns 101 when tenant has no extensions', () => {
    expect(nextAvailableExtensionNumber([])).toBe('101');
  });

  it('skips taken numeric extensions', () => {
    expect(nextAvailableExtensionNumber(['101', '102', '104'])).toBe('103');
  });

  it('ignores non-numeric extension labels', () => {
    expect(nextAvailableExtensionNumber(['main', '101', 'sales'])).toBe('102');
  });

  it('respects startFrom when free', () => {
    expect(nextAvailableExtensionNumber(['101'], 200)).toBe('200');
  });

  it('advances from startFrom when taken', () => {
    expect(nextAvailableExtensionNumber(['200', '201'], 200)).toBe('202');
  });
});

describe('extensionNeedsBusinessSetup', () => {
  it('is true for NoDevice', () => {
    expect(
      extensionNeedsBusinessSetup({
        extension: '101',
        displayName: 'Alice',
        hasLinkedUser: true,
        status: 'NoDevice',
      }),
    ).toBe(true);
  });

  it('is true when display name is still the default and no user', () => {
    expect(
      extensionNeedsBusinessSetup({
        extension: '101',
        displayName: defaultExtensionDisplayName('101'),
        hasLinkedUser: false,
        status: 'Provisioned',
      }),
    ).toBe(true);
  });

  it('is true when user is missing even with custom name', () => {
    expect(
      extensionNeedsBusinessSetup({
        extension: '101',
        displayName: 'Reception',
        hasLinkedUser: false,
        status: 'Provisioned',
      }),
    ).toBe(true);
  });

  it('is false when user linked and display name customized', () => {
    expect(
      extensionNeedsBusinessSetup({
        extension: '101',
        displayName: 'Reception',
        hasLinkedUser: true,
        status: 'Provisioned',
      }),
    ).toBe(false);
  });

  it('is true when user linked but display name still default', () => {
    expect(
      extensionNeedsBusinessSetup({
        extension: '102',
        displayName: 'Extension 102',
        hasLinkedUser: true,
        status: 'Registered',
      }),
    ).toBe(true);
  });
});

describe('bulk assign allocation contract', () => {
  function resolveExtension(
    dto: { extensions?: string[]; startExtension?: string; extension?: string },
    index: number,
    taken: string[],
  ): string {
    const target = resolveBulkExtensionTarget(dto, index);
    if (target.mode === 'explicit') return target.extension;
    return nextAvailableExtensionNumber(taken, target.startFrom);
  }

  it('auto-allocates consecutive free extensions when startExtension omitted', () => {
    const taken: string[] = [];
    const assigned: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const ext = resolveExtension({}, i, taken);
      assigned.push(ext);
      taken.push(ext);
    }
    expect(assigned).toEqual(['101', '102', '103']);
  });

  it('skips already-taken numbers when startExtension overlaps existing', () => {
    const taken = ['101', '102', '103'];
    const assigned: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const ext = resolveExtension({ startExtension: '101' }, i, taken);
      assigned.push(ext);
      taken.push(ext);
    }
    expect(assigned).toEqual(['104', '105', '106']);
  });

  it('allows explicit extensions[] to target a specific number', () => {
    expect(resolveBulkExtensionTarget({ extensions: ['104'] }, 0)).toEqual({
      mode: 'explicit',
      extension: '104',
    });
  });
});

describe('tombstoneExtensionNumber', () => {
  it('frees the original number for reuse while keeping a unique tombstone', () => {
    const tomb = tombstoneExtensionNumber('101', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(tomb.startsWith('101__del__')).toBe(true);
    expect(tomb).not.toBe('101');
  });
});

import {
  DEFAULT_EXTENSION_START,
  defaultExtensionDisplayName,
  extensionNeedsBusinessSetup,
  nextAvailableExtensionNumber,
  resolveBulkExtensionTarget,
  tenantAdvisoryLockKeys,
  toPgInt4,
  tombstoneExtensionNumber,
} from './extension-auto-provision.util';

describe('nextAvailableExtensionNumber', () => {
  it('returns 100 when tenant has no extensions', () => {
    expect(nextAvailableExtensionNumber([])).toBe('100');
    expect(DEFAULT_EXTENSION_START).toBe(100);
  });

  it('skips taken numeric extensions', () => {
    expect(nextAvailableExtensionNumber(['100', '101', '103'])).toBe('102');
  });

  it('ignores non-numeric extension labels', () => {
    expect(nextAvailableExtensionNumber(['main', '100', 'sales'])).toBe('101');
  });

  it('ignores DID-length numeric strings (never treat phone numbers as extensions)', () => {
    expect(nextAvailableExtensionNumber(['3367454551', '100'])).toBe('101');
  });

  it('respects startFrom when free', () => {
    expect(nextAvailableExtensionNumber(['100'], 200)).toBe('200');
  });

  it('advances from startFrom when taken', () => {
    expect(nextAvailableExtensionNumber(['200', '201'], 200)).toBe('202');
  });
});

describe('tenantAdvisoryLockKeys', () => {
  it('keeps keys inside PostgreSQL int4 so pg_advisory_xact_lock does not raise 22003', () => {
    // 0xc8b74757 === 3367454551 — the exact overflow value from production logs
    const tenantId = 'c8b74757-95ad-404c-8c2d-96313744edfc';
    const raw = Number.parseInt(tenantId.replace(/-/g, '').slice(0, 8), 16);
    expect(raw).toBe(3367454551);
    expect(raw).toBeGreaterThan(2147483647);

    const [k1, k2] = tenantAdvisoryLockKeys(tenantId);
    expect(k1).toBe(toPgInt4(raw));
    expect(k1).toBeGreaterThanOrEqual(-2147483648);
    expect(k1).toBeLessThanOrEqual(2147483647);
    expect(k2).toBeGreaterThanOrEqual(-2147483648);
    expect(k2).toBeLessThanOrEqual(2147483647);
  });
});

describe('defaultExtensionDisplayName', () => {
  it('uses Extension N pattern for identification defaults', () => {
    expect(defaultExtensionDisplayName('100')).toBe('Extension 100');
  });
});

describe('extensionNeedsBusinessSetup', () => {
  it('is true for NoDevice', () => {
    expect(
      extensionNeedsBusinessSetup({
        extension: '100',
        displayName: 'Alice',
        hasLinkedUser: true,
        status: 'NoDevice',
      }),
    ).toBe(true);
  });

  it('is true when display name is still the default and no user', () => {
    expect(
      extensionNeedsBusinessSetup({
        extension: '100',
        displayName: defaultExtensionDisplayName('100'),
        hasLinkedUser: false,
        status: 'Provisioned',
      }),
    ).toBe(true);
  });

  it('is true when user is missing even with custom name', () => {
    expect(
      extensionNeedsBusinessSetup({
        extension: '100',
        displayName: 'Reception',
        hasLinkedUser: false,
        status: 'Provisioned',
      }),
    ).toBe(true);
  });

  it('is false when user linked and display name customized', () => {
    expect(
      extensionNeedsBusinessSetup({
        extension: '100',
        displayName: 'Reception',
        hasLinkedUser: true,
        status: 'Provisioned',
      }),
    ).toBe(false);
  });

  it('is true when user linked but display name still default', () => {
    expect(
      extensionNeedsBusinessSetup({
        extension: '101',
        displayName: 'Extension 101',
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

  it('auto-allocates consecutive free extensions starting at 100', () => {
    const taken: string[] = [];
    const assigned: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const ext = resolveExtension({}, i, taken);
      assigned.push(ext);
      taken.push(ext);
    }
    expect(assigned).toEqual(['100', '101', '102']);
  });

  it('skips already-taken numbers when startExtension overlaps existing', () => {
    const taken = ['100', '101', '102'];
    const assigned: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const ext = resolveExtension({ startExtension: '100' }, i, taken);
      assigned.push(ext);
      taken.push(ext);
    }
    expect(assigned).toEqual(['103', '104', '105']);
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
    const tomb = tombstoneExtensionNumber('100', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(tomb.startsWith('100__del__')).toBe(true);
    expect(tomb).not.toBe('100');
  });
});

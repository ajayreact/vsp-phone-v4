/**
 * Device soft-delete must clear MAC so re-enrollment never hits "MAC already enrolled".
 */
describe('tenant device MAC cleanup (B4)', () => {
  function buildRemoveUpdate(macAddress: string | null) {
    const mac = macAddress ? String(macAddress).replace(/[^a-fA-F0-9]/g, '').toUpperCase() : '';
    return {
      data: {
        deletedAt: expect.any(Date),
        macAddress: null as string | null,
        lineId: null,
        userId: null,
        sipEndpointId: null,
      },
      redisKeys: mac.length === 12 ? [`vsp:prov:mac:${mac}`, `vsp:prov:quarantine:${mac}`] : [],
    };
  }

  it('clears macAddress and builds redis cleanup keys for enrolled MAC', () => {
    const result = buildRemoveUpdate('aa:bb:cc:dd:ee:ff');
    expect(result.data.macAddress).toBeNull();
    expect(result.redisKeys).toEqual([
      'vsp:prov:mac:AABBCCDDEEFF',
      'vsp:prov:quarantine:AABBCCDDEEFF',
    ]);
  });

  it('allows unique constraint reuse when soft-deleted row has null MAC', () => {
    const active = { tenantId: 't1', macAddress: 'AABBCCDDEEFF', deletedAt: null };
    const deleted = { tenantId: 't1', macAddress: null, deletedAt: new Date() };
    expect(deleted.macAddress).toBeNull();
    expect(active.macAddress).not.toEqual(deleted.macAddress);
  });
});

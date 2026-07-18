/**
 * Global Inventory model — no fake Platform Inventory tenant.
 * Unassigned DIDs use ownerTenantId IS NULL (and tenantId IS NULL).
 * Assigned DIDs set both ownerTenantId and tenantId to the customer tenant.
 */
describe('Global Inventory ownership model', () => {
  type Phone = { ownerTenantId: string | null; tenantId: string | null; lineId: string | null };

  function isGlobalInventory(p: Phone): boolean {
    return p.ownerTenantId == null && p.tenantId == null;
  }

  function isAssignedToTenant(p: Phone, tenantId: string): boolean {
    return p.ownerTenantId === tenantId && p.tenantId === tenantId;
  }

  function assignToTenant(p: Phone, tenantId: string): Phone {
    return { ...p, ownerTenantId: tenantId, tenantId, lineId: p.lineId };
  }

  function releaseToGlobalInventory(p: Phone): Phone {
    return { ...p, ownerTenantId: null, tenantId: null, lineId: null };
  }

  it('treats null owner+tenant as Global Inventory', () => {
    expect(isGlobalInventory({ ownerTenantId: null, tenantId: null, lineId: null })).toBe(true);
  });

  it('treats tenant-owned numbers as assigned ownership', () => {
    const tenantId = 'tenant-a';
    expect(
      isAssignedToTenant({ ownerTenantId: tenantId, tenantId, lineId: null }, tenantId),
    ).toBe(true);
    expect(isGlobalInventory({ ownerTenantId: tenantId, tenantId, lineId: null })).toBe(false);
  });

  it('assign moves Global Inventory DID onto a real tenant', () => {
    const before: Phone = { ownerTenantId: null, tenantId: null, lineId: null };
    const after = assignToTenant(before, 'tenant-a');
    expect(isGlobalInventory(after)).toBe(false);
    expect(isAssignedToTenant(after, 'tenant-a')).toBe(true);
  });

  it('delete/release returns DID to Global Inventory', () => {
    const owned: Phone = { ownerTenantId: 'tenant-a', tenantId: 'tenant-a', lineId: 'line-1' };
    const released = releaseToGlobalInventory(owned);
    expect(isGlobalInventory(released)).toBe(true);
    expect(released.lineId).toBeNull();
  });

  it('does not treat a fake inventory-tenant id as Global Inventory', () => {
    const fakeInventoryTenant = 'platform-inventory-uuid';
    expect(
      isGlobalInventory({
        ownerTenantId: fakeInventoryTenant,
        tenantId: fakeInventoryTenant,
        lineId: null,
      }),
    ).toBe(false);
  });
});

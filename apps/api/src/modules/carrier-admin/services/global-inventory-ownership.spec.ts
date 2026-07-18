/**
 * Global Inventory model — no fake Platform Inventory tenant.
 * Unassigned DIDs use ownerTenantId IS NULL (and tenantId IS NULL).
 */
describe('Global Inventory ownership model', () => {
  type Phone = { ownerTenantId: string | null; tenantId: string | null; lineId: string | null };

  function isGlobalInventory(p: Phone): boolean {
    return p.ownerTenantId == null && p.tenantId == null;
  }

  function isAssignedToTenant(p: Phone, tenantId: string): boolean {
    return p.ownerTenantId === tenantId && p.tenantId === tenantId;
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

  it('does not use a Platform Inventory tenant id', () => {
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

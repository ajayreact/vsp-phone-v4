/**
 * Global Inventory isolation — ownerTenantId NULL, never customer-tenant DIDs.
 */
describe('marketplace inventory isolation (global inventory)', () => {
  type Row = {
    id: string;
    ownerTenantId: string | null;
    lineId: string | null;
    status: string;
  };

  function filterMarketplaceInventory(rows: Row[]): Row[] {
    return rows.filter(
      (n) => n.ownerTenantId == null && n.lineId == null && n.status === 'available',
    );
  }

  it('only returns Global Inventory (ownerTenantId null) numbers', () => {
    const rows: Row[] = [
      { id: '1', ownerTenantId: null, lineId: null, status: 'available' },
      { id: '2', ownerTenantId: 'customer-a', lineId: null, status: 'available' },
      { id: '3', ownerTenantId: null, lineId: 'line-1', status: 'active' },
    ];
    expect(filterMarketplaceInventory(rows).map((r) => r.id)).toEqual(['1']);
  });

  it('excludes bound inventory rows', () => {
    const rows: Row[] = [
      { id: '1', ownerTenantId: null, lineId: null, status: 'available' },
      { id: '2', ownerTenantId: null, lineId: 'x', status: 'available' },
    ];
    expect(filterMarketplaceInventory(rows).map((r) => r.id)).toEqual(['1']);
  });
});

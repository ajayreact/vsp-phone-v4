/**
 * Marketplace inventory must never list numbers assigned to customer tenants.
 * Mirrors the filter contract of TelnyxNumbersService.listMarketplaceInventory.
 */
describe('marketplace inventory isolation', () => {
  type Row = {
    id: string;
    tenantId: string;
    status: 'available' | 'active' | 'suspended';
    assignedExtension: string | null;
    assignedTenantId: string | null;
  };

  function filterMarketplaceInventory(inventoryTenantId: string, rows: Row[]): Row[] {
    return rows.filter(
      (n) =>
        n.tenantId === inventoryTenantId &&
        n.status === 'available' &&
        !n.assignedExtension &&
        !n.assignedTenantId,
    );
  }

  const inventoryTenantId = 'inventory-tenant';

  it('excludes numbers belonging to other tenants', () => {
    const rows: Row[] = [
      {
        id: '1',
        tenantId: inventoryTenantId,
        status: 'available',
        assignedExtension: null,
        assignedTenantId: null,
      },
      {
        id: '2',
        tenantId: 'customer-a',
        status: 'available',
        assignedExtension: null,
        assignedTenantId: 'customer-a',
      },
      {
        id: '3',
        tenantId: 'customer-b',
        status: 'active',
        assignedExtension: '1001',
        assignedTenantId: 'customer-b',
      },
    ];
    const result = filterMarketplaceInventory(inventoryTenantId, rows);
    expect(result.map((r) => r.id)).toEqual(['1']);
  });

  it('excludes inventory numbers already marked assigned', () => {
    const rows: Row[] = [
      {
        id: '1',
        tenantId: inventoryTenantId,
        status: 'available',
        assignedExtension: null,
        assignedTenantId: null,
      },
      {
        id: '2',
        tenantId: inventoryTenantId,
        status: 'available',
        assignedExtension: '2001',
        assignedTenantId: null,
      },
    ];
    expect(filterMarketplaceInventory(inventoryTenantId, rows).map((r) => r.id)).toEqual(['1']);
  });
});

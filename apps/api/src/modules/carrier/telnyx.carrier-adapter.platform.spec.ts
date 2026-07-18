/**
 * Global Inventory / platform Telnyx regressions.
 * Platform-owned resources use tenantId NULL and must remain usable by tenants.
 */
describe('platform-owned carrier + inventory visibility', () => {
  type Carrier = { id: string; tenantId: string | null; health: 'GREEN' | 'YELLOW' | 'RED' };

  function isCarrierVisibleToTenant(
    carrierTenantId: string | null,
    requestTenantId: string,
  ): boolean {
    return carrierTenantId == null || carrierTenantId === requestTenantId;
  }

  function selectOutbound(
    carriers: Carrier[],
    requestTenantId: string,
  ): Carrier | null {
    const eligible = carriers
      .filter((c) => c.health !== 'RED')
      .filter((c) => isCarrierVisibleToTenant(c.tenantId, requestTenantId))
      // Prefer tenant-scoped when both exist — mirrors Prisma orderBy tenantId asc
      // (PostgreSQL ASC → NULLS LAST).
      .sort((a, b) => Number(a.tenantId == null) - Number(b.tenantId == null));
    return eligible[0] ?? null;
  }

  function isGlobalInventory(p: {
    ownerTenantId: string | null;
    tenantId: string | null;
  }): boolean {
    return p.ownerTenantId == null && p.tenantId == null;
  }

  function buildMetricsCallWhere(carrierTenantId: string | null) {
    return {
      deletedAt: null,
      ...(carrierTenantId ? { tenantId: carrierTenantId } : {}),
    };
  }

  it('selects platform Telnyx (tenantId NULL) for a customer tenant', () => {
    const picked = selectOutbound(
      [
        { id: 'platform-telnyx', tenantId: null, health: 'GREEN' },
        { id: 'other-tenant', tenantId: 'tenant-b', health: 'GREEN' },
      ],
      'tenant-a',
    );
    expect(picked?.id).toBe('platform-telnyx');
  });

  it('prefers tenant-scoped carrier over platform when both are visible', () => {
    const picked = selectOutbound(
      [
        { id: 'platform-telnyx', tenantId: null, health: 'GREEN' },
        { id: 'tenant-a-telnyx', tenantId: 'tenant-a', health: 'GREEN' },
      ],
      'tenant-a',
    );
    expect(picked?.id).toBe('tenant-a-telnyx');
  });

  it('never returns another tenant carrier', () => {
    const picked = selectOutbound(
      [{ id: 'other', tenantId: 'tenant-b', health: 'GREEN' }],
      'tenant-a',
    );
    expect(picked).toBeNull();
  });

  it('recognizes Global Inventory ownership', () => {
    expect(isGlobalInventory({ ownerTenantId: null, tenantId: null })).toBe(true);
    expect(isGlobalInventory({ ownerTenantId: 't1', tenantId: 't1' })).toBe(false);
  });

  it('omits tenantId from metrics queries for platform carriers', () => {
    expect(buildMetricsCallWhere(null)).toEqual({ deletedAt: null });
    expect(buildMetricsCallWhere('tenant-a')).toEqual({
      deletedAt: null,
      tenantId: 'tenant-a',
    });
  });
});

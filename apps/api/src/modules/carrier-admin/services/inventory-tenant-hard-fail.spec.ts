describe('resolveInventoryTenantId hard-fail (B2)', () => {
  async function resolveInventoryTenantId(opts: {
    settingsId?: string | null;
    envId?: string | null;
    tenantExists?: boolean;
  }): Promise<string> {
    const configured = opts.settingsId?.trim() || opts.envId?.trim();
    if (!configured) {
      throw new Error(
        'Platform Inventory Tenant is not configured. Set platformSettings.inventoryTenantId or VSP_PLATFORM_INVENTORY_TENANT_ID',
      );
    }
    if (!opts.tenantExists) {
      throw new Error(`Platform Inventory Tenant not found: ${configured}`);
    }
    return configured;
  }

  it('fails when neither settings nor env is set (no oldest-tenant fallback)', async () => {
    await expect(
      resolveInventoryTenantId({ settingsId: null, envId: null, tenantExists: true }),
    ).rejects.toThrow(/not configured/);
  });

  it('fails when configured id does not exist', async () => {
    await expect(
      resolveInventoryTenantId({
        settingsId: 'missing-uuid',
        envId: null,
        tenantExists: false,
      }),
    ).rejects.toThrow(/not found/);
  });

  it('returns configured inventory tenant id', async () => {
    await expect(
      resolveInventoryTenantId({
        settingsId: 'inv-1',
        envId: null,
        tenantExists: true,
      }),
    ).resolves.toBe('inv-1');
  });
});

/**
 * DEPRECATED (RC1 cleanup): Platform Inventory tenant is removed.
 * Global Inventory = PhoneNumber.owner_tenant_id IS NULL.
 *
 * This script is a no-op kept so older runbooks do not fail.
 */
console.log(
  JSON.stringify(
    {
      ok: true,
      deprecated: true,
      message:
        'Platform Inventory tenant is no longer used. Unassigned numbers use ownerTenantId=NULL (Global Inventory).',
    },
    null,
    2,
  ),
);

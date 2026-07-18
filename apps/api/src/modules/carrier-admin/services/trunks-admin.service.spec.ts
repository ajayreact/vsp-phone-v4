describe('TrunksAdminService null tenantId call filter', () => {
  /**
   * Mirrors countActiveCalls: never pass tenantId: null into Prisma
   * (CallSession.tenantId is required — PrismaClientValidationError).
   */
  function buildCallWhere(tenantId: string | null) {
    return {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
    };
  }

  it('omits tenantId for platform (null) carriers', () => {
    expect(buildCallWhere(null)).toEqual({ deletedAt: null });
  });

  it('includes tenantId for tenant-scoped carriers', () => {
    expect(buildCallWhere('tenant-a')).toEqual({ deletedAt: null, tenantId: 'tenant-a' });
  });
});

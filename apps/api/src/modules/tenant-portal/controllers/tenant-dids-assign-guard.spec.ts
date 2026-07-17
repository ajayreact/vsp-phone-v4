import { JWT_USER_KEY } from '../../auth/jwt-auth.guard';
import { TenantDidsController } from './tenant-dids.controller';

describe('TenantDidsController.assign (Extension Workspace)', () => {
  it('delegates tenant-scoped DID assign/change to the service (Configure → DID)', async () => {
    const result = { phoneNumberId: 'pn1', routing: null };
    const dids = { assign: jest.fn().mockResolvedValue(result) };
    const controller = new TenantDidsController(dids as never);
    const req = {
      [JWT_USER_KEY]: {
        sub: 'u1',
        tenantId: 't1',
        email: 'a@t.com',
        portal: 'tenant',
      },
    };
    const dto = { destinationType: 'EXTENSION', destinationId: 'e1' };

    const response = await controller.assign('pn1', dto as never, req as never);

    expect(dids.assign).toHaveBeenCalledWith('t1', 'u1', 'pn1', dto);
    expect(response).toEqual({ data: result });
  });
});

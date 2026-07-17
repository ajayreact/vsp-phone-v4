import { ForbiddenException } from '@nestjs/common';
import { JWT_USER_KEY } from '../../auth/jwt-auth.guard';
import { TenantDidsController } from './tenant-dids.controller';

describe('TenantDidsController.assign (Extension Workspace)', () => {
  it('rejects all tenant-surface DID assign writes', async () => {
    const dids = { assign: jest.fn() };
    const controller = new TenantDidsController(dids as never);
    const req = {
      [JWT_USER_KEY]: {
        sub: 'u1',
        tenantId: 't1',
        email: 'a@t.com',
        portal: 'tenant',
      },
    };

    await expect(
      controller.assign('pn1', { destinationType: 'EXTENSION', destinationId: 'e1' } as never, req as never),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(dids.assign).not.toHaveBeenCalled();
  });
});

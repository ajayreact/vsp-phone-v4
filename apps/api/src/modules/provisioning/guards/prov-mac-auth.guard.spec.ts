import { Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common/interfaces';
import { ProvMacAuthGuard } from './prov-mac-auth.guard';

describe('ProvMacAuthGuard', () => {
  const mac = 'ec74d751e3e7';

  function buildContext(path: string, authHeader?: string) {
    const req = {
      path,
      url: path,
      params: {},
      headers: authHeader ? { authorization: authHeader } : {},
      ip: '10.0.0.1',
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;
    return { context, req };
  }

  it('allows cfg download when credentials were rehydrated from Redis', async () => {
    const password = 'rehydrated-password';
    const vault = {
      resolveProvHttp: jest.fn().mockResolvedValue({ username: mac, password, version: 'prov-1' }),
    };
    const orchestrator = {
      lookupMac: jest.fn().mockResolvedValue({ tenantId: 't1', deviceId: 'd1', mac }),
      quarantineUnknownMac: jest.fn(),
    };
    const guard = new ProvMacAuthGuard(vault as never, orchestrator as never);
    const basic = Buffer.from(`${mac}:${password}`).toString('base64');
    const { context, req } = buildContext(`/gs/${mac}/cfg.xml`, `Basic ${basic}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(vault.resolveProvHttp).toHaveBeenCalledWith(mac);
    expect(req).toMatchObject({ provMac: mac, provDeviceId: 'd1', provTenantId: 't1' });
  });

  it('allows Grandstream directory-style path using MAC from path prefix', async () => {
    const password = 'rehydrated-password';
    const vault = {
      resolveProvHttp: jest.fn().mockResolvedValue({ username: mac, password, version: 'prov-1' }),
    };
    const orchestrator = {
      lookupMac: jest.fn().mockResolvedValue({ tenantId: 't1', deviceId: 'd1', mac }),
      quarantineUnknownMac: jest.fn(),
    };
    const guard = new ProvMacAuthGuard(vault as never, orchestrator as never);
    const basic = Buffer.from(`${mac}:${password}`).toString('base64');
    const { context, req } = buildContext(`/gs/${mac}/cfg.xml/cfg${mac}.xml`, `Basic ${basic}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req).toMatchObject({ provMac: mac });
  });

  it('allows native cfggrp2601.xml using Basic auth username as MAC', async () => {
    const password = 'rehydrated-password';
    const vault = {
      resolveProvHttp: jest.fn().mockResolvedValue({ username: mac, password, version: 'prov-1' }),
    };
    const orchestrator = {
      lookupMac: jest.fn().mockResolvedValue({ tenantId: 't1', deviceId: 'd1', mac }),
      quarantineUnknownMac: jest.fn(),
    };
    const guard = new ProvMacAuthGuard(vault as never, orchestrator as never);
    const basic = Buffer.from(`${mac}:${password}`).toString('base64');
    const { context, req } = buildContext('/gs/cfggrp2601.xml', `Basic ${basic}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req).toMatchObject({ provMac: mac });
  });

  it('returns 404 for unknown gs paths', async () => {
    const vault = { resolveProvHttp: jest.fn() };
    const orchestrator = {
      lookupMac: jest.fn(),
      quarantineUnknownMac: jest.fn(),
    };
    const guard = new ProvMacAuthGuard(vault as never, orchestrator as never);
    const { context } = buildContext('/gs/not-provisioning');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('rejects invalid gs paths with 404 before auth lookup', () => {
    const password = 'rehydrated-password';
    const basic = `Basic ${Buffer.from(`${mac}:${password}`).toString('base64')}`;

    function buildGuard() {
      const vault = { resolveProvHttp: jest.fn() };
      const orchestrator = {
        lookupMac: jest.fn(),
        quarantineUnknownMac: jest.fn(),
      };
      return {
        guard: new ProvMacAuthGuard(vault as never, orchestrator as never),
        orchestrator,
      };
    }

    it.each([
      '/gs/random.txt',
      '/gs/foo/bar',
      '/gs/cfginvalid.xml',
      '/gs/../../test',
    ])('%s', async (path) => {
      const { guard, orchestrator } = buildGuard();
      const { context } = buildContext(path, basic);

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(NotFoundException);
      expect(orchestrator.lookupMac).not.toHaveBeenCalled();
    });
  });

  describe('allows valid gs paths to reach auth (200 path when creds valid)', () => {
    const password = 'rehydrated-password';
    const basic = `Basic ${Buffer.from(`${mac}:${password}`).toString('base64')}`;

    function buildGuard() {
      const vault = {
        resolveProvHttp: jest.fn().mockResolvedValue({ username: mac, password, version: 'prov-1' }),
      };
      const orchestrator = {
        lookupMac: jest.fn().mockResolvedValue({ tenantId: 't1', deviceId: 'd1', mac }),
        quarantineUnknownMac: jest.fn(),
      };
      return new ProvMacAuthGuard(vault as never, orchestrator as never);
    }

    it.each([
      `/gs/cfg${mac}.xml`,
      '/gs/cfggrp2601.xml',
      '/gs/cfg.xml',
      `/gs/${mac}/cfg.xml`,
    ])('%s', async (path) => {
      const guard = buildGuard();
      const { context } = buildContext(path, basic);

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });

  it('rejects and logs when provisioning credentials are missing after restart', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const vault = {
      resolveProvHttp: jest.fn().mockResolvedValue(null),
    };
    const orchestrator = {
      lookupMac: jest.fn().mockResolvedValue({ tenantId: 't1', deviceId: 'd1', mac }),
      quarantineUnknownMac: jest.fn(),
    };
    const guard = new ProvMacAuthGuard(vault as never, orchestrator as never);
    const { context } = buildContext(`/gs/${mac}/cfg.xml`, `Basic ${Buffer.from(`${mac}:x`).toString('base64')}`);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(vault.resolveProvHttp).toHaveBeenCalledWith(mac);
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(String(warn.mock.calls[0]?.[0])) as {
      event: string;
      mac: string;
      deviceId: string;
      tenantId: string;
      requestId: string;
    };
    expect(logged).toMatchObject({
      event: 'provisioning.credentials.missing',
      mac,
      deviceId: 'd1',
      tenantId: 't1',
    });
    expect(logged.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    warn.mockRestore();
  });
});

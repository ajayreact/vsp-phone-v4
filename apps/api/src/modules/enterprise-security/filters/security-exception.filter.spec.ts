import { BadRequestException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SecurityExceptionFilter } from './security-exception.filter';

describe('SecurityExceptionFilter', () => {
  function mockHost(path = '/api/v1/tenant/devices') {
    const json = jest.fn();
    const setHeader = jest.fn();
    const status = jest.fn().mockReturnValue({ json, setHeader });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ headersSent: false, status, setHeader }),
        getRequest: () => ({
          originalUrl: path,
          url: path,
          method: 'POST',
          requestId: 'req-test-123',
        }),
      }),
    };
    return { filter: new SecurityExceptionFilter(), json, status, setHeader, host };
  }

  it('returns structured JSON for validation errors', () => {
    const { filter, json, status, host } = mockHost();

    expect(() =>
      filter.catch(new BadRequestException('Device is not assigned to an extension'), host as never),
    ).not.toThrow();

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: expect.any(String),
        message: expect.any(String),
        requestId: 'req-test-123',
        timestamp: expect.any(String),
      }),
    );
  });

  it('maps Prisma P2002 MAC conflict to 409 MAC_ALREADY_EXISTS', () => {
    const { filter, json, status, host } = mockHost();
    const prismaErr = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['tenant_id', 'mac_address'] },
    });

    filter.catch(prismaErr, host as never);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'MAC_ALREADY_EXISTS',
        field: 'macAddress',
        message: expect.stringContaining('MAC address'),
      }),
    );
  });

  it('returns JSON for unexpected errors without leaking internals', () => {
    const { filter, json, status, host } = mockHost();

    filter.catch(new TypeError("Cannot read properties of undefined (reading 'replace')"), host as never);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'INTERNAL_ERROR',
        message: expect.not.stringMatching(/undefined|TypeError/i),
      }),
    );
  });
});

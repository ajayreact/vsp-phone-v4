import { BadRequestException, HttpStatus } from '@nestjs/common';
import { SecurityExceptionFilter } from './security-exception.filter';

describe('SecurityExceptionFilter', () => {
  it('always returns JSON and never throws while logging', () => {
    const filter = new SecurityExceptionFilter();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ headersSent: false, status }),
        getRequest: () => ({
          originalUrl: '/api/v1/tenant/devices',
          url: '/api/v1/tenant/devices',
          method: 'POST',
        }),
      }),
    };

    expect(() =>
      filter.catch(new BadRequestException('MAC address already in use'), host as never),
    ).not.toThrow();

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: expect.any(String),
        timestamp: expect.any(String),
      }),
    );
  });

  it('returns JSON for unexpected errors (Add Device 500 path)', () => {
    const filter = new SecurityExceptionFilter();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ headersSent: false, status }),
        getRequest: () => ({
          originalUrl: '/api/v1/tenant/devices',
          url: '/api/v1/tenant/devices',
          method: 'POST',
        }),
      }),
    };

    filter.catch(new TypeError("Cannot read properties of undefined (reading 'replace')"), host as never);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
      }),
    );
  });
});

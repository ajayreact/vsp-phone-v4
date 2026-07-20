import { BadRequestException, ConflictException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { mapException } from './error-mapper';

describe('error-mapper', () => {
  it('maps login invalid credentials to INVALID_CREDENTIALS', () => {
    const mapped = mapException(new UnauthorizedException('Invalid credentials'));
    expect(mapped.status).toBe(401);
    expect(mapped.code).toBe('INVALID_CREDENTIALS');
    expect(mapped.message).toBe('Invalid email or password.');
  });

  it('maps account lockout', () => {
    const mapped = mapException(new UnauthorizedException('Account temporarily locked'));
    expect(mapped.code).toBe('ACCOUNT_LOCKED');
    expect(mapped.message).toContain('Too many failed login attempts');
  });

  it('maps Prisma P2002 mac_address to MAC_ALREADY_EXISTS', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['tenant_id', 'mac_address'] },
    });
    const mapped = mapException(err);
    expect(mapped.status).toBe(409);
    expect(mapped.code).toBe('MAC_ALREADY_EXISTS');
    expect(mapped.field).toBe('macAddress');
  });

  it('sanitizes prisma leak in unknown errors', () => {
    const mapped = mapException(new Error('PrismaClientKnownRequestError: P2002'));
    expect(mapped.code).toBe('INTERNAL_ERROR');
    expect(mapped.message).not.toMatch(/prisma/i);
  });

  it('passes through structured HttpException bodies', () => {
    const mapped = mapException(
      new ConflictException({
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'This email address is already in use.',
        field: 'email',
        details: null,
      }),
    );
    expect(mapped.code).toBe('EMAIL_ALREADY_EXISTS');
    expect(mapped.field).toBe('email');
  });

  it('maps invalid MAC business message to 422', () => {
    const mapped = mapException(new BadRequestException('Invalid MAC address'));
    expect(mapped.status).toBe(422);
    expect(mapped.code).toBe('INVALID_MAC_ADDRESS');
    expect(mapped.field).toBe('macAddress');
  });
});

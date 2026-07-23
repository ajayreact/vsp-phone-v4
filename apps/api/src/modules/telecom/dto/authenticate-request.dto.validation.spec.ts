import { BadRequestException, UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from '../../../common/errors/validation-exception.factory';
import { AuthenticateRequestDto } from './telecom.request.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  exceptionFactory: validationExceptionFactory,
});

const PROBE = {
  aor: 'sip:100@sip.vspphone.com',
  username: '100',
  realm: 'sip.vspphone.com',
  nonce: 'test',
  response: '00',
  method: 'REGISTER',
  uri: 'sip:sip.vspphone.com',
  srcIp: '127.0.0.1',
};

describe('AuthenticateRequestDto validation (RC1 sip-digest probe)', () => {
  it('accepts Kamailio/curl probe payload', async () => {
    const result = await pipe.transform(PROBE, { type: 'body', metatype: AuthenticateRequestDto, data: '' });
    expect(result).toMatchObject(PROBE);
  });

  it('returns 422 for empty required field', async () => {
    await expect(
      pipe.transform({ ...PROBE, username: '' }, { type: 'body', metatype: AuthenticateRequestDto, data: '' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('returns 422 for unknown property (forbidNonWhitelisted + custom exceptionFactory)', async () => {
    await expect(
      pipe.transform({ ...PROBE, authorization: 'Digest x' }, { type: 'body', metatype: AuthenticateRequestDto, data: '' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('returns 422 for empty body object (missing required fields)', async () => {
    await expect(pipe.transform({}, { type: 'body', metatype: AuthenticateRequestDto, data: '' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});

import { envKeys, getEnv, getEnvNumber } from './config';

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('reads required environment variables', () => {
    process.env.TEST_KEY = 'value';
    expect(getEnv('TEST_KEY')).toBe('value');
  });

  it('returns numeric environment variables', () => {
    process.env[envKeys.port] = '3000';
    expect(getEnvNumber(envKeys.port)).toBe(3000);
  });
});

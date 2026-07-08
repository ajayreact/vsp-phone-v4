import { createLogger } from './logger';

describe('logger', () => {
  it('creates a logger with context', () => {
    const logger = createLogger({ context: 'test' });
    expect(typeof logger.info).toBe('function');
  });
});

import { APP_NAME } from './lib/common';

describe('common', () => {
  it('exposes the application name constant', () => {
    expect(APP_NAME).toBe('VSP Phone v4');
  });
});

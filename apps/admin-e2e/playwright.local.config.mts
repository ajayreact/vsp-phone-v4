import { defineConfig, devices } from '@playwright/test';

/** Use when admin dev server is already running on :3001 */
export default defineConfig({
  testDir: './src',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'on',
  },
  outputDir: '../../static/runtime-verification/playwright/test-results',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

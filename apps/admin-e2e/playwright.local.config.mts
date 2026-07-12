import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(import.meta.dirname, '../../.env') });

/** Use when admin dev server is already running on :3001, or against deployed tenant URL */
export default defineConfig({
  testDir: './src',
  timeout: 180_000,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'on',
  },
  outputDir: '../../static/runtime-verification/playwright/test-results',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

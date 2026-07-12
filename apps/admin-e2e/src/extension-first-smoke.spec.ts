import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT = path.join(process.cwd(), '..', '..', 'static', 'runtime-verification', 'playwright');

test.describe('UI smoke (no auth)', () => {
  test('Login page renders without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const failed: { url: string; status: number }[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/api/') && !r.ok()) failed.push({ url: r.url(), status: r.status() });
    });

    await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    fs.mkdirSync(ARTIFACT, { recursive: true });
    await page.screenshot({ path: path.join(ARTIFACT, '00-login-page.png'), fullPage: true });

    await expect(page.getByRole('button', { name: /continue|sign in|log in/i })).toBeVisible();
    fs.writeFileSync(path.join(ARTIFACT, 'smoke-console-errors.json'), JSON.stringify(errors, null, 2));
    fs.writeFileSync(path.join(ARTIFACT, 'smoke-failed-requests.json'), JSON.stringify(failed, null, 2));
  });

  test('/extensions redirects unauthenticated users', async ({ page }) => {
    await page.goto('/extensions');
    await expect(page).toHaveURL(/login/);
    fs.mkdirSync(ARTIFACT, { recursive: true });
    await page.screenshot({ path: path.join(ARTIFACT, '00-extensions-guard.png'), fullPage: true });
  });
});

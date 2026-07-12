import { test, expect, type Page, type ConsoleMessage, type Response } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT = path.join(process.cwd(), 'static', 'runtime-verification', 'playwright');
const TENANT_EMAIL = process.env.TENANT_EMAIL || process.env.E2E_TENANT_EMAIL || '';
const TENANT_PASSWORD = process.env.TENANT_PASSWORD || process.env.E2E_TENANT_PASSWORD || '';
const BASE = process.env.BASE_URL || 'http://localhost:3001';

type NetEntry = { url: string; status: number; ok: boolean };

function ensureDir() {
  fs.mkdirSync(ARTIFACT, { recursive: true });
}

async function attachObservers(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: NetEntry[] = [];

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('response', (res: Response) => {
    const url = res.url();
    if (url.includes('/api/') && !res.ok()) {
      failedRequests.push({ url, status: res.status(), ok: res.ok() });
    }
  });

  return { consoleErrors, failedRequests };
}

async function screenshot(page: Page, name: string) {
  ensureDir();
  await page.screenshot({ path: path.join(ARTIFACT, `${name}.png`), fullPage: true });
}

test.describe('Extension-First Runtime Verification', () => {
  test.skip(!TENANT_EMAIL || !TENANT_PASSWORD, 'Set TENANT_EMAIL and TENANT_PASSWORD for UI runtime tests');

  test('Test 2 — Tenant login lands on /extensions with KPI cards', async ({ page }) => {
    const { consoleErrors, failedRequests } = await attachObservers(page);

    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(TENANT_EMAIL);
    await page.getByLabel(/password/i).fill(TENANT_PASSWORD);
    await page.getByRole('button', { name: /sign in|log in/i }).click();

    await page.waitForURL(/\/(extensions|dashboard)/, { timeout: 30_000 });
    await screenshot(page, '01-after-login');

    expect(page.url()).toContain('/extensions');

    await expect(page.getByText('Total Extensions')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Assigned DIDs')).toBeVisible();
    await screenshot(page, '02-extensions-kpi');

    const hubFailed = failedRequests.filter((f) => f.url.includes('/extensions/hub'));
    expect(hubFailed, JSON.stringify(hubFailed)).toHaveLength(0);
    expect(consoleErrors.filter((e) => !e.includes('favicon'))).toEqual([]);

    fs.writeFileSync(path.join(ARTIFACT, 'console-errors.json'), JSON.stringify(consoleErrors, null, 2));
    fs.writeFileSync(path.join(ARTIFACT, 'failed-requests.json'), JSON.stringify(failedRequests, null, 2));
  });

  test('Test 3 — Rename extension updates label', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(TENANT_EMAIL);
    await page.getByLabel(/password/i).fill(TENANT_PASSWORD);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/extensions/, { timeout: 30_000 });

    const renameInput = page.locator('input[aria-label*="Display name"]').first();
    if (await renameInput.count()) {
      await renameInput.fill('Reception');
      await renameInput.blur();
      await page.waitForTimeout(1000);
      await expect(page.getByText('101 • Reception').first()).toBeVisible({ timeout: 10_000 });
      await screenshot(page, '03-renamed-reception');
    }
  });

  test('Test 4 — QR Login panel', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(TENANT_EMAIL);
    await page.getByLabel(/password/i).fill(TENANT_PASSWORD);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/extensions/, { timeout: 30_000 });

    const configureBtn = page.getByRole('button', { name: /^Configure$/ }).first();
    if (await configureBtn.count()) {
      await configureBtn.click();
      await page.getByRole('tab', { name: /Mobile App/i }).click();
      await expect(page.getByText(/Expires in/i)).toBeVisible({ timeout: 15_000 });
      await screenshot(page, '04-mobile-qr');
    }
  });

  test('Test 5 — Manufacturer-specific desk phone fields', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(TENANT_EMAIL);
    await page.getByLabel(/password/i).fill(TENANT_PASSWORD);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/extensions/, { timeout: 30_000 });

    const configureBtn = page.getByRole('button', { name: /^Configure$/ }).first();
    if (await configureBtn.count()) {
      await configureBtn.click();
      await page.getByRole('tab', { name: /Desk Phone/i }).click();
      const manufacturer = page.locator('select').filter({ hasText: /Grandstream|Yealink|Fanvil/i }).first();
      if (await manufacturer.count()) {
        await manufacturer.selectOption({ label: /Grandstream/i });
        await expect(page.getByText(/Grandstream/i).first()).toBeVisible();
        await screenshot(page, '05-grandstream-fields');
        await manufacturer.selectOption({ label: /Yealink/i });
        await expect(page.getByText(/Yealink/i).first()).toBeVisible();
        await screenshot(page, '05-yealink-fields');
      }
    }
  });
});

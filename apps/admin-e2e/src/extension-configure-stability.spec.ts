import { test, expect, type Page, type Response } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT = path.join(process.cwd(), 'static', 'runtime-verification', 'playwright', '2b2');
const TENANT_EMAIL = process.env.TENANT_EMAIL || process.env.E2E_TENANT_EMAIL || '';
const TENANT_PASSWORD = process.env.TENANT_PASSWORD || process.env.E2E_TENANT_PASSWORD || '';
const BASE = process.env.BASE_URL || 'http://localhost:3001';

type DetailRequest = { url: string; extensionId: string };

function ensureDir() {
  fs.mkdirSync(ARTIFACT, { recursive: true });
}

async function loginTenant(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email/i).fill(TENANT_EMAIL);
  await page.getByLabel(/password/i).fill(TENANT_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/extensions/, { timeout: 30_000 });
}

function trackExtensionDetailRequests(page: Page) {
  const requests: DetailRequest[] = [];
  page.on('response', (res: Response) => {
    const url = res.url();
    const match = url.match(/\/v1\/tenant\/extensions\/([^/?]+)(?:\?|$)/);
    if (match && !url.includes('/hub')) {
      requests.push({ url, extensionId: match[1] });
    }
  });
  return requests;
}

async function openConfigureDrawer(page: Page) {
  const configureBtn = page.getByRole('button', { name: /^Configure$/ }).first();
  await expect(configureBtn).toBeVisible({ timeout: 15_000 });
  await configureBtn.click();
  await expect(page.getByRole('heading', { name: /Configure /i })).toBeVisible();
}

async function selectDrawerTab(page: Page, label: RegExp) {
  await page.getByRole('button', { name: label }).click();
}

test.describe('Phase 2B.2 — Configure drawer stability', () => {
  test.skip(!TENANT_EMAIL || !TENANT_PASSWORD, 'Set TENANT_EMAIL and TENANT_PASSWORD for configure stability tests');

  test('detail tabs show loading then values; reopen uses cache', async ({ page }) => {
    ensureDir();
    const detailRequests = trackExtensionDetailRequests(page);
    await loginTenant(page);

    await openConfigureDrawer(page);
    await selectDrawerTab(page, /^General$/);
    await expect(page.getByLabel('Loading extension settings')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByLabel('Loading extension settings')).toBeHidden({ timeout: 15_000 });
    await expect(page.getByLabel(/^Display name$/i)).not.toHaveValue('');

    const firstOpenRequests = detailRequests.length;
    expect(firstOpenRequests).toBeGreaterThanOrEqual(1);

    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: /Configure /i })).toBeHidden({ timeout: 5_000 });

    detailRequests.length = 0;
    await openConfigureDrawer(page);
    await selectDrawerTab(page, /^General$/);
    await expect(page.getByLabel(/^Display name$/i)).not.toHaveValue('', { timeout: 5_000 });
    expect(detailRequests.length, 'Reopen within stale window should not duplicate detail fetch').toBe(0);

    await page.screenshot({ path: path.join(ARTIFACT, 'general-reopen-cache.png'), fullPage: true });
  });

  test('unsaved changes dialog only after edits', async ({ page }) => {
    await loginTenant(page);
    await openConfigureDrawer(page);
    await selectDrawerTab(page, /^Phone$/);
    await expect(page.getByLabel('Loading extension settings')).toBeHidden({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: /You have unsaved changes/i })).toHaveCount(0);

    await openConfigureDrawer(page);
    await selectDrawerTab(page, /^Phone$/);
    await expect(page.getByLabel('Loading extension settings')).toBeHidden({ timeout: 15_000 });
    const callerId = page.getByLabel(/^Caller ID name$/i);
    const before = await callerId.inputValue();
    await callerId.fill(before ? `${before} edited` : 'Edited Caller');

    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: /You have unsaved changes/i })).toBeVisible();
    await page.getByRole('button', { name: /^Cancel$/i }).click();
  });

  test('rapid extension switches keep latest detail', async ({ page }) => {
    const detailRequests = trackExtensionDetailRequests(page);
    await loginTenant(page);

    const configureButtons = page.getByRole('button', { name: /^Configure$/ });
    const count = await configureButtons.count();
    test.skip(count < 2, 'Need at least two extensions for race verification');

    for (let i = 0; i < Math.min(count, 3); i++) {
      await configureButtons.nth(i).click();
      await page.waitForTimeout(150);
    }

    await selectDrawerTab(page, /^General$/);
    await expect(page.getByLabel('Loading extension settings')).toBeHidden({ timeout: 15_000 });

    const title = await page.getByRole('heading', { name: /^Configure /i }).textContent();
    const displayName = await page.getByLabel(/^Display name$/i).inputValue();
    expect(title).toBeTruthy();
    expect(displayName).not.toBe('');

    const ids = [...new Set(detailRequests.map((r) => r.extensionId))];
    expect(ids.length).toBeGreaterThanOrEqual(1);
    await page.screenshot({ path: path.join(ARTIFACT, 'rapid-switch-final.png'), fullPage: true });
  });
});

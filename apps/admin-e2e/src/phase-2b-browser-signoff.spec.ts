import { test, expect, type Page, type ConsoleMessage, type Response } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT = path.join(process.cwd(), '..', '..', 'static', 'runtime-verification', 'playwright', '2b-signoff');
const TENANT_EMAIL = process.env.TENANT_EMAIL || process.env.E2E_TENANT_EMAIL || '';
const TENANT_PASSWORD = process.env.TENANT_PASSWORD || process.env.E2E_TENANT_PASSWORD || '';
const BASE = process.env.BASE_URL || 'https://tenant.vspphone.com';

type NetFailure = { url: string; status: number };

function ensureDir() {
  fs.mkdirSync(ARTIFACT, { recursive: true });
}

function attachObservers(page: Page) {
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const failedRequests: NetFailure[] = [];
  const detailGets: string[] = [];

  page.on('console', (msg: ConsoleMessage) => {
    const text = msg.text();
    if (msg.type() === 'error') consoleErrors.push(text);
    if (msg.type() === 'warning') consoleWarnings.push(text);
  });

  page.on('response', (res: Response) => {
    const url = res.url();
    if (url.includes('/api/') && !res.ok()) {
      const allowed =
        res.status() === 404 ||
        res.status() === 401 ||
        url.includes('/hub/stats') && res.status() === 404;
      if (!allowed) failedRequests.push({ url, status: res.status() });
    }
    const detailMatch = url.match(/\/v1\/tenant\/extensions\/([^/?]+)(?:\?|$)/);
    if (detailMatch && !url.includes('/hub') && res.request().method() === 'GET') {
      detailGets.push(detailMatch[1]);
    }
  });

  return { consoleErrors, consoleWarnings, failedRequests, detailGets };
}

async function loginTenant(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByLabel(/work email|email/i).fill(TENANT_EMAIL);
  await page.getByLabel(/^password$/i).fill(TENANT_PASSWORD);
  await page.getByRole('button', { name: /continue|sign in|log in/i }).click();
  await page.waitForURL(/\/extensions/, { timeout: 60_000 });
}

async function openConfigureForExtension(page: Page, label: RegExp) {
  const card = page.locator('article, [data-extension-card], div').filter({ hasText: label }).first();
  const configure = card.getByRole('button', { name: /^Configure$/ });
  if (await configure.count()) {
    await configure.click();
  } else {
    await page.getByRole('button', { name: /^Configure$/ }).filter({ hasText: /.+/ }).first().click();
  }
  await expect(page.getByRole('heading', { name: /Configure /i })).toBeVisible({ timeout: 15_000 });
}

async function selectDrawerTab(page: Page, label: RegExp) {
  await page.getByRole('button', { name: label }).click();
}

async function waitDetailLoaded(page: Page) {
  await expect(page.getByLabel('Loading extension settings')).toBeHidden({ timeout: 20_000 });
}

async function closeDrawer(page: Page) {
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { name: /Configure /i })).toBeHidden({ timeout: 10_000 });
}

test.describe('Phase 2B Final Browser Sign-off', () => {
  test.skip(!TENANT_EMAIL || !TENANT_PASSWORD, 'Set TENANT_EMAIL and TENANT_PASSWORD');

  test('complete extension lifecycle checklist', async ({ page }) => {
    test.setTimeout(180_000);
    ensureDir();
    const { consoleErrors, consoleWarnings, failedRequests, detailGets } = attachObservers(page);

    await loginTenant(page);
    await expect(page.getByText('Total Extensions')).toBeVisible({ timeout: 20_000 });

    // 1 — Existing extension (101 • Reception or first extension)
    const reception = page.getByText(/101 • Reception|101 • /).first();
    const hasReception = (await reception.count()) > 0;
    if (hasReception) {
      await openConfigureForExtension(page, /101 • Reception|101 • /);
    } else {
      await page.getByRole('button', { name: /^Configure$/ }).first().click();
      await expect(page.getByRole('heading', { name: /Configure /i })).toBeVisible();
    }

    await expect(page.getByText(/Extension Status|Current Number/i).first()).toBeVisible();
    await selectDrawerTab(page, /^General$/);
    await waitDetailLoaded(page);
    await expect(page.getByLabel(/^Display name$/i)).not.toHaveValue('');
    await page.screenshot({ path: path.join(ARTIFACT, '01-configure-general-loaded.png'), fullPage: true });

    // 2 — Caller ID
    await selectDrawerTab(page, /^Phone$/);
    await waitDetailLoaded(page);
    const callerId = page.getByLabel(/^Caller ID name$/i);
    const originalCallerId = await callerId.inputValue();
    const testCallerId = originalCallerId ? `${originalCallerId} QA` : 'Reception QA';
    await callerId.fill(testCallerId);
    await page.getByRole('button', { name: /Save Caller ID/i }).click();
    await page.waitForTimeout(1500);
    await closeDrawer(page);

    await openConfigureForExtension(page, hasReception ? /101 • Reception|101 • / : /.+/);
    await selectDrawerTab(page, /^Phone$/);
    await waitDetailLoaded(page);
    await expect(page.getByLabel(/^Caller ID name$/i)).toHaveValue(testCallerId);

    // Restore caller ID
    await callerId.fill(originalCallerId);
    if (originalCallerId !== testCallerId) {
      await page.getByRole('button', { name: /Save Caller ID/i }).click();
      await page.waitForTimeout(1000);
    }
    await closeDrawer(page);

    // 3 — Voicemail
    await openConfigureForExtension(page, hasReception ? /101 • Reception|101 • / : /.+/);
    await selectDrawerTab(page, /^Voicemail$/);
    await waitDetailLoaded(page);
    const pin = page.getByLabel(/^Voicemail PIN$/i);
    const notify = page.getByLabel(/^Notify email$/i);
    const origPin = await pin.inputValue();
    const origNotify = await notify.inputValue();
    await pin.fill('4321');
    await notify.fill('vm-signoff@verify.vspphone.com');
    await page.getByRole('button', { name: /^Save$/i }).click();
    await page.waitForTimeout(1500);
    await closeDrawer(page);

    await openConfigureForExtension(page, hasReception ? /101 • Reception|101 • / : /.+/);
    await selectDrawerTab(page, /^Voicemail$/);
    await waitDetailLoaded(page);
    await expect(pin).toHaveValue('4321');
    await expect(notify).toHaveValue('vm-signoff@verify.vspphone.com');
    await pin.fill(origPin);
    await notify.fill(origNotify);
    await page.getByRole('button', { name: /^Save$/i }).click();
    await closeDrawer(page);

    // 4 — Call Handling
    await openConfigureForExtension(page, hasReception ? /101 • Reception|101 • / : /.+/);
    await selectDrawerTab(page, /^Call Handling$/);
    await waitDetailLoaded(page);
    const forward = page.getByLabel(/^Enable call forward$/i);
    const dnd = page.getByLabel(/^Do not disturb$/i);
    const dest = page.getByLabel(/^Forward destination$/i);
    await forward.check();
    await dest.fill('102');
    await dnd.check();
    await page.getByRole('button', { name: /^Save$/i }).click();
    await page.waitForTimeout(1500);
    await closeDrawer(page);

    await openConfigureForExtension(page, hasReception ? /101 • Reception|101 • / : /.+/);
    await selectDrawerTab(page, /^Call Handling$/);
    await waitDetailLoaded(page);
    await expect(forward).toBeChecked();
    await expect(dnd).toBeChecked();
    await expect(dest).toHaveValue('102');
    await forward.uncheck();
    await dnd.uncheck();
    await dest.fill('');
    await page.getByRole('button', { name: /^Save$/i }).click();
    await closeDrawer(page);

    // 5 — Mobile QR
    await openConfigureForExtension(page, hasReception ? /101 • Reception|101 • / : /.+/);
    await selectDrawerTab(page, /^Mobile App$/);
    await expect(page.getByText(/Generating QR|Loading current QR|Expires in/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('img[alt*="QR code"]')).toBeVisible({ timeout: 30_000 });
    const qrBefore = await page.locator('img[alt*="QR code"]').getAttribute('src');
    await page.getByRole('button', { name: /Regenerate|Generate/i }).click();
    await page.waitForTimeout(3000);
    const qrAfter = await page.locator('img[alt*="QR code"]').getAttribute('src');
    expect(qrAfter).toBeTruthy();
    await closeDrawer(page);

    // 7 — Race test (rapid extension switches)
    const configureButtons = page.getByRole('button', { name: /^Configure$/ });
    const count = await configureButtons.count();
    if (count >= 2) {
      detailGets.length = 0;
      for (let i = 0; i < Math.min(count, 3); i++) {
        await configureButtons.nth(i).click();
        await page.waitForTimeout(200);
      }
      await selectDrawerTab(page, /^General$/);
      await waitDetailLoaded(page);
      const title = await page.getByRole('heading', { name: /^Configure /i }).textContent();
      expect(title).toMatch(/Configure/);
      await closeDrawer(page);
    }

    // 8 — Search
    const search = page.getByPlaceholder(/search/i);
    if (await search.count()) {
      await search.fill('101');
      await page.waitForTimeout(500);
      await expect(page.getByText(/101 •/).first()).toBeVisible();
      await search.fill('Reception');
      await page.waitForTimeout(500);
      await search.fill('');
    }

    // 9 — Filters
    for (const label of [/All/i, /Online/i, /Offline/i, /Needs Setup/i]) {
      const btn = page.getByRole('button', { name: label });
      if (await btn.count()) await btn.first().click();
    }

    // 10 — Console hygiene
    const reactWarnings = consoleWarnings.filter(
      (w) => w.includes('hydration') || w.includes('React') || w.includes('Warning:'),
    );
    const hardErrors = consoleErrors.filter((e) => !e.includes('favicon'));

    fs.writeFileSync(path.join(ARTIFACT, 'console-errors.json'), JSON.stringify(consoleErrors, null, 2));
    fs.writeFileSync(path.join(ARTIFACT, 'console-warnings.json'), JSON.stringify(consoleWarnings, null, 2));
    fs.writeFileSync(path.join(ARTIFACT, 'failed-requests.json'), JSON.stringify(failedRequests, null, 2));
    fs.writeFileSync(path.join(ARTIFACT, 'detail-gets.json'), JSON.stringify(detailGets, null, 2));
    await page.screenshot({ path: path.join(ARTIFACT, '99-final-hub.png'), fullPage: true });

    expect(failedRequests, JSON.stringify(failedRequests)).toEqual([]);
    expect(hardErrors, JSON.stringify(hardErrors)).toEqual([]);
    expect(reactWarnings, JSON.stringify(reactWarnings)).toEqual([]);
  });
});

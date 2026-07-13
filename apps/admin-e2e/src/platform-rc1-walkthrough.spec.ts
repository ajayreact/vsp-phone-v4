import { test, expect, type Page, type ConsoleMessage, type Response } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BROWSER_TAG = process.env.PW_BROWSER_TAG || 'chromium';
const ARTIFACT = path.join(
  process.cwd(),
  '..',
  '..',
  'static',
  'runtime-verification',
  'playwright',
  'platform-rc1',
  BROWSER_TAG,
);
const PLATFORM_EMAIL = process.env.PLATFORM_EMAIL || '';
const PLATFORM_PASSWORD = process.env.PLATFORM_PASSWORD || '';
const BASE = process.env.BASE_URL || 'https://admin.vspphone.com';

type NetFailure = { url: string; status: number };

function ensureDir() {
  fs.mkdirSync(ARTIFACT, { recursive: true });
}

/** Routes claimed reachable on the Platform Admin portal per the RC1 handoff. */
const ROUTES: { path: string; label: string }[] = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/tenants', label: 'Tenants' },
  { path: '/users', label: 'Users' },
  { path: '/roles', label: 'Roles' },
  { path: '/permissions', label: 'Permissions' },
  { path: '/api-keys', label: 'API Keys' },
  { path: '/carriers', label: 'Carriers' },
  { path: '/trunks', label: 'SIP Trunks' },
  { path: '/billing', label: 'Billing' },
  { path: '/audit-logs', label: 'Audit Logs' },
  { path: '/settings', label: 'Settings' },
  { path: '/system-health', label: 'Health' },
];

/** Routes the handoff describes but which may not exist in this deployed build — verify actual behavior. */
const SUSPECT_ROUTES: { path: string; label: string }[] = [
  { path: '/provisioning', label: 'Provisioning Workspace' },
  { path: '/did-inventory', label: 'DID Inventory' },
];

function attachObservers(page: Page) {
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const failedRequests: NetFailure[] = [];

  page.on('console', (msg: ConsoleMessage) => {
    const text = msg.text();
    if (msg.type() === 'error') consoleErrors.push(text);
    if (msg.type() === 'warning') consoleWarnings.push(text);
  });

  page.on('response', (res: Response) => {
    const url = res.url();
    const status = res.status();
    // 401 = expected auth-guard probe; 304 = normal conditional-GET cache revalidation, not a failure.
    if (url.includes('/api/') && !res.ok() && status !== 401 && status !== 304) {
      failedRequests.push({ url, status });
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(`[pageerror] ${err.message}`);
  });

  return { consoleErrors, consoleWarnings, failedRequests };
}

async function loginPlatform(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 60_000 });
  // NOTE: clicking Continue before React hydrates falls through to a native
  // form GET submit (full page reload, login silently discarded — see DEFECT
  // in the RC1 walkthrough report). Wait for hydration to settle first.
  await page.waitForTimeout(2000);
  await page.getByLabel(/email/i).fill(PLATFORM_EMAIL);
  await page.getByLabel(/^password$/i).fill(PLATFORM_PASSWORD);
  await page.getByRole('button', { name: /continue|sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

test.describe('Platform RC1 Browser Walkthrough', () => {
  test.skip(!PLATFORM_EMAIL || !PLATFORM_PASSWORD, 'Set PLATFORM_EMAIL and PLATFORM_PASSWORD');

  test('login lands on platform dashboard', async ({ page }) => {
    ensureDir();
    const { consoleErrors, failedRequests } = attachObservers(page);
    await loginPlatform(page);
    await page.screenshot({ path: path.join(ARTIFACT, '00-dashboard-after-login.png'), fullPage: true });
    fs.writeFileSync(
      path.join(ARTIFACT, 'login-report.json'),
      JSON.stringify({ url: page.url(), consoleErrors, failedRequests }, null, 2),
    );
    expect(page.url()).toContain('/dashboard');
  });

  for (const route of ROUTES) {
    test(`page: ${route.label} (${route.path})`, async ({ page }) => {
      ensureDir();
      const { consoleErrors, consoleWarnings, failedRequests } = attachObservers(page);
      await loginPlatform(page);

      await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle', timeout: 45_000 });
      await page.waitForTimeout(1500); // settle hydration + late queries

      const bodyText = await page.locator('body').innerText().catch(() => '');
      const finalUrl = page.url();
      const is404 =
        /page could not be found|404/i.test(bodyText) && !route.path.includes('audit');
      const redirected = !finalUrl.includes(route.path);

      const slug = route.path.replace(/\//g, '_');
      await page.screenshot({ path: path.join(ARTIFACT, `${slug}.png`), fullPage: true });

      const report = {
        route: route.path,
        label: route.label,
        finalUrl,
        redirected,
        is404,
        consoleErrors,
        consoleWarnings: consoleWarnings.filter((w) => /hydrat/i.test(w)),
        failedRequests,
      };
      fs.writeFileSync(path.join(ARTIFACT, `${slug}.json`), JSON.stringify(report, null, 2));

      // Soft assertions — this test intentionally does not fail the run; the report is the deliverable.
      test.info().annotations.push({ type: 'report', description: JSON.stringify(report) });
    });
  }

  for (const route of SUSPECT_ROUTES) {
    test(`suspect route: ${route.label} (${route.path})`, async ({ page }) => {
      ensureDir();
      const { consoleErrors, failedRequests } = attachObservers(page);
      await loginPlatform(page);

      await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle', timeout: 45_000 });
      await page.waitForTimeout(1000);

      const finalUrl = page.url();
      const slug = route.path.replace(/\//g, '_');
      await page.screenshot({ path: path.join(ARTIFACT, `suspect${slug}.png`), fullPage: true });

      const report = { route: route.path, label: route.label, finalUrl, consoleErrors, failedRequests };
      fs.writeFileSync(path.join(ARTIFACT, `suspect${slug}.json`), JSON.stringify(report, null, 2));
      test.info().annotations.push({ type: 'report', description: JSON.stringify(report) });
    });
  }
});

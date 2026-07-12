# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase-2b-browser-signoff.spec.ts >> Phase 2B Final Browser Sign-off >> complete extension lifecycle checklist
- Location: src\phase-2b-browser-signoff.spec.ts:81:7

# Error details

```
TimeoutError: page.waitForURL: Timeout 60000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e4]:
        - img [ref=e6]
        - generic [ref=e8]: VSP Phone
      - generic [ref=e9]:
        - heading "Enterprise cloud phone administration" [level=1] [ref=e10]
        - paragraph [ref=e11]: Manage extensions, devices, routing, and analytics from one unified console.
      - paragraph [ref=e12]: © VSP Phone v4
    - generic [ref=e16]:
      - generic [ref=e17]:
        - img [ref=e19]
        - generic [ref=e21]:
          - heading "Sign in" [level=2] [ref=e22]
          - paragraph [ref=e23]: VSP Phone Operations Center
      - generic [ref=e24]:
        - generic [ref=e25]:
          - text: Work email
          - textbox "Work email" [ref=e26]:
            - /placeholder: you@company.com
            - text: admin+signoff-mrhyi0kt@verify.vspphone.com
        - generic [ref=e27]:
          - text: Password
          - textbox "Password" [ref=e28]: Signoff!c82a5494
        - generic [ref=e29]: Failed to fetch
        - button "Continue" [ref=e30] [cursor=pointer]
  - button "Open Next.js Dev Tools" [ref=e36] [cursor=pointer]:
    - img [ref=e37]
  - alert [ref=e40]
```

# Test source

```ts
  1   | import { test, expect, type Page, type ConsoleMessage, type Response } from '@playwright/test';
  2   | import fs from 'node:fs';
  3   | import path from 'node:path';
  4   | 
  5   | const ARTIFACT = path.join(process.cwd(), '..', '..', 'static', 'runtime-verification', 'playwright', '2b-signoff');
  6   | const TENANT_EMAIL = process.env.TENANT_EMAIL || process.env.E2E_TENANT_EMAIL || '';
  7   | const TENANT_PASSWORD = process.env.TENANT_PASSWORD || process.env.E2E_TENANT_PASSWORD || '';
  8   | const BASE = process.env.BASE_URL || 'https://tenant.vspphone.com';
  9   | 
  10  | type NetFailure = { url: string; status: number };
  11  | 
  12  | function ensureDir() {
  13  |   fs.mkdirSync(ARTIFACT, { recursive: true });
  14  | }
  15  | 
  16  | function attachObservers(page: Page) {
  17  |   const consoleErrors: string[] = [];
  18  |   const consoleWarnings: string[] = [];
  19  |   const failedRequests: NetFailure[] = [];
  20  |   const detailGets: string[] = [];
  21  | 
  22  |   page.on('console', (msg: ConsoleMessage) => {
  23  |     const text = msg.text();
  24  |     if (msg.type() === 'error') consoleErrors.push(text);
  25  |     if (msg.type() === 'warning') consoleWarnings.push(text);
  26  |   });
  27  | 
  28  |   page.on('response', (res: Response) => {
  29  |     const url = res.url();
  30  |     if (url.includes('/api/') && !res.ok()) {
  31  |       const allowed =
  32  |         res.status() === 404 ||
  33  |         res.status() === 401 ||
  34  |         url.includes('/hub/stats') && res.status() === 404;
  35  |       if (!allowed) failedRequests.push({ url, status: res.status() });
  36  |     }
  37  |     const detailMatch = url.match(/\/v1\/tenant\/extensions\/([^/?]+)(?:\?|$)/);
  38  |     if (detailMatch && !url.includes('/hub') && res.request().method() === 'GET') {
  39  |       detailGets.push(detailMatch[1]);
  40  |     }
  41  |   });
  42  | 
  43  |   return { consoleErrors, consoleWarnings, failedRequests, detailGets };
  44  | }
  45  | 
  46  | async function loginTenant(page: Page) {
  47  |   await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  48  |   await page.getByLabel(/work email|email/i).fill(TENANT_EMAIL);
  49  |   await page.getByLabel(/^password$/i).fill(TENANT_PASSWORD);
  50  |   await page.getByRole('button', { name: /continue|sign in|log in/i }).click();
> 51  |   await page.waitForURL(/\/extensions/, { timeout: 60_000 });
      |              ^ TimeoutError: page.waitForURL: Timeout 60000ms exceeded.
  52  | }
  53  | 
  54  | async function openConfigureForExtension(page: Page, label: RegExp) {
  55  |   const card = page.locator('article, [data-extension-card], div').filter({ hasText: label }).first();
  56  |   const configure = card.getByRole('button', { name: /^Configure$/ });
  57  |   if (await configure.count()) {
  58  |     await configure.click();
  59  |   } else {
  60  |     await page.getByRole('button', { name: /^Configure$/ }).filter({ hasText: /.+/ }).first().click();
  61  |   }
  62  |   await expect(page.getByRole('heading', { name: /Configure /i })).toBeVisible({ timeout: 15_000 });
  63  | }
  64  | 
  65  | async function selectDrawerTab(page: Page, label: RegExp) {
  66  |   await page.getByRole('button', { name: label }).click();
  67  | }
  68  | 
  69  | async function waitDetailLoaded(page: Page) {
  70  |   await expect(page.getByLabel('Loading extension settings')).toBeHidden({ timeout: 20_000 });
  71  | }
  72  | 
  73  | async function closeDrawer(page: Page) {
  74  |   await page.getByRole('button', { name: 'Close' }).click();
  75  |   await expect(page.getByRole('heading', { name: /Configure /i })).toBeHidden({ timeout: 10_000 });
  76  | }
  77  | 
  78  | test.describe('Phase 2B Final Browser Sign-off', () => {
  79  |   test.skip(!TENANT_EMAIL || !TENANT_PASSWORD, 'Set TENANT_EMAIL and TENANT_PASSWORD');
  80  | 
  81  |   test('complete extension lifecycle checklist', async ({ page }) => {
  82  |     test.setTimeout(180_000);
  83  |     ensureDir();
  84  |     const { consoleErrors, consoleWarnings, failedRequests, detailGets } = attachObservers(page);
  85  | 
  86  |     await loginTenant(page);
  87  |     await expect(page.getByText('Total Extensions')).toBeVisible({ timeout: 20_000 });
  88  | 
  89  |     // 1 — Existing extension (101 • Reception or first extension)
  90  |     const reception = page.getByText(/101 • Reception|101 • /).first();
  91  |     const hasReception = (await reception.count()) > 0;
  92  |     if (hasReception) {
  93  |       await openConfigureForExtension(page, /101 • Reception|101 • /);
  94  |     } else {
  95  |       await page.getByRole('button', { name: /^Configure$/ }).first().click();
  96  |       await expect(page.getByRole('heading', { name: /Configure /i })).toBeVisible();
  97  |     }
  98  | 
  99  |     await expect(page.getByText(/Extension Status|Current Number/i).first()).toBeVisible();
  100 |     await selectDrawerTab(page, /^General$/);
  101 |     await waitDetailLoaded(page);
  102 |     await expect(page.getByLabel(/^Display name$/i)).not.toHaveValue('');
  103 |     await page.screenshot({ path: path.join(ARTIFACT, '01-configure-general-loaded.png'), fullPage: true });
  104 | 
  105 |     // 2 — Caller ID
  106 |     await selectDrawerTab(page, /^Phone$/);
  107 |     await waitDetailLoaded(page);
  108 |     const callerId = page.getByLabel(/^Caller ID name$/i);
  109 |     const originalCallerId = await callerId.inputValue();
  110 |     const testCallerId = originalCallerId ? `${originalCallerId} QA` : 'Reception QA';
  111 |     await callerId.fill(testCallerId);
  112 |     await page.getByRole('button', { name: /Save Caller ID/i }).click();
  113 |     await page.waitForTimeout(1500);
  114 |     await closeDrawer(page);
  115 | 
  116 |     await openConfigureForExtension(page, hasReception ? /101 • Reception|101 • / : /.+/);
  117 |     await selectDrawerTab(page, /^Phone$/);
  118 |     await waitDetailLoaded(page);
  119 |     await expect(page.getByLabel(/^Caller ID name$/i)).toHaveValue(testCallerId);
  120 | 
  121 |     // Restore caller ID
  122 |     await callerId.fill(originalCallerId);
  123 |     if (originalCallerId !== testCallerId) {
  124 |       await page.getByRole('button', { name: /Save Caller ID/i }).click();
  125 |       await page.waitForTimeout(1000);
  126 |     }
  127 |     await closeDrawer(page);
  128 | 
  129 |     // 3 — Voicemail
  130 |     await openConfigureForExtension(page, hasReception ? /101 • Reception|101 • / : /.+/);
  131 |     await selectDrawerTab(page, /^Voicemail$/);
  132 |     await waitDetailLoaded(page);
  133 |     const pin = page.getByLabel(/^Voicemail PIN$/i);
  134 |     const notify = page.getByLabel(/^Notify email$/i);
  135 |     const origPin = await pin.inputValue();
  136 |     const origNotify = await notify.inputValue();
  137 |     await pin.fill('4321');
  138 |     await notify.fill('vm-signoff@verify.vspphone.com');
  139 |     await page.getByRole('button', { name: /^Save$/i }).click();
  140 |     await page.waitForTimeout(1500);
  141 |     await closeDrawer(page);
  142 | 
  143 |     await openConfigureForExtension(page, hasReception ? /101 • Reception|101 • / : /.+/);
  144 |     await selectDrawerTab(page, /^Voicemail$/);
  145 |     await waitDetailLoaded(page);
  146 |     await expect(pin).toHaveValue('4321');
  147 |     await expect(notify).toHaveValue('vm-signoff@verify.vspphone.com');
  148 |     await pin.fill(origPin);
  149 |     await notify.fill(origNotify);
  150 |     await page.getByRole('button', { name: /^Save$/i }).click();
  151 |     await closeDrawer(page);
```
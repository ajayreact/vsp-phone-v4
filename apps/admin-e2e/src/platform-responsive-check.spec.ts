import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT = path.join(
  process.cwd(),
  '..',
  '..',
  'static',
  'runtime-verification',
  'playwright',
  'platform-rc1',
  'responsive',
);
const PLATFORM_EMAIL = process.env.PLATFORM_EMAIL || '';
const PLATFORM_PASSWORD = process.env.PLATFORM_PASSWORD || '';
const BASE = process.env.BASE_URL || 'https://admin.vspphone.com';

function ensureDir() {
  fs.mkdirSync(ARTIFACT, { recursive: true });
}

/** Representative pages: list view, form-heavy view, table-heavy view, nav-heavy dashboard. */
const PAGES: { path: string; label: string }[] = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/tenants', label: 'Tenants' },
  { path: '/billing', label: 'Billing' },
  { path: '/settings', label: 'Settings' },
  { path: '/system-health', label: 'Health' },
];

/** Standard breakpoints used across the app's Tailwind config (sm/md/lg/xl/2xl neighborhoods). */
const BREAKPOINTS: { name: string; width: number; height: number }[] = [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'laptop-1024', width: 1024, height: 800 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'wide-1920', width: 1920, height: 1080 },
];

async function loginPlatform(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(2000);
  await page.getByLabel(/email/i).fill(PLATFORM_EMAIL);
  await page.getByLabel(/^password$/i).fill(PLATFORM_PASSWORD);
  await page.getByRole('button', { name: /continue|sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

test.describe('Platform RC1 Responsive Breakpoint Verification', () => {
  test.skip(!PLATFORM_EMAIL || !PLATFORM_PASSWORD, 'Set PLATFORM_EMAIL and PLATFORM_PASSWORD');

  for (const bp of BREAKPOINTS) {
    for (const pg of PAGES) {
      test(`${bp.name} — ${pg.label} (${pg.path})`, async ({ page }) => {
        ensureDir();
        await page.setViewportSize({ width: bp.width, height: bp.height });
        await loginPlatform(page);

        await page.goto(`${BASE}${pg.path}`, { waitUntil: 'networkidle', timeout: 45_000 });
        await page.waitForTimeout(1200);

        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          const body = document.body;
          return {
            docScrollWidth: doc.scrollWidth,
            docClientWidth: doc.clientWidth,
            bodyScrollWidth: body.scrollWidth,
            bodyClientWidth: body.clientWidth,
          };
        });
        const horizontalOverflowPx = Math.max(
          overflow.docScrollWidth - overflow.docClientWidth,
          overflow.bodyScrollWidth - overflow.bodyClientWidth,
        );

        const slug = `${bp.name}_${pg.path.replace(/\//g, '_')}`;
        await page.screenshot({ path: path.join(ARTIFACT, `${slug}.png`), fullPage: true });

        const report = {
          breakpoint: bp.name,
          width: bp.width,
          height: bp.height,
          route: pg.path,
          label: pg.label,
          horizontalOverflowPx,
          hasUnexpectedHorizontalScroll: horizontalOverflowPx > 4, // small rounding tolerance
        };
        fs.writeFileSync(path.join(ARTIFACT, `${slug}.json`), JSON.stringify(report, null, 2));
        test.info().annotations.push({ type: 'report', description: JSON.stringify(report) });
      });
    }
  }
});

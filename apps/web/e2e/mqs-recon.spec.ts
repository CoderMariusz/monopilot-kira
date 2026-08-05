/**
 * RECON — warehouse / quality / shipping / maintenance.
 *
 * Not a product assertion: this walks every route of the four untouched modules and
 * dumps what a user can actually DO there (headings, row counts, enabled/disabled
 * buttons, testids, visible error text) into
 * `apps/web/e2e/artifacts/mqs-recon/recon.json`.
 *
 * It exists because the four modules have ~0 seeded rows, so guessing selectors from
 * page.tsx would burn runs. One pass here, then the action specs are written against
 * facts.
 *
 * Run: bash scripts/e2e-local.sh apps/web/e2e/mqs-recon.spec.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { test, type Page } from '@playwright/test';

import { signIn } from './_shared/parity-login';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const artifactDir = path.resolve(__dirname, 'artifacts/mqs-recon');
const L = 'en';

const ROUTES = [
  '/warehouse',
  '/warehouse/grns',
  '/warehouse/inbound',
  '/warehouse/adjustments',
  '/warehouse/adjustments/new',
  '/warehouse/counts',
  '/warehouse/license-plates',
  '/warehouse/inventory',
  '/warehouse/movements',
  '/warehouse/locations',
  '/warehouse/expiry',
  '/warehouse/reservations',
  '/warehouse/genealogy',
  '/warehouse/print-history',
  '/quality',
  '/quality/inspections',
  '/quality/holds',
  '/quality/ncrs',
  '/quality/specifications',
  '/quality/complaints',
  '/quality/trace',
  '/quality/ccp-monitoring',
  '/quality/ccp-deviations',
  '/quality/cold-chain',
  '/quality/haccp',
  '/quality/recall-drills',
  '/shipping',
  '/shipping/shipments',
  '/shipping/customers',
  '/shipping/rma',
  '/maintenance',
  '/maintenance/assets',
  '/maintenance/calibration',
];

type RouteReport = {
  route: string;
  status: number | null;
  finalUrl: string;
  h1: string[];
  tableRows: number;
  emptyState: string[];
  buttons: { text: string; disabled: boolean; testid: string | null }[];
  links: string[];
  testids: string[];
  errors: string[];
  console: string[];
};

async function recon(page: Page, route: string): Promise<RouteReport> {
  const consoleErrors: string[] = [];
  const onConsole = (m: { type: () => string; text: () => string }) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
  };
  page.on('console', onConsole);
  let status: number | null = null;
  try {
    const resp = await page.goto(`${baseURL}/${L}${route}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    status = resp?.status() ?? null;
    await page.waitForTimeout(1200);
  } catch (error) {
    consoleErrors.push(`NAV FAILED: ${(error as Error).message.slice(0, 200)}`);
  }

  const data = await page.evaluate(() => {
    const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    const vis = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    return {
      h1: [...document.querySelectorAll('h1, h2')].filter(vis).map(text).slice(0, 8),
      tableRows: document.querySelectorAll('table tbody tr').length,
      emptyState: [...document.querySelectorAll('[data-empty], .empty, [class*="empty"]')]
        .filter(vis)
        .map(text)
        .filter(Boolean)
        .slice(0, 6),
      buttons: [...document.querySelectorAll('button, a[role="button"], [role="button"]')]
        .filter(vis)
        .map((b) => ({
          text: text(b).slice(0, 60),
          disabled:
            (b as HTMLButtonElement).disabled === true ||
            b.getAttribute('aria-disabled') === 'true',
          testid: b.getAttribute('data-testid'),
        }))
        .filter((b) => b.text || b.testid)
        .slice(0, 40),
      links: [...document.querySelectorAll('main a[href]')]
        .filter(vis)
        .map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? '')
        .filter((h, i, arr) => h && arr.indexOf(h) === i)
        .slice(0, 30),
      testids: [...document.querySelectorAll('[data-testid]')]
        .map((e) => e.getAttribute('data-testid') ?? '')
        .filter((h, i, arr) => h && arr.indexOf(h) === i)
        .slice(0, 60),
      errors: [...document.querySelectorAll('[role="alert"], [data-error], .error, [class*="error"]')]
        .filter(vis)
        .map(text)
        .filter(Boolean)
        .slice(0, 8),
    };
  });

  page.off('console', onConsole);
  return { route, status, finalUrl: page.url(), console: consoleErrors.slice(0, 5), ...data };
}

test.describe('MQS recon', () => {
  test.skip(!baseURL, 'needs PLAYWRIGHT_BASE_URL (scripts/e2e-local.sh)');
  test.setTimeout(15 * 60_000);

  test('map every route of the four untouched modules', async ({ page }) => {
    await signIn(page, baseURL, L);
    const out: RouteReport[] = [];
    for (const route of ROUTES) {
      const report = await recon(page, route);
      out.push(report);
      // eslint-disable-next-line no-console
      console.log(
        `${route} :: ${report.status} :: rows=${report.tableRows} :: ${report.h1[0] ?? '(no h1)'} :: btns=${report.buttons
          .map((b) => `${b.text}${b.disabled ? '[X]' : ''}`)
          .join(' | ')}`,
      );
    }
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(path.join(artifactDir, 'recon.json'), JSON.stringify(out, null, 2));
  });
});

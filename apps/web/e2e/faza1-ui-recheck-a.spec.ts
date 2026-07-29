/**
 * FAZA 1 — recheck of the UI-* catalog contracts, part A (read / render / navigate).
 *
 * These contracts are about what the shell actually puts on screen and where its
 * links go, so the DOM *is* the contract here — each test says so explicitly.
 * Write-bound contracts live in parts B (UI-008, UI-012 counter) and C (UI-017
 * adjustment, UI-021, UI-022, UI-039, UI-005).
 *
 * Read-only: safe to re-run.
 *
 * Run: bash scripts/e2e-local.sh apps/web/e2e/faza1-ui-recheck-a.spec.ts
 */
import { test, expect } from '@playwright/test';

import { signIn } from './_shared/parity-login';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? '';

test.beforeEach(async ({ page }) => {
  test.skip(!baseURL, 'run through scripts/e2e-local.sh');
  test.setTimeout(120_000);
  await signIn(page, baseURL);
});

/** Every UI test below needs hydration; assert it once, loudly, per page load. */
async function assertHydrated(page: import('@playwright/test').Page) {
  const handle = await page.waitForFunction(
    () => Object.keys(document).some((k) => k.startsWith('__reactContainer$')),
    undefined,
    { timeout: 30_000 },
  );
  expect(await handle.jsonValue()).toBeTruthy();
}

test('UI-003 — global search accepts input', async ({ page }) => {
  await page.goto(`${baseURL}/en/planning`, { waitUntil: 'domcontentloaded' });
  await assertHydrated(page);

  const search = page.getByTestId('app-topbar-search');
  await expect(search).toBeVisible();
  const placeholder = await search.getAttribute('placeholder');
  const readOnly = await search.getAttribute('readonly');
  console.log(`[UI-003] placeholder=${JSON.stringify(placeholder)} readonly=${JSON.stringify(readOnly)}`);

  // The contract's precondition: the field must take text.
  let fillError = '';
  try {
    await search.fill('settings', { timeout: 5_000 });
  } catch (error) {
    fillError = String(error).split('\n')[0];
  }
  console.log(`[UI-003] fill() -> ${fillError || 'accepted'}`);
  console.log(`[UI-003] value after fill attempt = ${JSON.stringify(await search.inputValue())}`);

  // Is there ANY result surface at all?
  const forms = await page.locator('form:has([data-testid="app-topbar-search"])').count();
  console.log(`[UI-003] wrapping <form> count = ${forms}`);
});

test('UI-011 / UI-012 — planning alert panels: labels and link targets', async ({ page }) => {
  await page.goto(`${baseURL}/en/planning`, { waitUntil: 'domcontentloaded' });
  await assertHydrated(page);
  await expect(page.getByTestId('planning-alert-cols')).toBeVisible({ timeout: 30_000 });

  for (const panel of ['planning-wo-alerts', 'planning-po-alerts', 'planning-to-alerts']) {
    const count = await page.getByTestId(`${panel}-count`).innerText();
    const empty = page.getByTestId(`${panel}-empty`);
    const emptyText = (await empty.count()) ? (await empty.innerText()).trim() : '(no empty-state — has rows)';
    const links = page.getByTestId(panel).locator('a');
    const labels = await links.allInnerTexts();
    const hrefs = await links.evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href')));
    console.log(`[alerts] ${panel}: count=${count} empty=${JSON.stringify(emptyText)}`);
    console.log(`[alerts] ${panel}: links=${JSON.stringify(labels)} -> ${JSON.stringify(hrefs)}`);
  }

  // UI-011 — click the PO alert link and see where it lands.
  const poLink = page.getByTestId('planning-po-alerts').locator('a').first();
  const poLabel = (await poLink.innerText()).trim();
  const poRef = (await page.getByTestId('planning-po-alerts').locator('.font-mono').first().innerText()).trim();
  await poLink.click();
  await page.waitForURL(/purchase-orders|work-orders|transfer-orders/, { timeout: 30_000 });
  console.log(`[UI-011] row ${poRef} link label=${JSON.stringify(poLabel)} -> URL ${new URL(page.url()).pathname}`);
  const heading = await page.locator('h1').first().innerText().catch(() => '(no h1)');
  console.log(`[UI-011] destination h1 = ${JSON.stringify(heading.trim())}`);
});

test('UI-017 — warehouse hub navigation: duplicate "Stock adjustments" entries', async ({ page }) => {
  await page.goto(`${baseURL}/en/warehouse`, { waitUntil: 'domcontentloaded' });
  await assertHydrated(page);
  await expect(page.getByTestId('module-landing-warehouse')).toBeVisible({ timeout: 30_000 });

  const entries = page.locator('nav a').filter({ hasText: /^Stock adjustments/ });
  const n = await entries.count();
  const rows: Array<{ label: string; href: string | null }> = [];
  for (let i = 0; i < n; i += 1) {
    rows.push({
      label: (await entries.nth(i).locator('span').first().innerText()).trim(),
      href: await entries.nth(i).getAttribute('href'),
    });
  }
  console.log(`[UI-017] entries labelled "Stock adjustments": ${n} -> ${JSON.stringify(rows)}`);

  // Click both, in order, and record the resolved URL + HTTP status of each.
  for (const row of rows) {
    const response = await page.goto(`${baseURL}${row.href}`, { waitUntil: 'domcontentloaded' });
    console.log(`[UI-017] ${row.href} -> HTTP ${response?.status()} at ${new URL(page.url()).pathname}`);
  }
});

test('UI-018 — internal developer notes must not be in the user-facing DOM', async ({ page }) => {
  const needles = ['KPI omitted', 'no valuation/costing field is exposed', 'FEFO-override telemetry'];
  for (const path of ['/en/warehouse', '/en/dashboard']) {
    const response = await page.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3_000);
    const body = await page.locator('body').innerText().catch(() => '');
    const html = await page.content();
    for (const needle of needles) {
      const inText = body.includes(needle);
      const inHtml = html.includes(needle);
      if (inText || inHtml) {
        console.log(`[UI-018] ${path} (HTTP ${response?.status()}): "${needle}" present — innerText=${inText} html=${inHtml}`);
      }
    }
    const srOnly = await page.locator('[data-testid="wh-kpi-omitted-value"], [data-testid="wh-kpi-omitted-fefo"]').count();
    console.log(`[UI-018] ${path}: sr-only omitted-note nodes = ${srOnly}`);
  }
});

test('UI-020 — reporting "Spend by supplier" currency symbol', async ({ page }) => {
  await page.goto(`${baseURL}/en/reporting`, { waitUntil: 'domcontentloaded' });
  await assertHydrated(page);
  const section = page.getByTestId('rpt-section-spend-by-supplier');
  await expect(section).toBeVisible({ timeout: 40_000 });
  const text = (await section.innerText()).replace(/\s+/g, ' ').trim();
  console.log(`[UI-020] section text = ${JSON.stringify(text)}`);
});

test('UI-021 — multi-site "Aggregated inventory" formatting', async ({ page }) => {
  await page.goto(`${baseURL}/en/multi-site`, { waitUntil: 'domcontentloaded' });
  await assertHydrated(page);
  const landing = page.getByTestId('module-landing-multi-site');
  await expect(landing).toBeVisible({ timeout: 30_000 });
  const kpis = page.locator('[aria-label="Network KPIs"]');
  const kpiText = (await kpis.count())
    ? (await kpis.innerText()).replace(/\s+/g, ' ').trim()
    : `(no KPI block) ${(await landing.innerText()).replace(/\s+/g, ' ').trim()}`;
  console.log(`[UI-021] ${kpiText}`);
});

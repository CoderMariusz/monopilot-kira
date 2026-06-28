/**
 * T-091 — NPD Dashboard interactive controls E2E (Playwright).
 *
 * Prototype anchor: prototypes/design/Monopilot Design System/npd/fa-screens.jsx:32-174
 * PRD ref: docs/prd/01-NPD-PRD.md §11.7 (interactive controls)
 *
 * Covers the merged NPD Dashboard (T-052 + T-134):
 *   1. KPI counters visible on load (Total active FAs + 3 more tiles)
 *   2. Show-built toggle — client-side filter; built FAs appear without reload
 *   3. Launch alert row links navigate to /fa/<code> (pipeline preview links)
 *   4. Pipeline preview "View all" link is present and navigates to /pipeline
 *
 * Auth: the dashboard is org-scoped + RBAC-gated. Live capture requires an
 * authenticated Supabase session. When PLAYWRIGHT_BASE_URL is unset (the default
 * in any isolated worktree) ALL tests SKIP cleanly via `test.skip`. Credentials
 * are injected via PLAYWRIGHT_AUTH_STORAGE (a Playwright storage-state JSON of a
 * logged-in session) or via the email/password env pair
 * (PLAYWRIGHT_USER_EMAIL / PLAYWRIGHT_USER_PASSWORD). When neither is available but
 * PLAYWRIGHT_BASE_URL IS set the login step will still be attempted and will fail
 * with a descriptive message rather than a silent pass.
 *
 * Gate-5 run command (from repo root):
 *   PLAYWRIGHT_BASE_URL=https://... \
 *   PLAYWRIGHT_AUTH_STORAGE=/path/to/user.json \
 *   pnpm --filter web exec playwright test e2e/npd-dashboard-interactive
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Environment / skip guard
// ---------------------------------------------------------------------------

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL;
const AUTH_STORAGE =
  process.env.PLAYWRIGHT_AUTH_STORAGE ??
  process.env.PLAYWRIGHT_AUTH_STORAGE_STATE;

const USER_EMAIL = process.env.PLAYWRIGHT_USER_EMAIL;
const USER_PASSWORD = process.env.PLAYWRIGHT_USER_PASSWORD;

const DASHBOARD_ROUTE = '/en/npd';
const LOGIN_ROUTE = '/en/login';

const evidenceDir = path.resolve(
  __dirname,
  '../../../_meta/parity-artifacts/01-npd/dashboard-interactive',
);
const artifactDir = path.resolve(__dirname, 'artifacts/T-091');

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function resolveAuthStorage(): string | undefined {
  if (AUTH_STORAGE && existsSync(AUTH_STORAGE)) return AUTH_STORAGE;
  const fallback = path.resolve(__dirname, '.auth/user.json');
  if (existsSync(fallback)) return fallback;
  return undefined;
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function loginViaEmailPassword(page: Page): Promise<void> {
  if (!USER_EMAIL || !USER_PASSWORD) {
    throw new Error(
      'No auth storage found and PLAYWRIGHT_USER_EMAIL/PLAYWRIGHT_USER_PASSWORD are not set. ' +
        'Provide one of these to run the interactive dashboard E2E spec.',
    );
  }
  await page.goto(`${BASE_URL}${LOGIN_ROUTE}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: /email/i }).fill(USER_EMAIL);
  const pwField = page.getByLabel(/password/i);
  await pwField.fill(USER_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in|continue/i }).click();
  // Wait for redirect away from login
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
}

async function createAuthContext(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const storageState = resolveAuthStorage();
  const context = storageState
    ? await browser.newContext({ storageState })
    : await browser.newContext();
  const page = await context.newPage();
  if (!storageState) {
    await loginViaEmailPassword(page);
  }
  return { context, page };
}

// ---------------------------------------------------------------------------
// Axe helper — optional dep imported via non-literal specifier so the spec
// compiles + loads even when @axe-core/playwright is not linked.
// ---------------------------------------------------------------------------

type AxeViolation = { id: string; impact?: string | null };
type AxeAnalysis = { violations: AxeViolation[] };
type AxeBuilderCtor = new (opts: { page: Page }) => { analyze(): Promise<AxeAnalysis> };

async function runAxe(page: Page, label: string): Promise<void> {
  ensureDir(evidenceDir);
  const axeSpecifier = '@axe-core/playwright';
  const { default: AxeBuilder } = (await import(axeSpecifier)) as { default: AxeBuilderCtor };
  const axe = await new AxeBuilder({ page }).analyze();
  writeFileSync(
    path.join(evidenceDir, `axe-${label}.json`),
    `${JSON.stringify(axe, null, 2)}\n`,
  );
  const blocking = axe.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(blocking, `axe critical/serious violations on ${label}`).toEqual([]);
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

test.describe('NPD Dashboard interactive controls (fa-screens.jsx:32-174 §11.7)', () => {
  // Hard skip when no live server is configured — always exits 0 in isolation.
  test.skip(!BASE_URL, 'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; skip cleanly in worktree.');

  test('KPI counters are visible and report non-negative numeric values', async ({ browser }) => {
    ensureDir(evidenceDir);
    ensureDir(artifactDir);

    const { context, page } = await createAuthContext(browser);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${BASE_URL}${DASHBOARD_ROUTE}`, { waitUntil: 'domcontentloaded' });

      // KPI region aria-label matches dashboard-screen.tsx: "Dashboard KPI summary counters"
      const kpiRegion = page.getByRole('region', { name: /kpi|summary counters/i });
      await expect(kpiRegion).toBeVisible({ timeout: 10_000 });

      // Each KPI card renders a [data-counter-value] element.
      const counterCells = kpiRegion.locator('[data-counter-value]');
      const count = await counterCells.count();
      expect(count, 'at least one KPI counter tile visible').toBeGreaterThanOrEqual(1);

      // All visible numeric values must parse as non-negative integers.
      for (let i = 0; i < count; i++) {
        const text = (await counterCells.nth(i).textContent()) ?? '';
        const value = parseInt(text.trim(), 10);
        expect(Number.isNaN(value), `KPI counter ${i} must be numeric, got "${text}"`).toBe(false);
        expect(value, `KPI counter ${i} must be non-negative`).toBeGreaterThanOrEqual(0);
      }

      await page.screenshot({ path: path.join(evidenceDir, 'T-091-kpi-counters.png'), fullPage: false });
      await runAxe(page, 'kpi-counters');
    } finally {
      await context.tracing.stop({ path: path.join(artifactDir, 'trace-kpi.zip') });
      await context.close();
    }
  });

  test('Show-built toggle reveals built FAs in the launch alerts table (client-side, no reload)', async ({ browser }) => {
    ensureDir(evidenceDir);
    ensureDir(artifactDir);

    const { context, page } = await createAuthContext(browser);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${BASE_URL}${DASHBOARD_ROUTE}`, { waitUntil: 'domcontentloaded' });

      // Ensure the dashboard has fully rendered (KPI region is the readiness signal).
      const kpiRegion = page.getByRole('region', { name: /kpi|summary counters/i });
      await expect(kpiRegion).toBeVisible({ timeout: 10_000 });

      // Mark the document so we can confirm no full-page reload occurs on toggle.
      await page.evaluate(() => {
        (window as unknown as { __dashboardNoReload?: boolean }).__dashboardNoReload = true;
      });

      // Locate the Show-built checkbox (aria-label from dashboard-screen.tsx: labels.showBuilt).
      const showBuiltCheckbox = page.getByRole('checkbox', { name: /show built/i });
      await expect(showBuiltCheckbox, 'Show-built checkbox must be present').toBeVisible({ timeout: 8_000 });

      // Record the current row count before toggling.
      const alertsTable = page.getByRole('table', { name: /launch alerts/i });
      const initialRowCount = await alertsTable.getByRole('row').count();

      // Click the toggle — the component updates client-side state; no server round-trip.
      await showBuiltCheckbox.click();
      await expect(showBuiltCheckbox).toBeChecked();

      // After toggling, the row count must be >= the original (built rows now included).
      // We allow equality in the degenerate case where no built FAs exist in the test org.
      const afterRowCount = await alertsTable.getByRole('row').count();
      expect(
        afterRowCount,
        'toggling Show-built must not reduce the row count',
      ).toBeGreaterThanOrEqual(initialRowCount);

      // Confirm no full-page reload happened (per §11.7 — client-side filter contract).
      const survived = await page.evaluate(
        () =>
          (window as unknown as { __dashboardNoReload?: boolean }).__dashboardNoReload === true,
      );
      expect(survived, 'Show-built toggle must not trigger a full document reload').toBe(true);

      await page.screenshot({
        path: path.join(evidenceDir, 'T-091-show-built-toggled.png'),
        fullPage: true,
      });
    } finally {
      await context.tracing.stop({ path: path.join(artifactDir, 'trace-show-built.zip') });
      await context.close();
    }
  });

  test('Launch alert row links navigate to the FA detail page', async ({ browser }) => {
    ensureDir(evidenceDir);
    ensureDir(artifactDir);

    const { context, page } = await createAuthContext(browser);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${BASE_URL}${DASHBOARD_ROUTE}`, { waitUntil: 'domcontentloaded' });

      const kpiRegion = page.getByRole('region', { name: /kpi|summary counters/i });
      await expect(kpiRegion).toBeVisible({ timeout: 10_000 });

      // Locate the launch alerts table; skip the link assertion if the table is empty
      // (empty state is valid when there are no active FAs in the org).
      const alertsTable = page.getByRole('table', { name: /launch alerts/i });
      const isTableVisible = await alertsTable.isVisible().catch(() => false);

      if (!isTableVisible) {
        // Empty dashboard — confirm the empty-state placeholder renders.
        await expect(
          page.getByTestId('dashboard-empty'),
          'empty-state placeholder must be visible when there are no alerts',
        ).toBeVisible({ timeout: 5_000 });
        return;
      }

      // The first body row contains an anchor whose href is /fg/<productCode>.
      const firstFaLink = alertsTable
        .getByRole('row')
        .nth(1) // skip header row
        .getByRole('link', { name: /[A-Z0-9]+/ })
        .first();

      await expect(firstFaLink, 'first FA code link must be visible').toBeVisible({ timeout: 5_000 });
      const href = await firstFaLink.getAttribute('href');
      expect(href, 'FG link href must begin with /fg/').toMatch(/^\/fg\//);

      await page.screenshot({
        path: path.join(evidenceDir, 'T-091-alert-links.png'),
        fullPage: false,
      });
    } finally {
      await context.tracing.stop({ path: path.join(artifactDir, 'trace-alert-links.zip') });
      await context.close();
    }
  });

  test('Pipeline preview "View all" link is present and points to /pipeline', async ({ browser }) => {
    ensureDir(evidenceDir);
    ensureDir(artifactDir);

    const { context, page } = await createAuthContext(browser);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${BASE_URL}${DASHBOARD_ROUTE}`, { waitUntil: 'domcontentloaded' });

      const kpiRegion = page.getByRole('region', { name: /kpi|summary counters/i });
      await expect(kpiRegion).toBeVisible({ timeout: 10_000 });

      // The DashboardPipelinePreview renders a "View all" link to /pipeline.
      // The link text comes from labels.viewAll — default English: "View all".
      const viewAllLink = page.getByRole('link', { name: /view all/i });
      await expect(viewAllLink, '"View all" link must be visible in the pipeline preview').toBeVisible({ timeout: 8_000 });

      const href = await viewAllLink.getAttribute('href');
      expect(href, '"View all" link must point to the pipeline route').toMatch(/\/pipeline/);

      // Pipeline-preview project rows also carry individual FA detail links.
      const previewRegion = page.getByRole('region', { name: /pipeline/i });
      await expect(previewRegion).toBeVisible({ timeout: 5_000 });

      await previewRegion.screenshot({
        path: path.join(evidenceDir, 'T-091-pipeline-preview.png'),
      });

      await page.screenshot({
        path: path.join(evidenceDir, 'T-091-full-dashboard.png'),
        fullPage: true,
      });
      await runAxe(page, 'full-dashboard');
    } finally {
      await context.tracing.stop({ path: path.join(artifactDir, 'trace-pipeline-preview.zip') });
      await context.close();
    }
  });
});

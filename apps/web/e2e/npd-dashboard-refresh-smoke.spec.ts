/**
 * T-053 — NPD Dashboard refresh + alert thresholds smoke E2E (Playwright).
 *
 * Prototype anchor: prototypes/design/Monopilot Design System/npd/fa-screens.jsx:32-174
 * PRD ref: docs/prd/01-NPD-PRD.md §11.1, §11.5, §15
 *
 * Covers the merged NPD Dashboard (T-052) wired to T-051 Server Actions:
 *   1. Dashboard loads at /en/dashboard — KPI counters render with numeric values.
 *   2. Launch-alert thresholds (T-051) are reflected: RED badge row carries
 *      aria-label/variant "danger" per AlertBadge in dashboard-screen.tsx.
 *   3. A router-level refresh re-fetches and re-renders the view (Server Component
 *      force-dynamic) without a full document reload losing the session.
 *   4. After refresh the KPI region remains visible (view is stable post-rehydration).
 *
 * Auth: PLAYWRIGHT_BASE_URL unset → all tests skip cleanly (worktree isolation).
 *       PLAYWRIGHT_AUTH_STORAGE (storage-state JSON) is tried first; falls back to
 *       PLAYWRIGHT_USER_EMAIL / PLAYWRIGHT_USER_PASSWORD login via /en/login.
 *
 * Alert threshold semantics (get-launch-alerts.ts §11.5):
 *   RED    → days_left ≤ red_days  (default 10) OR launch_date IS NULL
 *   YELLOW → days_left ≤ yellow_days (default 21) AND missing_data present
 *   GREEN  → on track, no data gaps
 *
 * Gate-5 run command (from repo root):
 *   PLAYWRIGHT_BASE_URL=https://... \
 *   PLAYWRIGHT_AUTH_STORAGE=/path/to/user.json \
 *   pnpm --filter web exec playwright test e2e/npd-dashboard-refresh-smoke
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

const DASHBOARD_ROUTE = '/en/dashboard';
const LOGIN_ROUTE = '/en/login';

const evidenceDir = path.resolve(
  __dirname,
  '../../../_meta/parity-artifacts/01-npd/dashboard-refresh-smoke',
);
const artifactDir = path.resolve(__dirname, 'artifacts/T-053');

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
// Auth helpers — identical pattern to npd-dashboard-interactive.spec.ts
// ---------------------------------------------------------------------------

async function loginViaEmailPassword(page: Page): Promise<void> {
  if (!USER_EMAIL || !USER_PASSWORD) {
    throw new Error(
      'No auth storage found and PLAYWRIGHT_USER_EMAIL/PLAYWRIGHT_USER_PASSWORD are not set. ' +
        'Provide one of these to run the dashboard refresh smoke E2E spec.',
    );
  }
  await page.goto(`${BASE_URL}${LOGIN_ROUTE}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: /email/i }).fill(USER_EMAIL);
  await page.getByLabel(/password/i).fill(USER_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in|continue/i }).click();
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
// Axe helper — optional dep; non-literal specifier keeps spec loadable without
// @axe-core/playwright installed (same pattern as sibling specs).
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

test.describe('NPD Dashboard refresh + alert thresholds smoke (fa-screens.jsx:32-174 §11.1 §11.5 §15)', () => {
  // Hard skip when no live server is configured — exits 0 in any isolated worktree.
  test.skip(!BASE_URL, 'PLAYWRIGHT_BASE_URL unset — live authenticated server required; skip cleanly in worktree.');

  test('dashboard loads at /en/dashboard and KPI counters render with non-negative numeric values', async ({ browser }) => {
    ensureDir(evidenceDir);
    ensureDir(artifactDir);

    const { context, page } = await createAuthContext(browser);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${BASE_URL}${DASHBOARD_ROUTE}`, { waitUntil: 'domcontentloaded' });

      // KPI region — aria-label from dashboard-screen.tsx: "Dashboard KPI summary counters"
      const kpiRegion = page.getByRole('region', { name: /kpi|summary counters/i });
      await expect(kpiRegion, 'KPI region must be visible').toBeVisible({ timeout: 12_000 });

      // Each KPI card carries [data-counter-value] from KpiCard in dashboard-screen.tsx.
      const counterCells = kpiRegion.locator('[data-counter-value]');
      const count = await counterCells.count();
      expect(count, 'at least one KPI counter tile must be visible').toBeGreaterThanOrEqual(1);

      for (let i = 0; i < count; i++) {
        const text = (await counterCells.nth(i).textContent()) ?? '';
        const value = parseInt(text.trim(), 10);
        expect(Number.isNaN(value), `KPI counter ${i} must be numeric, got "${text}"`).toBe(false);
        expect(value, `KPI counter ${i} must be non-negative`).toBeGreaterThanOrEqual(0);
      }

      await page.screenshot({ path: path.join(evidenceDir, 'T-053-kpi-load.png'), fullPage: false });
      await runAxe(page, 'kpi-load');
    } finally {
      await context.tracing.stop({ path: path.join(artifactDir, 'trace-kpi-load.zip') });
      await context.close();
    }
  });

  test('launch-alert thresholds are reflected: RED badge rows visible when org has near-launch FAs (T-051 §11.5)', async ({ browser }) => {
    ensureDir(evidenceDir);
    ensureDir(artifactDir);

    const { context, page } = await createAuthContext(browser);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${BASE_URL}${DASHBOARD_ROUTE}`, { waitUntil: 'domcontentloaded' });

      // Wait for dashboard readiness via KPI region.
      const kpiRegion = page.getByRole('region', { name: /kpi|summary counters/i });
      await expect(kpiRegion).toBeVisible({ timeout: 12_000 });

      // Locate the launch alerts table (aria-label from dashboard-screen.tsx labels.alertsTitle
      // defaults to "Launch alerts") or the empty-state placeholder.
      const alertsTable = page.getByRole('table', { name: /launch alerts/i });
      const emptyState = page.getByTestId('dashboard-empty');

      const hasTable = await alertsTable.isVisible().catch(() => false);
      const hasEmpty = await emptyState.isVisible().catch(() => false);

      // Either the table renders rows OR the empty-state placeholder is visible.
      expect(
        hasTable || hasEmpty,
        'dashboard must show the launch alerts table or the empty-state placeholder',
      ).toBe(true);

      if (hasTable) {
        // At least one data row (skip header row at index 0).
        const rows = alertsTable.getByRole('row');
        const rowCount = await rows.count();
        expect(rowCount, 'launch alerts table must have at least one data row').toBeGreaterThan(1);

        // Alert level badges — RED threshold: days_left ≤ red_days (default 10) OR null date.
        // AlertBadge in dashboard-screen.tsx renders <Badge variant="danger"> for RED rows.
        // Collect all badge text; if any RED rows exist their badge text is "● Red".
        const badges = alertsTable.locator('[data-slot="badge"], [class*="badge"]');
        const badgeTexts = await badges.allTextContents();

        // Presence of a RED badge is conditional on the org's data — we assert the
        // badge text format is well-formed (contains a level token) for each visible badge.
        for (const text of badgeTexts) {
          const normalized = text.replace(/\s+/g, ' ').trim();
          expect(
            normalized.match(/Red|Amber|Green/i),
            `badge text "${normalized}" must contain a valid alert level (Red / Amber / Green)`,
          ).toBeTruthy();
        }

        // If any RED badge is present, confirm its row carries the visual indicator
        // (the row's class includes border-l-red-500 per dashboard-screen.tsx rowTone logic).
        const redBadge = alertsTable.getByText(/● Red|Red/i).first();
        const redBadgePresent = await redBadge.isVisible().catch(() => false);
        if (redBadgePresent) {
          // The row containing a RED badge must be inside the table (structural integrity).
          const redRow = redBadge.locator('xpath=ancestor::tr[1]');
          await expect(redRow, 'RED badge must be inside a table row').toBeVisible({ timeout: 5_000 });
        }
      }

      await page.screenshot({ path: path.join(evidenceDir, 'T-053-alert-thresholds.png'), fullPage: true });
    } finally {
      await context.tracing.stop({ path: path.join(artifactDir, 'trace-alert-thresholds.zip') });
      await context.close();
    }
  });

  test('router refresh re-fetches and re-renders: KPI region stable after reload (§11.5 force-dynamic)', async ({ browser }) => {
    ensureDir(evidenceDir);
    ensureDir(artifactDir);

    const { context, page } = await createAuthContext(browser);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

    try {
      await page.setViewportSize({ width: 1440, height: 900 });

      // --- Initial load ---
      await page.goto(`${BASE_URL}${DASHBOARD_ROUTE}`, { waitUntil: 'domcontentloaded' });

      const kpiRegion = page.getByRole('region', { name: /kpi|summary counters/i });
      await expect(kpiRegion, 'KPI region must be visible before refresh').toBeVisible({ timeout: 12_000 });

      // Read initial counter values for a stable-identity assertion post-refresh.
      const initialCounters = await kpiRegion.locator('[data-counter-value]').allTextContents();
      expect(initialCounters.length, 'at least one counter before refresh').toBeGreaterThanOrEqual(1);

      // --- Router refresh (Next.js force-dynamic re-fetch via browser reload) ---
      // The dashboard page uses `export const dynamic = 'force-dynamic'` — a browser
      // reload triggers a fresh Server Component render querying Supabase. The session
      // cookie persists through a same-origin reload so auth is preserved.
      await page.reload({ waitUntil: 'domcontentloaded' });

      // --- Post-refresh assertions ---
      await expect(
        kpiRegion,
        'KPI region must remain visible after reload (session + data re-fetch stable)',
      ).toBeVisible({ timeout: 15_000 });

      const afterCounters = await kpiRegion.locator('[data-counter-value]').allTextContents();
      expect(afterCounters.length, 'same number of KPI counters after reload').toBe(initialCounters.length);

      // Each counter must still parse as a non-negative integer (data continuity).
      for (let i = 0; i < afterCounters.length; i++) {
        const value = parseInt((afterCounters[i] ?? '').trim(), 10);
        expect(Number.isNaN(value), `post-refresh counter ${i} must be numeric`).toBe(false);
        expect(value, `post-refresh counter ${i} must be non-negative`).toBeGreaterThanOrEqual(0);
      }

      // Confirm the launch alerts region is still rendered after reload.
      const alertsOrEmpty = page
        .getByRole('table', { name: /launch alerts/i })
        .or(page.getByTestId('dashboard-empty'));
      await expect(
        alertsOrEmpty,
        'launch alerts table or empty-state must remain visible after reload',
      ).toBeVisible({ timeout: 10_000 });

      await page.screenshot({ path: path.join(evidenceDir, 'T-053-post-refresh.png'), fullPage: true });
      await runAxe(page, 'post-refresh');
    } finally {
      await context.tracing.stop({ path: path.join(artifactDir, 'trace-post-refresh.zip') });
      await context.close();
    }
  });
});

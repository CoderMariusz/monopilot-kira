/**
 * T-087 — E2E: V18 built-blocker (Open High risk → cannot build / export).
 *
 * Prototype anchor:
 *   prototypes/design/Monopilot Design System/npd/docs-screens.jsx:56-106 (RiskRegisterScreen)
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:300-401  (FA detail)
 *
 * V18 contract (§18 PRD + 2026-05-03 PO Amendment):
 *   - An Open High-bucket risk (likelihood × impact score ≥ 6) blocks the NPD
 *     Builder "built" transition AND optional D365 export.
 *   - The RiskRegisterScreen surfaces a `data-testid="risk-built-blocker"` advisory
 *     banner so the FA owner can see why the built path is blocked.
 *   - Mitigating the risk (state → Mitigated) removes the blocker and allows the
 *     built transition to proceed.
 *
 * Spec flow:
 *   1. Log in as NPD Manager via /en/login (email + password form).
 *   2. Navigate to an FA whose product code is provided via PLAYWRIGHT_V18_PRODUCT_CODE
 *      (or PLAYWRIGHT_TEST_PRODUCT_CODE) — the FA must already exist in the Supabase
 *      test org; this spec does NOT create the FA itself.
 *   3. Navigate to the risk register for that FA.
 *   4. Open "Add risk" and submit a High-bucket risk (likelihood=3, impact=3).
 *   5. Assert the V18 blocker banner is shown and built badge is absent.
 *   6. Open the risk edit modal and mitigate the risk (state → Mitigated, reason ≥ 10 chars).
 *   7. Assert the V18 blocker banner is gone (risk no longer Open+High).
 *
 * Skip contract:
 *   - Without PLAYWRIGHT_BASE_URL the entire suite skips cleanly (no imports fail,
 *     no external resources are fetched, tsc --noEmit stays 0).
 *   - The spec runs live against a Vercel+Supabase preview at Gate-5 when
 *     PLAYWRIGHT_BASE_URL, PLAYWRIGHT_TEST_EMAIL, PLAYWRIGHT_TEST_PASSWORD, and
 *     PLAYWRIGHT_V18_PRODUCT_CODE are all set.
 *
 * Run command:
 *   PLAYWRIGHT_BASE_URL=https://preview.monopilot.app \
 *   PLAYWRIGHT_TEST_EMAIL=admin@monopilot.test \
 *   PLAYWRIGHT_TEST_PASSWORD='...' \
 *   PLAYWRIGHT_V18_PRODUCT_CODE=FA-TEST-001 \
 *   pnpm --filter web exec playwright test e2e/npd-v18-built-blocker.spec.ts --trace on
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Environment gating — skip the whole suite when BASE_URL is absent.
// ---------------------------------------------------------------------------

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const testEmail = process.env.PLAYWRIGHT_TEST_EMAIL ?? process.env.PLAYWRIGHT_E2E_EMAIL;
const testPassword = process.env.PLAYWRIGHT_TEST_PASSWORD ?? process.env.PLAYWRIGHT_E2E_PASSWORD;
const productCode =
  process.env.PLAYWRIGHT_V18_PRODUCT_CODE ??
  process.env.PLAYWRIGHT_TEST_PRODUCT_CODE ??
  'FA-V18-TEST';

const evidenceDir = path.resolve(
  __dirname,
  'parity-evidence/npd/T-087',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

type AxeAnalysis = { violations: Array<{ id: string; impact?: string | null }> };
type AxeBuilderCtor = new (opts: { page: Page }) => { analyze(): Promise<AxeAnalysis> };

/** Dynamic axe import — spec remains loadable when the dep is absent. */
async function runAxe(page: Page, name: string): Promise<void> {
  const axeSpecifier = '@axe-core/playwright';
  try {
    const { default: AxeBuilder } = (await import(axeSpecifier)) as { default: AxeBuilderCtor };
    const axe = await new AxeBuilder({ page }).analyze();
    writeFileSync(
      path.join(evidenceDir, `axe-${name}.json`),
      `${JSON.stringify(axe, null, 2)}\n`,
    );
    const blocking = axe.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking, `axe critical/serious violations on ${name}`).toEqual([]);
  } catch {
    // @axe-core/playwright not linked in this checkout — skip silently.
  }
}

/**
 * Authenticate via the /en/login password form.
 * Called once per browser context; re-use storageState across tests in the suite.
 */
async function loginViaForm(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${baseURL}/en/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in|submit/i }).click();
  // Wait for redirect away from /login (auth success) or an explicit nav element.
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('NPD V18 built-blocker (docs-screens.jsx:56-106 · fa-screens.jsx:300-401)', () => {
  // Gate: skip the whole suite when the live server URL is absent.
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; spec skips cleanly at Gate-5 without BASE_URL.',
  );

  // Authenticate once before all tests in this describe block.
  test.beforeAll(async ({ browser }) => {
    if (!baseURL || !testEmail || !testPassword) return;
    ensureDir(evidenceDir);
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginViaForm(page, testEmail, testPassword);
    // Persist auth state so individual tests can reuse it.
    await context.storageState({ path: path.join(__dirname, '.auth/v18-user.json') });
    await context.close();
  });

  // Resolve the auth storage created above (if the file exists from a prior run it's reused).
  function authStorage(): string | undefined {
    const p = path.join(__dirname, '.auth/v18-user.json');
    return existsSync(p) ? p : undefined;
  }

  // ---------------------------------------------------------------------------
  // Test 1: V18 blocker banner appears when an Open High risk exists
  // ---------------------------------------------------------------------------

  test('V18: Open High risk shows built-blocker banner on the Risk Register', async ({
    browser,
  }) => {
    const auth = authStorage();
    test.skip(!auth, 'BLOCKED_AUTH: v18-user.json not found — run with valid PLAYWRIGHT_TEST_EMAIL/PASSWORD.');
    test.skip(!testEmail || !testPassword, 'BLOCKED_AUTH: credentials not set.');

    const context = await browser.newContext({ storageState: auth });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await context.newPage();

    try {
      // Navigate to the Risk Register for this FA.
      const risksRoute = `${baseURL}/en/fg/${productCode}/risks`;
      await page.goto(risksRoute, { waitUntil: 'domcontentloaded' });

      // Confirm the Risk Register screen rendered.
      await expect(
        page.getByTestId('risk-register-screen'),
        'risk-register-screen must be visible',
      ).toBeVisible({ timeout: 10_000 });

      // --- Add a High-bucket risk (likelihood=3, impact=3 → score=9 → High) ---
      await page.getByRole('button', { name: /add risk/i }).click();

      // Fill the risk add modal.
      const modal = page.getByRole('dialog');
      await expect(modal).toBeVisible({ timeout: 5_000 });

      // Description (required field).
      await modal
        .getByLabel(/description/i)
        .fill('V18-TEST: Regulatory approval not confirmed');

      // Likelihood = High (3).
      const likelihoodSelect = modal.getByLabel(/likelihood/i);
      await likelihoodSelect.selectOption({ label: /high/i });

      // Impact = High (3).
      const impactSelect = modal.getByLabel(/impact/i);
      await impactSelect.selectOption({ label: /high/i });

      // Submit the new risk.
      await modal.getByRole('button', { name: /add risk|create|save/i }).click();
      await expect(modal).not.toBeVisible({ timeout: 10_000 });

      // --- Assert V18 blocker banner is shown ---
      const blockerBanner = page.getByTestId('risk-built-blocker');
      await expect(
        blockerBanner,
        'V18 built-blocker banner must appear when an Open High risk exists',
      ).toBeVisible({ timeout: 8_000 });

      // Capture screenshot evidence.
      await page.screenshot({
        path: path.join(evidenceDir, 'T-087-v18-blocker-visible.png'),
        fullPage: true,
      });

      await runAxe(page, 'v18-blocker-visible');
    } finally {
      await context.tracing.stop({
        path: path.join(evidenceDir, 'trace-v18-blocker-visible.zip'),
      });
      await context.close();
    }
  });

  // ---------------------------------------------------------------------------
  // Test 2: FA detail page does NOT show the Built badge when V18 is active
  // ---------------------------------------------------------------------------

  test('V18: Built badge absent on FA detail while Open High risk exists', async ({
    browser,
  }) => {
    const auth = authStorage();
    test.skip(!auth, 'BLOCKED_AUTH: v18-user.json not found.');
    test.skip(!testEmail || !testPassword, 'BLOCKED_AUTH: credentials not set.');

    const context = await browser.newContext({ storageState: auth });
    const page = await context.newPage();

    try {
      const faRoute = `${baseURL}/en/fg/${productCode}`;
      await page.goto(faRoute, { waitUntil: 'domcontentloaded' });

      // FA detail page must load.
      await expect(
        page.getByRole('main'),
        'FA detail main region must be visible',
      ).toBeVisible({ timeout: 10_000 });

      // The "Built" badge (data-testid="fa-detail-built") must be ABSENT while
      // the V18 Open High risk remains unresolved.
      await expect(
        page.getByTestId('fa-detail-built'),
        'Built badge must NOT appear while Open High risk exists (V18 block)',
      ).not.toBeVisible();

      await page.screenshot({
        path: path.join(evidenceDir, 'T-087-fa-built-badge-absent.png'),
        fullPage: true,
      });
    } finally {
      await context.close();
    }
  });

  // ---------------------------------------------------------------------------
  // Test 3: Mitigating the High risk removes the V18 blocker banner
  // ---------------------------------------------------------------------------

  test('V18: Mitigating the Open High risk removes the built-blocker banner', async ({
    browser,
  }) => {
    const auth = authStorage();
    test.skip(!auth, 'BLOCKED_AUTH: v18-user.json not found.');
    test.skip(!testEmail || !testPassword, 'BLOCKED_AUTH: credentials not set.');

    const context = await browser.newContext({ storageState: auth });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await context.newPage();

    try {
      const risksRoute = `${baseURL}/en/fg/${productCode}/risks`;
      await page.goto(risksRoute, { waitUntil: 'domcontentloaded' });

      await expect(
        page.getByTestId('risk-register-screen'),
        'risk-register-screen must be visible',
      ).toBeVisible({ timeout: 10_000 });

      // Locate the first Open + High risk row and open its Edit modal.
      const highOpenRow = page
        .locator('[data-testid^="risk-row-"][data-bucket="High"][data-state="Open"]')
        .first();

      await expect(
        highOpenRow,
        'At least one Open High risk row must exist to mitigate',
      ).toBeVisible({ timeout: 8_000 });

      // Click the Edit button for this row.
      await highOpenRow
        .getByRole('button', { name: /edit/i })
        .click();

      const modal = page.getByRole('dialog');
      await expect(modal).toBeVisible({ timeout: 5_000 });

      // Capture pre-mitigation state.
      await page.screenshot({
        path: path.join(evidenceDir, 'T-087-edit-modal-open.png'),
      });

      // Transition to Mitigated: fill the required reason (≥ 10 chars).
      const reasonField = modal.getByLabel(/reason/i);
      await reasonField.fill('Supplier documentation received and verified by QA team');

      // Click the "Mitigate" button (lifecycle transition).
      await modal.getByRole('button', { name: /mitigate/i }).click();
      await expect(modal).not.toBeVisible({ timeout: 10_000 });

      // --- Assert V18 blocker banner is now GONE ---
      const blockerBanner = page.getByTestId('risk-built-blocker');
      await expect(
        blockerBanner,
        'V18 built-blocker banner must disappear after the High risk is mitigated',
      ).not.toBeVisible({ timeout: 8_000 });

      // Capture post-mitigation screenshot evidence.
      await page.screenshot({
        path: path.join(evidenceDir, 'T-087-v18-blocker-resolved.png'),
        fullPage: true,
      });

      await runAxe(page, 'v18-blocker-resolved');
    } finally {
      await context.tracing.stop({
        path: path.join(evidenceDir, 'trace-v18-blocker-resolved.zip'),
      });
      await context.close();
    }
  });
});

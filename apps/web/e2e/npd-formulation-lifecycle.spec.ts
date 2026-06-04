/**
 * T-068 — E2E: formulation edit → submit-for-trial → lock (NPD-g lifecycle)
 *
 * PRD: docs/prd/01-NPD-PRD.md §17.11.1
 *
 * Prototype anchors:
 *   prototypes/design/Monopilot Design System/npd/recipe.jsx:124-264
 *   prototypes/design/Monopilot Design System/npd/formulation-screens.jsx:79-153
 *
 * Full lifecycle: open FormulationEditor → edit 5 ingredients summing to 100%
 * → live panels (NutritionPanel, CostPanel, AllergenPanel, CompositionBar) update
 * in real-time (T-117) → submit-for-trial (totalPct gate: 99.99–100.01%) → lock
 * (T-064) → verify locked state.
 *
 * Environment gating (HARD):
 *   - When PLAYWRIGHT_BASE_URL is unset the entire describe block is SKIPPED.
 *     This is the correct behaviour in isolated worktrees and CI jobs that only
 *     run typecheck + unit tests.
 *   - When PLAYWRIGHT_BASE_URL is set the spec expects:
 *       PLAYWRIGHT_LOGIN_EMAIL    (default: admin@monopilot.test)
 *       PLAYWRIGHT_LOGIN_PASSWORD (required when base URL is set)
 *       NPD_FORMULATION_PROJECT_ID (UUID of a G2-stage project with an empty
 *                                   formulation; default: stub UUID for dry-run)
 *
 * Gate-5 live run:
 *   PLAYWRIGHT_BASE_URL=<preview> \
 *   PLAYWRIGHT_LOGIN_EMAIL=admin@monopilot.test \
 *   PLAYWRIGHT_LOGIN_PASSWORD=<pwd> \
 *   NPD_FORMULATION_PROJECT_ID=<uuid> \
 *   pnpm --filter web exec playwright test e2e/npd-formulation-lifecycle.spec.ts --trace on
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

// ── env-gating ────────────────────────────────────────────────────────────────
const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const loginEmail = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? 'admin@monopilot.test';
const loginPassword = process.env.PLAYWRIGHT_LOGIN_PASSWORD;
const projectId =
  process.env.NPD_FORMULATION_PROJECT_ID ?? '00000000-0000-4000-8000-000000000001';

const evidenceDir = path.resolve(__dirname, 'parity-evidence/npd/T-068');
const formulationRoute = `/en/pipeline/${projectId}/formulation`;

// ── helpers ───────────────────────────────────────────────────────────────────

/** Logs in through the real Supabase-backed login form at /en/login. */
async function loginAsAdmin(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`${baseURL}/en/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(loginEmail);
  await page.locator('input[name="password"]').fill(loginPassword as string);
  await page.getByRole('button', { name: /sign in|log in|continue/i }).first().click();
  // Wait until the app shell is loaded (any non-login route).
  await page.waitForURL((url) => !/\/login/.test(url.pathname), { timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/login/);
}

// ── test suite ─────────────────────────────────────────────────────────────────

test.describe('NPD formulation lifecycle (edit → submit-for-trial → lock)', () => {
  // Skip the entire suite when either the base URL or the login password is absent.
  // This lets the spec compile and be collected without a running server.
  test.skip(
    !baseURL || !loginPassword,
    'PLAYWRIGHT_BASE_URL + PLAYWRIGHT_LOGIN_PASSWORD required — live Gate-5 run only; skip in worktree / tsc-only CI.',
  );

  // ── AC#1: edit ingredients → live panels update ──────────────────────────

  test('AC#1 — editing ingredient % updates live panels (T-117 wiring)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${baseURL}${formulationRoute}`, { waitUntil: 'networkidle' });

    // FormulationEditor must be mounted.
    await expect(page.getByTestId('formulation-editor')).toBeVisible({ timeout: 15_000 });

    // All four live panels must be present in prototype order (recipe.jsx:253-258).
    await expect(page.getByTestId('nutrition-panel')).toBeVisible();
    await expect(page.getByTestId('cost-panel')).toBeVisible();
    await expect(page.getByTestId('allergen-panel')).toBeVisible();
    await expect(page.getByTestId('composition-bar')).toBeVisible();

    // Record baseline cost before any edit.
    const costBefore = await page.getByTestId('cost-raw').textContent();

    // Edit the first ingredient's % w/w field.
    const firstRow = page.getByTestId('ingredient-row').first();
    await firstRow.getByLabel('% w/w').fill('20');
    // Live recompute is synchronous (client-side useMemo); give the strip one frame.
    await page.waitForTimeout(150);

    // Cost panel must reflect the new value.
    const costAfter = await page.getByTestId('cost-raw').textContent();
    expect(costAfter).not.toEqual(costBefore);

    await page.screenshot({ path: path.join(evidenceDir, 'T-068-live-panels.png'), fullPage: true });
  });

  // ── AC#1 extension: totalPct gate blocks submit when not 100% ─────────────

  test('AC#1b — submit-for-trial button is disabled when totalPct ≠ 100%', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${baseURL}${formulationRoute}`, { waitUntil: 'networkidle' });

    await expect(page.getByTestId('formulation-editor')).toBeVisible({ timeout: 15_000 });

    // Ensure total row shows a value ≠ 100 by setting one ingredient to a partial value.
    const firstRow = page.getByTestId('ingredient-row').first();
    await firstRow.getByLabel('% w/w').fill('10');
    await page.waitForTimeout(900); // wait past debounce (800 ms) so draft save fires

    // The submit-for-trial button must be disabled when total ≠ 100%.
    const submitBtn = page.getByRole('button', { name: /submit.for.trial|submit for trial/i });
    await expect(submitBtn).toBeDisabled();

    await page.screenshot({ path: path.join(evidenceDir, 'T-068-gate-disabled.png'), fullPage: true });
  });

  // ── AC#2: 5 ingredients summing to 100% → submit-for-trial succeeds ───────

  test('AC#2 — 5 ingredients at 100% total → submit-for-trial transitions state', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(`${baseURL}${formulationRoute}`, { waitUntil: 'networkidle' });

    await expect(page.getByTestId('formulation-editor')).toBeVisible({ timeout: 15_000 });

    // Set 5 ingredient rows to 20% each (total = 100%).
    // This assumes the seeded formulation has at least 5 rows. When fewer rows
    // exist the "Add ingredient" button must be used first.
    const rows = page.getByTestId('ingredient-row');
    const rowCount = await rows.count();
    const needed = 5;

    if (rowCount < needed) {
      // Add rows until we have 5.
      for (let i = rowCount; i < needed; i++) {
        await page.getByRole('button', { name: /add ingredient/i }).click();
        await page.waitForTimeout(200);
      }
    }

    // Fill each row with 20%.
    for (let i = 0; i < needed; i++) {
      await rows.nth(i).getByLabel('% w/w').fill('20');
    }

    // Wait past debounce so the draft is persisted.
    await page.waitForTimeout(900);

    // Total row must display 100 (or 100.00).
    await expect(page.getByTestId('total-row')).toContainText(/100/);

    // Submit-for-trial button must be enabled now.
    const submitBtn = page.getByRole('button', { name: /submit.for.trial|submit for trial/i });
    await expect(submitBtn).toBeEnabled();

    await page.screenshot({ path: path.join(evidenceDir, 'T-068-pre-submit.png'), fullPage: true });

    await submitBtn.click();

    // After submit, the UI must reflect the 'submitted_for_trial' state.
    // The badge / state label is asserted via data-testid="formulation-state".
    await expect(page.getByTestId('formulation-state')).toContainText(
      /submitted.for.trial|submitted for trial/i,
      { timeout: 10_000 },
    );

    await page.screenshot({ path: path.join(evidenceDir, 'T-068-submitted.png'), fullPage: true });
  });

  // ── AC#3: locked state after Lock action ──────────────────────────────────

  test('AC#3 — lock action transitions state to locked (T-064)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${baseURL}${formulationRoute}`, { waitUntil: 'networkidle' });

    await expect(page.getByTestId('formulation-editor')).toBeVisible({ timeout: 15_000 });

    // Precondition: the formulation must already be in 'submitted_for_trial' state.
    // If it is still in 'draft' we first submit (mirrors the AC#2 flow).
    const stateEl = page.getByTestId('formulation-state');
    const stateBefore = await stateEl.textContent();

    if (stateBefore && !/submitted.for.trial/i.test(stateBefore)) {
      // Attempt to set 5 rows × 20% and submit.
      const rows = page.getByTestId('ingredient-row');
      const rowCount = await rows.count();
      const needed = 5;
      if (rowCount < needed) {
        for (let i = rowCount; i < needed; i++) {
          await page.getByRole('button', { name: /add ingredient/i }).click();
          await page.waitForTimeout(200);
        }
      }
      for (let i = 0; i < needed; i++) {
        await rows.nth(i).getByLabel('% w/w').fill('20');
      }
      await page.waitForTimeout(900);
      const submitBtn = page.getByRole('button', { name: /submit.for.trial|submit for trial/i });
      if (await submitBtn.isEnabled()) {
        await submitBtn.click();
        await expect(stateEl).toContainText(/submitted.for.trial/i, { timeout: 10_000 });
      }
    }

    // Now click Lock.
    const lockBtn = page.getByRole('button', { name: /^lock$/i });
    await expect(lockBtn).toBeVisible({ timeout: 5_000 });
    await expect(lockBtn).toBeEnabled();
    await lockBtn.click();

    // Confirm in any confirmation dialog if present.
    const confirmBtn = page.getByRole('button', { name: /confirm|yes|lock/i }).last();
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // State must transition to 'locked'.
    await expect(stateEl).toContainText(/locked/i, { timeout: 10_000 });

    // Submit-for-trial and Lock buttons must be gone / disabled once locked.
    const submitAfterLock = page.getByRole('button', { name: /submit.for.trial/i });
    if (await submitAfterLock.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await expect(submitAfterLock).toBeDisabled();
    }

    await page.screenshot({ path: path.join(evidenceDir, 'T-068-locked.png'), fullPage: true });
  });

  // ── axe accessibility ─────────────────────────────────────────────────────

  test('axe: formulation editor page has 0 accessibility violations', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${baseURL}${formulationRoute}`, { waitUntil: 'networkidle' });

    await expect(page.getByTestId('formulation-editor')).toBeVisible({ timeout: 15_000 });

    type AxeAnalysis = { violations: Array<{ id: string; impact?: string | null }> };
    type AxeBuilderCtor = new (opts: { page: typeof page }) => { analyze(): Promise<AxeAnalysis> };
    const axeSpecifier = '@axe-core/playwright';
    const { default: AxeBuilder } = (await import(axeSpecifier)) as { default: AxeBuilderCtor };
    const axe = await new AxeBuilder({ page }).analyze();

    await import('node:fs').then(({ mkdirSync, writeFileSync }) => {
      mkdirSync(evidenceDir, { recursive: true });
      writeFileSync(path.join(evidenceDir, 'axe-report.json'), `${JSON.stringify(axe, null, 2)}\n`);
    });

    expect(axe.violations).toEqual([]);
  });
});

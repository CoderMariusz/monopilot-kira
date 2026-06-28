/**
 * A6 — E2E: unlock a LOCKED formulation version back to draft (e-sign PIN).
 *
 * PRD: docs/prd/01-NPD-PRD.md §17.11.1
 *
 * No prototype anchor — this is a spec-driven e-sign control that reuses the
 * established in-app GateRevertModal pattern
 * (apps/web/app/(npd)/_modals/gate-revert-modal.tsx): @monopilot/ui Modal +
 * reason Textarea + password PIN Input + confirm Checkbox + per-code error map.
 *
 * Flow: open a locked FormulationEditor → "Unlock recipe" button is shown ONLY on
 * a locked version → click → PIN modal opens → enter PIN + confirm → submit →
 * server unlockVersion() returns the version to 'draft' → the editor re-renders
 * editable (the locked amber banner disappears, Save/Submit re-enable).
 *
 * Environment gating (HARD):
 *   - When PLAYWRIGHT_BASE_URL is unset the entire describe block is SKIPPED, so
 *     the spec compiles + is collected without a running server (worktree / CI).
 *   - When set, the spec expects:
 *       PLAYWRIGHT_LOGIN_EMAIL          (default: admin@monopilot.test)
 *       PLAYWRIGHT_LOGIN_PASSWORD       (required when base URL is set)
 *       NPD_FORMULATION_PROJECT_ID      (a project whose current version is LOCKED)
 *       NPD_ESIGN_PIN                   (the signer's e-sign PIN)
 *
 * Gate-5 live run:
 *   PLAYWRIGHT_BASE_URL=<preview> \
 *   PLAYWRIGHT_LOGIN_EMAIL=admin@monopilot.test \
 *   PLAYWRIGHT_LOGIN_PASSWORD=<pwd> \
 *   NPD_FORMULATION_PROJECT_ID=<uuid-of-locked-version> \
 *   NPD_ESIGN_PIN=<pin> \
 *   pnpm --filter web exec playwright test e2e/npd-formulation-unlock.spec.ts --trace on
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

// ── env-gating ────────────────────────────────────────────────────────────────
const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const loginEmail = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? 'admin@monopilot.test';
const loginPassword = process.env.PLAYWRIGHT_LOGIN_PASSWORD;
const projectId =
  process.env.NPD_FORMULATION_PROJECT_ID ?? '00000000-0000-4000-8000-000000000001';
const esignPin = process.env.NPD_ESIGN_PIN ?? '000000';

const evidenceDir = path.resolve(__dirname, 'parity-evidence/npd/A6');
const formulationRoute = `/en/pipeline/${projectId}/formulation`;

/** Logs in through the real Supabase-backed login form at /en/login. */
async function loginAsAdmin(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`${baseURL}/en/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(loginEmail);
  await page.locator('input[name="password"]').fill(loginPassword as string);
  await page.getByRole('button', { name: /sign in|log in|continue/i }).first().click();
  await page.waitForURL((url) => !/\/login/.test(url.pathname), { timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/login/);
}

test.describe('NPD formulation unlock (locked → e-sign PIN → draft)', () => {
  // Skip the whole suite without a running server (compiles + collects in CI).
  test.skip(
    !baseURL || !loginPassword,
    'PLAYWRIGHT_BASE_URL + PLAYWRIGHT_LOGIN_PASSWORD required — live Gate-5 run only; skip in worktree / tsc-only CI.',
  );

  test('A6 — unlock button is shown on a locked version and opens the PIN modal', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(`${baseURL}${formulationRoute}`, { waitUntil: 'networkidle' });

    await expect(page.getByTestId('formulation-editor')).toBeVisible({ timeout: 15_000 });

    // Precondition: the loaded version must be LOCKED (the amber banner renders).
    await expect(page.getByText(/locked and cannot be edited/i)).toBeVisible({ timeout: 10_000 });

    // The Unlock recipe button is shown ONLY on a locked version.
    const unlockBtn = page.getByTestId('unlock-recipe-trigger');
    await expect(unlockBtn).toBeVisible();
    await expect(unlockBtn).toBeEnabled();

    await page.screenshot({ path: path.join(evidenceDir, 'A6-locked-toolbar.png'), fullPage: true });

    // Clicking opens the PIN e-sign modal — NOT an immediate mutation.
    await unlockBtn.click();
    await expect(page.getByTestId('unlock-version-modal')).toBeVisible();
    await expect(page.getByTestId('unlock-pin')).toBeVisible();
    await expect(page.getByTestId('unlock-confirm-checkbox')).toBeVisible();
    // Submit stays disabled until PIN + confirm are provided.
    await expect(page.getByTestId('unlock-submit')).toBeDisabled();

    await page.screenshot({ path: path.join(evidenceDir, 'A6-unlock-modal.png'), fullPage: true });
  });

  test('A6 — entering the PIN + confirming unlocks the version back to draft', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(`${baseURL}${formulationRoute}`, { waitUntil: 'networkidle' });

    await expect(page.getByTestId('formulation-editor')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('unlock-recipe-trigger').click();

    await page.getByTestId('unlock-pin').fill(esignPin);
    await page.getByTestId('unlock-confirm-checkbox').click();
    await expect(page.getByTestId('unlock-submit')).toBeEnabled();
    await page.getByTestId('unlock-submit').click();

    // On success the version returns to draft: the locked banner disappears and
    // the editor re-renders editable (Save draft re-enables).
    await expect(page.getByText(/locked and cannot be edited/i)).toBeHidden({ timeout: 10_000 });
    await expect(page.getByTestId('unlock-recipe-trigger')).toBeHidden();

    await page.screenshot({ path: path.join(evidenceDir, 'A6-unlocked-draft.png'), fullPage: true });
  });

  test('axe: the unlock PIN modal has 0 accessibility violations', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${baseURL}${formulationRoute}`, { waitUntil: 'networkidle' });

    await expect(page.getByTestId('formulation-editor')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('unlock-recipe-trigger').click();
    await expect(page.getByTestId('unlock-version-modal')).toBeVisible();

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

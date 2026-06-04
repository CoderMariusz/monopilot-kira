/**
 * T-118 — PARITY: FormulationEditor live panels E2E (Playwright) — browser
 * screenshot parity + live value updates + allergen alert + axe (0 violations).
 *
 * Covers the wiring landed by T-117 (NutritionPanel, CostPanel, AllergenPanel,
 * CompositionBar mounted into the merged formulation editor).
 *
 * Prototype anchor:
 *   prototypes/design/Monopilot Design System/npd/recipe.jsx:141-262 (RecipeScreen)
 *     sidebar order Nutrition → Cost → Allergen (recipe.jsx:253-258);
 *     CompositionBar below the ingredient table (recipe.jsx:230-250).
 *
 * The editor route is org-scoped + RBAC-gated, so live capture needs an
 * authenticated Supabase session against a running app server (Vercel preview or
 * `pnpm --filter web dev`). When PLAYWRIGHT_BASE_URL is unset (the default in this
 * isolated worktree) the live capture is SKIPPED, and the accepted fallback
 * evidence is the RTL DOM-artifact set written by
 * formulation-editor.wired.evidence.test.tsx into
 * apps/web/e2e/parity-evidence/npd/T-117/ (per UI-PROTOTYPE-PARITY-POLICY.md).
 * This spec is the harness that runs unchanged against a preview to produce pixel
 * screenshots + trace + the real axe report at Gate-5.
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const projectId = process.env.NPD_FORMULATION_PROJECT_ID ?? '00000000-0000-4000-8000-000000000000';
const evidenceDir = path.resolve(__dirname, 'parity-evidence/npd/T-118');
const route = `/en/pipeline/${projectId}/formulation`;

test.describe('NPD FormulationEditor live-panels parity (recipe.jsx:141-262)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL DOM fallback evidence used (T-117 parity-evidence/npd/T-117).',
  );

  test('mounts the four live panels in prototype order with a full-page screenshot (AC#1)', async ({ page }) => {
    await page.goto(`${baseURL}${route}`);

    await expect(page.getByTestId('formulation-editor')).toBeVisible();
    await expect(page.getByTestId('nutrition-panel')).toBeVisible();
    await expect(page.getByTestId('cost-panel')).toBeVisible();
    await expect(page.getByTestId('allergen-panel')).toBeVisible();
    await expect(page.getByTestId('composition-bar')).toBeVisible();

    // Sidebar order Nutrition → Cost → Allergen (recipe.jsx:253-258).
    const order = await page
      .getByTestId('live-panels')
      .locator('[data-testid$="-panel"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
    expect(order).toEqual(['nutrition-panel', 'cost-panel', 'allergen-panel']);

    await page.screenshot({ path: path.join(evidenceDir, 'T-118-ready.png'), fullPage: true });
  });

  test('editing an ingredient pct updates Nutrition + Cost + CompositionBar live (AC#2)', async ({ page }) => {
    await page.goto(`${baseURL}${route}`);
    await expect(page.getByTestId('cost-panel')).toBeVisible();

    const rawBefore = await page.getByTestId('cost-raw').textContent();
    const firstSegmentBefore = await page
      .getByTestId('composition-bar')
      .locator('[data-testid="composition-segment"]')
      .first()
      .getAttribute('style');

    const firstRow = page.getByTestId('ingredient-row').first();
    await firstRow.getByLabel('% w/w').fill('50');
    // Live recompute is synchronous (client useMemo) — give the strip a frame.
    await page.waitForTimeout(100);

    expect(await page.getByTestId('cost-raw').textContent()).not.toEqual(rawBefore);
    const firstSegmentAfter = await page
      .getByTestId('composition-bar')
      .locator('[data-testid="composition-segment"]')
      .first()
      .getAttribute('style');
    expect(firstSegmentAfter).not.toEqual(firstSegmentBefore);

    await page.screenshot({ path: path.join(evidenceDir, 'T-118-live-edit.png'), fullPage: true });
  });

  test('a gluten ingredient renders the allergen as present with a declared-on-label alert (AC#3)', async ({
    page,
  }) => {
    await page.goto(`${baseURL}${route}`);
    await expect(page.getByTestId('allergen-panel')).toBeVisible();

    await expect(page.getByTestId('allergen-cell-gluten')).toHaveAttribute('data-status', 'present');
    const alert = page.getByTestId('allergen-panel-alert');
    await expect(alert).toHaveAttribute('role', 'alert');
    await expect(alert).toContainText(/gluten|cereals/i);
  });

  test('editor page has 0 axe violations (AC#4)', async ({ page }) => {
    await page.goto(`${baseURL}${route}`);
    await expect(page.getByTestId('formulation-editor')).toBeVisible();

    type AxeAnalysis = { violations: Array<{ id: string; impact?: string | null }> };
    type AxeBuilderCtor = new (opts: { page: typeof page }) => { analyze(): Promise<AxeAnalysis> };
    const axeSpecifier = '@axe-core/playwright';
    const { default: AxeBuilder } = (await import(axeSpecifier)) as { default: AxeBuilderCtor };
    const axe = await new AxeBuilder({ page }).analyze();
    await import('node:fs').then(({ writeFileSync, mkdirSync }) => {
      mkdirSync(evidenceDir, { recursive: true });
      writeFileSync(path.join(evidenceDir, 'axe-report.json'), `${JSON.stringify(axe, null, 2)}\n`);
    });
    expect(axe.violations).toEqual([]);
  });
});

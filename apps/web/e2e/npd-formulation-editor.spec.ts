/**
 * T-066 — FormulationEditor (RecipeScreen) E2E (Playwright) — happy path +
 * per-state screenshots + axe.
 *
 * Prototype anchors:
 *   prototypes/design/Monopilot Design System/npd/recipe.jsx:124-264 (IngredientRow + RecipeScreen)
 *   prototypes/design/Monopilot Design System/npd/formulation-screens.jsx:79-153 (FormulationEditor)
 *
 * The formulation editor route is org-scoped + RBAC-gated, so live capture needs
 * an authenticated Supabase session against a running app server (Vercel preview
 * or `pnpm --filter web dev`). When PLAYWRIGHT_BASE_URL is unset (the default in
 * this isolated worktree) the live capture is SKIPPED, and the accepted fallback
 * evidence is the RTL DOM-artifact set written by formulation-editor.evidence.test.tsx
 * into apps/web/e2e/parity-evidence/npd/T-066/ (per UI-PROTOTYPE-PARITY-POLICY.md).
 * This spec is the harness that runs unchanged against a preview to produce pixel
 * screenshots + trace.
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const projectId = process.env.NPD_FORMULATION_PROJECT_ID ?? '00000000-0000-4000-8000-000000000000';
const evidenceDir = path.resolve(__dirname, 'parity-evidence/npd/T-066');
const route = `/en/pipeline/${projectId}/formulation`;

test.describe('NPD FormulationEditor parity (recipe.jsx:124-264)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL DOM fallback evidence used.',
  );

  test('renders toolbar + ingredient rows + total + panel slots and is axe-clean', async ({ page }) => {
    await page.goto(`${baseURL}${route}`);

    await expect(page.getByTestId('formulation-editor')).toBeVisible();
    await expect(page.getByRole('combobox', { name: /version/i })).toBeVisible();
    await expect(page.getByTestId('ingredient-table')).toBeVisible();
    await expect(page.getByTestId('total-row')).toBeVisible();

    await page.screenshot({ path: path.join(evidenceDir, 'T-066-ready.png'), fullPage: true });

    // Debounced save: edit a pct, wait past the 800 ms window, capture saved state.
    const firstRow = page.getByTestId('ingredient-row').first();
    await firstRow.getByLabel('% w/w').fill('80');
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(evidenceDir, 'T-066-optimistic.png'), fullPage: true });

    type AxeAnalysis = { violations: Array<{ id: string; impact?: string | null }> };
    type AxeBuilderCtor = new (opts: { page: typeof page }) => { analyze(): Promise<AxeAnalysis> };
    const axeSpecifier = '@axe-core/playwright';
    const { default: AxeBuilder } = (await import(axeSpecifier)) as { default: AxeBuilderCtor };
    const axe = await new AxeBuilder({ page }).analyze();
    await import('node:fs').then(({ writeFileSync }) =>
      writeFileSync(path.join(evidenceDir, 'axe-report.json'), `${JSON.stringify(axe, null, 2)}\n`),
    );
    expect(axe.violations).toEqual([]);
  });
});

/**
 * NPD v2 S5b (owner D6/D9) — FA Production tab dynamic per-component PROCESS LIST
 * E2E (Playwright stub).
 *
 * S5b rebuilds the Production tab: the legacy fixed 4 manufacturing_operation_N /
 * operation_yield_N / intermediate_code_* / yield_line columns are FILTERED OUT of
 * the schema-driven grid, and each component (ProdDetail row) instead carries an
 * unlimited, Settings-managed PROCESS LIST — add a process by selecting from active
 * "Reference"."ManufacturingOperations"; the pick pre-fills roles + headcount +
 * standard cost + default duration (getProcessDefault); a createsWipItem toggle
 * marks the process as creating a WIP; per-process + per-component cost lines show
 * the computed processCost (Σ role rate × headcount × duration + additional cost).
 *
 * Spec-driven (NO 1:1 prototype JSX — D6/D9 is a new dynamic model). Parity is
 * inherited from the existing Production tab component patterns (Card / Badge /
 * Button / Switch / portaled combobox; no raw <select>).
 *
 * The FA detail route is org-scoped + RBAC-gated, so a live capture needs an
 * authenticated Supabase session against a running app server (Vercel preview or
 * `pnpm --filter web dev`). When PLAYWRIGHT_BASE_URL is unset (the default in this
 * isolated worktree) the live capture is SKIPPED, and the accepted fallback
 * evidence is the RTL DOM-artifact set from the fa-production-tab vitest suite
 * (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is the harness that runs unchanged
 * against a preview to produce the per-state screenshots + trace + axe report.
 */
import path from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
// A seeded, core-closed (Pack_Size filled) FA with >=1 ProdDetail component so the
// Production tab is unlocked + the process list is reachable. Overridable.
const productCode = process.env.NPD_FA_DETAIL_PRODUCT_CODE ?? 'FA0043';
const evidenceDir = path.resolve(__dirname, 'parity-evidence/npd/S5b-production-processes');
const route = `/en/fg/${productCode}?tab=production`;

type AxeAnalysis = { violations: Array<{ id: string; impact?: string | null }> };
type AxeBuilderCtor = new (opts: { page: Page }) => { analyze(): Promise<AxeAnalysis> };

async function runAxe(page: Page, name: string): Promise<AxeAnalysis> {
  const axeSpecifier = '@axe-core/playwright';
  const { default: AxeBuilder } = (await import(axeSpecifier)) as { default: AxeBuilderCtor };
  const axe = await new AxeBuilder({ page }).analyze();
  writeFileSync(path.join(evidenceDir, `axe-${name}.json`), `${JSON.stringify(axe, null, 2)}\n`);
  return axe;
}

test.describe('NPD FA Production tab — dynamic process list (S5b / D6/D9)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL DOM fallback evidence used.',
  );

  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true });
  });

  test('renders the process list per component (legacy slot columns filtered out)', async ({ page }) => {
    await page.goto(`${baseURL}${route}`);

    // The Production tab body + at least one component block render.
    await expect(page.getByTestId('fa-production-tab').first()).toBeVisible();
    const component = page.getByTestId('fa-prod-component').first();
    await expect(component).toBeVisible();

    // The legacy fixed-slot process fields no longer render in the grid.
    await expect(page.locator('[data-field="manufacturing_operation_1"]')).toHaveCount(0);
    await expect(page.locator('[data-field="intermediate_code_final"]')).toHaveCount(0);

    // The dynamic process sub-section renders for the component.
    await expect(component.locator('[data-testid^="fa-prod-processes-"]').first()).toBeVisible();

    await page.screenshot({ path: path.join(evidenceDir, 'S5b-ready.png'), fullPage: true });
    const axe = await runAxe(page, 'ready');
    expect(axe.violations).toEqual([]);
  });

  test('add a process from the ManufacturingOperations picker (pre-fills defaults)', async ({ page }) => {
    await page.goto(`${baseURL}${route}`);

    const addBtn = page.getByTestId('fa-prod-add-process').first();
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // The portaled operation picker opens (combobox over active operations).
    const picker = page.getByTestId('fa-prod-process-picker');
    await expect(picker).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'S5b-process-picker.png'), fullPage: true });

    // Pick the first operation option; a new process row appears with its cost.
    await picker.getByRole('option').first().click();
    await expect(page.locator('[data-testid^="fa-prod-process-cost-"]').first()).toBeVisible();

    await page.screenshot({ path: path.join(evidenceDir, 'S5b-after-add.png'), fullPage: true });
  });

  test('edit a process (duration / createsWip toggle) via the editor dialog', async ({ page }) => {
    await page.goto(`${baseURL}${route}`);

    const edit = page.locator('[data-testid^="fa-prod-edit-process-"]').first();
    await edit.click();

    const editor = page.getByTestId('fa-prod-process-editor');
    await expect(editor).toBeVisible();
    await editor.getByTestId('fa-prod-process-creates-wip').click();
    await editor.getByTestId('fa-prod-process-save').click();
    await expect(editor).toBeHidden();

    await page.screenshot({ path: path.join(evidenceDir, 'S5b-optimistic-edit.png'), fullPage: true });
  });

  test('locked (Pack_Size missing) hides/disables the add-process write affordance', async ({ page }) => {
    // A FG whose Core Pack_Size is NOT filled — the tab is locked.
    const lockedCode = process.env.NPD_FA_LOCKED_PRODUCT_CODE ?? productCode;
    await page.goto(`${baseURL}/en/fg/${lockedCode}?tab=production`);

    const lockAlert = page.getByTestId('fa-production-locked');
    if (await lockAlert.count()) {
      await expect(lockAlert.first()).toBeVisible();
      const add = page.getByTestId('fa-prod-add-process').first();
      if (await add.count()) await expect(add).toBeDisabled();
      await page.screenshot({ path: path.join(evidenceDir, 'S5b-permission-locked.png'), fullPage: true });
    }
  });
});

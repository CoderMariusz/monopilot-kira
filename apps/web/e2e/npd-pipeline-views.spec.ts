/**
 * T-131 — Pipeline views parity (Kanban | Table | Split) E2E (Playwright).
 *
 * Prototype anchor:
 *   prototypes/design/Monopilot Design System/npd/pipeline.jsx:35-208
 *   (KanbanView 35-52 + TableView 54-88 + SplitView 89-131 + the page wrapper /
 *    view-mode + filter pills 133-208 — wired by T-130's pipeline-tabs switcher)
 *
 * Validates the T-130 wiring contract + the T-131 parity gate:
 *   - the WAI-ARIA tablist switches ?view=kanban|table|split WITHOUT a full reload
 *     (client navigation; the tabpanel swaps in place);
 *   - the shared ?filter=mine persists across all three view switches (the filter /
 *     sort / selection state lives only in the URL — never duplicated per view);
 *   - a full-page screenshot is captured per view for prototype-region comparison;
 *   - @axe-core/playwright runs on each view → 0 critical / 0 serious violations
 *     (per `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`).
 *
 * The pipeline route is org-scoped + RBAC-gated (npd.project.view), so live capture
 * needs an authenticated Supabase session against a running app server (Vercel
 * preview or `pnpm --filter web dev`). When PLAYWRIGHT_BASE_URL is unset (the
 * default in this isolated worktree) the live capture is SKIPPED, and the accepted
 * fallback evidence is the RTL DOM-artifact set produced by the component +
 * pipeline-tabs RTL suites (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is the
 * harness that runs unchanged against a preview to produce pixel screenshots +
 * trace + axe reports.
 */
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'parity-evidence/npd/T-131');
const selectedId = process.env.NPD_PIPELINE_SELECTED_ID ?? '';

const route = (view: 'kanban' | 'table' | 'split', extra = '') =>
  `${baseURL}/en/pipeline?view=${view}${extra}`;

type AxeAnalysis = { violations: Array<{ id: string; impact?: string | null }> };
type AxeBuilderCtor = new (opts: { page: Page }) => { analyze(): Promise<AxeAnalysis> };

async function runAxe(page: Page, name: string): Promise<void> {
  const axeSpecifier = '@axe-core/playwright';
  const { default: AxeBuilder } = (await import(axeSpecifier)) as { default: AxeBuilderCtor };
  const axe = await new AxeBuilder({ page }).analyze();
  const { writeFileSync } = await import('node:fs');
  writeFileSync(
    path.join(evidenceDir, `axe-${name}.json`),
    `${JSON.stringify(axe, null, 2)}\n`,
  );
  const blocking = axe.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(blocking, `axe critical/serious violations on ${name}`).toEqual([]);
}

test.describe('NPD pipeline views parity (pipeline.jsx:35-208)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL DOM fallback evidence used.',
  );

  test('Kanban view renders, is axe-clean, and captures parity screenshot', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(route('kanban'), { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('tablist', { name: /pipeline views/i })).toBeVisible();
    await expect(page.getByTestId('kanban-screen')).toBeVisible();
    await expect(page.getByRole('tab', { name: /kanban/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.screenshot({ path: path.join(evidenceDir, 'T-131-kanban.png'), fullPage: true });
    await runAxe(page, 'kanban');
  });

  test('Table view renders, is axe-clean, and captures parity screenshot', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(route('table'), { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('pipeline-table-screen')).toBeVisible();
    await expect(page.getByRole('tab', { name: /table/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.screenshot({ path: path.join(evidenceDir, 'T-131-table.png'), fullPage: true });
    await runAxe(page, 'table');
  });

  test('Split view renders, is axe-clean, and captures parity screenshot', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const extra = selectedId ? `&selected=${selectedId}` : '';
    await page.goto(route('split', extra), { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('split-screen')).toBeVisible();
    await expect(page.getByRole('tab', { name: /split/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.screenshot({ path: path.join(evidenceDir, 'T-131-split.png'), fullPage: true });
    await runAxe(page, 'split');
  });

  test('switching tabs does not full-reload and preserves shared ?filter=mine', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(route('kanban', '&filter=mine'), { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('kanban-screen')).toBeVisible();

    // Mark the loaded document so we can prove the tab switch did NOT reload it.
    await page.evaluate(() => {
      (window as unknown as { __pipelineNoReload?: boolean }).__pipelineNoReload = true;
    });

    // Switch Kanban → Table via the tab (client navigation).
    await page.getByRole('tab', { name: /table/i }).click();
    await expect(page.getByTestId('pipeline-table-screen')).toBeVisible();
    expect(new URL(page.url()).searchParams.get('view')).toBe('table');
    expect(new URL(page.url()).searchParams.get('filter')).toBe('mine');

    // The in-page marker survives → no full document reload occurred.
    const survived = await page.evaluate(
      () => (window as unknown as { __pipelineNoReload?: boolean }).__pipelineNoReload === true,
    );
    expect(survived, 'tab switch must not trigger a full document reload').toBe(true);

    // Switch Table → Split; ?filter=mine still persists.
    await page.getByRole('tab', { name: /split/i }).click();
    await expect(page.getByTestId('split-screen')).toBeVisible();
    expect(new URL(page.url()).searchParams.get('view')).toBe('split');
    expect(new URL(page.url()).searchParams.get('filter')).toBe('mine');

    await page.screenshot({
      path: path.join(evidenceDir, 'T-131-filter-persist.png'),
      fullPage: true,
    });
  });
});

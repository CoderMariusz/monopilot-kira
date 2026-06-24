/**
 * Wave E8 — Scheduler board + changeover-matrix E2E (Playwright) — per-state
 * screenshot / trace / axe harness for the new /scheduler board (replacing the
 * ModuleStubNotice stub) + /scheduler/changeover-matrix editor.
 *
 * Prototype anchors (spec-driven UI extending the planning schedule board):
 *   prototypes/design/Monopilot Design System/planning-ext/sequencing-screens.jsx:1-179
 *     (run/preview control + per-line proposed sequence + changeover cost summary)
 *   prototypes/design/Monopilot Design System/planning-ext/matrix-screens.jsx:1-247
 *     (N×N FROM\TO grid + single-cell editor)
 *
 * The routes are org-scoped + RBAC-gated (read via scheduler.run.read; run/apply/
 * edit via npd.planning.write), so live capture requires an authenticated
 * Supabase session against a running app server (Vercel preview or
 * `pnpm --filter web dev`). When PLAYWRIGHT_BASE_URL is unset (the default in
 * this isolated worktree) the live capture is SKIPPED and the accepted fallback
 * evidence is the RTL coverage:
 *   .../scheduler/__tests__/scheduler-board.test.tsx       (run → proposed sequence + apply-confirm)
 *   .../scheduler/__tests__/changeover-matrix.test.tsx     (grid + cell editor save)
 * (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is the unchanged harness that
 * produces pixel screenshots + trace + axe report against a preview.
 */
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/E8-scheduler');

test.describe('Scheduler board parity + states (sequencing-screens.jsx:1-179)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.',
  );

  test('board: run control + empty/idle state (loading→ready)', async ({ page }) => {
    await page.goto(`${baseURL}/en/scheduler`);
    await expect(page.locator('[data-screen="scheduler"]')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('scheduler-run-control')).toBeVisible();
    // Empty/idle until a run is generated.
    await expect(page.getByTestId('scheduler-empty')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'E8-board-empty.png'), fullPage: true });
  });

  test('board: run scheduler → proposed sequence per line', async ({ page }) => {
    await page.goto(`${baseURL}/en/scheduler`);
    await page.getByTestId('scheduler-run-button').click();
    const proposal = page.getByTestId('scheduler-proposal');
    if (await proposal.isVisible().catch(() => false)) {
      await expect(page.getByTestId('scheduler-total-cost')).toBeVisible();
      await page.screenshot({ path: path.join(evidenceDir, 'E8-board-proposal.png'), fullPage: true });
    } else {
      // No open WOs in the horizon → the inline run error/empty is the state.
      await page.screenshot({ path: path.join(evidenceDir, 'E8-board-no-work.png'), fullPage: true });
    }
  });

  test('board: apply schedule is gated behind a confirm dialog (optimistic)', async ({ page }) => {
    await page.goto(`${baseURL}/en/scheduler`);
    await page.getByTestId('scheduler-run-button').click();
    const applyBtn = page.getByTestId('scheduler-apply-button');
    if (await applyBtn.isEnabled().catch(() => false)) {
      await applyBtn.click();
      await expect(page.getByTestId('scheduler-apply-confirm')).toBeVisible();
      await page.screenshot({ path: path.join(evidenceDir, 'E8-apply-confirm.png'), fullPage: true });
    }
  });

  test('matrix: from→to grid + single-cell editor', async ({ page }) => {
    await page.goto(`${baseURL}/en/scheduler/changeover-matrix`);
    await expect(page.locator('[data-screen="scheduler-changeover-matrix"]')).toBeVisible();
    const grid = page.getByTestId('changeover-matrix');
    if (await grid.isVisible().catch(() => false)) {
      await page.screenshot({ path: path.join(evidenceDir, 'E8-matrix-grid.png'), fullPage: true });
    } else {
      await expect(page.getByTestId('matrix-empty')).toBeVisible();
      await page.screenshot({ path: path.join(evidenceDir, 'E8-matrix-empty.png'), fullPage: true });
    }
  });

  test('axe: scheduler board has no critical/serious violations', async ({ page }) => {
    await page.goto(`${baseURL}/en/scheduler`);
    await expect(page.locator('[data-screen="scheduler"]')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});

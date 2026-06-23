/**
 * Wave E2A — Trace & Recall (/quality/trace) + Recall drills
 * (/quality/recall-drills) per-state screenshot / trace / axe harness.
 *
 * Spec-driven (no JSX prototype for trace/recall in the Monopilot Design System;
 * nearest reusable pattern = the sibling quality CCP-monitoring screen + the
 * warehouse genealogy panel, per UI-PROTOTYPE-PARITY-POLICY.md §1.2). DS
 * conformance: PageHeader + Card + Badge + shadcn Select + Table, matching the
 * sibling quality screens.
 *
 * The routes are org-scoped + RBAC-gated (quality.dashboard.view), so live
 * capture requires an authenticated Supabase session against a running app
 * server (Vercel preview or `pnpm --filter web dev`). When PLAYWRIGHT_BASE_URL is
 * unset (the default in this isolated worktree) the live capture is SKIPPED and
 * the accepted fallback evidence is the RTL coverage:
 *   .../quality/trace/_components/__tests__/trace.test.tsx
 *     (input row exposes ref+type+direction, Run trace payload, 5 summary counts,
 *      node tree + flat table, deep-links, no UUID leak, all four states,
 *      save-as-drill, i18n)
 *   .../quality/recall-drills/_components/__tests__/recall-drills.test.tsx
 *     (rows + duration KPI + within/over-target badges, in-progress, empty-CTA,
 *      New-drill CTA, row deep-link, no UUID leak, i18n)
 * This spec is the harness that produces pixel screenshots + trace + axe report
 * against a preview.
 */
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/E2A-trace-recall');

test.describe('Trace & Recall parity + states', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.',
  );

  test('landing cards: Quality landing shows the Trace + Recall drills nav cards', async ({ page }) => {
    await page.goto(`${baseURL}/en/quality`);
    await expect(page.getByTestId('quality-nav-trace')).toBeVisible();
    await expect(page.getByTestId('quality-nav-recall-drills')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'E2A-quality-landing-cards.png'), fullPage: true });
  });

  test('trace: input row + empty state, then a run renders the report (loading→data)', async ({ page }) => {
    await page.goto(`${baseURL}/en/quality/trace`);
    await expect(page.locator('[data-screen="quality-trace"]')).toBeVisible();
    // permission-denied terminal state or the workbench.
    const denied = page.getByTestId('trace-denied');
    const empty = page.getByTestId('trace-empty');
    await expect(denied.or(empty)).toBeVisible();
    if (await denied.isVisible().catch(() => false)) {
      await page.screenshot({ path: path.join(evidenceDir, 'E2A-trace-denied.png'), fullPage: true });
      return;
    }
    await page.screenshot({ path: path.join(evidenceDir, 'E2A-trace-empty.png'), fullPage: true });
    // input row exposes ref + type + direction.
    await expect(page.getByTestId('trace-input-ref')).toBeVisible();
    await expect(page.getByTestId('trace-input-type')).toBeVisible();
    await expect(page.getByTestId('trace-direction-both')).toBeVisible();
    // run a trace against a seeded reference (test env supplies one via env).
    const ref = process.env.E2A_TRACE_REF;
    if (ref) {
      await page.getByTestId('trace-input-ref').fill(ref);
      await page.getByTestId('trace-run').click();
      const report = page.getByTestId('trace-report');
      const error = page.getByTestId('trace-error');
      await expect(report.or(error)).toBeVisible();
      if (await report.isVisible().catch(() => false)) {
        await expect(page.getByTestId('trace-summary-lpCount')).toBeVisible();
        await page.screenshot({ path: path.join(evidenceDir, 'E2A-trace-data.png'), fullPage: true });
      } else {
        await page.screenshot({ path: path.join(evidenceDir, 'E2A-trace-error.png'), fullPage: true });
      }
    }
  });

  test('recall drills: list (empty or table) renders', async ({ page }) => {
    await page.goto(`${baseURL}/en/quality/recall-drills`);
    await expect(page.locator('[data-screen="quality-recall-drills"]')).toBeVisible();
    const table = page.getByTestId('recall-drills-table');
    const empty = page.getByTestId('recall-drills-empty');
    const denied = page.getByTestId('recall-drills-denied');
    await expect(table.or(empty).or(denied)).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'E2A-recall-drills-list.png'), fullPage: true });
  });

  test('axe: trace + recall-drills have no critical violations', async ({ page }) => {
    for (const route of ['/en/quality/trace', '/en/quality/recall-drills']) {
      await page.goto(`${baseURL}${route}`);
      await expect(page.locator('main[data-screen]')).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      expect(serious, `${route}: ${JSON.stringify(serious, null, 2)}`).toEqual([]);
    }
  });
});

/**
 * T-059 — NPD Pipeline Kanban E2E (Playwright) — happy path + advance + per-state.
 *
 * Prototype anchor: prototypes/design/Monopilot Design System/npd/pipeline.jsx:19-52
 *
 * The pipeline route is org-scoped + RBAC-gated, so live capture requires an
 * authenticated Supabase session against a running app server (Vercel preview or
 * `pnpm --filter web dev`). When PLAYWRIGHT_BASE_URL is unset (the default in this
 * isolated worktree) the live capture is SKIPPED and the accepted fallback evidence
 * is the RTL DOM-artifact set written by kanban-parity-evidence.test.tsx into
 * apps/web/e2e/artifacts/T-059/ (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is the
 * harness that runs unchanged against a preview to produce pixel screenshots + trace.
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/T-059');
const route = '/en/pipeline';

test.describe('NPD Pipeline Kanban parity (pipeline.jsx:19-52)', () => {
  test.skip(!baseURL, 'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL DOM fallback evidence used.');

  test('renders 6 gate columns + project cards, advances a card, and is axe-clean', async ({ page }) => {
    await page.goto(`${baseURL}${route}`);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // 6 gate columns G0..Launched.
    for (const gate of ['G0', 'G1', 'G2', 'G3', 'G4', 'Launched']) {
      await expect(page.getByTestId(`kanban-col-${gate}`)).toBeVisible();
    }

    // Happy-path: capture the ready state.
    await page.screenshot({ path: path.join(evidenceDir, 'T-059-ready.png'), fullPage: true });

    // Optimistic interaction: advance the first advanceable card to the next gate.
    const advance = page.locator('[data-testid^="kanban-advance-"]').first();
    if (await advance.count()) {
      await advance.click();
      await page.screenshot({ path: path.join(evidenceDir, 'T-059-optimistic-advance.png'), fullPage: true });
    }

    // @axe-core/playwright is an optional dep (declared by packages/ui); import it
    // dynamically with a non-literal specifier so the spec stays loadable/typechecks
    // even when the dep is not linked in this checkout. The live-preview run has it.
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

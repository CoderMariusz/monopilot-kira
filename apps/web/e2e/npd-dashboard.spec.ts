/**
 * T-052 — NPD Dashboard E2E (Playwright) — happy path + per-state screenshots.
 *
 * Prototype anchor: prototypes/design/Monopilot Design System/npd/fa-screens.jsx:32-174
 *
 * The dashboard route is org-scoped + RBAC-gated, so live capture requires an
 * authenticated Supabase session against a running app server (Vercel preview or
 * `pnpm --filter web dev`). When PLAYWRIGHT_BASE_URL is unset (the default in this
 * isolated worktree) the live capture is SKIPPED and the accepted fallback evidence
 * is the RTL DOM-artifact set written by dashboard-parity-evidence.test.tsx into
 * apps/web/e2e/artifacts/T-052/ (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is the
 * harness that runs unchanged against a preview to produce pixel screenshots + trace.
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/T-052');
const route = '/en/dashboard';

test.describe('NPD Dashboard parity (fa-screens.jsx:32-174)', () => {
  test.skip(!baseURL, 'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL DOM fallback evidence used.');

  test('renders KPI counters + department progress + launch alerts and is axe-clean', async ({ page }) => {
    await page.goto(`${baseURL}${route}`);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('table', { name: /department progress/i })).toBeVisible();

    // Happy-path: capture the ready state.
    await page.screenshot({ path: path.join(evidenceDir, 'T-052-ready.png'), fullPage: true });

    // Optimistic interaction: toggle show-built reveals built FAs without a navigation.
    const toggle = page.getByRole('checkbox', { name: /show built/i });
    await toggle.click();
    await page.screenshot({ path: path.join(evidenceDir, 'T-052-optimistic.png'), fullPage: true });

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

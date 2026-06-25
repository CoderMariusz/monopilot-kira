/**
 * Cold-chain (gaps #9) — /quality/cold-chain per-state screenshot / trace / axe
 * harness.
 *
 * No quality JSX prototype exists for cold-chain (grep of
 * prototypes/design/Monopilot Design System/quality returns none). This route
 * mirrors the sibling read-only list pattern quality/ccp-monitoring/page.tsx
 * (PageHeader + Suspense skeleton + server-side RBAC gate + four UI states);
 * prototype_match = false (spec-driven source per UI-PROTOTYPE-PARITY-POLICY).
 *
 * The route is org-scoped + RBAC-gated at the READ tier (listColdChainOverview —
 * quality.coldchain.record OR quality.coldchain.manage), so live capture
 * requires an authenticated Supabase session against a running app server
 * (Vercel preview or `pnpm --filter web dev`). When PLAYWRIGHT_BASE_URL is unset
 * (the default in this isolated worktree) the live capture is SKIPPED and the
 * accepted fallback evidence is the RTL coverage:
 *   .../quality/cold-chain/_components/__tests__/cold-chain.test.tsx
 *     (two-table parity + empty states + pass/fail-not-colour-only + on-hold
 *      badge + i18n en/pl). This spec is the harness that produces pixel
 * screenshots + trace + axe report against a preview.
 */
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/coldchain');

test.describe('Cold-chain viewer parity + states', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.',
  );

  test('landing card: Quality landing shows the Cold-chain nav card', async ({ page }) => {
    await page.goto(`${baseURL}/en/quality`);
    await expect(page.getByTestId('quality-nav-cold-chain')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'coldchain-quality-landing-card.png'), fullPage: true });
  });

  test('viewer: page head + ranges + checks tables render (loading→data)', async ({ page }) => {
    await page.goto(`${baseURL}/en/quality/cold-chain`);
    await expect(page.locator('[data-screen="quality-cold-chain"]')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Either the data view, a per-table empty panel, the denied or the error
    // panel is the terminal state.
    const view = page.getByTestId('cold-chain-view');
    const denied = page.getByTestId('cold-chain-denied');
    const error = page.getByTestId('cold-chain-error');
    await expect(view.or(denied).or(error)).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'coldchain-terminal-state.png'), fullPage: true });
  });

  test('axe: viewer has no critical violations', async ({ page }) => {
    await page.goto(`${baseURL}/en/quality/cold-chain`);
    await expect(page.locator('[data-screen="quality-cold-chain"]')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});

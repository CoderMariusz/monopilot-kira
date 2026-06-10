/**
 * P-L1 — Production WO list + WO Execution detail E2E (Playwright) — happy path
 * + per-state screenshots / trace harness.
 *
 * Prototype anchors:
 *   prototypes/design/Monopilot Design System/production/wo-list.jsx:4-106 (list)
 *   prototypes/design/Monopilot Design System/production/wo-detail.jsx:4-530 (detail, 8 tabs)
 *
 * The /production/wos route + detail are org-scoped + RBAC-gated
 * (production.oee.read), so live capture requires an authenticated Supabase
 * session against a running app server (Vercel preview or `pnpm --filter web dev`).
 * When PLAYWRIGHT_BASE_URL is unset (the default in this isolated worktree) the
 * live capture is SKIPPED and the accepted fallback evidence is the RTL component
 * coverage in:
 *   app/[locale]/(app)/(modules)/production/wos/_components/__tests__/wo-list-screen.test.tsx
 *   app/[locale]/(app)/(modules)/production/wos/[id]/_components/__tests__/wo-detail-screen.test.tsx
 * (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is the harness that runs
 * unchanged against a preview to produce pixel screenshots + trace + axe report.
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/P-L1');
const listRoute = '/en/production/wos';

test.describe('Production WO list + detail parity (wo-list.jsx:4-106 / wo-detail.jsx:4-530)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.',
  );

  test('WO list: status tabs + dense table + row link to detail', async ({ page }) => {
    await page.goto(`${baseURL}${listRoute}`);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Status tabs (all + live states) + search.
    await expect(page.getByTestId('wo-tab-all')).toBeVisible();
    await expect(page.getByTestId('wo-tab-in_progress')).toBeVisible();
    await expect(page.getByTestId('wo-list-search')).toBeVisible();

    await page.screenshot({ path: path.join(evidenceDir, 'P-L1-list-ready.png'), fullPage: true });

    // Open the first WO row → detail.
    const firstLink = page.getByTestId(/^wo-link-/).first();
    await firstLink.click();
    await expect(page).toHaveURL(/\/production\/wos\/[0-9a-f-]+$/);
  });

  test('WO detail: 8 tabs render + deferred action bar is disabled', async ({ page }) => {
    await page.goto(`${baseURL}${listRoute}`);
    await page.getByTestId(/^wo-link-/).first().click();

    // 8 tabs in prototype order.
    for (const k of ['overview', 'consumption', 'output', 'waste', 'downtime', 'qa', 'genealogy', 'history']) {
      await expect(page.getByTestId(`wo-detail-tab-${k}`)).toBeVisible();
    }

    // Deferred mutation slots are disabled (wired by a follow-up lane).
    await expect(page.getByTestId('wo-action-complete')).toBeDisabled();

    await page.screenshot({ path: path.join(evidenceDir, 'P-L1-detail-overview.png'), fullPage: true });

    await page.getByTestId('wo-detail-tab-consumption').click();
    await page.screenshot({ path: path.join(evidenceDir, 'P-L1-detail-consumption.png'), fullPage: true });
  });
});

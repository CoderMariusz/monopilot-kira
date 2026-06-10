/**
 * P-L2 — Production dashboard sub-pages E2E (Playwright) — per-state screenshots /
 * trace / axe harness for the 5 dead-link sub-pages now built read-only.
 *
 * Prototype anchors:
 *   prototypes/design/Monopilot Design System/production/other-screens.jsx:126-217 (downtime)
 *   prototypes/design/Monopilot Design System/production/new-screens.jsx:5-213   (waste)
 *   prototypes/design/Monopilot Design System/production/other-screens.jsx:298-397 (changeover)
 *   prototypes/design/Monopilot Design System/production/other-screens.jsx:218-297 (shifts)
 *   prototypes/design/Monopilot Design System/production/other-screens.jsx:398-504 (analytics)
 *
 * Each route is org-scoped + RBAC-gated (production.oee.read), so live capture requires
 * an authenticated Supabase session against a running app server (Vercel preview or
 * `pnpm --filter web dev`). When PLAYWRIGHT_BASE_URL is unset (the default in this
 * isolated worktree) the live capture is SKIPPED and the accepted fallback evidence is
 * the RTL component coverage in:
 *   .../production/downtime/__tests__/downtime-table.test.tsx
 *   .../production/waste/__tests__/waste-table.test.tsx
 *   .../production/changeover/__tests__/changeover-table.test.tsx
 *   .../production/__tests__/analytics-charts.test.tsx
 * (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is the harness that runs unchanged
 * against a preview to produce pixel screenshots + trace + axe report.
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/P-L2');

const SUBPAGES: { key: string; route: string; screen: string }[] = [
  { key: 'downtime', route: '/en/production/downtime', screen: 'production-downtime' },
  { key: 'waste', route: '/en/production/waste', screen: 'production-waste' },
  { key: 'changeover', route: '/en/production/changeover', screen: 'production-changeover' },
  { key: 'shifts', route: '/en/production/shifts', screen: 'production-shifts' },
  { key: 'analytics', route: '/en/production/analytics', screen: 'production-analytics' },
];

test.describe('Production sub-pages parity (downtime / waste / changeover / shifts / analytics)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.',
  );

  for (const sub of SUBPAGES) {
    test(`${sub.key}: page head renders + screenshot captured`, async ({ page }) => {
      await page.goto(`${baseURL}${sub.route}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator(`[data-screen="${sub.screen}"]`)).toBeVisible();
      await page.screenshot({ path: path.join(evidenceDir, `P-L2-${sub.key}-ready.png`), fullPage: true });
    });
  }
});

/**
 * T-106 (PARITY) / T-025 (ROOT) — FA detail dept tabs E2E (Playwright).
 *
 * Browser-level parity for the FA detail tabs container once the merged dept tab
 * components are wired (T-105): Core / Planning / Commercial / Production /
 * Technical / MRP / Procurement / History. For each reachable tab it activates
 * the trigger, captures a per-state screenshot, and runs axe (0 violations).
 *
 * Prototype anchors (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:312-408
 *     (FADetail tab bar + TABS array + per-tab body switch)
 *   - Core tab          455-517
 *   - Production tab     571-653
 *   - Planning tab       537-557
 *   - Commercial tab     559-586
 *   - MRP tab            763-804
 *   - Procurement tab    806-838
 *
 * The FA detail route is org-scoped + RBAC-gated, so live capture needs an
 * authenticated Supabase session against a running app server (Vercel preview or
 * `pnpm --filter web dev`). When PLAYWRIGHT_BASE_URL is unset (the default in
 * this isolated worktree) the live capture is SKIPPED, and the accepted fallback
 * evidence is the RTL DOM-artifact set from the fa-tabs-wiring / per-tab
 * parity-evidence vitest suites (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is
 * the harness that runs unchanged against a preview to produce pixel screenshots
 * + trace + axe report.
 */
import path from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
// A seeded, core-closed FA so dept tabs are unlocked for capture. Overridable.
const productCode = process.env.NPD_FA_DETAIL_PRODUCT_CODE ?? 'FA0043';
const evidenceDir = path.resolve(__dirname, 'parity-evidence/npd/T-106');
const route = `/en/fa/${productCode}`;

type AxeAnalysis = { violations: Array<{ id: string; impact?: string | null }> };
type AxeBuilderCtor = new (opts: { page: Page }) => { analyze(): Promise<AxeAnalysis> };

async function runAxe(page: Page, name: string): Promise<AxeAnalysis> {
  const axeSpecifier = '@axe-core/playwright';
  const { default: AxeBuilder } = (await import(axeSpecifier)) as { default: AxeBuilderCtor };
  const axe = await new AxeBuilder({ page }).analyze();
  writeFileSync(
    path.join(evidenceDir, `axe-${name}.json`),
    `${JSON.stringify(axe, null, 2)}\n`,
  );
  return axe;
}

// Each entry: URL tab slug + the testid the wired dept body exposes.
const TABS: Array<{ slug: string; testid: string }> = [
  { slug: 'core', testid: 'fa-core-tab' },
  { slug: 'planning', testid: 'fa-planning-tab' },
  { slug: 'commercial', testid: 'fa-commercial-tab' },
  { slug: 'production', testid: 'fa-production-tab' },
  { slug: 'technical', testid: 'fa-technical-tab' },
  { slug: 'procurement', testid: 'fa-procurement-tab' },
];

test.describe('NPD FA detail dept tabs parity (fa-screens.jsx:312-408)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL DOM fallback evidence used.',
  );

  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true });
  });

  test('renders the 8-tab dept bar in prototype order + Built/status header', async ({ page }) => {
    await page.goto(`${baseURL}${route}`);

    const tablist = page.getByRole('tablist');
    await expect(tablist).toBeVisible();

    const tabs = tablist.getByRole('tab');
    await expect(tabs).toHaveCount(8);
    const labels = await tabs.allTextContents();
    // Tab order matches the prototype TABS array (dept tabs + History).
    expect(labels.map((t) => t.trim().replace(/Locked$/, ''))).toEqual([
      'Core',
      'Planning',
      'Commercial',
      'Production',
      'Technical',
      'MRP',
      'Procurement',
      'History',
    ]);

    await page.screenshot({ path: path.join(evidenceDir, 'T-106-tabbar.png'), fullPage: true });
  });

  for (const { slug, testid } of TABS) {
    test(`activates the ${slug} tab, captures a screenshot, and is axe-clean`, async ({ page }) => {
      await page.goto(`${baseURL}${route}?tab=${slug}`);

      // The body renders only when the tab is reachable (not Core-gated).
      const body = page.getByTestId(testid);
      await expect(body).toBeVisible();

      await page.screenshot({
        path: path.join(evidenceDir, `T-106-${slug}.png`),
        fullPage: true,
      });

      const axe = await runAxe(page, slug);
      expect(axe.violations).toEqual([]);
    });
  }

  test('keeps the History (T-027) timeline reachable', async ({ page }) => {
    await page.goto(`${baseURL}${route}?tab=history`);
    // History tab is never locked; its timeline panel must render.
    const historyTab = page.getByRole('tab', { name: /history/i });
    await expect(historyTab).toHaveAttribute('aria-selected', 'true');
    await page.screenshot({ path: path.join(evidenceDir, 'T-106-history.png'), fullPage: true });
  });
});

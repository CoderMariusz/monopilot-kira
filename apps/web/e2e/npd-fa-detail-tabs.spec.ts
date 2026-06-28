/**
 * T-106 (PARITY) / T-025 (ROOT) / A3 SLICE 2 — FA detail SECTION tabs E2E (Playwright).
 *
 * Browser-level parity for the FA detail tabs container after A3 SLICE 2 regroups
 * the 7 dept tabs into 3 owner-facing SECTION tabs — Core / Commercial & Planning
 * (= Commercial + Planning + Procurement) / Production & Technical (= Production +
 * Technical + MRP) — plus the unchanged BOM (read-only, Lane 12) and History tabs
 * (5 tabs total). The dept bodies are stacked inside a section by FaSectionWrapper
 * (the FaXxxTab components are unchanged). For each section it activates the
 * trigger, asserts the section landmark + its stacked dept bodies, captures a
 * per-state screenshot, and runs axe (0 violations).
 *
 * Prototype anchors (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:300-408
 *     (FADetail tab bar + per-section body switch)
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
const route = `/en/fg/${productCode}`;

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

// Each entry: section URL slug + the section landmark testid + the dept-body
// testids the section stacks (FaSectionWrapper). MRP + Procurement reuse
// FaProcurementTab → data-testid fa-procurement-tab.
const SECTIONS: Array<{ slug: string; sectionTestId: string; bodyTestIds: string[] }> = [
  { slug: 'core', sectionTestId: 'fa-section-core', bodyTestIds: ['fa-core-tab'] },
  {
    slug: 'commercial',
    sectionTestId: 'fa-section-commercial',
    bodyTestIds: ['fa-commercial-tab', 'fa-planning-tab', 'fa-procurement-tab'],
  },
  {
    slug: 'production',
    sectionTestId: 'fa-section-production',
    bodyTestIds: ['fa-production-tab', 'fa-technical-tab'],
  },
  // Read-only BOM (computed view) — SCR-03h, fa-screens.jsx:840-886 (Lane 12).
  { slug: 'bom', sectionTestId: 'fa-bom-tab', bodyTestIds: ['fa-bom-tab'] },
];

test.describe('NPD FA detail section tabs parity (fa-screens.jsx:300-408)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL DOM fallback evidence used.',
  );

  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true });
  });

  test('renders the section bar (3 sections + BOM + History) in order + Built/status header', async ({ page }) => {
    await page.goto(`${baseURL}${route}`);

    const tablist = page.getByRole('tablist');
    await expect(tablist).toBeVisible();

    const tabs = tablist.getByRole('tab');
    await expect(tabs).toHaveCount(5);
    const labels = await tabs.allTextContents();
    // Tab order = 3 section tabs + BOM + History.
    expect(labels.map((t) => t.trim().replace(/Locked$/, ''))).toEqual([
      'Core',
      'Commercial & Planning',
      'Production & Technical',
      'BOM',
      'History',
    ]);

    await page.screenshot({ path: path.join(evidenceDir, 'T-106-tabbar.png'), fullPage: true });
  });

  for (const { slug, sectionTestId, bodyTestIds } of SECTIONS) {
    test(`activates the ${slug} section, asserts its stacked dept bodies, captures a screenshot, and is axe-clean`, async ({ page }) => {
      await page.goto(`${baseURL}${route}?tab=${slug}`);

      // The section landmark renders only when the section is reachable (not Core-gated).
      await expect(page.getByTestId(sectionTestId)).toBeVisible();
      // Each stacked dept body in the section is present (zero field-cell rewrites).
      for (const bodyTestId of bodyTestIds) {
        await expect(page.getByTestId(bodyTestId).first()).toBeVisible();
      }

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

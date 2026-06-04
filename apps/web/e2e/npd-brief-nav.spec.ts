/**
 * T-121 / T-122 — Brief list↔detail navigation + parity E2E (Playwright).
 *
 * Prototype anchor: prototypes/design/Monopilot Design System/npd/brief-screens.jsx
 *   - BriefList   : 7-82
 *   - BriefDetail : 84-231
 *
 * The briefs routes are org-scoped + RBAC-gated, so live capture requires an
 * authenticated Supabase session against a running app server (Vercel preview or
 * `pnpm --filter web dev`). When PLAYWRIGHT_BASE_URL is unset (the default in
 * this isolated worktree) the live capture is SKIPPED; the accepted fallback
 * evidence for the wiring is the RTL suite
 * `app/[locale]/(app)/(npd)/briefs/__tests__/wiring.test.tsx` (per
 * UI-PROTOTYPE-PARITY-POLICY.md). This spec is the harness that runs unchanged
 * against a preview to produce the list→detail nav proof, per-state screenshots,
 * a trace, and an axe report for both screens (T-122 parity).
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/T-121');
const listRoute = '/en/briefs';

type AxeAnalysis = { violations: Array<{ id: string; impact?: string | null }> };
type AxeBuilderCtor = new (opts: { page: unknown }) => { analyze(): Promise<AxeAnalysis> };

async function runAxe(page: unknown, outFile: string): Promise<AxeAnalysis> {
  // @axe-core/playwright is an optional dep; import via a non-literal specifier
  // so the spec stays loadable/typechecks even when the dep is not linked here.
  const axeSpecifier = '@axe-core/playwright';
  const { default: AxeBuilder } = (await import(axeSpecifier)) as { default: AxeBuilderCtor };
  const axe = await new AxeBuilder({ page }).analyze();
  await import('node:fs').then(({ writeFileSync, mkdirSync }) => {
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(path.join(evidenceDir, outFile), `${JSON.stringify(axe, null, 2)}\n`);
  });
  return axe;
}

test.describe('NPD Brief navigation + parity (brief-screens.jsx:7-82 / 84-231)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL wiring.test.tsx is the accepted fallback evidence.',
  );

  test('list renders, row → detail navigates, back → list returns, both axe-clean', async ({ page }) => {
    // ---- Brief list (parity 7-82) ----
    await page.goto(`${baseURL}${listRoute}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const table = page.getByRole('table');
    await expect(table).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'T-121-list-ready.png'), fullPage: true });

    const listAxe = await runAxe(page, 'axe-list.json');
    expect(listAxe.violations).toEqual([]);

    // ---- list → detail navigation (AC#1) ----
    const firstRowLink = page.getByRole('link', { name: /^DEV/ }).first();
    const devCode = (await firstRowLink.textContent())?.trim() ?? '';
    await firstRowLink.click();

    // URL must resolve to the consolidated /<locale>/briefs/<id> detail route.
    await expect(page).toHaveURL(/\/en\/briefs\/[0-9a-f-]+/i);
    await expect(page.getByTestId('brief-detail')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'T-121-detail-ready.png'), fullPage: true });

    // breadcrumb reads NPD / Briefs / <devCode> (AC#3).
    const breadcrumb = page.getByRole('navigation', { name: /breadcrumb/i });
    await expect(breadcrumb).toContainText('Briefs');
    if (devCode) await expect(breadcrumb).toContainText(devCode);

    const detailAxe = await runAxe(page, 'axe-detail.json');
    expect(detailAxe.violations).toEqual([]);

    // ---- back → list via the breadcrumb crumb (AC#2) ----
    await page.getByTestId('brief-detail-breadcrumb-list').click();
    await expect(page).toHaveURL(/\/en\/briefs\/?$/);
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('modal host: ?modal=briefCreate opens the Create modal on the list', async ({ page }) => {
    await page.goto(`${baseURL}${listRoute}?modal=briefCreate`);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'T-121-create-modal.png'), fullPage: true });
    const modalAxe = await runAxe(page, 'axe-create-modal.json');
    expect(modalAxe.violations).toEqual([]);
  });
});

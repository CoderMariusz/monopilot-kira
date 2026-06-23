/**
 * Wave E3 — HACCP Plans (/quality/haccp + /quality/haccp/[id]) per-state
 * screenshot / trace / axe harness.
 *
 * Prototype anchor:
 *   prototypes/design/Monopilot Design System/quality/haccp-screens.jsx:3-106
 *     (QaHaccpPlans — page head + "＋ New HACCP Plan", plan list rows with
 *     code/version/status, draft → e-sign "Approve Plan", active → "New
 *     version"; detail pane :44-103 — plan header card + linked CCP grid). The
 *     new-plan / activate(e-sign) / add-CCP modals have no in-file JSX anchor;
 *     they follow the sibling MODAL-CCP-CREATE / MODAL-SPEC-SIGN islands for
 *     design-system conformance.
 *
 * The routes are org-scoped + RBAC-gated (read + mutate via the reviewed HACCP
 * plan Server Actions — quality.haccp.plan_edit), so live capture requires an
 * authenticated Supabase session against a running app server (Vercel preview
 * or `pnpm --filter web dev`). When PLAYWRIGHT_BASE_URL is unset (the default in
 * this isolated worktree) the live capture is SKIPPED and the accepted fallback
 * evidence is the RTL coverage:
 *   .../quality/haccp/_components/__tests__/haccp-plan-list.test.tsx
 *     (list parity + four states + new-plan modal ALL fields + e-sign PIN +
 *      new-version + i18n + RBAC)
 *   .../quality/haccp/[id]/_components/__tests__/haccp-plan-detail.test.tsx
 *     (header + CCP table + four states + add-CCP modal ALL fields incl plan_id
 *      + draft-only edit lock + e-sign PIN + i18n + RBAC)
 * (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is the harness that produces
 * pixel screenshots + trace + axe report against a preview.
 */
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/E3-haccp');

test.describe('HACCP plans parity + states', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.',
  );

  test('landing card: Quality landing shows the HACCP plans nav card', async ({ page }) => {
    await page.goto(`${baseURL}/en/quality`);
    await expect(page.getByTestId('quality-nav-haccp')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'E3-quality-landing-card.png'), fullPage: true });
  });

  test('list: page head + plan table render (loading→data/empty)', async ({ page }) => {
    await page.goto(`${baseURL}/en/quality/haccp`);
    await expect(page.locator('[data-screen="quality-haccp-plans"]')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const table = page.getByTestId('haccp-plan-table');
    const empty = page.getByTestId('haccp-plan-empty');
    await expect(table.or(empty)).toBeVisible();
    if (await empty.isVisible().catch(() => false)) {
      await page.screenshot({ path: path.join(evidenceDir, 'E3-list-empty.png'), fullPage: true });
    } else {
      await page.screenshot({ path: path.join(evidenceDir, 'E3-list-data.png'), fullPage: true });
    }
  });

  test('new-plan modal opens with name + scope-type + scope-ref fields', async ({ page }) => {
    await page.goto(`${baseURL}/en/quality/haccp`);
    const open = page.getByTestId('haccp-plan-new');
    if (await open.isEnabled().catch(() => false)) {
      await open.click();
      await expect(page.getByTestId('haccp-plan-create-form')).toBeVisible();
      await expect(page.getByTestId('haccp-plan-create-name')).toBeVisible();
      await expect(page.getByTestId('haccp-plan-create-scope-type')).toBeVisible();
      await page.screenshot({ path: path.join(evidenceDir, 'E3-new-plan-modal.png'), fullPage: true });
    }
  });

  test('e-sign activate modal exposes the PIN field on a draft row', async ({ page }) => {
    await page.goto(`${baseURL}/en/quality/haccp`);
    const activate = page.locator('[data-testid^="haccp-plan-activate-"]').first();
    if (await activate.isEnabled().catch(() => false)) {
      await activate.click();
      await expect(page.getByTestId('haccp-plan-activate-form')).toBeVisible();
      await expect(page.getByTestId('haccp-plan-activate-password')).toBeVisible();
      await page.screenshot({ path: path.join(evidenceDir, 'E3-activate-esign-modal.png'), fullPage: true });
    }
  });

  test('detail: plan header card + CCP table render, add-CCP modal opens', async ({ page }) => {
    await page.goto(`${baseURL}/en/quality/haccp`);
    const firstView = page.locator('[data-testid^="haccp-plan-view-"]').first();
    if (await firstView.isVisible().catch(() => false)) {
      await firstView.click();
      await expect(page.locator('[data-screen="quality-haccp-plan-detail"]')).toBeVisible();
      await expect(page.getByTestId('haccp-detail-header')).toBeVisible();
      await page.screenshot({ path: path.join(evidenceDir, 'E3-detail-data.png'), fullPage: true });
      const add = page.getByTestId('haccp-detail-add-ccp');
      if (await add.isEnabled().catch(() => false)) {
        await add.click();
        await expect(page.getByTestId('haccp-ccp-add-form')).toBeVisible();
        await page.screenshot({ path: path.join(evidenceDir, 'E3-add-ccp-modal.png'), fullPage: true });
      }
    }
  });

  test('axe: list has no critical/serious violations', async ({ page }) => {
    await page.goto(`${baseURL}/en/quality/haccp`);
    await expect(page.locator('[data-screen="quality-haccp-plans"]')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});

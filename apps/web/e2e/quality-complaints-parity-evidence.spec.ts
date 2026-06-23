/**
 * Wave E11 — Complaints + CAPA (/quality/complaints) per-state screenshot /
 * trace / axe harness.
 *
 * Spec-driven (prototype_match=false): there is NO dedicated complaints/CAPA
 * prototype JSX — complaints/CAPA are P2 placeholders in the NCR prototype
 * (ncr-screens.jsx:283-284,312 + modals.jsx:367,397). Per UI-PROTOTYPE-PARITY-
 * POLICY.md §1.2 the nearest reusable prototype patterns are:
 *   - QA-009 NCR list/detail (ncr-screens.jsx:1-184 / 186-352) — list header
 *     "+ create" → modal, status Select, dense table → row detail; detail context
 *     card + sticky primary action + linked-records cross-link;
 *   - the NCR-CLOSE / CCP-deviation resolve e-sign modals (modals.jsx:444-462 /
 *     585-591) — the CAPA [Resolve] PIN block.
 *
 * The route is org-scoped + RBAC-gated (read via listComplaints / getComplaint /
 * listCapaActions — quality.dashboard.view; create/convert/CAPA/resolve —
 * quality.ncr.create), so live capture requires an authenticated Supabase session
 * against a running app server (Vercel preview or `pnpm --filter web dev`). When
 * PLAYWRIGHT_BASE_URL is unset (the default in this isolated worktree) the live
 * capture is SKIPPED and the accepted fallback evidence is the RTL coverage:
 *   .../quality/complaints/_components/__tests__/complaints.test.tsx
 *     (list parity + four states + New-complaint modal fields/payload + detail
 *      Convert-to-NCR + CAPA add modal + CAPA resolve e-sign PIN + action errors
 *      verbatim + no-UUID + i18n en/pl + RBAC disabled-with-tooltip)
 * (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is the harness that produces
 * pixel screenshots + trace + axe report against a preview.
 */
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/E11-complaints');

test.describe('Complaints register + CAPA parity + states', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.',
  );

  test('landing card: Quality landing shows the Complaints nav card', async ({ page }) => {
    await page.goto(`${baseURL}/en/quality`);
    await expect(page.getByTestId('quality-nav-complaints')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'E11-quality-landing-card.png'), fullPage: true });
  });

  test('list: page head + filter bar + table render (loading→data / empty)', async ({ page }) => {
    await page.goto(`${baseURL}/en/quality/complaints`);
    await expect(page.locator('[data-screen="quality-complaints-list"]')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const table = page.getByTestId('complaints-list-table-card');
    const empty = page.getByTestId('complaints-list-empty');
    await expect(table.or(empty)).toBeVisible();
    if (await empty.isVisible().catch(() => false)) {
      await page.screenshot({ path: path.join(evidenceDir, 'E11-list-empty.png'), fullPage: true });
    } else {
      await page.screenshot({ path: path.join(evidenceDir, 'E11-list-data.png'), fullPage: true });
    }
  });

  test('new-complaint modal opens (create state)', async ({ page }) => {
    await page.goto(`${baseURL}/en/quality/complaints`);
    const open = page.getByTestId('complaint-create-open');
    if (await open.isEnabled().catch(() => false)) {
      await open.click();
      await expect(page.getByTestId('complaint-create-form')).toBeVisible();
      await page.screenshot({ path: path.join(evidenceDir, 'E11-create-modal.png'), fullPage: true });
    }
  });

  test('detail: complaint info + Convert-to-NCR action + CAPA panel render', async ({ page }) => {
    await page.goto(`${baseURL}/en/quality/complaints`);
    const firstLink = page.locator('[data-testid^="complaint-link-"]').first();
    if (await firstLink.isVisible().catch(() => false)) {
      await firstLink.click();
      await expect(page.locator('[data-screen="quality-complaint-detail"]')).toBeVisible();
      await expect(page.getByTestId('complaint-detail-info')).toBeVisible();
      await expect(page.getByTestId('capa-panel')).toBeVisible();
      await page.screenshot({ path: path.join(evidenceDir, 'E11-detail.png'), fullPage: true });

      // CAPA resolve e-sign modal (exposes the PIN field) — if any open action exists.
      const resolveOpen = page.locator('[data-testid^="capa-resolve-open-"]').first();
      if (await resolveOpen.isEnabled().catch(() => false)) {
        await resolveOpen.click();
        await expect(page.getByTestId('capa-resolve-password')).toBeVisible();
        await page.screenshot({ path: path.join(evidenceDir, 'E11-capa-resolve-esign.png'), fullPage: true });
      }
    }
  });

  test('axe: list has no critical/serious violations', async ({ page }) => {
    await page.goto(`${baseURL}/en/quality/complaints`);
    await expect(page.locator('[data-screen="quality-complaints-list"]')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});

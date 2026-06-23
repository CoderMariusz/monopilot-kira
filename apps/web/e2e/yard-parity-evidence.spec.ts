/**
 * WAVE E5 — Yard board (/yard) + appointments (/yard/appointments) +
 * weighbridge (/yard/weighbridge) + dock-door settings (/settings/infra/docks)
 * per-state screenshot / trace / axe harness.
 *
 * Spec-driven (no JSX prototype for any yard/dock/weighbridge screen exists in
 * the Monopilot Design System — verified zero matches across every prototype
 * module folder; nearest reusable pattern = the planning/carriers list+dialog
 * and settings/infra/lines screens, per UI-PROTOTYPE-PARITY-POLICY.md §1.2). DS
 * conformance: PageHeader + Card + Badge + @monopilot/ui Select + Modal + Table,
 * matching the sibling planning/settings screens.
 *
 * The routes are org-scoped + RBAC-gated (the yard actions THROW `forbidden`),
 * so live capture requires an authenticated Supabase session against a running
 * app server (Vercel preview or `pnpm --filter web dev`). When
 * PLAYWRIGHT_BASE_URL is unset (the default in this isolated worktree) the live
 * capture is SKIPPED and the accepted fallback evidence is the RTL coverage:
 *   .../yard/__tests__/yard-board.test.tsx
 *     (appointments grouped by dock + on-site panel, gate-in/out, weigh net,
 *      loading/empty/error/denied states, i18n in all 4 locales)
 *   .../yard/__tests__/appointments-view.test.tsx
 *     (day/week list, book-appointment payload, inline overlap rejection)
 *   .../(admin)/settings/infra/docks/docks-view.test.tsx
 *     (list + add/edit upsert, server-resolved denied/empty, RBAC affordance)
 * This spec is the harness that produces pixel screenshots + trace + axe report
 * against a preview.
 */
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/E5-yard');

test.describe('Yard E5 parity + states', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.',
  );

  test('warehouse hub exposes the Yard nav card', async ({ page }) => {
    await page.goto(`${baseURL}/en/warehouse`);
    await expect(page.getByTestId('warehouse-nav-yard')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'E5-warehouse-yard-card.png'), fullPage: true });
  });

  test('yard board: appointments + on-site panels render (or the denied note)', async ({ page }) => {
    await page.goto(`${baseURL}/en/yard`);
    await expect(page.locator('[data-screen="yard-board"]')).toBeVisible();
    const board = page.getByTestId('yard-appointments');
    const denied = page.getByTestId('yard-board-denied');
    await expect(board.or(denied)).toBeVisible();
    if (await denied.isVisible().catch(() => false)) {
      await page.screenshot({ path: path.join(evidenceDir, 'E5-yard-board-denied.png'), fullPage: true });
      return;
    }
    await expect(page.getByTestId('yard-onsite')).toBeVisible();
    await expect(page.getByTestId('yard-gate-in')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'E5-yard-board.png'), fullPage: true });
  });

  test('appointments: day/week list + Book dialog opens', async ({ page }) => {
    await page.goto(`${baseURL}/en/yard/appointments`);
    await expect(page.locator('[data-screen="yard-appointments"]')).toBeVisible();
    const table = page.getByTestId('appointments-table');
    const empty = page.getByTestId('appointments-empty');
    const denied = page.getByTestId('appointments-denied');
    await expect(table.or(empty).or(denied)).toBeVisible();
    if (!(await denied.isVisible().catch(() => false))) {
      await page.getByTestId('appointments-book').click();
      await expect(page.getByTestId('book-appointment-form')).toBeVisible();
    }
    await page.screenshot({ path: path.join(evidenceDir, 'E5-yard-appointments.png'), fullPage: true });
  });

  test('weighbridge: form + recent panel render', async ({ page }) => {
    await page.goto(`${baseURL}/en/yard/weighbridge`);
    await expect(page.locator('[data-screen="yard-weighbridge"]')).toBeVisible();
    const form = page.getByTestId('weighbridge-form');
    const denied = page.getByTestId('weighbridge-denied');
    await expect(form.or(denied)).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'E5-yard-weighbridge.png'), fullPage: true });
  });

  test('dock-door settings: list (table / empty / denied) renders', async ({ page }) => {
    await page.goto(`${baseURL}/en/settings/infra/docks`);
    await expect(page.locator('[data-screen="settings-infra-docks"]')).toBeVisible();
    const table = page.getByTestId('docks-table');
    const empty = page.getByTestId('docks-empty');
    const denied = page.getByTestId('docks-denied');
    await expect(table.or(empty).or(denied)).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'E5-settings-docks.png'), fullPage: true });
  });

  test('axe: yard screens have no critical/serious violations', async ({ page }) => {
    for (const route of ['/en/yard', '/en/yard/appointments', '/en/yard/weighbridge', '/en/settings/infra/docks']) {
      await page.goto(`${baseURL}${route}`);
      await expect(page.locator('main[data-screen]')).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      expect(serious, `${route}: ${JSON.stringify(serious, null, 2)}`).toEqual([]);
    }
  });
});

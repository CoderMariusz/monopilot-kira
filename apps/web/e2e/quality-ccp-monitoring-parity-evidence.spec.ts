/**
 * Wave E3 — CCP Monitoring (/quality/ccp-monitoring) per-state screenshot /
 * trace / axe harness.
 *
 * Prototype anchor:
 *   prototypes/design/Monopilot Design System/quality/haccp-screens.jsx:108-226
 *     (QaCcpMonitoring — page head + KPI summary + "+ Record reading" + per-CCP
 *     reading board with IN/OUT-of-limit status). The record-reading modal has no
 *     in-file JSX anchor; it follows the sibling MODAL-INSPECTION-CREATE island
 *     for design-system conformance.
 *
 * The route is org-scoped + RBAC-gated (read via listCcps + listMonitoringLog —
 * quality.haccp.plan_edit; record via recordMonitoring — quality.ccp.deviation_
 * override), so live capture requires an authenticated Supabase session against a
 * running app server (Vercel preview or `pnpm --filter web dev`). When
 * PLAYWRIGHT_BASE_URL is unset (the default in this isolated worktree) the live
 * capture is SKIPPED and the accepted fallback evidence is the RTL coverage:
 *   .../quality/ccp-monitoring/_components/__tests__/ccp-monitoring.test.tsx
 *     (board parity + four states + optimistic record + breach/NCR + i18n + RBAC)
 * (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is the harness that produces
 * pixel screenshots + trace + axe report against a preview.
 */
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/E3-ccp-monitoring');

test.describe('CCP Monitoring board parity + states', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.',
  );

  test('landing card: Quality landing shows the CCP Monitoring nav card', async ({ page }) => {
    await page.goto(`${baseURL}/en/quality`);
    await expect(page.getByTestId('quality-nav-ccp-monitoring')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'E3-quality-landing-card.png'), fullPage: true });
  });

  test('board: page head + KPI summary + CCP cards render (loading→data)', async ({ page }) => {
    await page.goto(`${baseURL}/en/quality/ccp-monitoring`);
    await expect(page.locator('[data-screen="quality-ccp-monitoring"]')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Either the data board or the empty state is the terminal state.
    const board = page.getByTestId('ccp-board');
    const empty = page.getByTestId('ccp-board-empty');
    await expect(board.or(empty)).toBeVisible();
    if (await empty.isVisible().catch(() => false)) {
      await page.screenshot({ path: path.join(evidenceDir, 'E3-empty.png'), fullPage: true });
    } else {
      await page.screenshot({ path: path.join(evidenceDir, 'E3-board-data.png'), fullPage: true });
    }
  });

  test('record-reading modal opens (record state)', async ({ page }) => {
    await page.goto(`${baseURL}/en/quality/ccp-monitoring`);
    const open = page.getByTestId('ccp-record-open');
    if (await open.isEnabled().catch(() => false)) {
      await open.click();
      await expect(page.getByTestId('ccp-record-form')).toBeVisible();
      await page.screenshot({ path: path.join(evidenceDir, 'E3-record-modal.png'), fullPage: true });
    }
  });

  test('axe: board has no critical violations', async ({ page }) => {
    await page.goto(`${baseURL}/en/quality/ccp-monitoring`);
    await expect(page.locator('[data-screen="quality-ccp-monitoring"]')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});

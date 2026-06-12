/**
 * C-R3 — Wave R3 reversibility UI (Playwright) — per-state screenshot / trace
 * harness for the three new correction surfaces:
 *   1. WO detail Genealogy → "Reverse…" (e-sign modal, desktop-only).
 *   2. GRN detail receipt lines → "Cancel receipt…" (reason + note, NO e-sign).
 *   3. LP detail action group → "Edit metadata…" (expiry + batch, reason + note).
 *
 * Source: spec-driven. No reverse/cancel/edit-metadata screen exists in
 * prototypes/design/Monopilot Design System/ (production wo-detail.jsx Genealogy
 * :454, warehouse grn-screens.jsx:96-171, lp-screens.jsx:216-571 are the read
 * surfaces this lane extends with correction affordances); the e-sign block on the
 * reverse modal mirrors the in-repo C-R2 void-correction modal precedent.
 *
 * All three routes are org-scoped + RBAC-gated, and the BACKEND actions
 * (reverseConsumption / cancelGrnLine / updateLpMetadata) are owned by parallel
 * Codex lanes and may not be merged yet — so live capture requires both an
 * authenticated Supabase session AND those actions shipped. When
 * PLAYWRIGHT_BASE_URL is unset (the default in this isolated worktree) the live
 * capture is SKIPPED and the accepted fallback evidence is the RTL component
 * coverage + per-state HTML/a11y captures in:
 *   production/wos/[id]/_components/__tests__/wo-reverse-consumption.test.tsx
 *   warehouse/grns/[grnId]/_components/__tests__/grn-detail.test.tsx
 *   warehouse/license-plates/[lpId]/_components/__tests__/lp-detail.test.tsx
 *   e2e/artifacts/C-R3-{reverse-consumption,grn-line-cancel,lp-metadata}/
 * (per UI-PROTOTYPE-PARITY-POLICY.md). This spec runs unchanged against a preview
 * to produce pixel screenshots + trace + axe report once the lanes land.
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;

test.describe('C-R3 reversibility UI parity', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server + parallel correction backends required; RTL component + HTML/a11y fallback evidence used.',
  );

  test('WO Genealogy → "Reverse…" → e-sign modal (reason + note + password)', async ({ page }) => {
    const ev = path.resolve(__dirname, 'artifacts/C-R3-reverse-consumption');
    await page.goto(`${baseURL}/en/production/wos`);
    await page.getByTestId(/^wo-link-/).first().click();
    await expect(page).toHaveURL(/\/production\/wos\/[0-9a-f-]+$/);

    await page.getByTestId('wo-detail-tab-genealogy').click();
    await page.screenshot({ path: path.join(ev, 'genealogy-tab.png'), fullPage: true });

    const reverse = page.getByTestId(/^wo-genealogy-reverse-/).first();
    if (await reverse.count()) {
      await reverse.click();
      await expect(page.getByTestId('wo-reverse-esign')).toBeVisible();
      await expect(page.getByTestId('wo-reverse-password')).toBeVisible();
      await page.screenshot({ path: path.join(ev, 'reverse-modal-esign.png') });
    }
  });

  test('GRN detail → "Cancel receipt…" → modal WITHOUT e-sign', async ({ page }) => {
    const ev = path.resolve(__dirname, 'artifacts/C-R3-grn-line-cancel');
    await page.goto(`${baseURL}/en/warehouse/grns`);
    await page.getByTestId(/^grn-row-/).first().click();

    const cancel = page.getByTestId(/^grn-cancel-line-/).first();
    if (await cancel.count()) {
      await cancel.click();
      await expect(page.getByTestId('grn-cancel-form')).toBeVisible();
      await expect(page.getByTestId('grn-cancel-password')).toHaveCount(0);
      await page.screenshot({ path: path.join(ev, 'cancel-modal-no-esign.png') });
    }
  });

  test('LP detail → "Edit metadata…" → modal prefilled with expiry + batch', async ({ page }) => {
    const ev = path.resolve(__dirname, 'artifacts/C-R3-lp-metadata');
    await page.goto(`${baseURL}/en/warehouse/license-plates`);
    await page.getByTestId(/^lp-link-/).first().click();

    const edit = page.getByTestId('lp-action-metadata');
    if (await edit.count()) {
      await edit.click();
      await expect(page.getByTestId('lp-metadata-form')).toBeVisible();
      await expect(page.getByTestId('lp-metadata-expiry')).toBeVisible();
      await expect(page.getByTestId('lp-metadata-batch')).toBeVisible();
      await page.screenshot({ path: path.join(ev, 'metadata-modal-prefilled.png') });
    }
  });
});

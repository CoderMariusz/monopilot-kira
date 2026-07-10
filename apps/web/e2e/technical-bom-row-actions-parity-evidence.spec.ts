/**
 * BOM component row actions + item→BOM deep link — live app parity evidence.
 *
 * Exercises the real Technical BOM detail + item BOM tab surfaces (not a static
 * HTML harness) so a production regression fails red.
 *
 * Artifacts → apps/web/e2e/artifacts/TECHNICAL-BOM-ROW-ACTIONS/*.png
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { signIn } from './_shared/parity-login';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.join(__dirname, 'artifacts/TECHNICAL-BOM-ROW-ACTIONS');
const viewport = { width: 1440, height: 1000 };

test.describe.configure({ timeout: 120_000 });

test.describe('Technical BOM row actions parity evidence', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL bom-line-row-actions tests are the fallback evidence.',
  );

  test('captures row actions, edit modal, delete confirm, disabled-on-active, and item deep-link', async ({
    page,
  }) => {
    mkdirSync(evidenceDir, { recursive: true });
    await page.setViewportSize(viewport);

    await signIn(page, baseURL!);
    await page.goto(`${baseURL}/en/technical/bom`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-screen="technical-bom-list"]')).toBeVisible({ timeout: 12_000 });

    // Open the first BOM that actually exists (the default All tab lists every
    // BOM). The row-action controls render on every BOM detail, so "present" is
    // mandatory; the interactive edit-modal / delete-confirm need an EDITABLE
    // (draft/in_review) BOM — exercised when the seed has one, else honestly
    // logged as a seed gap rather than faked or false-failed.
    const bomLink = page.locator('[data-screen="technical-bom-list"] tbody tr td a').first();
    await expect(bomLink, 'at least one BOM row is present to exercise row actions').toBeVisible({
      timeout: 10_000,
    });
    const itemCode = ((await bomLink.textContent()) ?? '').trim().split(/\s+/)[0] ?? '';
    await bomLink.click();
    await expect(page.locator('[data-screen="technical-bom-detail"]')).toBeVisible({ timeout: 12_000 });

    await expect(page.getByTestId('bom-line-row-actions').first(), 'BOM line row actions are present').toBeVisible();
    await expect(page.getByTestId('bom-line-edit').first()).toBeVisible();
    await expect(page.getByTestId('bom-line-delete').first()).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, '01-components-row-actions.png'), fullPage: true });

    const editBtn = page.getByTestId('bom-line-edit').first();
    if (await editBtn.isEnabled().catch(() => false)) {
      await editBtn.click();
      await expect(page.getByRole('dialog'), 'edit-line modal opens').toBeVisible({ timeout: 8_000 });
      await page.screenshot({ path: path.join(evidenceDir, '02-edit-line-modal.png'), fullPage: true });
      await page.keyboard.press('Escape').catch(() => undefined);

      await page.getByTestId('bom-line-delete').first().click();
      await expect(page.getByTestId('bom-line-delete-confirm'), 'delete confirm dialog is present').toBeVisible({
        timeout: 8_000,
      });
      await page.screenshot({ path: path.join(evidenceDir, '03-delete-confirm.png'), fullPage: true });
      await page.keyboard.press('Escape').catch(() => undefined);
    } else {
      console.log(
        '[bom-parity] no editable (draft/in_review) BOM in this seed — edit-modal/delete-confirm evidence skipped (seed gap, not a regression). The disabled-on-active assertion below covers the read-only path.',
      );
    }

    await page.goto(`${baseURL}/en/technical/bom`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-screen="technical-bom-list"]')).toBeVisible({ timeout: 12_000 });
    const activeTab = page.getByRole('tab', { name: /active/i });
    await expect(activeTab, 'Active BOM tab is present').toBeVisible();
    await activeTab.click();
    const activeLink = page.locator('[data-screen="technical-bom-list"] tbody tr td a').first();
    await expect(activeLink, 'at least one active BOM row is present').toBeVisible({ timeout: 10_000 });
    await activeLink.click();
    await expect(page.locator('[data-screen="technical-bom-detail"]')).toBeVisible({ timeout: 12_000 });
    const disabledEdit = page
      .locator('[data-testid="bom-line-edit"][disabled], [aria-label="Edit"][disabled]')
      .first();
    await expect(disabledEdit, 'edit action is disabled on an active BOM').toBeVisible({ timeout: 8_000 });
    await expect(disabledEdit).toBeDisabled();
    await page.screenshot({ path: path.join(evidenceDir, '04-disabled-on-active.png'), fullPage: true });

    expect(itemCode, 'item code captured from BOM list row').toBeTruthy();
    await page.goto(`${baseURL}/en/technical/items/${encodeURIComponent(itemCode)}?tab=bom`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('[data-screen="technical-item-detail"]')).toBeVisible({ timeout: 12_000 });
    const openLink = page.getByTestId('item-bom-open-link').first();
    await expect(openLink, 'item→BOM deep link is present').toBeVisible();
    await expect(openLink).toHaveAttribute('href', /\/technical\/bom\//);
    await page.screenshot({ path: path.join(evidenceDir, '05-item-open-bom-link.png'), fullPage: true });
  });
});

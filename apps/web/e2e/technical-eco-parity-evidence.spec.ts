/**
 * N1-A — Change Control (ECO) parity evidence (live app).
 *
 * Captures list + create-modal + empty-state screenshots against the real
 * /{locale}/technical/eco screen on a seeded preview (Gate-5).
 *
 * Prototype anchors:
 *   - other-screens.jsx:132-180 (EcoScreen)
 *   - modals.jsx:352-414 (EcoChangeRequestModal)
 *
 * Artifacts → apps/web/e2e/artifacts/TECHNICAL-ECO/*.png
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.join(__dirname, 'artifacts/TECHNICAL-ECO');
const viewport = { width: 1440, height: 1000 };

test.describe('Technical ECO parity evidence', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL eco-ui tests are the fallback evidence.',
  );

  test('captures list, modal, and empty-state screenshots', async ({ page }) => {
    mkdirSync(evidenceDir, { recursive: true });
    await page.setViewportSize(viewport);
    await page.goto(`${baseURL}/en/technical/eco`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-screen="technical-eco"]')).toBeVisible({ timeout: 12_000 });

    const denied = page.getByRole('alert').filter({ hasText: /permission/i });
    await expect(denied, 'parity evidence requires authorized ECO access — permission denial is a hard fail').not.toBeVisible();

    await expect(page.getByRole('heading', { name: /change control/i })).toBeVisible();
    await expect(page.getByRole('tablist')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'list-ready.png'), fullPage: true });

    const newEco = page.getByRole('button', { name: /new eco/i });
    await expect(newEco, 'New ECO control must be present on the live screen').toBeVisible();
    await newEco.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog, 'New ECO modal opens').toBeVisible({ timeout: 8_000 });
    await expect(dialog.getByRole('button', { name: /submit|create|open eco/i })).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'create-modal.png'), fullPage: true });
    await page.keyboard.press('Escape').catch(() => undefined);

    await page.goto(`${baseURL}/en/technical/eco?status=closed`, { waitUntil: 'domcontentloaded' });
    const empty = page.getByText(/no change orders/i);
    const table = page.getByRole('table', { name: /change orders/i });
    await expect(empty.or(table)).toBeVisible({ timeout: 10_000 });
    if (await empty.isVisible().catch(() => false)) {
      await page.screenshot({ path: path.join(evidenceDir, 'empty-state.png'), fullPage: true });
    }
  });
});

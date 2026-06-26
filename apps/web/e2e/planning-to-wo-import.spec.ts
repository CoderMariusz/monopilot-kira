/**
 * P2-PLANNING — Bulk TO + WO CSV import screens E2E (Playwright) — happy path +
 * per-state screenshots + axe scan. Mirrors the shipped PO import screen
 * (/planning/purchase-orders/import) for the Transfer-Order and Work-Order
 * preview→confirm flows wired to the existing actions:
 *   TO: previewToImport / confirmToImport   (apps/web/lib/import/to-import-*.ts)
 *   WO: previewWoImport / confirmWoImport    (apps/web/lib/import/wo-import-*.ts)
 *
 * NO prototype exists — parity is by REUSE of the planning list conventions and a
 * 1:1 mirror of the PO import view (shared apps/web/lib/import/_components/
 * bulk-import-view.tsx). The /planning/{transfer-orders,work-orders}/import routes
 * are org-scoped + RBAC-gated (npd.planning.write), so live capture requires an
 * authenticated Supabase session against a running app server (Vercel preview or
 * `pnpm --filter web dev`). When PLAYWRIGHT_BASE_URL is unset (the default in this
 * isolated worktree) the live capture is SKIPPED and the accepted fallback evidence
 * is the RTL component coverage in
 *   .../transfer-orders/__tests__/to-bulk-import-view.test.tsx
 *   .../work-orders/__tests__/wo-bulk-import-view.test.tsx
 * (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is the harness that runs unchanged
 * against a preview to produce pixel screenshots + trace + axe report.
 */
import fs from 'node:fs';
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/planning-to-wo-import');

test.describe('Bulk TO + WO CSV import screens (mirror of PO import — no prototype)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.',
  );

  test('TO list → Import TOs → pick CSV → preview → confirm, and is axe-clean', async ({ page }) => {
    fs.mkdirSync(evidenceDir, { recursive: true });

    // ── "Import TOs" link on the TO list deep-links into the import screen ───────
    await page.goto(`${baseURL}/en/planning/transfer-orders`);
    const importLink = page.getByTestId('to-list-bulk-import');
    await expect(importLink).toBeVisible();
    await expect(importLink).toHaveAttribute('href', /\/planning\/transfer-orders\/import$/);
    await importLink.click();

    // ── Import screen: empty state (Preview disabled until a file is picked) ─────
    await expect(page.getByTestId('to-bulk-import-view')).toBeVisible();
    await expect(page.getByTestId('to-bulk-import-preview')).toBeDisabled();
    await page.screenshot({ path: path.join(evidenceDir, 'to-import-empty.png'), fullPage: true });

    // ── Pick a small CSV (one valid + one bad-qty row) and preview ──────────────
    const toCsv =
      'from_site,to_site,item_code,qty,uom\nWH-A,WH-B,RM-1001,100,kg\nWH-A,WH-B,RM-1001,bad,kg';
    await page.getByTestId('to-bulk-import-file').setInputFiles({
      name: 'to-e2e.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(toCsv),
    });
    await page.getByTestId('to-bulk-import-preview').click();
    await expect(page.getByTestId('to-bulk-import-valid-count')).toBeVisible();
    await expect(page.getByTestId('to-bulk-import-errors-count')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'to-import-preview.png'), fullPage: true });

    // ── Confirm → created count ─────────────────────────────────────────────────
    await page.getByTestId('to-bulk-import-confirm').click();
    await expect(page.getByTestId('to-bulk-import-created')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'to-import-confirmed.png'), fullPage: true });

    const toAxe = await new AxeBuilder({ page }).analyze();
    fs.writeFileSync(path.join(evidenceDir, 'to-axe-results.json'), JSON.stringify(toAxe.violations, null, 2));
    expect(toAxe.violations).toEqual([]);
  });

  test('WO list → Import WOs → pick CSV → preview → confirm, and is axe-clean', async ({ page }) => {
    fs.mkdirSync(evidenceDir, { recursive: true });

    await page.goto(`${baseURL}/en/planning/work-orders`);
    const importLink = page.getByTestId('wo-list-bulk-import');
    await expect(importLink).toBeVisible();
    await expect(importLink).toHaveAttribute('href', /\/planning\/work-orders\/import$/);
    await importLink.click();

    await expect(page.getByTestId('wo-bulk-import-view')).toBeVisible();
    await expect(page.getByTestId('wo-bulk-import-preview')).toBeDisabled();
    await page.screenshot({ path: path.join(evidenceDir, 'wo-import-empty.png'), fullPage: true });

    const woCsv = 'item_code,qty,uom\nFG-1001,100,base\nFG-1001,bad,base';
    await page.getByTestId('wo-bulk-import-file').setInputFiles({
      name: 'wo-e2e.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(woCsv),
    });
    await page.getByTestId('wo-bulk-import-preview').click();
    await expect(page.getByTestId('wo-bulk-import-valid-count')).toBeVisible();
    await expect(page.getByTestId('wo-bulk-import-errors-count')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'wo-import-preview.png'), fullPage: true });

    await page.getByTestId('wo-bulk-import-confirm').click();
    await expect(page.getByTestId('wo-bulk-import-created')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'wo-import-confirmed.png'), fullPage: true });

    const woAxe = await new AxeBuilder({ page }).analyze();
    fs.writeFileSync(path.join(evidenceDir, 'wo-axe-results.json'), JSON.stringify(woAxe.violations, null, 2));
    expect(woAxe.violations).toEqual([]);
  });
});

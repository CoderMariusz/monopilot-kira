/**
 * Wave E-IO (decision #6) — Bulk PO import hub E2E (Playwright) — happy path +
 * per-state screenshots + axe scan.
 *
 * Structural reference (NOT 1:1 visual): the locked spec-driven bulk-import
 * wizard primitive
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:25-218
 *   (`bulk_import_csv_screen`, 4-step wizard) — re-applied for the PO domain.
 *
 * The /planning/import route is org-scoped + RBAC-gated (npd.planning.write), so
 * live capture requires an authenticated Supabase session against a running app
 * server (Vercel preview or `pnpm --filter web dev`). When PLAYWRIGHT_BASE_URL is
 * unset (the default in this isolated worktree) the live capture is SKIPPED and
 * the accepted fallback evidence is the RTL component coverage in
 *   app/[locale]/(app)/(modules)/planning/import/__tests__/po-bulk-import.test.tsx
 * (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is the harness that runs
 * unchanged against a preview to produce pixel screenshots + trace + axe report.
 */
import fs from 'node:fs';
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/E-IO-po-import');
const hubRoute = '/en/planning/import';
const poListRoute = '/en/planning/purchase-orders';

const TEMPLATE_HEADER =
  'external_ref,supplier_code,item_code,qty,uom,price,currency,expected_delivery,warehouse_code,notes';

test.describe('Bulk PO import hub parity (spec-driven-screens.jsx:25-218)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.',
  );

  test('hub → download template → upload → validate → preview → commit, and is axe-clean', async ({ page }) => {
    fs.mkdirSync(evidenceDir, { recursive: true });

    // ── Import button on the PO list deep-links into the hub ────────────────────
    await page.goto(`${baseURL}${poListRoute}`);
    const importBtn = page.getByTestId('po-list-import');
    await expect(importBtn).toBeVisible();
    await expect(importBtn).toHaveAttribute('href', /\/planning\/import\?source=po/);
    await page.screenshot({ path: path.join(evidenceDir, 'E-IO-po-list-import-button.png'), fullPage: true });

    // ── Hub: PO card live + TO/WO coming-soon placeholders ──────────────────────
    await page.goto(`${baseURL}${hubRoute}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('po-import-card')).toBeVisible();
    await expect(page.getByTestId('import-coming-soon-transfer-orders')).toBeVisible();
    await expect(page.getByTestId('import-coming-soon-work-orders')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'E-IO-hub-ready.png'), fullPage: true });

    // ── Download template (client-side CSV) ─────────────────────────────────────
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('po-import-download-template').click();
    const download = await downloadPromise;
    const tmp = path.join(evidenceDir, 'po-import-template.csv');
    await download.saveAs(tmp);
    const headerLine = fs.readFileSync(tmp, 'utf-8').split('\r\n')[0];
    expect(headerLine).toBe(TEMPLATE_HEADER);

    // ── Open the wizard (upload step) ───────────────────────────────────────────
    await page.getByTestId('po-import-open-wizard').click();
    await expect(page.getByTestId('po-import-stepper')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'E-IO-wizard-upload.png'), fullPage: true });

    // ── Upload a small CSV (one valid + one bad qty row) ────────────────────────
    const csv = `${TEMPLATE_HEADER}\nPO-E2E-1,SUP-001,RM-1001,100,kg,2.5,EUR,2026-12-31,WH-MAIN,ok\nPO-E2E-2,SUP-001,RM-1001,bad,kg,,,,,broken`;
    await page.getByTestId('po-import-file').setInputFiles({
      name: 'po-e2e.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    });
    await page.getByTestId('po-import-validate-cta').click();

    // ── Validate step: per-row status + counter ─────────────────────────────────
    await expect(page.getByTestId('po-import-counter')).toBeVisible();
    await expect(page.getByTestId('po-import-validate-kpis')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'E-IO-wizard-validate.png'), fullPage: true });

    // ── Preview step: grouped PO count + mode toggle ────────────────────────────
    await page.getByTestId('po-import-preview-cta').click();
    await expect(page.getByTestId('po-import-mode-help')).toBeVisible();
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: /skip invalid/i }).click();
    await page.screenshot({ path: path.join(evidenceDir, 'E-IO-wizard-preview.png'), fullPage: true });

    // ── Commit → result step with created PO numbers ────────────────────────────
    await page.getByTestId('po-import-commit-cta').click();
    await expect(page.getByTestId('po-import-result-kpis')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'E-IO-wizard-result.png'), fullPage: true });

    // ── axe (0 violations or documented blocker) ────────────────────────────────
    const results = await new AxeBuilder({ page }).analyze();
    fs.writeFileSync(
      path.join(evidenceDir, 'axe-results.json'),
      JSON.stringify(results.violations, null, 2),
    );
    expect(results.violations).toEqual([]);
  });
});

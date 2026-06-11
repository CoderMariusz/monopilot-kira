/**
 * DEFECT-8 — Settings Roles Editor (create role + per-role permission grid) E2E.
 *
 * Prototype anchor: prototypes/settings/access-screens.jsx:95-129
 * (module-grouped "Role permissions" surface).
 *
 * The /settings/roles route is org-scoped + RBAC-gated (settings.roles.assign),
 * so live capture needs an authenticated Supabase session against a running app
 * server (Vercel preview or `pnpm --filter web dev`). When PLAYWRIGHT_BASE_URL is
 * unset (the default in this isolated worktree) the live capture is SKIPPED, and
 * the accepted fallback evidence is the RTL DOM-artifact set written by
 * role-editor.evidence.test.tsx into
 * apps/web/e2e/parity-evidence/settings/DEFECT-8/ (per UI-PROTOTYPE-PARITY-POLICY.md).
 * This spec is the harness that runs unchanged against a preview to produce pixel
 * screenshots + trace + axe.
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'parity-evidence/settings/DEFECT-8');
const route = '/en/settings/roles';

test.describe('Settings Roles Editor parity (access-screens.jsx:95-129)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL DOM fallback evidence used.',
  );

  test('creates a custom role and edits a module-grouped permission grid, axe-clean', async ({ page }) => {
    await page.goto(`${baseURL}${route}`);

    await expect(page.getByRole('heading', { name: /roles & permissions/i })).toBeVisible();

    // Create role modal
    await page.getByRole('button', { name: /create role/i }).click();
    const createDialog = page.getByRole('dialog');
    await expect(createDialog).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'create-modal.png'), fullPage: true });
    await createDialog.getByLabel(/role code/i).fill('qa_reviewer');
    await createDialog.getByLabel(/role name/i).fill('QA Reviewer');
    await createDialog.getByRole('button', { name: /create role/i }).click();

    // Permission grid for the new role
    await page.getByText(/edit role permissions/i).click();
    await page.getByRole('button', { name: /permissions/i }).last().click();
    const gridDialog = page.getByRole('dialog');
    await expect(gridDialog.getByRole('group').first()).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'permissions-grid.png'), fullPage: true });
    await gridDialog.getByRole('checkbox', { name: 'settings.org.update' }).click();
    await gridDialog.getByRole('button', { name: /save permissions/i }).click();
    await page.screenshot({ path: path.join(evidenceDir, 'permissions-saved.png'), fullPage: true });

    type AxeAnalysis = { violations: Array<{ id: string; impact?: string | null }> };
    type AxeBuilderCtor = new (opts: { page: typeof page }) => { analyze(): Promise<AxeAnalysis> };
    const axeSpecifier = '@axe-core/playwright';
    const { default: AxeBuilder } = (await import(axeSpecifier)) as { default: AxeBuilderCtor };
    const axe = await new AxeBuilder({ page }).analyze();
    await import('node:fs').then(({ writeFileSync }) =>
      writeFileSync(path.join(evidenceDir, 'axe-report.json'), `${JSON.stringify(axe, null, 2)}\n`),
    );
    expect(axe.violations).toEqual([]);
  });
});

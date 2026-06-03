import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

/**
 * SET-034 / T-128 — Schema Shadow Preview parity evidence (Playwright stub).
 *
 * SET-034 has NO JSX prototype: it is document/spec-driven. The nearest
 * reusable design language (per UI-PROTOTYPE-PARITY-POLICY.md §1.2) is the
 * settings data screens (settings/data-screens.jsx + settings/data.jsx) and
 * the existing schema admin page structure — and this task did NOT alter that
 * structure. It only swapped the draft data source from a hardcoded in-memory
 * array to a real RLS-scoped query against public.dept_column_drafts.
 *
 * This spec is a STUB (test.skip): the full parity harness
 * (startLocalShellParityHarness) needs a live authenticated Next dev server
 * backed by a provisioned Supabase, which is not available in this worktree
 * (base = older main; the run forbids db:test/migrate, and no playwright.config
 * is present here). The runnable REAL evidence for this task is the RTL suite
 *   app/[locale]/(app)/(admin)/settings/schema/preview/page.test.tsx
 * (11 passing) which exercises all 5 UI states, the real draft-store query, the
 * server-side RBAC publish gate, and i18n-backed labels.
 *
 * When run in a DB-backed env (with playwright.config + auth harness), this
 * stub should be un-skipped to capture per-state screenshots, a trace.zip, and
 * an axe report at apps/web/e2e/parity-evidence/SET-034/.
 */

const repoRoot = path.resolve(__dirname, '../../..');
const webRoot = path.join(repoRoot, 'apps/web');
const evidenceDir = path.join(webRoot, 'e2e/parity-evidence/SET-034');
const targetRoute = '/en/settings/schema/preview';

test.describe('SET-034 schema shadow preview parity evidence', () => {
  test.skip(
    true,
    'Requires a live authenticated dev server + Supabase (not available in this worktree). RTL suite provides the real 5-state + real-data evidence; see parity_report.json.',
  );

  test('captures per-state screenshots, trace, axe, and dom-diff against the real route', async ({ browser }) => {
    mkdirSync(evidenceDir, { recursive: true });

    // Intentionally unreached while skipped — documents the captured artifacts
    // the DB-backed run must produce.
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const response = await page.goto(targetRoute, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);

    await page.screenshot({ path: path.join(evidenceDir, 'target-default-desktop.png'), fullPage: true });
    await page.goto(`${targetRoute}?state=loading`, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: path.join(evidenceDir, 'target-loading-desktop.png'), fullPage: true });
    await page.goto(`${targetRoute}?state=no-drafts`, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: path.join(evidenceDir, 'target-empty-desktop.png'), fullPage: true });
    await page.goto(`${targetRoute}?state=permission-denied`, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: path.join(evidenceDir, 'target-permission-denied-desktop.png'), fullPage: true });

    writeFileSync(
      path.join(evidenceDir, 'dom_diff.json'),
      `${JSON.stringify({ target_route: targetRoute, captured_at: new Date().toISOString() }, null, 2)}\n`,
    );
  });
});

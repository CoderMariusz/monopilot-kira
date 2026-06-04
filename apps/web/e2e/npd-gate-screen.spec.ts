/**
 * T-111 wiring + T-112 PARITY — NPD Gate screen E2E (Playwright).
 *
 * Prototype anchor: prototypes/design/Monopilot Design System/npd/gate-screens.jsx:106-616
 *   covering the four merged components:
 *     - GateChecklistPanel       (gate-screens.jsx:106-258)
 *     - AdvanceGateModal         (gate-screens.jsx:261-373)
 *     - GateApprovalModal        (gate-screens.jsx:378-522)
 *     - ApprovalHistoryTimeline  (gate-screens.jsx:525-616)
 *
 * Route: /en/pipeline/[projectId]/gate
 *
 * The gate route is org-scoped + RBAC-gated, so live capture requires an authenticated
 * Supabase session against a running app server (Vercel preview or `pnpm --filter web dev`).
 * When PLAYWRIGHT_BASE_URL is unset (the default in this isolated worktree) the live
 * capture is SKIPPED and the accepted fallback evidence is the RTL DOM-artifact set written
 * by the slice/wiring component tests (gate-screen.test.tsx + the T-107..T-110 evidence
 * tests) per UI-PROTOTYPE-PARITY-POLICY.md. This spec is the harness that runs unchanged
 * against a preview to produce the T-112 pixel screenshots + axe reports + trace.
 *
 * A specific project id is required for the gate route. Provide it via
 * PLAYWRIGHT_GATE_PROJECT_ID (a project at a G3/G4 e-sign gate gives the richest parity
 * surface). When unset, the spec resolves the first project from the pipeline board.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const gateProjectId = process.env.PLAYWRIGHT_GATE_PROJECT_ID;
const evidenceDir = path.resolve(__dirname, '../../../_meta/parity-artifacts/01-npd/gate-screens');
const traceArtifactDir = path.resolve(__dirname, 'artifacts/T-111');

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function resolveAuthStorage(): string | undefined {
  const explicit = process.env.PLAYWRIGHT_AUTH_STORAGE ?? process.env.PLAYWRIGHT_AUTH_STORAGE_STATE;
  const candidates = [explicit, path.resolve(__dirname, '.auth/user.json')].filter((v): v is string => Boolean(v));
  return candidates.find((c) => existsSync(c));
}

/** @axe-core/playwright is an optional dep (declared by packages/ui); import it via a
 * non-literal specifier so the spec stays loadable/typechecks when the dep is unlinked. */
async function runAxe(page: import('@playwright/test').Page, name: string): Promise<void> {
  type AxeAnalysis = { violations: Array<{ id: string; impact?: string | null }> };
  type AxeBuilderCtor = new (opts: { page: typeof page }) => { analyze(): Promise<AxeAnalysis> };
  const axeSpecifier = '@axe-core/playwright';
  const { default: AxeBuilder } = (await import(axeSpecifier)) as { default: AxeBuilderCtor };
  const axe = await new AxeBuilder({ page }).analyze();
  writeFileSync(path.join(evidenceDir, `axe-${name}.json`), `${JSON.stringify(axe, null, 2)}\n`);
  expect(axe.violations, `axe violations on ${name}`).toEqual([]);
}

test.describe('NPD Gate screen parity (gate-screens.jsx:106-616)', () => {
  test.skip(!baseURL, 'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL DOM fallback evidence used.');

  test('captures checklist + advance/approval modals + approval timeline and is axe-clean', async ({ browser }) => {
    ensureDir(evidenceDir);
    ensureDir(traceArtifactDir);

    const authStorage = resolveAuthStorage();
    test.skip(!authStorage, 'BLOCKED_AUTH: gate screen E2E needs PLAYWRIGHT_AUTH_STORAGE for an authenticated user.');

    const context = await browser.newContext({ storageState: authStorage });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await context.newPage();

    try {
      // Resolve a project id (env override, else first card on the pipeline board).
      let projectId = gateProjectId;
      if (!projectId) {
        await page.goto(`${baseURL}/en/pipeline`, { waitUntil: 'domcontentloaded' });
        const card = page.locator('[data-testid^="kanban-card-"]').first();
        await expect(card, 'a pipeline project card to derive a gate route').toBeVisible({ timeout: 10_000 });
        projectId = (await card.getAttribute('data-project-id')) ?? undefined;
      }
      expect(projectId, 'a project id for the gate route').toBeTruthy();

      const route = `/en/pipeline/${projectId}/gate`;
      await page.goto(`${baseURL}${route}`, { waitUntil: 'domcontentloaded' });

      // --- GateChecklistPanel + ApprovalHistoryTimeline (route default) ---
      await expect(page.getByTestId('gate-screen')).toBeVisible();
      await expect(page.getByTestId('gate-checklist-panel')).toBeVisible();
      await expect(page.getByTestId('approval-history-timeline')).toBeVisible();
      await page.screenshot({ path: path.join(evidenceDir, 'panel-default.png'), fullPage: true });
      await runAxe(page, 'route');

      // Panel-with-blockers state (when the current gate has blockers).
      const blockerAlert = page.getByTestId('gate-blocker-alert');
      if (await blockerAlert.count()) {
        await blockerAlert.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(evidenceDir, 'panel-with-blockers.png'), fullPage: true });
      }

      // --- Advance/Approval modal (dispatched by the panel CTA) ---
      const advanceButton = page.getByTestId('gate-advance-button');
      if (await advanceButton.count()) {
        await advanceButton.click();
        const advanceModal = page.getByTestId('advance-gate-transition');
        const approvalModal = page.getByTestId('gate-approval-project');

        if (await approvalModal.count()) {
          // requiresApproval gate → GateApprovalModal (decision step).
          await expect(approvalModal).toBeVisible();
          await page.screenshot({ path: path.join(evidenceDir, 'gate-approval-decision.png') });
          await runAxe(page, 'gate-approval-decision');

          // Advance to the e-signature overlay (approve path).
          const notes = page.locator('#gate-approval-notes');
          await notes.fill('Approving the gate for the parity capture.');
          await page.getByRole('button', { name: /submit approval/i }).click();
          const esign = page.getByTestId('gate-approval-esign');
          if (await esign.count()) {
            await expect(esign).toBeVisible();
            await page.screenshot({ path: path.join(evidenceDir, 'gate-approval-esig.png') });
            await runAxe(page, 'gate-approval-esig');
          }
        } else if (await advanceModal.count()) {
          // self-advance gate → AdvanceGateModal.
          await expect(advanceModal).toBeVisible();
          await page.screenshot({ path: path.join(evidenceDir, 'advance-gate-modal.png') });
          await runAxe(page, 'advance-gate-modal');
        }
        await page.keyboard.press('Escape').catch(() => undefined);
      }

      // --- ApprovalHistoryTimeline with an e-signed entry expanded ---
      const sigToggle = page.getByTestId('approval-history-signature-toggle').first();
      if (await sigToggle.count()) {
        await sigToggle.click();
        await expect(page.getByTestId('approval-history-signature-panel').first()).toBeVisible();
        await page.screenshot({ path: path.join(evidenceDir, 'approval-history-expanded.png') });
        await runAxe(page, 'approval-history-expanded');
      }
    } finally {
      await context.tracing.stop({ path: path.join(traceArtifactDir, 'trace.zip') });
      await context.close();
    }
  });
});

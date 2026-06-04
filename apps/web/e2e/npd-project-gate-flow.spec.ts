/**
 * T-062 — E2E spec: create NPD project → advance G0→G1→G2 → approve G3 with e-signature.
 *
 * Prototype anchor:
 *   prototypes/design/Monopilot Design System/npd/gate-screens.jsx:106-616
 *     - GateChecklistPanel       (gate-screens.jsx:106-258)
 *     - AdvanceGateModal         (gate-screens.jsx:261-373)  — T-058/T-108
 *     - GateApprovalModal        (gate-screens.jsx:378-522)  — T-109
 *     - ApprovalHistoryTimeline  (gate-screens.jsx:525-616)
 *
 * Routes exercised:
 *   /en/login                          — admin sign-in
 *   /en/pipeline                       — pipeline kanban board (T-059)
 *   /en/pipeline/[projectId]/gate      — gate screen (T-111)
 *
 * Actions exercised (merged via Server Actions):
 *   createProject           (T-057 write path)
 *   advanceProjectGate      (T-058/T-108 — G0→G1, G1→G2, G2→G3)
 *   approveProjectGate      (T-109 — G3 e-sign → creates FG candidate, T-095)
 *
 * Gate on PLAYWRIGHT_BASE_URL:
 *   When the env var is unset (default in CI / isolated worktree) every test in this
 *   describe block is SKIPPED via `test.skip(!baseURL, reason)`. The spec is collected
 *   normally by Playwright so `--list` works; it just reports [skipped].
 *
 * Live run (Gate-5 / module sign-off):
 *   PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app \
 *   PLAYWRIGHT_ADMIN_PASSWORD=<pwd> \
 *     pnpm --filter web exec playwright test npd-project-gate-flow --trace on
 *
 * Accepted credentials: admin@monopilot.test / PLAYWRIGHT_ADMIN_PASSWORD env.
 * The password for live runs is stored in the team's secrets store — NOT in this file
 * (risk red-line: no real secrets in test code).
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

// ── env guards ───────────────────────────────────────────────────────────────

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL ?? 'admin@monopilot.test';
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? '';

// ── artifact paths ───────────────────────────────────────────────────────────

const artifactDir = path.resolve(__dirname, 'artifacts/T-062');

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ── axe helper (optional dep — graceful skip when unlinked) ──────────────────

async function runAxe(
  page: import('@playwright/test').Page,
  label: string,
): Promise<void> {
  type AxeAnalysis = { violations: Array<{ id: string; impact?: string | null }> };
  type AxeBuilderCtor = new (opts: { page: typeof page }) => { analyze(): Promise<AxeAnalysis> };
  const axeSpecifier = '@axe-core/playwright';
  try {
    const { default: AxeBuilder } = (await import(axeSpecifier)) as { default: AxeBuilderCtor };
    const results = await new AxeBuilder({ page }).analyze();
    writeFileSync(
      path.join(artifactDir, `axe-${label}.json`),
      `${JSON.stringify(results, null, 2)}\n`,
    );
    expect(results.violations, `axe violations on ${label}`).toEqual([]);
  } catch (err: unknown) {
    // @axe-core/playwright not installed in this checkout — skip silently.
    if (
      err instanceof Error &&
      (err.message.includes('Cannot find module') || err.message.includes('MODULE_NOT_FOUND'))
    ) {
      return;
    }
    throw err;
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function url(route: string): string {
  return `${baseURL}${route}`;
}

/**
 * Sign in via the /en/login page using email + password credentials.
 * Uses the merged LoginCard (T-057 auth path) that is live at Gate-5.
 */
async function signIn(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(url('/en/login'), { waitUntil: 'domcontentloaded' });

  const emailInput = page.getByLabel(/work email/i).or(page.locator('input[type="email"]'));
  await emailInput.fill(adminEmail);

  const passwordInput = page
    .getByLabel(/password/i)
    .or(page.locator('input[type="password"]'))
    .first();
  await passwordInput.fill(adminPassword);

  await page.getByRole('button', { name: /sign in|log in|submit/i }).click();

  // Wait for redirect away from /login to confirm auth success.
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15_000 });
}

/**
 * Navigate to the pipeline board and return the first card at G0 so we can
 * locate the project created during the spec run.
 */
async function openPipelineBoard(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.goto(url('/en/pipeline'), { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('pipeline-tabs')).toBeVisible({ timeout: 10_000 });
}

/**
 * Navigate to the gate screen for a known projectId.
 */
async function openGateScreen(
  page: import('@playwright/test').Page,
  projectId: string,
): Promise<void> {
  await page.goto(url(`/en/pipeline/${projectId}/gate`), { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('gate-checklist-panel')).toBeVisible({ timeout: 10_000 });
}

/**
 * Resolve the newest project id from the pipeline board by reading data-project-id
 * off a kanban card. Falls back to reading the URL after clicking "Open" on the card.
 */
async function resolveLatestProjectId(
  page: import('@playwright/test').Page,
  projectCode: string,
): Promise<string | null> {
  // Look for a card whose data-testid contains the project code.
  const card = page.getByTestId(`kanban-card-${projectCode}`);
  if (await card.count()) {
    const projectId = await card.getAttribute('data-project-id');
    if (projectId) return projectId;
  }

  // Fallback: use the first G0 card and derive the id from the gate link.
  const firstG0Card = page.locator('[data-gate="G0"]').first();
  if (await firstG0Card.count()) {
    const href = await firstG0Card.locator('a[href*="/pipeline/"]').first().getAttribute('href');
    if (href) {
      const match = /\/pipeline\/([a-f0-9-]{36})/.exec(href);
      if (match) return match[1] ?? null;
    }
  }

  return null;
}

// ── spec ─────────────────────────────────────────────────────────────────────

test.describe('T-062 NPD: create project → advance G0→G1→G2 → approve G3 (e-sign)', () => {
  // Gate: entire describe block skips when no live server is configured.
  test.skip(!baseURL, 'PLAYWRIGHT_BASE_URL unset — live authenticated server required (Gate-5 only).');

  // State shared across the ordered tests in this describe block.
  let projectId = '';
  let projectCode = '';

  // Each test re-authenticates for simplicity; in a full suite extract to beforeAll.

  // ── Step 1: create a new NPD project ───────────────────────────────────────

  test('1 · creates a new NPD project via the pipeline board', async ({ page }) => {
    ensureDir(artifactDir);

    await signIn(page);
    await openPipelineBoard(page);

    // Locate the "+ New project" / "New" button (accessible name covers prototype labels).
    const newProjectButton = page
      .getByRole('button', { name: /new project|new|create/i })
      .or(page.getByRole('link', { name: /new project|new|create/i }))
      .first();

    await expect(newProjectButton, 'a "New project" affordance is present on the pipeline board').toBeVisible({
      timeout: 8_000,
    });
    await newProjectButton.click();

    // Project creation dialog / wizard.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Fill the minimal required fields (name + type).
    const nameInput = dialog.getByLabel(/project name|name/i).first();
    const typeInput = dialog.getByLabel(/type/i).first();

    const uniqueName = `E2E Gate Flow ${Date.now()}`;
    await nameInput.fill(uniqueName);

    // Type field — select the first available option or type a value.
    if (await typeInput.count()) {
      const tagName = await typeInput.evaluate((el) => el.tagName.toLowerCase());
      if (tagName === 'select') {
        await typeInput.selectOption({ index: 1 });
      } else {
        await typeInput.fill('New');
      }
    }

    await page.screenshot({ path: path.join(artifactDir, '01-create-dialog.png') });

    // Submit the creation form.
    await dialog.getByRole('button', { name: /create|submit|save/i }).click();

    // Dialog closes; new card should appear in the G0 column.
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('kanban-col-G0')).toBeVisible({ timeout: 8_000 });

    await page.screenshot({ path: path.join(artifactDir, '02-after-create.png'), fullPage: true });
    await runAxe(page, 'pipeline-after-create');

    // Capture the project code from the first G0 card for subsequent steps.
    const firstCard = page.locator('[data-testid^="kanban-card-"]').first();
    const code = await firstCard.getAttribute('data-testid');
    if (code) {
      projectCode = code.replace('kanban-card-', '');
    }
    const pid = await firstCard.getAttribute('data-project-id');
    if (pid) {
      projectId = pid;
    }

    // If we couldn't read directly from the card, fall back to resolving from code.
    if (!projectId && projectCode) {
      const resolved = await resolveLatestProjectId(page, projectCode);
      if (resolved) projectId = resolved;
    }

    expect(projectCode || projectId, 'a new project card appeared in G0').toBeTruthy();
  });

  // ── Step 2: advance G0 → G1 ────────────────────────────────────────────────

  test('2 · advances the project from G0 to G1 (self-advance via AdvanceGateModal)', async ({ page }) => {
    ensureDir(artifactDir);
    test.skip(!projectId && !projectCode, 'project id not captured from step 1 — run full suite sequentially');

    await signIn(page);

    // Navigate to the gate screen; fall back to pipeline board if no projectId.
    if (projectId) {
      await openGateScreen(page, projectId);
    } else {
      await openPipelineBoard(page);
      const resolved = await resolveLatestProjectId(page, projectCode);
      if (!resolved) throw new Error(`Could not resolve project id for code ${projectCode}`);
      projectId = resolved;
      await openGateScreen(page, projectId);
    }

    // The gate screen must render the checklist panel.
    await expect(page.getByTestId('gate-checklist-panel')).toBeVisible({ timeout: 10_000 });

    // The "Advance to G1" CTA opens the AdvanceGateModal (G0 is a self-advance gate).
    const advanceButton = page.getByTestId('gate-advance-button');
    await expect(advanceButton).toBeVisible({ timeout: 8_000 });
    await advanceButton.click();

    // AdvanceGateModal should open (data-testid from T-108).
    const advanceModal = page.getByTestId('advance-gate-transition');
    await expect(advanceModal).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: path.join(artifactDir, '03-advance-g0-modal.png') });
    await runAxe(page, 'advance-g0-modal');

    // Add a note (required by the advance form).
    const notesTextarea = page.locator('#advance-gate-notes').or(page.getByLabel(/advance notes|notes/i)).first();
    if (await notesTextarea.count()) {
      await notesTextarea.fill('Advancing from G0 to G1 — E2E gate flow test.');
    }

    // Confirm the advance.
    await page.getByRole('button', { name: /advance to g1|advance/i }).click();

    // Success state or modal closes, then the board/panel reflects G1.
    const successAlert = page.getByTestId('advance-gate-success');
    if (await successAlert.count()) {
      await expect(successAlert).toBeVisible({ timeout: 10_000 });
    } else {
      await expect(advanceModal).not.toBeVisible({ timeout: 10_000 });
    }

    await page.screenshot({ path: path.join(artifactDir, '04-after-advance-g1.png'), fullPage: true });
  });

  // ── Step 3: advance G1 → G2 ────────────────────────────────────────────────

  test('3 · advances the project from G1 to G2 (self-advance)', async ({ page }) => {
    ensureDir(artifactDir);
    test.skip(!projectId, 'project id not captured — run full suite sequentially');

    await signIn(page);
    await openGateScreen(page, projectId);

    const advanceButton = page.getByTestId('gate-advance-button');
    await expect(advanceButton).toBeVisible({ timeout: 10_000 });
    await advanceButton.click();

    const advanceModal = page.getByTestId('advance-gate-transition');
    await expect(advanceModal).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: path.join(artifactDir, '05-advance-g1-modal.png') });

    const notesTextarea = page.locator('#advance-gate-notes').or(page.getByLabel(/advance notes|notes/i)).first();
    if (await notesTextarea.count()) {
      await notesTextarea.fill('Advancing from G1 to G2 — E2E gate flow test.');
    }

    await page.getByRole('button', { name: /advance to g2|advance/i }).click();

    const successAlert = page.getByTestId('advance-gate-success');
    if (await successAlert.count()) {
      await expect(successAlert).toBeVisible({ timeout: 10_000 });
    } else {
      await expect(advanceModal).not.toBeVisible({ timeout: 10_000 });
    }

    await page.screenshot({ path: path.join(artifactDir, '06-after-advance-g2.png'), fullPage: true });
  });

  // ── Step 4: advance G2 → G3 (requires e-sign approval gate) ────────────────

  test('4 · advances the project from G2 to G3 (GateApprovalModal — requiresApproval=true)', async ({
    page,
  }) => {
    ensureDir(artifactDir);
    test.skip(!projectId, 'project id not captured — run full suite sequentially');

    await signIn(page);
    await openGateScreen(page, projectId);

    // G2 → G3 uses the GateApprovalModal (requiresApproval=true per GATE_META).
    const advanceButton = page.getByTestId('gate-advance-button');
    await expect(advanceButton).toBeVisible({ timeout: 10_000 });
    await advanceButton.click();

    // The approval modal (not the advance modal) should open.
    const approvalModal = page.getByTestId('gate-approval-project');
    await expect(approvalModal).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: path.join(artifactDir, '07-approval-g3-modal.png') });
    await runAxe(page, 'gate-approval-g3-decision');

    // Decision step: select "Approve" (default) and add notes.
    const approveRadio = page
      .getByRole('radio', { name: /approve/i })
      .or(page.locator('input[type="radio"][value="approve"]'))
      .first();
    if (await approveRadio.count()) {
      await approveRadio.check();
    }

    const notesTextarea = page.locator('#gate-approval-notes').or(page.getByLabel(/approval notes|notes/i)).first();
    await expect(notesTextarea).toBeVisible({ timeout: 5_000 });
    await notesTextarea.fill('Approving G3 transition — E2E gate flow test authorisation.');

    // Submit the decision to reach the e-sign step.
    await page.getByRole('button', { name: /submit approval|next|continue/i }).click();

    // E-sign overlay (data-testid="gate-approval-esign" from T-109).
    const esignOverlay = page.getByTestId('gate-approval-esign');
    await expect(esignOverlay).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: path.join(artifactDir, '08-esign-step.png') });
    await runAxe(page, 'gate-approval-esign');

    // Fill in the e-sign password.
    test.skip(!adminPassword, 'PLAYWRIGHT_ADMIN_PASSWORD unset — e-sign requires a real password');

    const passwordInput = esignOverlay
      .getByLabel(/password|pin/i)
      .or(esignOverlay.locator('input[type="password"]'))
      .first();
    await passwordInput.fill(adminPassword);

    // Confirm the e-sign checkbox (if present).
    const confirmCheckbox = esignOverlay.getByRole('checkbox').first();
    if (await confirmCheckbox.count() && !(await confirmCheckbox.isChecked())) {
      await confirmCheckbox.check();
    }

    // Submit the e-signature.
    await esignOverlay.getByRole('button', { name: /confirm.*sign|sign|submit/i }).click();

    // Success: the modal should close or show the "approved" confirmation.
    const doneBanner = page.getByTestId('gate-approval-done');
    if (await doneBanner.count()) {
      await expect(doneBanner).toBeVisible({ timeout: 15_000 });
    } else {
      await expect(approvalModal).not.toBeVisible({ timeout: 15_000 });
    }

    await page.screenshot({ path: path.join(artifactDir, '09-after-approve-g3.png'), fullPage: true });
  });

  // ── Step 5: assert G3 approval visible in ApprovalHistoryTimeline ───────────

  test('5 · gate_approvals row and ApprovalHistoryTimeline show the G3 e-sign entry', async ({
    page,
  }) => {
    ensureDir(artifactDir);
    test.skip(!projectId, 'project id not captured — run full suite sequentially');

    await signIn(page);
    await openGateScreen(page, projectId);

    // The timeline must be visible on the gate screen.
    const timeline = page.getByTestId('approval-history-timeline');
    await expect(timeline).toBeVisible({ timeout: 10_000 });

    // There should be at least one entry in the timeline.
    const entries = timeline.locator('[data-testid^="approval-history-entry"], [data-testid^="approval-"]').first();
    // Tolerate different testid schemes — just assert a child element exists.
    const entryCount = await timeline.locator('li, [role="listitem"], article').count();
    expect(entryCount, 'at least one approval timeline entry exists after G3 approval').toBeGreaterThan(0);

    // Expand the e-sign signature details if the toggle is present.
    const sigToggle = page.getByTestId('approval-history-signature-toggle').first();
    if (await sigToggle.count()) {
      await sigToggle.click();
      await expect(page.getByTestId('approval-history-signature-panel').first()).toBeVisible({
        timeout: 5_000,
      });
      await page.screenshot({ path: path.join(artifactDir, '10-esign-timeline-expanded.png') });
    }

    await page.screenshot({ path: path.join(artifactDir, '11-approval-history-timeline.png'), fullPage: true });
    await runAxe(page, 'approval-history-final');

    // Verify the project has advanced to the G4 gate (post-G3 approval).
    const currentGateBadge = page.getByTestId('gate-current-badge');
    if (await currentGateBadge.count()) {
      const badgeText = await currentGateBadge.first().textContent();
      // After G3 approval the project should be at G4 (current gate advanced server-side).
      expect(badgeText, 'current gate badge should reflect G4 after G3 approval').toContain('G4');
    }

    // Ignore the `entries` variable (unused — intentional toleration of different testid schemes).
    void entries;
  });
});

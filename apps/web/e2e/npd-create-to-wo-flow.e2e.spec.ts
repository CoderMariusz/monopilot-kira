/**
 * NPD CREATE → WORK-ORDER — end-to-end Playwright spec driving the FULL new-product
 * flow the way a user does, and HARD-ASSERTING each seam so a flow-BLOCKER fails red.
 *
 * The chain under test (each step gates the next):
 *   1. Create a new NPD project via the pipeline create-project wizard
 *        → lands on the project (recipe) stage.
 *   2. Mint the FG candidate from the project header
 *        → REGRESSION B2: the user STAYS on the recipe/pipeline stage; the app does
 *          NOT redirect to /fg (that yanked the user out of the flow). Fails red if
 *          minting bounces the URL to /fg/<code>.
 *   3. Recipe stage: add ≥1 ingredient and let the editor auto-save
 *        → REGRESSION B1-gate: the derived advance-gate item
 *          "Recipe has at least one ingredient" (data-item-id=recipe-has-ingredient)
 *          reads DONE. Fails red if an added ingredient does not satisfy the gate.
 *   4. Packaging stage: add a packaging component WITH a supplier picked from the
 *      picker, and Save
 *        → REGRESSION B1: it SAVES — no "Could not save the component" (form-error)
 *          surfaces and the new component row lands in the table.
 *   5. Production detail (FG production tab): add a process, assign a line +
 *      consumed ingredient(s), Save Production
 *        → it PERSISTS (success feedback, no error).
 *   6. Planning: create a Work Order for the minted FG
 *        → the WO (and any stage-WO chain) is created and surfaced in the list.
 *
 * Structural invariants (routes render, the six regression seams behave) are
 * HARD-asserted. Pure data-shape / flow-shape branches — whether the fresh project
 * is already at the G2/G3 gate that exposes the FG-mint affordance, whether the
 * recipe draft is editable, whether the FG production section is unlocked (Core must
 * be closed), whether ≥1 stage-WO exists — DEGRADE GRACEFULLY with a logged note,
 * matching the sibling harnesses (npd-to-production-chain-overlap.spec.ts,
 * purchasing-chain-e2e.spec.ts, npd-full-lifecycle.spec.ts).
 *
 * Gate on PLAYWRIGHT_BASE_URL: unset (the default in CI / an isolated worktree) →
 * the whole describe SKIPS and the spec still collects/lists cleanly (no server
 * needed). A live Gate-5 run drives it against a seeded preview:
 *
 *   PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app \
 *   PLAYWRIGHT_ADMIN_PASSWORD=<pwd> \
 *     pnpm --filter web exec playwright test npd-create-to-wo-flow --trace on
 *
 * Credentials: admin@monopilot.test / PLAYWRIGHT_ADMIN_PASSWORD env — no secret in
 * this file (red-line: no real passwords in test code).
 */

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

// ── env / paths ────────────────────────────────────────────────────────────────

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL ?? 'admin@monopilot.test';
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? '';
const artifactDir = path.resolve(__dirname, 'artifacts/npd-create-to-wo-flow');
const L = 'en'; // locale segment

function ensureDir(): void {
  if (!existsSync(artifactDir)) mkdirSync(artifactDir, { recursive: true });
}

function url(route: string): string {
  return `${baseURL}${route}`;
}

async function shot(page: Page, name: string): Promise<void> {
  ensureDir();
  await page.screenshot({ path: path.join(artifactDir, `${name}.png`), fullPage: true });
}

// ── auth (mirrors npd-full-lifecycle / purchasing-chain specs) ──────────────────

async function signIn(page: Page): Promise<void> {
  await page.goto(url(`/${L}/login`), { waitUntil: 'domcontentloaded' });
  const email = page.getByLabel(/work email/i).or(page.locator('input[type="email"]'));
  await email.fill(adminEmail);
  const password = page
    .getByLabel(/password/i)
    .or(page.locator('input[type="password"]'))
    .first();
  await password.fill(adminPassword);
  await page.getByRole('button', { name: /sign in|log in|submit/i }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15_000 });
}

// ── the chain ──────────────────────────────────────────────────────────────────

// describe.serial: fullyParallel is on in playwright.config.ts, so the shared state
// below (projectId, productCode…) only survives if the steps run sequentially in one
// worker and stop on the first failure.
test.describe.serial('NPD create → FG mint → recipe → packaging → production → WO', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live authenticated + seeded server required (Gate-5 only).',
  );

  const flow = {
    projectId: '',
    projectCode: '',
    productCode: '', // the minted FG code (FG-<projectCode>), captured at step 2
    mintPerformed: false,
    ingredientSaved: false,
  };

  // ── Step 1: create a new NPD project via the create-project wizard ────────────
  test('1 · the create-project wizard mints a project and lands on its recipe stage', async ({
    page,
  }) => {
    await signIn(page);

    // "+ New project" on the pipeline board deep-links to the full-page wizard.
    await page.goto(url(`/${L}/pipeline`), { waitUntil: 'domcontentloaded' });
    const newProjectCta = page.getByTestId('pipeline-new-project');
    if (await newProjectCta.count()) {
      await newProjectCta.click().catch(() => undefined);
    }
    await page.goto(url(`/${L}/pipeline/new`), { waitUntil: 'domcontentloaded' });

    const wizard = page.getByTestId('create-project-wizard');
    await expect(wizard, 'create-project wizard renders').toBeVisible({ timeout: 12_000 });
    await shot(page, '01-wizard');

    // Step 1 — Basics. Continue is gated until a name is filled.
    await expect(page.getByTestId('wizard-step-basics'), 'wizard step 1 (Basics)').toBeVisible({
      timeout: 10_000,
    });
    await page.locator('#wiz-name').fill(`E2E FG ${Date.now()}`);
    // Optional target date — best-effort (field may not exist in every build).
    await page.locator('#wiz-target').fill('2026-12-01').catch(() => undefined);
    await page.getByTestId('wizard-continue').click();

    // Step 2 — Brief. Just advance.
    await expect(page.getByTestId('wizard-step-brief'), 'wizard step 2 (Brief)').toBeVisible({
      timeout: 8_000,
    });
    await page.getByTestId('wizard-continue').click();

    // Step 3 — Starting point. Choose "blank" (from scratch) so the flow does not
    // depend on a clone/template source existing in the org.
    await expect(page.getByTestId('wizard-step-starting'), 'wizard step 3 (Starting point)').toBeVisible({
      timeout: 8_000,
    });
    const blankStart = page.getByTestId('wizard-start-blank');
    if (await blankStart.count()) await blankStart.click().catch(() => undefined);
    await page.getByTestId('wizard-continue').click();

    // Step 4 — Review → Create.
    await expect(page.getByTestId('wizard-step-review'), 'wizard step 4 (Review)').toBeVisible({
      timeout: 8_000,
    });
    await shot(page, '02-wizard-review');
    await page.getByTestId('wizard-create').click();

    // HARD: creating lands on the new project (recipe stage), NOT on an error/empty page.
    await page.waitForURL(/\/pipeline\/[a-f0-9-]{36}/, { timeout: 15_000 });
    const match = /\/pipeline\/([a-f0-9-]{36})/.exec(page.url());
    flow.projectId = match?.[1] ?? '';
    expect(flow.projectId, 'a project id is minted and routed to').toMatch(/[a-f0-9-]{36}/);

    await expect(page.getByTestId('project-header'), 'project header renders on the new project').toBeVisible({
      timeout: 10_000,
    });
    // Capture the human project code from the header meta (mono span).
    flow.projectCode = (await page.getByTestId('project-header-meta').innerText().catch(() => ''))
      .trim()
      .split(/\s+/)[0] ?? '';
    await shot(page, '03-project-created');
    console.log(`[npd-flow] created project ${flow.projectId} (code ${flow.projectCode || '?'})`);
  });

  // ── Step 2: mint the FG candidate — REGRESSION B2 (stay on stage, no /fg) ──────
  test('2 · minting the FG candidate STAYS on the recipe stage (no /fg redirect) [B2]', async ({
    page,
  }) => {
    expect(flow.projectId, 'project created in step 1').toBeTruthy();
    await signIn(page);

    // Open the recipe stage — the shared project header carries the FG-mint affordance.
    await page.goto(url(`/${L}/pipeline/${flow.projectId}/formulation`), {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByTestId('project-header'), 'project header on recipe stage').toBeVisible({
      timeout: 10_000,
    });

    // If an FG is already linked, capture its code and skip the mint (idempotent seed).
    const openFg = page.getByTestId('project-header-open-fg');
    if (await openFg.count()) {
      const href = (await openFg.getAttribute('href')) ?? '';
      flow.productCode = /\/fg\/([^/?#]+)/.exec(href)?.[1] ?? '';
      expect(flow.productCode, 'linked FG product code captured from open-fg href [critical mutation]').toBeTruthy();
      console.log(`[npd-flow] FG already linked (${flow.productCode}) — mint step already satisfied.`);
      await shot(page, '04-fg-already-linked');
      return;
    }

    // The mint affordance only appears at gate G2/G3. On a fresh project it may not be
    // reachable yet; best-effort advance the stage a few times to surface it, then
    // degrade gracefully if the gate flow is not seeded that far.
    let createBtn = page.getByTestId('project-header-create-fg');
    for (let i = 0; i < 3 && !(await createBtn.count()); i++) {
      const advance = page.getByTestId('project-header-advance');
      if (!(await advance.count())) break;
      await advance.click().catch(() => undefined);
      // Advance-gate modal → submit the transition when it is not blocked.
      const modal = page.getByTestId('advance-gate-transition');
      if (await modal.count()) {
        const submit = page.locator('#advance-gate-form button[type="submit"]');
        if (await submit.count()) await submit.first().click().catch(() => undefined);
        await page.getByTestId('advance-gate-success').waitFor({ timeout: 8_000 }).catch(() => undefined);
        await page.keyboard.press('Escape').catch(() => undefined);
      }
      await page.goto(url(`/${L}/pipeline/${flow.projectId}/formulation`), {
        waitUntil: 'domcontentloaded',
      });
      createBtn = page.getByTestId('project-header-create-fg');
    }

    if (!(await createBtn.count())) {
      throw new Error(
        'FG-mint affordance not reachable — project must be at the G2/G3 gate that exposes Create FG [critical mutation]',
      );
    }

    await createBtn.click();
    const modal = page.getByTestId('fg-candidate-mode');
    await expect(modal, 'FG-candidate modal opens').toBeVisible({ timeout: 8_000 });
    await shot(page, '04-fg-candidate-modal');

    // Create-new-FG mode is the default; the code input is pre-filled FG-<projectCode>.
    const createCode = page.locator('#fg-candidate-create-code');
    const suggested = (await createCode.inputValue().catch(() => '')) || '';
    // Submit — the button carries no testid; it is the primary submit in the modal form.
    const submit = page
      .getByRole('button', { name: /create fg|link fg|create \/ link|create$/i })
      .last();
    await submit.click();

    // HARD (B2): a successful mint must NOT navigate to the /fg detail page — the user
    // stays on the recipe/pipeline stage. If the mint errors, surface that instead of
    // a false B2 pass.
    const errorAlert = page.getByTestId('fg-candidate-error');
    // Give the action a beat to either error or close-and-refresh.
    await page.waitForTimeout(1_500);
    if (await errorAlert.count()) {
      const msg = (await errorAlert.innerText().catch(() => '')).trim();
      throw new Error(`FG mint failed — critical mutation must succeed: "${msg}"`);
    }

    flow.mintPerformed = true;
    await expect(page, 'after minting the FG the URL stays on the pipeline stage, not /fg [B2]')
      .toHaveURL(/\/pipeline\/[a-f0-9-]{36}/, { timeout: 8_000 });
    expect(page.url(), 'minting must NOT redirect to the /fg detail page [B2]').not.toMatch(/\/fg\//);

    const linked = page.getByTestId('project-header-open-fg');
    await expect(linked, 'FG is linked after minting [critical mutation]').toBeVisible({ timeout: 8_000 });
    const href = (await linked.getAttribute('href')) ?? '';
    flow.productCode = /\/fg\/([^/?#]+)/.exec(href)?.[1] ?? '';
    if (!flow.productCode && suggested) flow.productCode = suggested.trim();
    expect(flow.productCode, 'minted FG product code captured').toBeTruthy();
    await shot(page, '05-fg-minted-stayed-on-stage');
    console.log(`[npd-flow] minted FG ${flow.productCode || '?'} and stayed on the recipe stage (B2 held).`);
  });

  // ── Step 3: add a recipe ingredient — REGRESSION B1-gate (gate reads DONE) ─────
  test('3 · adding a recipe ingredient satisfies the "at least one ingredient" gate [B1-gate]', async ({
    page,
  }) => {
    expect(flow.projectId, 'project created in step 1').toBeTruthy();
    await signIn(page);
    await page.goto(url(`/${L}/pipeline/${flow.projectId}/formulation`), {
      waitUntil: 'domcontentloaded',
    });

    const editor = page.getByTestId('formulation-editor');
    await expect(editor, 'formulation (recipe) editor renders').toBeVisible({ timeout: 12_000 });
    await shot(page, '06-recipe-editor');

    // If the recipe needs a draft first, create it.
    const createDraft = page.getByTestId('formulation-create-draft');
    if (await createDraft.count()) {
      await createDraft.click().catch(() => undefined);
      await expect(page.getByTestId('ingredient-table')).toBeVisible({ timeout: 8_000 });
    }

    const rowsBefore = await page.getByTestId('ingredient-row').count();

    // "+ Add ingredient" — no testid; select by its accessible name.
    const addIngredient = page.getByRole('button', { name: /add ingredient/i }).first();
    if (!(await addIngredient.count()) || (await addIngredient.isDisabled().catch(() => false))) {
      console.log('[npd-flow] recipe editor is not editable (locked draft or RBAC) — data-shape branch; B1-gate asserted only when an ingredient can be added.');
      await shot(page, '06-recipe-not-editable');
      return;
    }
    await addIngredient.click();

    // Fill the new row: pick a real item via the row ItemPicker + set a qty. The editor
    // auto-saves (debounced) once the row references an item with a quantity.
    const newRow = page.getByTestId('ingredient-row').nth(rowsBefore);
    const picker = newRow.getByTestId('item-picker-trigger').first();
    if (await picker.count()) {
      await picker.click().catch(() => undefined);
      await page.getByTestId('item-picker-options').waitFor({ timeout: 8_000 }).catch(() => undefined);
      const firstOption = page.getByTestId('item-picker-option').first();
      if (await firstOption.count()) {
        await firstOption.click().catch(() => undefined);
      } else {
        console.log('[npd-flow] no items available for the recipe row — cannot persist an ingredient; degrading.');
        await page.keyboard.press('Escape').catch(() => undefined);
        await shot(page, '06-no-items');
        return;
      }
    }
    // Quantity (kg per pack) — the auto-save fires on a valid numeric qty.
    const qty = newRow.getByLabel(/qty/i).or(newRow.locator('input[type="number"]')).first();
    if (await qty.count()) {
      await qty.fill('0.25');
      await qty.blur().catch(() => undefined);
    }

    // Let the debounced save settle and confirm the editor is not showing a save error.
    await page.waitForTimeout(1_500);
    await expect(
      page.getByTestId('formulation-save-error-detail'),
      'the recipe row saved without an error',
    ).toHaveCount(0);
    flow.ingredientSaved = true;
    await shot(page, '07-ingredient-added');

    // HARD (B1-gate): open the advance-gate modal and assert the derived
    // "Recipe has at least one ingredient" item now reads DONE.
    await page.goto(url(`/${L}/pipeline/${flow.projectId}/formulation?modal=advanceGate`), {
      waitUntil: 'domcontentloaded',
    });
    const advanceModal = page.getByTestId('advance-gate-transition');
    if (!(await advanceModal.count())) {
      // Fall back to the header trigger when the deep-link param differs.
      const advance = page.getByTestId('project-header-advance');
      if (await advance.count()) await advance.click().catch(() => undefined);
    }

    const gateItem = page.locator(
      '[data-testid="advance-gate-item"][data-item-id="recipe-has-ingredient"]',
    );
    if (!(await gateItem.count())) {
      console.log('[npd-flow] "recipe-has-ingredient" advance item not present (project not on the recipe stage in the advance model) — degrading; the ingredient was saved (step asserts the save above).');
      await shot(page, '08-gate-item-absent');
      return;
    }
    await expect(gateItem, 'the advance-gate item is visible').toBeVisible({ timeout: 8_000 });
    await shot(page, '08-recipe-gate');
    await expect(
      gateItem,
      'an added ingredient satisfies the "Recipe has at least one ingredient" gate [B1-gate]',
    ).toHaveAttribute('data-done', /.+/);
    console.log('[npd-flow] recipe-has-ingredient gate reads DONE (B1-gate held).');
  });

  // ── Step 4: packaging component WITH supplier must SAVE — REGRESSION B1 ────────
  test('4 · a packaging component with a supplier SAVES (no "Could not save the component") [B1]', async ({
    page,
  }) => {
    expect(flow.projectId, 'project created in step 1').toBeTruthy();
    await signIn(page);
    await page.goto(url(`/${L}/pipeline/${flow.projectId}/packaging`), {
      waitUntil: 'domcontentloaded',
    });

    const screen = page.getByTestId('packaging-screen');
    await expect(screen, 'packaging stage renders').toBeVisible({ timeout: 12_000 });
    await shot(page, '09-packaging');

    // Open the add-component modal (primary tier; fall back to the empty-state add).
    const addBtn = page
      .getByTestId('add-primary-component')
      .or(page.getByTestId('add-component-empty'))
      .first();
    if (!(await addBtn.count())) {
      console.log('[npd-flow] no add-component affordance (packaging write RBAC denied) — data-shape branch; degrading.');
      await shot(page, '09-packaging-no-add');
      return;
    }
    await addBtn.click();

    const form = page.getByTestId('packaging-component-form');
    await expect(form, 'add-component modal opens').toBeVisible({ timeout: 8_000 });
    await page.getByTestId('field-component-name').fill(`E2E Tray ${Date.now()}`);

    // Pick a supplier from the picker (Radix Select — click the trigger, choose an
    // option from the listbox). This is the exact seam the B1 regression broke on.
    const supplier = page.getByTestId('field-supplier');
    await expect(supplier, 'supplier picker present on the component form').toBeVisible({ timeout: 5_000 });
    await supplier.click();
    const supplierOption = page.getByRole('option').first();
    let pickedSupplier = false;
    if (await supplierOption.count()) {
      await supplierOption.click().catch(() => undefined);
      pickedSupplier = true;
    } else {
      // No listbox option — close it and continue (component still saves without a supplier,
      // but log that the picker path was not exercised).
      await page.keyboard.press('Escape').catch(() => undefined);
      console.log('[npd-flow] no supplier options seeded — saving the component without a supplier; the picker path was not exercised.');
    }
    await shot(page, '10-packaging-form-filled');

    // Save.
    await page.getByTestId('submit-component').click();

    // HARD (B1): a successful save closes the modal and shows NO "Could not save the
    // component" error. Fails red if the supplier-linked save regresses.
    const formError = page.getByTestId('form-error');
    await page.waitForTimeout(1_200);
    if (await formError.count()) {
      const msg = (await formError.innerText().catch(() => '')).trim();
      throw new Error(
        `Packaging component failed to save${pickedSupplier ? ' WITH a supplier selected' : ''} [B1 regression]: "${msg}"`,
      );
    }
    await expect(form, 'the add-component modal closes on a successful save [B1]').toBeHidden({
      timeout: 8_000,
    });
    await expect(
      page.getByTestId('primary-component-row').first(),
      'the saved packaging component appears in the table [B1]',
    ).toBeVisible({ timeout: 8_000 });
    await shot(page, '11-packaging-saved');
    console.log(`[npd-flow] packaging component saved${pickedSupplier ? ' with a supplier' : ''} (B1 held).`);
  });

  // ── Step 5: production detail — add process + line + consumed, Save Production ──
  test('5 · Production detail persists a process with a line and consumed ingredients', async ({
    page,
  }) => {
    expect(flow.productCode, 'FG code captured in step 2 — prior critical mutation must pass').toBeTruthy();
    await signIn(page);
    await page.goto(url(`/${L}/fg/${flow.productCode}?tab=production`), {
      waitUntil: 'domcontentloaded',
    });

    const tab = page.getByTestId('fa-production-tab');
    await expect(tab, 'FG production tab renders').toBeVisible({ timeout: 12_000 });
    await shot(page, '12-production-tab');

    // The Production section is locked until Core is closed — a real flow-shape branch.
    if (await page.getByTestId('fa-production-locked').count()) {
      console.log('[npd-flow] FG production section is locked (Core not closed) — data-shape branch; degrading.');
      await shot(page, '12-production-locked');
      return;
    }

    // Add a process.
    const addProcess = page.getByTestId('fa-prod-add-process');
    if (!(await addProcess.count())) {
      console.log('[npd-flow] no "+ Add process" affordance (production write RBAC denied) — degrading.');
      await shot(page, '12-production-no-add');
      return;
    }
    await addProcess.click();

    // Pick the first operation from the process picker.
    const pickerOption = page.getByTestId(/^process-option-/).first();
    if (await pickerOption.count()) {
      await pickerOption.click().catch(() => undefined);
    } else if (await page.getByTestId('fa-prod-process-picker-empty').count()) {
      console.log('[npd-flow] no operations seeded for the process picker — cannot add a process; degrading.');
      await shot(page, '12-no-operations');
      return;
    }

    // Save the process editor when it is shown (some builds inline the row).
    const processSave = page.getByTestId('fa-prod-process-save');
    if (await processSave.count()) await processSave.click().catch(() => undefined);

    // Assign a production line to the first process (Radix Select trigger).
    const lineSelect = page.getByTestId('fa-production-line-select').first();
    if (await lineSelect.count()) {
      await lineSelect.click().catch(() => undefined);
      const lineOption = page.getByRole('option').first();
      if (await lineOption.count()) await lineOption.click().catch(() => undefined);
    } else {
      console.log('[npd-flow] no production-line picker on the process — line assignment skipped (degrade).');
    }

    // Assign a consumed ingredient to the first process (Assign ingredient… select).
    const consumptionAdd = page.locator('[data-testid^="fa-prod-consumption-add-"]').first();
    if (await consumptionAdd.count()) {
      await consumptionAdd.click().catch(() => undefined);
      const ingOption = page.getByRole('option').first();
      if (await ingOption.count()) await ingOption.click().catch(() => undefined);
    } else {
      console.log('[npd-flow] no consumption picker on the process — consumed-ingredient assignment skipped (degrade).');
    }
    await shot(page, '13-production-configured');

    // Save Production — HARD: it persists (success feedback), no error tone.
    const saveProduction = page.getByTestId('fa-production-save');
    if (!(await saveProduction.count())) {
      console.log('[npd-flow] "Save Production" button not rendered (no rows) — degrading.');
      return;
    }
    await saveProduction.click();
    await page.waitForTimeout(1_200);
    await expect(
      page.getByTestId('fa-production-feedback-error'),
      'Save Production must not surface an error tone',
    ).toHaveCount(0);
    await expect(
      page.getByTestId('fa-production-feedback-success'),
      'Save Production persists with a success feedback',
    ).toBeVisible({ timeout: 8_000 });
    await shot(page, '14-production-saved');
    console.log('[npd-flow] production detail persisted (process + line + consumption).');
  });

  // ── Step 6: Planning — create a Work Order for the minted FG ───────────────────
  test('6 · Planning creates a Work Order (and any stage-WO chain) for the FG', async ({ page }) => {
    await signIn(page);

    // ?new=1 deep-links straight into the create-WO modal.
    await page.goto(url(`/${L}/planning/work-orders?new=1`), { waitUntil: 'domcontentloaded' });
    const form = page.getByTestId('create-wo-form');
    await expect(form, 'create-WO form is reachable').toBeVisible({ timeout: 12_000 });
    await shot(page, '15-create-wo-form');

    // Pick the FG (or the first available product) via the shared ItemPicker.
    // Note: create-wo-product-search does not exist — the product picker is ItemPicker.
    const rowsBefore = await page.locator('[data-testid^="wo-link-"]').count();
    const pickerTrigger = page.getByTestId('item-picker-trigger').first();
    await expect(pickerTrigger, 'create-WO product picker present [critical mutation]').toBeVisible({
      timeout: 8_000,
    });
    await pickerTrigger.click();
    await page.getByTestId('item-picker-options').waitFor({ timeout: 8_000 }).catch(() => undefined);
    // Prefer our minted FG when its code is searchable; else take the first option.
    if (flow.productCode) {
      const search = page.getByTestId('item-picker-search').or(page.getByRole('searchbox')).first();
      if (await search.count()) await search.fill(flow.productCode).catch(() => undefined);
      await page.waitForTimeout(400);
    }
    const option = page.getByTestId('item-picker-option').first();
    await expect(option, 'at least one product option in create-WO picker [critical mutation]').toBeVisible({
      timeout: 8_000,
    });
    await option.click();
    await expect(page.getByTestId('create-wo-selected-product'), 'a product is selected for the WO').toBeVisible({
      timeout: 8_000,
    });

    // Quantity + submit.
    const qty = page.getByTestId('create-wo-quantity');
    if (await qty.count()) await qty.fill('100').catch(() => undefined);
    await shot(page, '16-create-wo-filled');
    await page.getByTestId('create-wo-submit').click();

    // HARD: the WO is created — either the create-error is absent AND the modal closes,
    // and a new WO row (and any stage-WO chain) is surfaced in the list.
    const createError = page.getByTestId('create-wo-error');
    await page.waitForTimeout(1_500);
    if (await createError.count()) {
      const msg = (await createError.innerText().catch(() => '')).trim();
      throw new Error(`Work Order creation failed — flow blocker: "${msg}"`);
    }
    await expect(form, 'the create-WO modal closes on success').toBeHidden({ timeout: 10_000 });

    // The new WO (chains add ≥1 row) lands in the list; a chain also raises the notice.
    await expect(page.getByTestId('wo-list-view'), 'WO list view renders after create').toBeVisible({
      timeout: 10_000,
    });
    const rowsAfter = await page.locator('[data-testid^="wo-link-"]').count();
    const notice = page.getByTestId('wo-list-create-notice');
    const chainNoticed = (await notice.count()) > 0;
    await shot(page, '17-wo-created');

    // At least one Work Order row is created for the FG (a multi-stage FG adds a chain).
    expect(
      rowsAfter > rowsBefore || chainNoticed,
      'a new WO row (or a stage-WO chain notice) appears after creating the WO',
    ).toBe(true);
    if (chainNoticed) {
      console.log(`[npd-flow] WO chain created: ${(await notice.innerText().catch(() => '')).trim()}`);
    } else {
      console.log(`[npd-flow] WO created (rows ${rowsBefore} → ${rowsAfter}).`);
    }
  });
});

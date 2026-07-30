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
import pg from 'pg';

import { signIn } from './_shared/parity-login';

// ── env / paths ────────────────────────────────────────────────────────────────

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const artifactDir = path.resolve(__dirname, 'artifacts/npd-create-to-wo-flow');
const L = 'en'; // locale segment

// Proof is a PERSISTED ROW, never a rendered screen: every step below re-reads the
// state it claims to have created straight from Postgres (pattern copied from
// faza1-ui-recheck-b.spec.ts:15-33). Only reachable through scripts/e2e-local.sh,
// which exports the local DATABASE_URL and asserts it is 127.0.0.1.
const { Client } = pg;
const ownerConnectionString = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL ?? '';

async function sql<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new Client({ connectionString: ownerConnectionString });
  await client.connect();
  try {
    const { rows } = await client.query<T>(text, params);
    return rows;
  } finally {
    await client.end();
  }
}

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

// ── the chain ──────────────────────────────────────────────────────────────────

// describe.serial: fullyParallel is on in playwright.config.ts, so the shared state
// below (projectId, productCode…) only survives if the steps run sequentially in one
// worker and stop on the first failure.
test.describe.serial('NPD create → FG mint → recipe → packaging → production → WO', () => {
  // The local harness is a DEV server: the first hit on a route pays a Turbopack
  // compile, which alone can eat the 30 s default and make a working picker look like
  // a dead end. Sibling DB-proof specs run at 180 s (faza1-ui-recheck-b.spec.ts:35).
  test.describe.configure({ timeout: 180_000 });

  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live authenticated + seeded server required (Gate-5 only).',
  );

  const flow = {
    projectId: '',
    projectCode: '',
    projectName: '', // unique per run; the minted FG item carries the SAME name
    productCode: '', // the minted FG code, read back from npd_projects at step 2
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

    // Step 1 — Basics. Continue is gated on THREE required inputs, not just the name:
    // create-project-wizard.tsx:476 — basicsIncomplete = nameEmpty || weeklyVolumeParsed === null
    // || runsPerWeekParsed === null || basicsFieldErrors. Weekly volume + runs per week arrived
    // with migration 427, after this spec was first written.
    await expect(page.getByTestId('wizard-step-basics'), 'wizard step 1 (Basics)').toBeVisible({
      timeout: 10_000,
    });
    flow.projectName = `E2E FG ${Date.now()}`;
    await page.locator('#wiz-name').fill(flow.projectName);
    // Optional target date — best-effort (field may not exist in every build).
    await page.locator('#wiz-target').fill('2026-12-01').catch(() => undefined);
    await page.getByTestId('wiz-weekly-volume').fill('1200');
    await page.getByTestId('wiz-runs-per-week').fill('3');
    const continueBtn = page.getByTestId('wizard-continue');
    await expect(continueBtn, 'Continue un-gates once name + weekly volume + runs/week are filled').toBeEnabled({
      timeout: 8_000,
    });
    await continueBtn.click();

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

    // PROOF (persisted row, not a rendered page): the project exists in Postgres with
    // the two basics the wizard now demands.
    const projectRows = await sql<{
      code: string;
      name: string;
      weekly_volume_packs: string | null;
      runs_per_week: string | null;
    }>(
      `select code, name, weekly_volume_packs::text, runs_per_week::text
         from public.npd_projects where id = $1::uuid`,
      [flow.projectId],
    );
    expect(projectRows, 'npd_projects row persisted for the created project').toHaveLength(1);
    expect(projectRows[0]?.name, 'the persisted project carries the typed name').toBe(flow.projectName);
    expect(Number(projectRows[0]?.weekly_volume_packs), 'weekly volume persisted').toBe(1200);
    expect(Number(projectRows[0]?.runs_per_week), 'runs per week persisted').toBe(3);
    console.log(
      `[npd-flow] created project ${flow.projectId} (code ${projectRows[0]?.code ?? '?'}) — row verified in npd_projects`,
    );
  });

  // ── Step 2: the FG candidate is minted BY THE WIZARD — no separate mint step ───
  // Rewritten 2026-07-30. The original step drove a "Create FG" modal on /brief and
  // read the FG code out of a `/fg/<code>` href. BOTH premises are gone from the
  // product:
  //   · create-project.ts:328-364 (bootstrapDraftRecipeProduct) already mints the FG
  //     inside the create transaction, so a fresh project is never FG-less and
  //     `project-header-create-fg` never renders — the modal is unreachable by design.
  //   · C7b folded the /fg detail into the pipeline: project-header.tsx:352-359 links
  //     "Open FG" at /<locale>/pipeline/<projectId>, and fg/[productCode]/page.tsx is
  //     now a pure redirect back into /pipeline. Nothing carries a /fg/<code> href.
  // The B2 invariant it guarded (the user is NOT yanked out of the pipeline to /fg)
  // still holds and is still asserted — it is now structural rather than behavioural.
  test('2 · the FG candidate is minted with the project and the user stays in the pipeline [B2]', async ({
    page,
  }) => {
    expect(flow.projectId, 'project created in step 1').toBeTruthy();
    await signIn(page);

    // PROOF FIRST: the mint is a persisted fact, read it from Postgres.
    const minted = await sql<{ product_code: string | null }>(
      `select product_code from public.npd_projects where id = $1::uuid`,
      [flow.projectId],
    );
    flow.productCode = minted[0]?.product_code ?? '';
    expect(
      flow.productCode,
      'creating the project mints its FG product code (npd_projects.product_code) [critical mutation]',
    ).toBeTruthy();

    // …and the FG really exists as an item, not just as a string on the project.
    const fgItem = await sql<{ item_code: string; item_type: string; name: string }>(
      `select item_code, item_type, name from public.items
        where item_code = $1 and org_id = (select org_id from public.npd_projects where id = $2::uuid)`,
      [flow.productCode, flow.projectId],
    );
    expect(fgItem, 'the minted FG exists in public.items [critical mutation]').toHaveLength(1);
    expect(fgItem[0]?.item_type, 'the minted item is a finished good').toBe('fg');
    expect(fgItem[0]?.name, 'the FG carries the project name').toBe(flow.projectName);
    flow.mintPerformed = true;

    await page.goto(url(`/${L}/pipeline/${flow.projectId}/brief`), {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByTestId('project-header'), 'project header on the stage page').toBeVisible({
      timeout: 10_000,
    });

    // The header exposes the linked FG (never the create affordance on a fresh project).
    const linked = page.getByTestId('project-header-open-fg');
    await expect(linked, 'the header surfaces the linked FG [critical mutation]').toBeVisible({
      timeout: 8_000,
    });
    await expect(
      page.getByTestId('project-header-create-fg'),
      'a project that already owns an FG must not offer to create a second one',
    ).toHaveCount(0);

    // HARD (B2, restated for C7b): the FG affordance keeps the user inside the
    // pipeline. It must NOT hand out a /fg/<code> href that yanks them out of the flow.
    const href = (await linked.getAttribute('href')) ?? '';
    expect(href, 'the FG link stays inside /pipeline [B2]').toMatch(
      new RegExp(`/pipeline/${flow.projectId}`),
    );
    expect(href, 'the FG link must not point at the retired /fg detail route [B2]').not.toMatch(/\/fg\//);

    await linked.click();
    await expect(page, 'following the FG link keeps the user on the pipeline project [B2]').toHaveURL(
      /\/pipeline\/[a-f0-9-]{36}/,
      { timeout: 10_000 },
    );
    await shot(page, '05-fg-minted-stayed-in-pipeline');
    console.log(`[npd-flow] FG ${flow.productCode} minted with the project; header keeps the user in /pipeline (B2 held).`);
  });

  // ── Step 3: add a recipe ingredient — REGRESSION B1-gate (gate reads DONE) ─────
  test('3 · adding a recipe ingredient satisfies the "at least one ingredient" gate [B1-gate]', async ({
    page,
  }) => {
    expect(flow.projectId, 'project created in step 1').toBeTruthy();
    await signIn(page);
    // ⚠ WORKAROUND for a PRODUCT BLOCKER, not a preference. The shared ItemPicker
    // portals its option list to a `position: fixed` panel anchored at
    // `top: trigger.bottom + 4` and clamps only the HORIZONTAL axis
    // (item-picker.tsx:128-136 — `left` is clamped to the viewport, `top` never is).
    // On the default 1280x720 viewport the ingredient row sits low enough that the
    // options render BELOW the fold; because the panel is `fixed` and re-anchors to
    // the trigger on scroll, the user can never bring them into view and the click
    // times out. Measured: at 720 px the option click times out and
    // formulation_ingredients stays EMPTY; at 1600 px the same click lands in ~50 ms
    // and the row persists. Drop this resize once the picker flips above the trigger.
    await page.setViewportSize({ width: 1280, height: 1600 });
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
    // A real, currently-active recipe input from THIS org — so "the picker found
    // nothing" can never be blamed on an empty catalogue.
    const catalogue = await sql<{ item_code: string }>(
      `select i.item_code from public.items i
        where i.org_id = (select org_id from public.npd_projects where id = $1::uuid)
          and i.item_type = any(array['rm','ingredient','intermediate','co_product','byproduct'])
          and i.status = 'active'
        order by i.item_code limit 1`,
      [flow.projectId],
    );
    const seededItemCode = catalogue[0]?.item_code ?? '';
    expect(seededItemCode, 'the org has at least one active recipe input to pick [data precondition]').toBeTruthy();

    const picker = newRow.getByTestId('item-picker-trigger').first();
    if (await picker.count()) {
      await picker.click().catch(() => undefined);
      // Type the code — this is what a user does, and it also forces the picker's
      // debounced search to run (item-picker.tsx:162-169).
      const pickerSearch = page.getByTestId('item-picker-panel').getByRole('combobox');
      await pickerSearch.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
      const blankOnOpen = (await page.getByTestId('item-picker-option').count()) === 0;
      await pickerSearch.fill(seededItemCode).catch(() => undefined);
      if (blankOnOpen) {
        console.log(
          `[npd-flow] NOTE: the recipe ItemPicker was blank on first open; it only listed items after typing "${seededItemCode}".`,
        );
      }
      // Wait for the option itself. `item-picker-empty` is NOT a settled state — the
      // list renders "No matching items" from the very first paint (options starts as
      // [] and `loading` is false until the debounce fires), so racing the two markers
      // always resolves on the empty one and reads a false negative.
      const firstOption = page.getByTestId('item-picker-option').first();
      await firstOption.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);
      if (await firstOption.count()) {
        await firstOption.click({ timeout: 15_000 });
      } else {
        // Never degrade silently: say WHICH branch the picker landed on. `empty` means
        // searchItems returned []; a role=alert means the Server Action threw.
        const emptyText = (await page.getByTestId('item-picker-empty').innerText().catch(() => '')).trim();
        const panelText = (await page.getByTestId('item-picker-panel').innerText().catch(() => '')).trim();
        console.log(
          `[npd-flow] recipe ItemPicker returned no options — empty="${emptyText}" panel="${panelText.replace(/\s+/g, ' ').slice(0, 300)}"`,
        );
        await shot(page, '06-no-items');
        throw new Error(
          `the recipe ItemPicker offers no items, so no ingredient can be added — the recipe stage is a dead end [flow blocker]: ${emptyText || panelText}`,
        );
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
    // PROOF: the ingredient is a row in formulation_ingredients on THIS project's
    // current version — the editor showing a row proves nothing about persistence.
    const ingredientRows = await sql<{ n: string }>(
      `select count(*)::text n
         from public.formulation_ingredients fi
         join public.formulation_versions fv on fv.id = fi.version_id
         join public.formulations f on f.id = fv.formulation_id
        where f.project_id = $1::uuid`,
      [flow.projectId],
    );
    expect(
      Number(ingredientRows[0]?.n ?? 0),
      'the added ingredient persisted into formulation_ingredients [critical mutation]',
    ).toBeGreaterThan(0);
    flow.ingredientSaved = true;
    console.log(`[npd-flow] ${ingredientRows[0]?.n} formulation_ingredients row(s) persisted for the project.`);
    await shot(page, '07-ingredient-added');

    // HARD (B1-gate): open the advance-gate modal and assert the derived
    // "Recipe has at least one ingredient" item now reads DONE.
    await page.goto(url(`/${L}/pipeline/${flow.projectId}/formulation?modal=advanceGate`), {
      waitUntil: 'domcontentloaded',
    });
    const gateItem = page.locator(
      '[data-testid="advance-gate-item"][data-item-id="recipe-has-ingredient"]',
    );
    // The modal host hydrates from ?modal= AFTER load, so wait for the item instead of
    // reading a count() against a not-yet-mounted island. Explicitly bounded: every
    // probe here is a secondary assertion and must never eat the whole test budget.
    await gateItem.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
    if (!(await gateItem.count())) {
      // Fall back to the header trigger when the deep-link param differs.
      const advance = page.getByTestId('project-header-advance');
      if (await advance.count()) {
        await advance.click({ timeout: 10_000 }).catch(() => undefined);
        await gateItem.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
      }
    }
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
    const componentName = `E2E Tray ${Date.now()}`;
    await page.getByTestId('field-component-name').fill(componentName);

    // Pick a supplier from the picker (click the trigger, choose an option from the
    // listbox). This is the exact seam the B1 regression broke on.
    //
    // Selected by ROLE, not by test id: packaging-component-modal.tsx:303 does pass
    // data-testid="field-supplier", but @monopilot/ui/Select DROPS it — SelectProps
    // (packages/ui/src/Select.tsx:21-37) declares no 'data-testid', and JSX excess-
    // property checks skip hyphenated attributes, so it compiles and vanishes. Only
    // the compound SelectTrigger accepts it (Select.tsx:289). The accessible name is
    // wired (aria-label={labels.fieldSupplier}), so the combobox role is reachable.
    const supplier = form.getByRole('combobox', { name: /supplier/i });
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

    // PROOF: the component is a row in packaging_components for THIS project, and the
    // supplier link — the seam B1 broke on — actually landed.
    const componentRows = await sql<{ component_name: string; supplier_id: string | null }>(
      `select component_name, supplier_id::text
         from public.packaging_components
        where project_id = $1::uuid and component_name = $2`,
      [flow.projectId, componentName],
    );
    expect(componentRows, 'the packaging component persisted [B1, critical mutation]').toHaveLength(1);
    if (pickedSupplier) {
      expect(
        componentRows[0]?.supplier_id,
        'a supplier picked in the form is persisted on the component [B1]',
      ).toBeTruthy();
    }
    await shot(page, '11-packaging-saved');
    console.log(
      `[npd-flow] packaging component "${componentName}" persisted${pickedSupplier ? ` with supplier_id=${componentRows[0]?.supplier_id}` : ''} (B1 held).`,
    );
  });

  // ── Step 5: production detail — add process + line + consumed, Save Production ──
  test('5 · Production detail persists a process with a line and consumed ingredients', async ({
    page,
  }) => {
    expect(flow.productCode, 'FG code captured in step 2 — prior critical mutation must pass').toBeTruthy();
    await signIn(page);
    // Route corrected 2026-07-30: C7b folded the FG detail into the pipeline, so
    // /fg/<code>?tab=production is now only a redirect stub back to the project index
    // (fg/[productCode]/page.tsx) and never renders a production tab. The very same
    // <FaProductionTab> is mounted on the formulation stage by FormulationWipPanel
    // (pipeline/[projectId]/formulation/_components/formulation-wip-panel.tsx:46-60).
    await page.goto(url(`/${L}/pipeline/${flow.projectId}/formulation`), {
      waitUntil: 'domcontentloaded',
    });

    // The panel honestly reports an FG-less project instead of rendering the tab.
    if (await page.getByTestId('formulation-wip-no-fg').count()) {
      throw new Error(
        'the WIP/production panel reports no linked FG although step 2 verified npd_projects.product_code [flow blocker]',
      );
    }

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
    // PROOF: the process is a row in npd_wip_processes for this project — a green
    // success toast is a rendered claim, not persistence.
    // npd_wip_processes hangs off prod_detail, which is keyed by the FG product code.
    const wipProcesses = await sql<{ n: string }>(
      `select count(*)::text n
         from public.npd_wip_processes p
         join public.prod_detail d on d.id = p.prod_detail_id
        where d.product_code = $1`,
      [flow.productCode],
    );
    expect(
      Number(wipProcesses[0]?.n ?? 0),
      'Save Production persisted a process row in npd_wip_processes [critical mutation]',
    ).toBeGreaterThan(0);
    await shot(page, '14-production-saved');
    console.log(`[npd-flow] production detail persisted — ${wipProcesses[0]?.n} npd_wip_processes row(s).`);
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
    // The picker's search box is the portaled combobox input (item-picker.tsx:288-299);
    // there is no item-picker-search testid. Narrow to OUR FG so the WO below is
    // provably for the product this flow minted, not for whatever sorts first.
    // Scope to the portaled picker panel: the create-WO modal also renders a
    // "Production line" <Select>, whose trigger is a role=combobox BUTTON and would
    // otherwise win .first() and fail the fill with "Element is not an <input>".
    const search = page.getByTestId('item-picker-panel').getByRole('combobox');
    await expect(search, 'create-WO picker search input').toBeVisible({ timeout: 8_000 });
    await search.fill(flow.productCode);
    const option = page.getByTestId('item-picker-option').first();
    await expect(option, 'the minted FG is findable in the create-WO picker [critical mutation]').toBeVisible({
      timeout: 15_000,
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

    // PROOF: the Work Order is a row in work_orders bound to the FG this flow minted,
    // with the quantity that was typed. The list re-rendering is not evidence.
    const woRows = await sql<{ wo_number: string; status: string; planned_quantity: string }>(
      `select w.wo_number, w.status, w.planned_quantity::text
         from public.work_orders w
         join public.items i on i.id = w.product_id
        where i.item_code = $1
        order by w.created_at desc`,
      [flow.productCode],
    );
    expect(
      woRows.length,
      'a work_orders row exists for the minted FG [critical mutation]',
    ).toBeGreaterThan(0);
    expect(Number(woRows[0]?.planned_quantity), 'the typed quantity persisted on the WO').toBe(100);
    console.log(
      `[npd-flow] WO ${woRows[0]?.wo_number} persisted for ${flow.productCode} (status ${woRows[0]?.status}, qty ${woRows[0]?.planned_quantity})` +
        (chainNoticed ? ` · chain: ${(await notice.innerText().catch(() => '')).trim()}` : ''),
    );
  });
});

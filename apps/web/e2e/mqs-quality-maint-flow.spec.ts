/**
 * QUALITY + MAINTENANCE walk-through — inspection PASS/FAIL, hold + release, NCR,
 * asset, MWO, LOTO, calibration — driven through the browser.
 *
 * Proof is a PERSISTED ROW, never a rendered screen. No graceful degradation: a step
 * whose DB proof is missing is recorded FAIL and the test ends red, but the remaining
 * steps still run so one pass maps the whole module.
 *
 * Run: bash scripts/e2e-local.sh apps/web/e2e/mqs-quality-maint-flow.spec.ts
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';
import pg from 'pg';

import { signIn } from './_shared/parity-login';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const artifactDir = path.resolve(__dirname, 'artifacts/mqs-quality-maint');
const L = 'en';

const { Client } = pg;
const conn = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL ?? '';

async function sql<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    const { rows } = await client.query<T>(text, params);
    return rows;
  } finally {
    await client.end();
  }
}

async function count(table: string, where = 'true', params: unknown[] = []): Promise<number> {
  const rows = await sql<{ n: string }>(`select count(*)::text as n from ${table} where ${where}`, params);
  return Number(rows[0]?.n ?? '0');
}

async function shot(page: Page, name: string): Promise<void> {
  if (!existsSync(artifactDir)) mkdirSync(artifactDir, { recursive: true });
  await page.screenshot({ path: path.join(artifactDir, `${name}.png`), fullPage: true }).catch(() => {});
}

/**
 * Options are scoped to the open `[role=listbox]` (portaled to <body>): a bare
 * getByRole('option') also matches the hidden native <option>s of the topbar site
 * switcher and of every Select that has not hydrated yet.
 */
async function combo(page: Page, trigger: Locator, option: RegExp): Promise<void> {
  await trigger.click();
  const list = page.locator('[role="listbox"]');
  await list.getByRole('option', { name: option }).first().click({ timeout: 8_000 });
}

/** Pick the first non-placeholder option (index 0 is usually "Select a …"). */
async function pickOption(page: Page, trigger: Locator, index = 1): Promise<string> {
  await trigger.click({ timeout: 10_000 });
  const options = page.locator('[role="listbox"]').getByRole('option');
  await options.first().waitFor({ state: 'visible', timeout: 8_000 });
  const n = await options.count();
  const target = options.nth(Math.min(index, n - 1));
  const label = (await target.innerText()).trim();
  await target.click({ timeout: 8_000 });
  return label;
}

/** Re-click `trigger` until `target` shows up — beats the `next dev` hydration race. */
async function clickUntil(page: Page, trigger: Locator, target: Locator, tries = 6): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    await trigger.click({ timeout: 10_000 }).catch(() => {});
    // waitFor, not isVisible: isVisible() answers immediately, and a portaled panel
    // needs one more effect pass (see the item picker's panelRect) — the immediate
    // "false" then made the NEXT retry toggle the panel shut again.
    const shown = await target
      .waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (shown) return;
    await page.waitForTimeout(800);
  }
  throw new Error(`"${await trigger.innerText().catch(() => '?')}" never opened its panel after ${tries} clicks`);
}

async function open(page: Page, route: string): Promise<void> {
  await page.goto(`${baseURL}/${L}${route}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(600);
}

/** Everything a user could click on the current screen — used to report dead ends precisely. */
async function affordances(page: Page): Promise<string> {
  const b = await page.locator('main button, [role="dialog"] button').evaluateAll((els) =>
    els
      .filter((e) => (e as HTMLElement).offsetParent !== null)
      .map(
        (e) =>
          `${(e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)}${(e as HTMLButtonElement).disabled ? '[DISABLED]' : ''}`,
      )
      .filter(Boolean)
      .slice(0, 30),
  );
  return JSON.stringify(b);
}

class Ledger {
  readonly rows: { step: string; ok: boolean; evidence: string }[] = [];
  record(step: string, ok: boolean, evidence: string): void {
    this.rows.push({ step, ok, evidence });
    // eslint-disable-next-line no-console
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${step} :: ${evidence}`);
  }
  async run(step: string, fn: () => Promise<string>): Promise<void> {
    try {
      this.record(step, true, await fn());
    } catch (error) {
      this.record(step, false, (error as Error).message.replace(/\s+/g, ' ').slice(0, 500));
    }
  }
  assertGreen(): void {
    const failed = this.rows.filter((r) => !r.ok).map((r) => `${r.step}: ${r.evidence}`);
    expect(failed, `FAILED STEPS\n${failed.join('\n')}`).toEqual([]);
  }
}

const LP_ID = 'f8885537-c12f-43d1-84da-2c40f001afce';

test.describe('quality + maintenance walk-through', () => {
  test.skip(!baseURL, 'needs PLAYWRIGHT_BASE_URL (scripts/e2e-local.sh)');
  test.describe.configure({ mode: 'default' });
  // playwright.config.ts sets no actionTimeout, so an unbounded click on a control
  // that never appears would burn the whole test timeout.
  test.use({ actionTimeout: 12_000 });
  test.setTimeout(4 * 60_000);

  test('Q1 create an inspection and record PASS', async ({ page }) => {
    const ledger = new Ledger();
    await signIn(page, baseURL, L);
    const before = await count('quality_inspections');
    const lpQaBefore = await sql<{ qa_status: string; status: string }>(
      'select qa_status, status from license_plates where id = $1',
      [LP_ID],
    );

    await ledger.run('Q1z LUKA DANYCH: create a quality specification so an inspection has parameters', async () => {
      await open(page, '/quality/specifications');
      await clickUntil(
        page,
        page.getByRole('button', { name: /create specification/i }).first(),
        page.getByTestId('spec-create-code'),
      );
      await page.getByTestId('spec-create-code').fill(`E2E-SPEC-${Date.now().toString().slice(-6)}`);
      await clickUntil(page, page.getByTestId('item-picker-trigger').first(), page.getByTestId('item-picker-panel'), 3);
      await page.getByTestId('item-picker-panel').getByRole('combobox').fill('Sugar');
      await page.waitForTimeout(1500);
      const hit = page.getByTestId('item-picker-option').first();
      if (!(await hit.count()))
        throw new Error(
          `product picker showed no result for "Sugar": "${(await page.getByTestId('item-picker-options').innerText()).replace(/\s+/g, ' ').slice(0, 200)}"`,
        );
      await hit.click();
      await page.getByRole('button', { name: /^incoming$/i }).first().click().catch(() => {});
      const add = page.getByRole('button', { name: /add parameter/i }).first();
      if (await add.count()) await add.click().catch(() => {});
      await page.getByTestId('spec-param-name').first().fill('Moisture');
      await page.getByTestId('spec-param-target').first().fill('10');
      await page.getByTestId('spec-param-min').first().fill('8');
      await page.getByTestId('spec-param-max').first().fill('12');
      await page.getByTestId('spec-param-unit').first().fill('%');
      await shot(page, 'q1-spec-modal');
      const submit = page.getByRole('button', { name: /create specification/i }).last();
      if (await submit.isDisabled())
        throw new Error(`"Create specification" disabled after code + product + stage + parameter. affordances=${await affordances(page)}`);
      await submit.click();
      await page.waitForTimeout(3000);
      await shot(page, 'q1-after-spec');
      const specs = await count('quality_specifications');
      const params = await count('quality_spec_parameters');
      if (specs === 0) throw new Error(`NO SPECIFICATION ROW — quality_specifications=${specs}, parameters=${params}`);
      // A freshly created spec lands in `draft`; approve it so inspections can resolve
      // a template (that is what leaves Pass/Fail/Hold locked otherwise).
      const spec = await sql<{ id: string; spec_code: string; status: string; applies_to: string }>(
        'select id::text, spec_code, status, applies_to from quality_specifications order by created_at desc limit 1',
      );
      await open(page, `/quality/specifications/${spec[0].id}`);
      // draft → submit for review → under_review → approve → active
      const submitReview = page.getByTestId('spec-submit-review');
      if (await submitReview.count()) {
        await submitReview.click();
        await page.waitForTimeout(3000);
      }
      const approveOpen = page.getByTestId('spec-approve-open');
      let approved = `(no approve affordance; submit-for-review present=${await submitReview.count()})`;
      if (await approveOpen.count()) {
        await clickUntil(page, approveOpen, page.getByTestId('spec-sign-form'), 3);
        await page.getByTestId('spec-sign-password').fill('e2e-local');
        await page.getByTestId('spec-sign-submit').click();
        await page.waitForTimeout(3000);
        const err = page.getByTestId('spec-sign-error');
        approved = (await err.count()) ? `sign error: ${(await err.innerText()).replace(/\s+/g, ' ')}` : 'signed';
      }
      await shot(page, 'q1-after-approve-spec');
      const after = await sql<{ status: string }>('select status from quality_specifications where id = $1', [spec[0].id]);
      const state = `spec ${spec[0].spec_code} applies_to=${spec[0].applies_to} status ${spec[0].status}→${after[0]?.status}; approve=${approved}; parameters=${params}`;
      if (after[0]?.status !== 'active')
        throw new Error(`specification never reaches "active", so no inspection can resolve it. ${state}`);
      return state;
    });

    await open(page, '/quality/inspections');

    await ledger.run('Q1a create a manual inspection against the LP', async () => {
      await clickUntil(
        page,
        page.getByRole('button', { name: /new inspection/i }).first(),
        page.getByTestId('inspection-create-lp-search'),
      );
      const search = page.getByTestId('inspection-create-lp-search');
      await search.fill('LP-');
      await page.waitForTimeout(1200);
      await shot(page, 'q1-create-modal');
      const opt = page.getByRole('option', { name: /LP-/i }).first();
      const btn = page.getByRole('button', { name: /LP-/i }).first();
      if (await opt.count()) await opt.click();
      else if (await btn.count()) await btn.click();
      else throw new Error(`LP search "LP-" surfaced no result. affordances=${await affordances(page)}`);
      await page.waitForTimeout(500);
      const submit = page.getByRole('button', { name: /create inspection/i });
      if (await submit.isDisabled())
        throw new Error(`"Create inspection" still disabled after picking an LP. affordances=${await affordances(page)}`);
      await submit.click();
      await page.waitForTimeout(2500);
      await shot(page, 'q1-after-create');
      return `url=${page.url()}`;
    });

    await ledger.run('Q1b DB: quality_inspections grew', async () => {
      const after = await count('quality_inspections');
      if (after <= before) throw new Error(`NO INSPECTION ROW — quality_inspections ${before}→${after}`);
      return `quality_inspections ${before}→${after}`;
    });

    await ledger.run('Q1c open the inspection and record a PASS result', async () => {
      const insp = await sql<{ id: string; status: string }>(
        'select id::text, status from quality_inspections order by created_at desc limit 1',
      );
      if (!insp[0]) throw new Error('no inspection to open');
      await open(page, `/quality/inspections/${insp[0].id}`);
      await shot(page, 'q1-inspection-detail');
      const acts = await affordances(page);
      const start = page.getByRole('button', { name: /start|begin/i }).first();
      if (await start.count()) {
        await start.click();
        await page.waitForTimeout(1500);
      }
      // Fill every measurement first: Pass/Fail/Hold are disabled while
      // parameterResolution === 'missing_template' or there are zero parameters
      // (inspection-detail.client.tsx:217,547).
      const values = page.locator('main input[type="number"], main input[type="text"]');
      for (let i = 0; i < (await values.count()); i += 1) await values.nth(i).fill('10').catch(() => {});
      const saveResults = page.getByRole('button', { name: /save results/i }).first();
      if ((await saveResults.count()) && !(await saveResults.isDisabled())) {
        await saveResults.click();
        await page.waitForTimeout(2000);
      }
      const pass = page.getByRole('button', { name: /pass/i }).first();
      if (!(await pass.count())) throw new Error(`no PASS affordance on the inspection detail. affordances=${acts}`);
      if (await pass.isDisabled())
        throw new Error(
          `PASS is LOCKED on a freshly created inspection (missing template / zero parameters). affordances=${await affordances(page)}`,
        );
      await pass.click();
      await page.waitForTimeout(1000);
      const dialog = page.locator('[role="dialog"]:not([data-nextjs-dialog])').last();
      if (await dialog.isVisible().catch(() => false)) {
        const pw = dialog.locator('input[type="password"]').first();
        if (await pw.count()) await pw.fill('e2e-local');
        await dialog.getByRole('button', { name: /confirm|save|submit|pass/i }).last().click();
      }
      await page.waitForTimeout(2500);
      await shot(page, 'q1-after-pass');
      const row = await sql<{ status: string; result: string | null }>(
        'select status, null::text as result from quality_inspections where id = $1',
        [insp[0].id],
      );
      const lpAfter = await sql<{ qa_status: string; status: string }>(
        'select qa_status, status from license_plates where id = $1',
        [LP_ID],
      );
      const delta = `inspection status=${row[0]?.status}; LP qa ${lpQaBefore[0]?.qa_status}/${lpQaBefore[0]?.status} → ${lpAfter[0]?.qa_status}/${lpAfter[0]?.status}; affordances=${acts}`;
      if (row[0]?.status === insp[0].status)
        throw new Error(`PASS clicked but inspection status UNCHANGED (${row[0]?.status}) — ${delta}`);
      return delta;
    });

    await ledger.run('Q1d after a QA PASS the LP is visible as available inventory', async () => {
      const lp = await sql<{ qa_status: string; status: string }>(
        'select qa_status, status from license_plates where id = $1',
        [LP_ID],
      );
      const avail = await sql<{ n: string }>(
        "select count(*)::text as n from v_inventory_available where lp_id = $1",
        [LP_ID],
      ).catch(async () => {
        const cols = await sql<{ column_name: string }>(
          "select column_name from information_schema.columns where table_name='v_inventory_available'",
        );
        throw new Error(`v_inventory_available has no lp_id; columns=${cols.map((c) => c.column_name).join(',')}`);
      });
      const delta = `LP qa_status=${lp[0]?.qa_status} status=${lp[0]?.status}; rows in v_inventory_available=${avail[0]?.n}`;
      if (Number(avail[0]?.n ?? '0') === 0)
        throw new Error(`QA-approved stock is INVISIBLE in v_inventory_available — ${delta}`);
      return delta;
    });

    ledger.assertGreen();
  });

  test('Q2 create a hold on the LP and release it', async ({ page }) => {
    const ledger = new Ledger();
    await signIn(page, baseURL, L);
    const before = { holds: await count('quality_holds'), items: await count('quality_hold_items') };
    const lpBefore = await sql<{ status: string }>('select status from license_plates where id = $1', [LP_ID]);

    await open(page, `/quality/holds`);

    await ledger.run('Q2a create the hold', async () => {
      await clickUntil(page, page.getByRole('button', { name: /create hold/i }).first(), page.getByTestId('hold-create-reason'));
      await page.getByRole('button', { name: /^LP$/ }).first().click().catch(() => {});
      const search = page.getByTestId('hold-create-lp-search');
      await search.fill('LP-');
      await page.waitForTimeout(1200);
      await shot(page, 'q2-hold-modal');
      const opt = page.getByRole('option', { name: /LP-/i }).first();
      const btn = page.locator('[role="dialog"]').getByRole('button', { name: /LP-/i }).first();
      if (await opt.count()) await opt.click();
      else if (await btn.count()) await btn.click();
      else {
        const ids = page.getByTestId('hold-create-lpids');
        if (!(await ids.count()))
          throw new Error(`LP search surfaced nothing and there is no id textarea. affordances=${await affordances(page)}`);
        await ids.fill(LP_ID);
      }
      await page.getByTestId('hold-create-reason').fill('E2E walk-through hold');
      await page.getByRole('button', { name: /^High$/ }).first().click().catch(() => {});
      const submit = page.getByRole('button', { name: /create hold/i }).last();
      if (await submit.isDisabled())
        throw new Error(`"Create hold" still disabled after LP + reason. affordances=${await affordances(page)}`);
      await submit.click();
      await page.waitForTimeout(2500);
      await shot(page, 'q2-after-create');
      return `url=${page.url()}`;
    });

    await ledger.run('Q2b DB: hold + hold item written AND the LP reaches the egress guard', async () => {
      const after = { holds: await count('quality_holds'), items: await count('quality_hold_items') };
      const lpAfter = await sql<{ status: string }>('select status from license_plates where id = $1', [LP_ID]);
      // license_plates.status deliberately does NOT change: holds are a separate
      // polymorphic layer and allocation/ship read v_active_holds
      // (shipping/_actions/so-actions.ts:1358-1367). That view is the contract.
      const guard = await sql<{ hold_number: string; hold_status: string }>(
        "select hold_number, hold_status from v_active_holds where reference_type = 'lp' and reference_id = $1",
        [LP_ID],
      );
      const delta = `quality_holds ${before.holds}→${after.holds}, quality_hold_items ${before.items}→${after.items}, LP status ${lpBefore[0]?.status}→${lpAfter[0]?.status}, v_active_holds=${JSON.stringify(guard)}`;
      if (after.holds <= before.holds) throw new Error(`NO HOLD ROW — ${delta}`);
      if (after.items <= before.items) throw new Error(`hold created but NO hold item — ${delta}`);
      if (guard.length === 0)
        throw new Error(`hold created but INVISIBLE to the allocation/ship guard (v_active_holds) — held stock stays shippable. ${delta}`);
      return delta;
    });

    await ledger.run('Q2c release the hold and check the LP comes back', async () => {
      const hold = await sql<{ id: string; hold_status: string }>(
        'select id::text, hold_status from quality_holds order by created_at desc limit 1',
      );
      if (!hold[0]) throw new Error('no hold to release');
      await open(page, `/quality/holds/${hold[0].id}`);
      await shot(page, 'q2-hold-detail');
      const acts = await affordances(page);
      const noRelease = page.getByTestId('hold-detail-no-release');
      if (await noRelease.count())
        throw new Error(`release is not granted to this persona: "${await noRelease.innerText()}" (segregation of duties)`);
      await clickUntil(page, page.getByTestId('hold-detail-release-open'), page.getByTestId('hold-release-submit'), 3);
      await shot(page, 'q2-release-modal');
      const disposition = page.getByTestId('hold-release-disposition').getByRole('combobox');
      const picked = (await disposition.count()) ? await pickOption(page, disposition.first(), 1) : '(no disposition select)';
      await page.getByTestId('hold-release-reason').fill('E2E walk-through release');
      await page.getByTestId('hold-release-password').fill('e2e-local');
      const submit = page.getByTestId('hold-release-submit');
      if (await submit.isDisabled())
        throw new Error(`release submit DISABLED with disposition="${picked}", reason and signature filled`);
      await submit.click();
      await page.waitForTimeout(3000);
      const relErr = page.getByTestId('hold-release-error');
      if (await relErr.count())
        throw new Error(`release rejected: ${(await relErr.innerText()).replace(/\s+/g, ' ')} (disposition="${picked}")`);
      await page.waitForTimeout(2500);
      await shot(page, 'q2-after-release');
      const holdAfter = await sql<{ hold_status: string; released_at: string | null }>(
        'select hold_status, released_at::text from quality_holds where id = $1',
        [hold[0].id],
      );
      const guard = await count('v_active_holds', "reference_type = 'lp' and reference_id = $1", [LP_ID]);
      const delta = `hold ${hold[0].hold_status}→${holdAfter[0]?.hold_status} (released_at=${holdAfter[0]?.released_at}), rows still in v_active_holds=${guard}; affordances=${acts}`;
      if (holdAfter[0]?.hold_status === hold[0].hold_status)
        throw new Error(`release clicked but the HOLD STATUS DID NOT CHANGE — ${delta}`);
      return delta;
    });

    ledger.assertGreen();
  });

  test('Q3 create an NCR', async ({ page }) => {
    const ledger = new Ledger();
    await signIn(page, baseURL, L);
    const before = await count('ncr_reports');

    await open(page, `/quality/ncrs`);

    await ledger.run('Q3a fill and submit the NCR form', async () => {
      await clickUntil(page, page.getByRole('button', { name: /create NCR/i }).first(), page.getByTestId('ncr-create-title'));
      await page.getByTestId('ncr-create-title').fill('E2E walk-through NCR');
      await page.getByTestId('ncr-create-description').fill('Recorded by the module walk-through.');
      await page.getByRole('button', { name: /^Major$/ }).first().click().catch(() => {});
      await page.getByTestId('ncr-create-affectedqty').fill('1').catch(() => {});
      await shot(page, 'q3-ncr-modal');
      const submit = page.getByRole('button', { name: /create NCR/i }).last();
      if (await submit.isDisabled())
        throw new Error(`"Create NCR" still disabled after title + description + severity. affordances=${await affordances(page)}`);
      await submit.click();
      await page.waitForTimeout(2500);
      await shot(page, 'q3-after-create');
      return `url=${page.url()}`;
    });

    await ledger.run('Q3b DB: ncr_reports grew', async () => {
      const after = await count('ncr_reports');
      if (after <= before) throw new Error(`NO NCR ROW — ncr_reports ${before}→${after}`);
      const row = await sql<{ ncr_number: string; status: string }>(
        'select ncr_number, status from ncr_reports order by created_at desc limit 1',
      );
      return `ncr_reports ${before}→${after}; newest=${JSON.stringify(row[0])}`;
    });

    ledger.assertGreen();
  });

  test('M1 create a maintenance asset, an MWO, and walk the LOTO checklist', async ({ page }) => {
    const ledger = new Ledger();
    await signIn(page, baseURL, L);
    const before = {
      equipment: await count('equipment'),
      mwos: await count('maintenance_work_orders'),
      loto: await count('mwo_loto_checklists'),
    };
    const code = `E2E-AST-${Date.now().toString().slice(-6)}`;

    await open(page, `/maintenance/assets`);

    await ledger.run('M1a add an asset that requires LOTO', async () => {
      await clickUntil(page, page.getByRole('button', { name: /add asset/i }).first(), page.getByTestId('asset-create-code'));
      await page.getByTestId('asset-create-code').fill(code);
      await page.getByTestId('asset-create-name').fill('E2E walk-through mixer');
      await page.getByTestId('asset-create-loto').check().catch(() => {});
      await shot(page, 'm1-asset-modal');
      await page.getByRole('button', { name: /save asset/i }).click();
      await page.waitForTimeout(2500);
      await shot(page, 'm1-after-asset');
      return `url=${page.url()}`;
    });

    await ledger.run('M1b DB: equipment row exists with requires_loto', async () => {
      const after = await count('equipment');
      const row = await sql<{ equipment_code: string; requires_loto: boolean }>(
        'select equipment_code, requires_loto from equipment where equipment_code = $1',
        [code],
      );
      if (!row[0]) throw new Error(`NO EQUIPMENT ROW for ${code} — equipment ${before.equipment}→${after}`);
      return `equipment ${before.equipment}→${after}; ${JSON.stringify(row[0])}`;
    });

    await ledger.run('M1c create an MWO — is the new asset selectable?', async () => {
      await open(page, `/maintenance`);
      await clickUntil(page, page.getByRole('button', { name: /new MWO/i }).first(), page.getByTestId('mwo-create-title'));
      const options = await page
        .getByTestId('mwo-create-equipment')
        .locator('option')
        .evaluateAll((els) => els.map((e) => `${(e as HTMLOptionElement).value}::${e.textContent?.trim()}`));
      await shot(page, 'm1-mwo-modal');
      const hasAsset = options.some((o) => o.includes(code));
      await page.getByTestId('mwo-create-equipment').selectOption({ index: 1 });
      await page.getByTestId('mwo-create-title').fill('E2E walk-through MWO');
      await page.getByTestId('mwo-create-description').fill('Recorded by the module walk-through.');
      await page.getByTestId('mwo-create-priority').selectOption('high').catch(() => {});
      await page.getByTestId('mwo-create-submit').click();
      await page.waitForTimeout(2500);
      await shot(page, 'm1-after-mwo');
      const evidence = `equipment picker options=${JSON.stringify(options)}; contains new asset=${hasAsset}`;
      if (!hasAsset)
        throw new Error(`the asset just created in Maintenance is NOT selectable in the MWO equipment picker — ${evidence}`);
      return evidence;
    });

    await ledger.run('M1d DB: maintenance_work_orders grew', async () => {
      const after = await count('maintenance_work_orders');
      if (after <= before.mwos) throw new Error(`NO MWO ROW — maintenance_work_orders ${before.mwos}→${after}`);
      const row = await sql<Record<string, unknown>>(
        'select id::text, mwo_number, state, equipment_id::text from maintenance_work_orders order by created_at desc limit 1',
      );
      return `maintenance_work_orders ${before.mwos}→${after}; newest=${JSON.stringify(row[0])}`;
    });

    await ledger.run('M1e open the MWO and complete the LOTO checklist', async () => {
      const mwo = await sql<{ id: string; state: string }>(
        'select id::text, state from maintenance_work_orders order by created_at desc limit 1',
      );
      if (!mwo[0]) throw new Error('no MWO to open');
      await open(page, `/maintenance/mwos/${mwo[0].id}`);
      await shot(page, 'm1-mwo-detail');
      const acts = await affordances(page);
      const start = page.getByRole('button', { name: /^start$/i }).first();
      let afterStart = acts;
      if (await start.count()) {
        await start.click().catch(() => {});
        await page.waitForTimeout(1200);
        const confirm = page.locator('[role="dialog"]:not([data-nextjs-dialog])').last();
        if (await confirm.count()) {
          const modalText = (await confirm.innerText()).replace(/\s+/g, ' ').slice(0, 300);
          const modalStart = confirm.getByRole('button', { name: /^start$/i }).last();
          if ((await modalStart.count()) && (await modalStart.isDisabled()))
            throw new Error(`the Start confirmation modal's own Start button is DISABLED. modal="${modalText}"`);
          await modalStart.click({ timeout: 8_000 }).catch(() => {});
        }
        await page.waitForTimeout(2500);
        afterStart = await affordances(page);
      }
      const stateNow = await sql<{ state: string }>('select state from maintenance_work_orders where id = $1', [mwo[0].id]);
      const loto = page.getByRole('button', { name: /loto|lock ?out|isolat/i }).first();
      if (!(await loto.count()))
        throw new Error(
          `no LOTO affordance on an MWO for a requires_loto asset. state=${mwo[0].state}→${stateNow[0]?.state}; before Start=${acts}; after Start=${afterStart}`,
        );
      await loto.click();
      await page.waitForTimeout(1200);
      await shot(page, 'm1-loto');
      const boxes = page.locator('[role="dialog"] input[type="checkbox"], main input[type="checkbox"]');
      const n = await boxes.count();
      for (let i = 0; i < n; i += 1) await boxes.nth(i).check().catch(() => {});
      const pw = page.locator('input[type="password"]').first();
      if (await pw.count()) await pw.fill('e2e-local');
      await page
        .getByRole('button', { name: /confirm|apply|save|complete|sign/i })
        .last()
        .click()
        .catch(() => {});
      await page.waitForTimeout(2500);
      await shot(page, 'm1-after-loto');
      const after = await count('mwo_loto_checklists');
      const delta = `mwo_loto_checklists ${before.loto}→${after}; checkboxes=${n}; affordances=${acts}`;
      if (after <= before.loto) throw new Error(`LOTO walked but NO mwo_loto_checklists ROW — ${delta}`);
      return delta;
    });

    ledger.assertGreen();
  });

  test('M2 add a calibration instrument and record a calibration', async ({ page }) => {
    const ledger = new Ledger();
    await signIn(page, baseURL, L);
    const before = {
      instruments: await count('calibration_instruments'),
      records: await count('calibration_records'),
    };
    const code = `E2E-INS-${Date.now().toString().slice(-6)}`;

    await open(page, `/maintenance/calibration`);

    await ledger.run('M2a add the instrument', async () => {
      await clickUntil(page, page.getByRole('button', { name: /add instrument/i }).first(), page.getByTestId('calibration-instrument-code'));
      await page.getByTestId('calibration-instrument-code').fill(code);
      await page.getByTestId('calibration-instrument-interval').fill('180');
      await page.getByTestId('calibration-instrument-range-min').fill('0');
      await page.getByTestId('calibration-instrument-range-max').fill('50');
      await page.getByTestId('calibration-instrument-unit').fill('kg');
      await shot(page, 'm2-instrument-modal');
      await page.getByRole('button', { name: /save instrument/i }).click();
      await page.waitForTimeout(2500);
      await shot(page, 'm2-after-instrument');
      return `url=${page.url()}`;
    });

    await ledger.run('M2b DB: calibration_instruments grew', async () => {
      const after = await count('calibration_instruments');
      const row = await sql<Record<string, unknown>>(
        'select * from calibration_instruments order by created_at desc limit 1',
      ).catch(() => []);
      if (after <= before.instruments)
        throw new Error(`NO INSTRUMENT ROW — calibration_instruments ${before.instruments}→${after}`);
      return `calibration_instruments ${before.instruments}→${after}; newest keys=${Object.keys(row[0] ?? {}).join(',')}`;
    });

    await ledger.run('M2c record a calibration (two signatures)', async () => {
      await open(page, `/maintenance/calibration`);
      await clickUntil(page, page.getByRole('button', { name: /record calibration/i }).first(), page.getByTestId('calibration-record-measured'));
      const dialog = page.locator('[role="dialog"]:not([data-nextjs-dialog])').last();
      const cb = dialog.getByRole('combobox');
      const nCombo = await cb.count();
      for (let i = 0; i < nCombo; i += 1) await pickOption(page, cb.nth(i), 1).catch(() => {});
      await page.getByTestId('calibration-record-date').fill(new Date().toISOString().slice(0, 10)).catch(() => {});
      await page.getByTestId('calibration-record-measured').fill('10.0 / 10.01 / 9.99');
      await page.getByTestId('calibration-record-notes').fill('E2E walk-through');
      await page.getByTestId('calibration-record-certificate').fill(`CERT-${code}`);
      await page.getByTestId('calibration-record-calibrator-signature').fill('e2e-local');
      const rev = page.getByTestId('calibration-record-reviewer-search');
      if (await rev.count()) {
        await rev.fill('Persona');
        await page.waitForTimeout(1200);
        const opt = page.locator('[role="dialog"]:not([data-nextjs-dialog])').last().getByRole('option').first();
        if (await opt.count()) await opt.click({ timeout: 8_000 }).catch(() => {});
      }
      await page.getByTestId('calibration-record-reviewer-signature').fill('e2e-local').catch(() => {});
      await shot(page, 'm2-record-modal');
      const save = page.getByTestId('calibration-record-submit');
      if (await save.isDisabled()) {
        const dialogText = (await dialog.innerText()).replace(/\s+/g, ' ').slice(0, 400);
        throw new Error(`"Save record" still disabled after every field + both signatures. modal="${dialogText}"`);
      }
      await save.click({ timeout: 10_000 }).catch(async () => {
        throw new Error(
          `"Save record" is present and reported enabled but refuses the click. modal="${(await dialog.innerText()).replace(/\s+/g, ' ').slice(0, 400)}"`,
        );
      });
      await page.waitForTimeout(2500);
      await shot(page, 'm2-after-record');
      const after = await count('calibration_records');
      if (after <= before.records)
        throw new Error(`NO CALIBRATION RECORD — calibration_records ${before.records}→${after}`);
      return `calibration_records ${before.records}→${after}`;
    });

    ledger.assertGreen();
  });
});

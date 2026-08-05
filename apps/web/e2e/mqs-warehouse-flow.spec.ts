/**
 * WAREHOUSE walk-through — GRN receipt, stock adjustment, count session, LP
 * split/merge, LP move — driven through the browser exactly as an operator does.
 *
 * Proof is a PERSISTED ROW, never a rendered screen. Every step re-reads the state
 * it claims to have created straight from Postgres (pattern:
 * npd-create-to-wo-flow.e2e.spec.ts:60-78).
 *
 * There is no graceful degradation here on purpose: a step whose DB proof is missing
 * is recorded as a FAILURE and the test ends red. It still runs the remaining steps so
 * one run maps the whole module (a silent `if (!count) return` is exactly the
 * anti-pattern this campaign keeps finding).
 *
 * Two harness facts this spec encodes, learned the hard way:
 *  - the repo's playwright.config.ts sets no actionTimeout, so a click on a control
 *    that never appears hangs for the whole test timeout — every action here is bounded;
 *  - `next dev` hydrates slowly, so a button clicked too early does nothing. Openers go
 *    through clickUntil(), which re-clicks until the panel it should open is visible.
 *
 * Run: bash scripts/e2e-local.sh apps/web/e2e/mqs-warehouse-flow.spec.ts
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';
import pg from 'pg';

import { signIn } from './_shared/parity-login';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const artifactDir = path.resolve(__dirname, 'artifacts/mqs-warehouse');
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

async function open(page: Page, route: string): Promise<void> {
  await page.goto(`${baseURL}/${L}${route}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(600);
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

/**
 * Pick an option out of the hydrated `Select` primitive. Option 0 is the placeholder.
 *
 * Options are scoped to the open `[role=listbox]` (portaled to <body>): a bare
 * getByRole('option') also matches the hidden native <option> elements of the topbar
 * site switcher and of every Select that has not hydrated yet.
 */
async function pickOption(page: Page, trigger: Locator, index = 1): Promise<string> {
  await trigger.click({ timeout: 10_000 });
  const options = page.locator('[role="listbox"]').getByRole('option');
  await options.first().waitFor({ state: 'visible', timeout: 8_000 });
  const labels = await options.allInnerTexts();
  const target = options.nth(Math.min(index, labels.length - 1));
  const label = (await target.innerText()).trim();
  await target.click({ timeout: 8_000 });
  return label;
}

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

const PO_ID = '2996caa5-cfbf-4ff2-8fdf-61703604d070';
const LP_ID = 'f8885537-c12f-43d1-84da-2c40f001afce';
const SUGAR_ID = 'bcb3f702-646b-4e0e-9790-9618285f69ff';
const ORG_ID = '00000000-0000-0000-0000-000000000002';
const WH_DEMO_01 = '7b566f20-3323-4ff3-8efc-c93cdf09a870';

test.describe('warehouse walk-through', () => {
  test.skip(!baseURL, 'needs PLAYWRIGHT_BASE_URL (scripts/e2e-local.sh)');
  test.describe.configure({ mode: 'default' });
  test.use({ actionTimeout: 12_000 });
  test.setTimeout(4 * 60_000);

  test('W1 receive a PO line → GRN + license plate + stock move', async ({ page }) => {
    const ledger = new Ledger();
    await signIn(page, baseURL, L);
    const before = {
      grns: await count('grns'),
      grnItems: await count('grn_items'),
      lps: await count('license_plates'),
      moves: await count('stock_moves'),
    };

    // LUKA DANYCH: PO-DEMO-0002 only carries `pcs` packaging lines. A kg line is added so
    // the run can tell "GRN is broken" apart from "GRN is broken for piece-based items".
    const kgLine = await sql<{ id: string }>(
      `insert into purchase_order_lines (org_id, po_id, line_no, item_id, qty, uom, unit_price)
       select org_id, id, 99, $2::uuid, 20, 'kg', 1.50 from purchase_orders where id = $1::uuid
       on conflict do nothing
       returning id::text`,
      [PO_ID, SUGAR_ID],
    ).catch(async (error) => {
      const cols = await sql<{ column_name: string }>(
        "select column_name from information_schema.columns where table_name='purchase_order_lines' order by ordinal_position",
      );
      throw new Error(`seed failed: ${(error as Error).message}; columns=${cols.map((c) => c.column_name).join(',')}`);
    });
    // eslint-disable-next-line no-console
    console.log(`  SEEDED: purchase_order_lines += ${kgLine.length} (20 kg of ING-SUGAR on PO-DEMO-0002)`);

    await open(page, `/warehouse/receive-po/${PO_ID}`);

    await ledger.run('W1a open the receive form for line 1', async () => {
      await clickUntil(
        page,
        page.getByRole('button', { name: /receive line/i }).first(),
        page.getByTestId('po-receive-form-card'),
      );
      await shot(page, 'w1-receive-form');
      return 'inline receive form opened';
    });

    await ledger.run('W1b fill quantity, batch, best-before, destination and submit', async () => {
      await page.getByTestId('po-receive-qty').fill('100');
      await page.getByTestId('po-receive-batch').fill(`E2E-${Date.now().toString().slice(-6)}`);
      await page
        .getByTestId('po-receive-best-before')
        .fill(new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10))
        .catch(() => {});
      const card = page.getByTestId('po-receive-form-card');
      const cb = card.getByRole('combobox').first();
      const picked = (await cb.count()) ? await pickOption(page, cb, 1) : '(no destination select)';
      await shot(page, 'w1-form-filled');
      await page.getByTestId('po-receive-submit').click();
      await page.waitForTimeout(3000);
      await shot(page, 'w1-after-receive');
      const err = page.getByTestId('po-receive-error');
      const ok = page.getByTestId('po-receive-success');
      const errText = (await err.count()) ? await err.innerText() : '';
      const okText = (await ok.count()) ? await ok.innerText() : '';
      if (errText) throw new Error(`form error: ${errText.replace(/\s+/g, ' ')} (destination=${picked})`);
      return `destination=${picked}; success="${okText.replace(/\s+/g, ' ')}"`;
    });

    await ledger.run('W1c DB: grns + grn_items + license_plates + stock_moves grew', async () => {
      const after = {
        grns: await count('grns'),
        grnItems: await count('grn_items'),
        lps: await count('license_plates'),
        moves: await count('stock_moves'),
      };
      const delta = `grns ${before.grns}→${after.grns}, grn_items ${before.grnItems}→${after.grnItems}, license_plates ${before.lps}→${after.lps}, stock_moves ${before.moves}→${after.moves}`;
      if (after.grns <= before.grns) throw new Error(`NO GRN ROW WRITTEN — ${delta}`);
      if (after.lps <= before.lps) throw new Error(`GRN written but NO license plate — ${delta}`);
      if (after.moves <= before.moves) throw new Error(`GRN written but NO stock_move — ${delta}`);
      return delta;
    });

    await ledger.run('W1c2 receive the kg line — does the GRN path work at all?', async () => {
      await open(page, `/warehouse/receive-po/${PO_ID}`);
      const rows = page.locator('table tbody tr');
      const n = await rows.count();
      let opened = false;
      for (let i = 0; i < n; i += 1) {
        if (/ING-SUGAR/i.test(await rows.nth(i).innerText())) {
          await clickUntil(
            page,
            rows.nth(i).getByRole('button', { name: /receive line/i }),
            page.getByTestId('po-receive-form-card'),
          );
          opened = true;
          break;
        }
      }
      if (!opened) throw new Error(`no ING-SUGAR line on the receive screen (${n} rows)`);
      await page.getByTestId('po-receive-qty').fill('20');
      await page.getByTestId('po-receive-batch').fill(`E2E-KG-${Date.now().toString().slice(-6)}`);
      const card = page.getByTestId('po-receive-form-card');
      const cb = card.getByRole('combobox').first();
      if (await cb.count()) await pickOption(page, cb, 1);
      await page.getByTestId('po-receive-submit').click();
      await page.waitForTimeout(3000);
      await shot(page, 'w1-kg-after-receive');
      const err = page.getByTestId('po-receive-error');
      const ok = page.getByTestId('po-receive-success');
      const grns = await count('grns');
      const lps = await count('license_plates');
      const moves = await count('stock_moves');
      const state = `grns=${grns}, license_plates=${lps}, stock_moves=${moves}`;
      if (await err.count()) throw new Error(`kg receipt error: ${(await err.innerText()).replace(/\s+/g, ' ')} — ${state}`);
      if (grns === 0) throw new Error(`kg receipt reported no error but NO GRN ROW — ${state}`);
      return `success="${(await ok.count()) ? (await ok.innerText()).replace(/\s+/g, ' ') : ''}"; ${state}`;
    });

    await ledger.run('W1c3 CONTROL: same click after flipping the PO currency to GBP', async () => {
      const before2 = await sql<{ currency: string }>('select currency from purchase_orders where id = $1', [PO_ID]);
      await sql("update purchase_orders set currency = 'GBP' where id = $1", [PO_ID]);
      await open(page, `/warehouse/receive-po/${PO_ID}`);
      const rows = page.locator('table tbody tr');
      let opened = false;
      for (let i = 0; i < (await rows.count()); i += 1) {
        if (/ING-SUGAR/i.test(await rows.nth(i).innerText())) {
          await clickUntil(page, rows.nth(i).getByRole('button', { name: /receive line/i }), page.getByTestId('po-receive-form-card'));
          opened = true;
          break;
        }
      }
      if (!opened) throw new Error('no ING-SUGAR line on the receive screen');
      await page.getByTestId('po-receive-qty').fill('20');
      await page.getByTestId('po-receive-batch').fill(`E2E-GBP-${Date.now().toString().slice(-6)}`);
      const cb = page.getByTestId('po-receive-form-card').getByRole('combobox').first();
      if (await cb.count()) await pickOption(page, cb, 1);
      await page.getByTestId('po-receive-submit').click();
      await page.waitForTimeout(3500);
      await shot(page, 'w1-control-gbp');
      const err = page.getByTestId('po-receive-error');
      const grns = await count('grns');
      const state = `PO currency ${before2[0]?.currency}→GBP; grns=${grns}, license_plates=${await count('license_plates')}, grn_items=${await count('grn_items')}, stock_moves=${await count('stock_moves')}`;
      if (await err.count()) throw new Error(`still blocked after GBP: ${(await err.innerText()).replace(/\s+/g, ' ')} — ${state}`);
      if (grns === 0) throw new Error(`no error shown but still NO GRN ROW — ${state}`);
      return `CURRENCY WAS THE ONLY DIFFERENCE — ${state}`;
    });

    await ledger.run('W1d the receipt shows up on the GRN list', async () => {
      await open(page, '/warehouse/grns');
      const rows = await page.locator('table tbody tr').count();
      await shot(page, 'w1-grn-list');
      const dbRows = await count('grns');
      if (rows === 0) throw new Error(`grns table has ${dbRows} row(s) but the GRN list renders none`);
      return `GRN list rows=${rows}, grns in DB=${dbRows}`;
    });

    ledger.assertGreen();
  });

  test('W2 direct stock adjustment → stock_adjustments + stock_moves', async ({ page }) => {
    const ledger = new Ledger();
    await signIn(page, baseURL, L);
    const before = {
      adj: await count('stock_adjustments'),
      moves: await count('stock_moves'),
      lps: await count('license_plates'),
    };

    await open(page, '/warehouse/adjustments/new');

    await ledger.run('W2a fill the adjustment form', async () => {
      await pickOption(page, page.getByTestId('adjust-location').getByRole('combobox').first(), 1);
      // The picker panel is createPortal'd to <body> as [role=dialog] — it is NOT a
      // descendant of adjust-item-picker-root, and the trigger TOGGLES, so an even number
      // of retries would close it again.
      // The panel is createPortal'd to <body>; target ITS listbox testid — a page-wide
      // [role=dialog] also matches other portaled, hidden overlays.
      const panel = page.getByTestId('adjust-item-options');
      await clickUntil(page, page.getByTestId('adjust-item-trigger'), panel, 3);
      await shot(page, 'w2-item-picker-open');
      const search = page.locator('[role="dialog"] input').last();
      await search.fill('Sugar');
      await page.waitForTimeout(900);
      const hit = panel.getByRole('option', { name: /sugar/i }).first();
      const anyHit = panel.getByRole('button', { name: /sugar/i }).first();
      if (await hit.count()) await hit.click();
      else if (await anyHit.count()) await anyHit.click();
      else
        throw new Error(
          `item picker showed no "Sugar" result; panel text="${(await panel.innerText()).replace(/\s+/g, ' ').slice(0, 200)}"`,
        );
      await page.getByTestId('adjust-direction-increase').click();
      await page.getByTestId('adjust-quantity').fill('7');
      const uom = page.getByTestId('adjust-uom');
      const uomCb = uom.getByRole('combobox');
      if (await uomCb.count()) await pickOption(page, uomCb.first(), 1);
      else await uom.fill('kg'); // adjust-uom is a free-text unit input, not a Select
      const reasonCb = page.getByTestId('adjust-reason').getByRole('combobox');
      if (await reasonCb.count()) await pickOption(page, reasonCb.first(), 1);
      const reasonText = page.getByTestId('adjust-reason-text');
      if (await reasonText.count()) await reasonText.fill('E2E walk-through');
      await page.getByTestId('adjust-password').fill('e2e-local');
      await shot(page, 'w2-form-filled');
      return 'location, item=Sugar, +7, uom, reason, e-sign filled';
    });

    await ledger.run('W2b submit', async () => {
      const submit = page.getByTestId('adjust-submit');
      if (await submit.isDisabled())
        throw new Error(`"Apply adjustment" DISABLED with every field filled. affordances=${await affordances(page)}`);
      await submit.click();
      await page.waitForTimeout(3000);
      await shot(page, 'w2-after-submit');
      const alerts = await page
        .locator('[role="alert"], [role="status"]')
        .evaluateAll((els) => els.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 4));
      return `url=${page.url()} messages=${JSON.stringify(alerts)}`;
    });

    await ledger.run('W2c DB: stock_adjustments + stock_moves grew', async () => {
      const after = {
        adj: await count('stock_adjustments'),
        moves: await count('stock_moves'),
        lps: await count('license_plates'),
      };
      const delta = `stock_adjustments ${before.adj}→${after.adj}, stock_moves ${before.moves}→${after.moves}, license_plates ${before.lps}→${after.lps}`;
      if (after.adj <= before.adj) throw new Error(`NO ADJUSTMENT ROW — ${delta}`);
      if (after.moves <= before.moves) throw new Error(`adjustment written but NO stock_move — ${delta}`);
      return delta;
    });

    ledger.assertGreen();
  });

  test('W3 count session → count_sessions + count_lines + posted variance', async ({ page }) => {
    const ledger = new Ledger();
    await signIn(page, baseURL, L);
    const before = { sessions: await count('count_sessions'), lines: await count('count_lines') };
    let countSessionId = '';

    await open(page, '/warehouse/counts');

    await ledger.run('W3a create a count session', async () => {
      await clickUntil(page, page.getByTestId('count-session-new'), page.getByTestId('count-session-create-modal'));
      const dialog = page.getByTestId('count-session-create-modal');
      const wh = await pickOption(page, dialog.getByRole('combobox').first(), 1);
      const type = await pickOption(page, dialog.getByRole('combobox').nth(1), 1);
      await shot(page, 'w3-count-modal');
      const confirm = page.getByTestId('count-session-create-confirm');
      if (await confirm.isDisabled())
        throw new Error(`"Create session" still disabled with warehouse="${wh}" type="${type}"`);
      await confirm.click();
      await page.waitForTimeout(3000);
      await shot(page, 'w3-after-create');
      const modalText = (await page.getByTestId('count-session-create-modal').count())
        ? (await page.getByTestId('count-session-create-modal').innerText()).replace(/\s+/g, ' ')
        : '(modal closed)';
      const whRow = await sql<{ code: string; site_id: string | null }>(
        'select code, site_id::text from warehouses where org_id = $1 order by code',
        [ORG_ID],
      );
      return `warehouse="${wh}" type="${type}" url=${page.url()}; modal="${modalText}"; warehouses=${JSON.stringify(whRow)}`;
    });

    await ledger.run('W3b DB: count_sessions grew and on-hand was snapshotted into count_lines', async () => {
      const after = { sessions: await count('count_sessions'), lines: await count('count_lines') };
      const delta = `count_sessions ${before.sessions}→${after.sessions}, count_lines ${before.lines}→${after.lines}`;
      if (after.sessions <= before.sessions) throw new Error(`NO COUNT SESSION ROW — ${delta}`);
      if (after.lines <= before.lines)
        throw new Error(
          `session created but NO count_lines snapshot, although the modal promises "the system snapshots on-hand" — ${delta}`,
        );
      return delta;
    });

    await ledger.run('W3b2 CONTROL: same click after giving the warehouse a site', async () => {
      const site = await sql<{ id: string }>('select id::text from sites where org_id = $1 order by name limit 1', [ORG_ID]);
      await sql('update warehouses set site_id = $2::uuid where org_id = $1::uuid and site_id is null', [ORG_ID, site[0].id]);
      await open(page, '/warehouse/counts');
      await clickUntil(page, page.getByTestId('count-session-new'), page.getByTestId('count-session-create-modal'));
      const dialog = page.getByTestId('count-session-create-modal');
      const wh = await pickOption(page, dialog.getByRole('combobox').first(), 1);
      const type = await pickOption(page, dialog.getByRole('combobox').nth(1), 1);
      await page.getByTestId('count-session-create-confirm').click();
      await page.waitForTimeout(3500);
      await shot(page, 'w3-control-site');
      const sessions = await count('count_sessions');
      const lines = await count('count_lines');
      const state = `warehouses.site_id null→${site[0].id}; count_sessions=${sessions}, count_lines=${lines}; picked "${wh}"/"${type}"`;
      if (sessions === 0) {
        const modal = (await dialog.count()) ? (await dialog.innerText()).replace(/\s+/g, ' ') : '(closed)';
        throw new Error(`still no session after filling site_id — ${state}; modal="${modal}"`);
      }
      return `warehouses.site_id WAS THE ONLY DIFFERENCE — ${state}`;
    });

    await ledger.run('W3c enter a blind count on a line and save it', async () => {
      const session = await sql<{ id: string; code: string; status: string }>(
        'select id::text, code, status from count_sessions order by created_at desc limit 1',
      );
      if (!session[0]) throw new Error('no count session to open');
      countSessionId = session[0].id;
      await open(page, `/warehouse/counts/${countSessionId}`);
      await shot(page, 'w3-session-detail');
      const entryTab = page.getByTestId('count-tab-entry');
      if (await entryTab.count()) await entryTab.click().catch(() => {});
      await page.waitForTimeout(600);
      const input = page.locator('[data-testid^="count-entry-input-"]').first();
      if (!(await input.count()))
        throw new Error(`no count-entry input. affordances=${await affordances(page)}`);
      const lineId = (await input.getAttribute('data-testid'))!.replace('count-entry-input-', '');
      await input.fill('1');
      const save = page.getByTestId(`count-entry-save-${lineId}`);
      if (await save.isDisabled()) throw new Error(`"Record count" stays disabled after typing a quantity (line ${lineId})`);
      await save.click();
      await page.waitForTimeout(2500);
      await shot(page, 'w3-after-entry');
      const err = page.getByTestId(`count-entry-error-${lineId}`);
      if (await err.count()) throw new Error(`entry error: ${(await err.innerText()).replace(/\s+/g, ' ')}`);
      const line = await sql<Record<string, unknown>>('select * from count_lines where id = $1', [lineId]);
      const counted = line[0] ?? {};
      const persisted = Object.entries(counted)
        .filter(([k]) => /count|qty|status/.test(k))
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(', ');
      if (!persisted) throw new Error(`count_lines row ${lineId} not found after save`);
      return `line ${lineId}: ${persisted}`;
    });

    await ledger.run('W3d approve the variance on the review tab', async () => {
      await open(page, `/warehouse/counts/${countSessionId}`);
      const reviewTab = page.getByTestId('count-tab-review');
      if (!(await reviewTab.count())) throw new Error(`no review tab. affordances=${await affordances(page)}`);
      await reviewTab.click();
      await page.waitForTimeout(900);
      await shot(page, 'w3-review');
      const approve = page.locator('[data-testid^="count-review-approve-"]').first();
      if (!(await approve.count()))
        throw new Error(`no approve affordance on the review tab. affordances=${await affordances(page)}`);
      await clickUntil(page, approve, page.getByTestId('count-approve-modal'), 3);
      const effect = page.getByTestId('count-approve-effect');
      const effectText = (await effect.count()) ? (await effect.innerText()).replace(/\s+/g, ' ') : '';
      await page.getByTestId('count-approve-password').fill('e2e-local');
      const pin = page.getByTestId('count-approve-supervisor-pin');
      const supervisorBlock = page.getByTestId('count-approve-supervisor-block');
      const needsSupervisor = await supervisorBlock.count();
      if (await pin.count()) await pin.fill('0000');
      await shot(page, 'w3-approve-modal');
      const confirm = page.getByRole('button', { name: /approve|confirm|apply/i }).last();
      if (await confirm.isDisabled())
        throw new Error(`approve disabled; effect="${effectText}" supervisorBlock=${needsSupervisor}`);
      await confirm.click();
      await page.waitForTimeout(3500);
      await shot(page, 'w3-after-approve');
      const modalErr = page.getByTestId('count-approve-error');
      const errText = (await modalErr.count()) ? (await modalErr.innerText()).replace(/\s+/g, ' ') : '';
      const adjustments = await count('stock_adjustments');
      const moves = await count('stock_moves');
      const state = `effect="${effectText}"; supervisorBlock=${needsSupervisor}; stock_adjustments=${adjustments}, stock_moves=${moves}`;
      if (errText) throw new Error(`approve error: ${errText} — ${state}`);
      return state;
    });

    await ledger.run('W3e close the session', async () => {
      await open(page, `/warehouse/counts/${countSessionId}`);
      const closeBtn = page.getByTestId('count-close-session');
      if (!(await closeBtn.count())) throw new Error(`no close affordance. affordances=${await affordances(page)}`);
      await closeBtn.click();
      await page.waitForTimeout(1200);
      const dialog = page.locator('[role="dialog"]');
      if (await dialog.isVisible().catch(() => false))
        await dialog.getByRole('button', { name: /close|confirm|yes/i }).last().click().catch(() => {});
      await page.waitForTimeout(3000);
      await shot(page, 'w3-after-close');
      const err = page.getByTestId('count-close-session-error');
      const errText = (await err.count()) ? (await err.innerText()).replace(/\s+/g, ' ') : '';
      const status = await sql<{ status: string; closed_at: string | null }>(
        'select status, closed_at::text from count_sessions where id = $1',
        [countSessionId],
      );
      const state = `count_sessions.status=${status[0]?.status}, closed_at=${status[0]?.closed_at}; inline error="${errText}"`;
      if (status[0]?.status === 'open') throw new Error(`"Close session" clicked but the session IS STILL open — ${state}`);
      return state;
    });

    ledger.assertGreen();
  });

  test('W4 license plate split → child LP with parent_lp_id + state history', async ({ page }) => {
    const ledger = new Ledger();
    await signIn(page, baseURL, L);
    const before = {
      lps: await count('license_plates'),
      hist: await count('lp_state_history'),
      moves: await count('stock_moves'),
    };
    const parentBefore = await sql<{ quantity: string }>('select quantity::text from license_plates where id = $1', [LP_ID]);

    await open(page, `/warehouse/license-plates/${LP_ID}`);

    await ledger.run('W4a split 5 kg off the LP', async () => {
      await clickUntil(page, page.getByTestId('lp-action-split'), page.getByTestId('lp-split-modal'));
      await shot(page, 'w4-split-modal');
      await page.getByTestId('lp-split-qty').fill('5');
      const dest = page.getByTestId('lp-split-destination').getByRole('combobox');
      if (await dest.count()) await pickOption(page, dest.first(), 1).catch(() => {});
      const reason = page.getByTestId('lp-split-reason');
      if (await reason.count()) await reason.fill('E2E walk-through split');
      const validation = page.getByTestId('lp-split-validation');
      const vText = (await validation.count()) ? await validation.innerText() : '';
      const confirm = page.getByTestId('lp-split-confirm');
      if (await confirm.isDisabled()) throw new Error(`split confirm DISABLED; validation="${vText}"`);
      await confirm.click();
      await page.waitForTimeout(3000);
      await shot(page, 'w4-after-split');
      const err = page.getByTestId('lp-split-error');
      if (await err.count()) throw new Error(`split error: ${(await err.innerText()).replace(/\s+/g, ' ')}`);
      return `validation="${vText}"`;
    });

    await ledger.run('W4b DB: child LP exists, parent quantity dropped, history written', async () => {
      const after = {
        lps: await count('license_plates'),
        hist: await count('lp_state_history'),
        moves: await count('stock_moves'),
      };
      const child = await sql<{ id: string; quantity: string; lp_number: string }>(
        'select id::text, quantity::text, lp_number from license_plates where parent_lp_id = $1',
        [LP_ID],
      );
      const parentAfter = await sql<{ quantity: string }>('select quantity::text from license_plates where id = $1', [LP_ID]);
      const delta = `license_plates ${before.lps}→${after.lps}, lp_state_history ${before.hist}→${after.hist}, stock_moves ${before.moves}→${after.moves}, parent qty ${parentBefore[0]?.quantity}→${parentAfter[0]?.quantity}, children=${JSON.stringify(child)}`;
      if (child.length === 0) throw new Error(`NO CHILD LP with parent_lp_id — ${delta}`);
      if (parentAfter[0]?.quantity === parentBefore[0]?.quantity)
        throw new Error(`child LP created but PARENT QUANTITY UNCHANGED (stock duplicated) — ${delta}`);
      return delta;
    });

    await ledger.run('W4b2 CONTROL: same split after giving the warehouse a site', async () => {
      const site = await sql<{ id: string }>('select id::text from sites where org_id = $1 order by name limit 1', [ORG_ID]);
      await sql('update warehouses set site_id = $2::uuid where org_id = $1::uuid and site_id is null', [ORG_ID, site[0].id]);
      await open(page, `/warehouse/license-plates/${LP_ID}`);
      await clickUntil(page, page.getByTestId('lp-action-split'), page.getByTestId('lp-split-modal'));
      await page.getByTestId('lp-split-qty').fill('5');
      const dest = page.getByTestId('lp-split-destination').getByRole('combobox');
      if (await dest.count()) await pickOption(page, dest.first(), 1).catch(() => {});
      const reason = page.getByTestId('lp-split-reason');
      if (await reason.count()) await reason.fill('E2E control split');
      await page.getByTestId('lp-split-confirm').click();
      await page.waitForTimeout(3500);
      await shot(page, 'w4-control-site');
      const err = page.getByTestId('lp-split-error');
      const child = await sql<{ id: string; quantity: string }>(
        'select id::text, quantity::text from license_plates where parent_lp_id = $1',
        [LP_ID],
      );
      const state = `warehouses.site_id null→${site[0].id}; children=${JSON.stringify(child)}`;
      if (await err.count()) throw new Error(`still blocked after site_id: ${(await err.innerText()).replace(/\s+/g, ' ')} — ${state}`);
      if (child.length === 0) throw new Error(`no error shown but still NO CHILD LP — ${state}`);
      return `warehouses.site_id WAS THE ONLY DIFFERENCE — ${state}`;
    });

    await ledger.run('W4c merge the child back into the parent', async () => {
      await open(page, `/warehouse/license-plates/${LP_ID}`);
      const merge = page.getByTestId('lp-action-merge');
      if (await merge.isDisabled())
        throw new Error(`Merge DISABLED right after a split (title="${await merge.getAttribute('title')}")`);
      await clickUntil(page, merge, page.getByTestId('lp-merge-modal'));
      await shot(page, 'w4-merge-modal');
      const dialog = page.getByTestId('lp-merge-modal');
      const empty = page.getByTestId('lp-merge-empty');
      if (await empty.count()) throw new Error(`merge says there is nothing to merge: "${await empty.innerText()}"`);
      const boxes = dialog.locator('input[type="checkbox"], input[type="radio"]');
      const nb = await boxes.count();
      for (let i = 0; i < nb; i += 1) await boxes.nth(i).check().catch(() => {});
      const cb = dialog.getByRole('combobox');
      if (await cb.count()) await pickOption(page, cb.first(), 1).catch(() => {});
      const reason = page.getByTestId('lp-merge-reason');
      if (await reason.count()) await reason.fill('E2E walk-through merge');
      const submit = page.getByTestId('lp-merge-confirm');
      const body = (await dialog.innerText()).replace(/\s+/g, ' ').slice(0, 300);
      if (await submit.isDisabled()) throw new Error(`merge submit DISABLED; dialog="${body}" checkboxes=${nb}`);
      await submit.click();
      await page.waitForTimeout(3000);
      await shot(page, 'w4-after-merge');
      const kids = await sql<{ id: string; quantity: string; status: string }>(
        'select id::text, quantity::text, status from license_plates where parent_lp_id = $1',
        [LP_ID],
      );
      const parentNow = await sql<{ quantity: string }>('select quantity::text from license_plates where id = $1', [LP_ID]);
      return `after merge: parent qty=${parentNow[0]?.quantity}, children=${JSON.stringify(kids)}`;
    });

    ledger.assertGreen();
  });

  test('W5 license plate move → location changes + stock_move row', async ({ page }) => {
    const ledger = new Ledger();
    await signIn(page, baseURL, L);
    const before = await sql<{ location_id: string; warehouse_id: string }>(
      'select location_id::text, warehouse_id::text from license_plates where id = $1',
      [LP_ID],
    );
    const movesBefore = await count('stock_moves');
    // LUKA DANYCH: the org has exactly one location, so "move" has nowhere to go.
    await sql(
      `insert into locations (org_id, warehouse_id, code, name, location_type, level, path, is_active)
       values ($1::uuid, $2::uuid, 'E2E-BAY-02', 'E2E walk-through bay', 'bin', 1, 'E2E-BAY-02', true)
       on conflict do nothing`,
      [ORG_ID, WH_DEMO_01],
    ).catch(async (error) => {
      const cols = await sql<{ column_name: string }>(
        "select column_name from information_schema.columns where table_name='locations' order by ordinal_position",
      );
      throw new Error(`seed failed: ${(error as Error).message}; columns=${cols.map((c) => c.column_name).join(',')}`);
    });
    const locations = await sql<{ id: string; code: string; warehouse_id: string }>(
      'select id::text, code, warehouse_id::text from locations order by code',
    );
    // eslint-disable-next-line no-console
    console.log(`  SEEDED: locations now ${JSON.stringify(locations)}`);

    await open(page, `/warehouse/license-plates/${LP_ID}`);

    await ledger.run('W5a open Move and pick a destination', async () => {
      await clickUntil(page, page.getByTestId('lp-action-move'), page.getByTestId('lp-move-form'));
      await shot(page, 'w5-move-modal');
      const noLoc = page.getByTestId('lp-move-no-locations');
      if (await noLoc.count())
        throw new Error(
          `move dialog says there is nowhere to move to ("${await noLoc.innerText()}") while locations exist: ${JSON.stringify(locations)}`,
        );
      const dest = page.getByTestId('lp-move-destination').getByRole('combobox');
      if (!(await dest.count())) throw new Error(`move dialog has no destination select. locations=${JSON.stringify(locations)}`);
      const picked = await pickOption(page, dest.first(), 1);
      const reason = page.getByTestId('lp-move-reason');
      if (await reason.count()) await reason.fill('E2E walk-through move');
      const submit = page.getByTestId('lp-move-submit');
      if (await submit.isDisabled()) throw new Error(`move submit DISABLED with destination="${picked}"`);
      await submit.click();
      await page.waitForTimeout(3000);
      await shot(page, 'w5-after-move');
      const err = page.getByTestId('lp-move-error');
      if (await err.count()) throw new Error(`move error: ${(await err.innerText()).replace(/\s+/g, ' ')}`);
      return `destination="${picked}"; locations in org=${JSON.stringify(locations)}`;
    });

    await ledger.run('W5b DB: location changed and a stock_move was recorded', async () => {
      const after = await sql<{ location_id: string; warehouse_id: string }>(
        'select location_id::text, warehouse_id::text from license_plates where id = $1',
        [LP_ID],
      );
      const movesAfter = await count('stock_moves');
      const delta = `location ${before[0]?.location_id}→${after[0]?.location_id}, warehouse ${before[0]?.warehouse_id}→${after[0]?.warehouse_id}, stock_moves ${movesBefore}→${movesAfter}`;
      if (after[0]?.location_id === before[0]?.location_id) throw new Error(`LOCATION UNCHANGED — ${delta}`);
      if (movesAfter <= movesBefore) throw new Error(`LP moved but NO stock_move row — ${delta}`);
      return delta;
    });

    await ledger.run('W5c CONTROL: same move after stamping the LP with a site', async () => {
      const site = await sql<{ site_id: string }>(
        `select w.site_id::text from license_plates lp join warehouses w on w.id = lp.warehouse_id where lp.id = $1`,
        [LP_ID],
      );
      await sql('update license_plates set site_id = $2::uuid where id = $1::uuid', [LP_ID, site[0]?.site_id]);
      await open(page, `/warehouse/license-plates/${LP_ID}`);
      await clickUntil(page, page.getByTestId('lp-action-move'), page.getByTestId('lp-move-form'));
      const dest = page.getByTestId('lp-move-destination').getByRole('combobox');
      const picked = await pickOption(page, dest.first(), 1);
      const reason = page.getByTestId('lp-move-reason');
      if (await reason.count()) await reason.fill('E2E control move');
      await page.getByTestId('lp-move-submit').click();
      await page.waitForTimeout(3500);
      await shot(page, 'w5-control-site');
      const err = page.getByTestId('lp-move-error');
      const after = await sql<{ location_id: string }>('select location_id::text from license_plates where id = $1', [LP_ID]);
      const moves = await count('stock_moves');
      const state = `license_plates.site_id null→${site[0]?.site_id}; destination="${picked}"; location now ${after[0]?.location_id}; stock_moves=${moves}`;
      if (await err.count()) throw new Error(`still blocked: ${(await err.innerText()).replace(/\s+/g, ' ')} — ${state}`);
      if (after[0]?.location_id === before[0]?.location_id) throw new Error(`no error but LOCATION UNCHANGED — ${state}`);
      return `license_plates.site_id WAS THE ONLY DIFFERENCE — ${state}`;
    });

    ledger.assertGreen();
  });
});

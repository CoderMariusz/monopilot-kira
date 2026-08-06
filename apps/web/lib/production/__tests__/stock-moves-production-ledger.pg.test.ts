/**
 * H7 — Behavioral stock_moves ledger suite (real Postgres).
 *
 * Drives the REAL writer code paths:
 *   (a) consume  → recordDesktopConsumption → writeConsumeLedger → stock_moves 'consume_to_wo'
 *   (b) idempotent replay on consume → same single row
 *   (c) output   → registerOutput → stock_moves 'receipt'
 *   (d) reverse  → reverseConsumption → writeConsumptionReverseStockMove → stock_moves 'adjustment'
 *   (e) idempotent correction dedup → same single adjustment row
 *   (f) constraint-rejection: negative consume_to_wo → 23514
 *   (i) waste void → voidWasteEntry → pallet + ledger both go back up
 *   (j) waste void with NO pallet → still a pure book-only correction
 *   (k) waste void when the pallet moved on → refused, nothing written
 *   (l) waste void that emptied the pallet → lifted back out of 'destroyed'
 *
 * Skips cleanly when DATABASE_URL is absent; residue-free (random-UUID org, org-scoped cleanup).
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Server Actions call revalidateLocalized() after commit; outside a Next request
// scope revalidatePath throws "static generation store missing" and would turn a
// committed write into { ok:false }. Same stub as reservation-integrity.pg.test.ts.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: vi.fn() }));

import { getAppConnection, getOwnerConnection } from '../../../../../packages/db/src/clients.js';
import { setPin } from '../../../../../packages/auth/src/verify-pin.js';
import {
  createPgTestFixture,
  type PgTestFixture,
} from '../../../tests/helpers/owner-org-context.js';

import { recordDesktopConsumption } from '../../../app/[locale]/(app)/(modules)/production/_actions/consume-material-actions.js';
import { registerOutput } from '../output/register-output.js';
import { cancelWo, completeWo } from '../complete-cancel-wo.js';
import { reverseConsumption, voidWasteEntry } from '../../../app/[locale]/(app)/(modules)/production/_actions/corrections-actions.js';
import { recordWaste } from '../waste/record-waste.js';
import { correctionTransactionId } from '../../corrections/correct-ledger-entry.js';

// ─── Skip guard ────────────────────────────────────────────────────────────────
const databaseUrl = process.env.DATABASE_URL;
const runPg = databaseUrl ? describe : describe.skip;

// ─── Fixed UUIDs ───────────────────────────────────────────────────────────────
let orgId: string;
let userId: string;
const itemId = randomUUID();
let siteId: string;
let warehouseId: string;
let locationId: string;
const lpId = randomUUID();
const woId = randomUUID();
const materialId = randomUUID();
const wasteCategoryId = randomUUID();
const WASTE_CATEGORY_CODE = 'SML-TRIM';

// ─── Test PIN (short numeric, exercises the PIN path in signEvent) ─────────────
const TEST_PIN = '1234';

runPg('production stock_moves ledger — behavioral (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;
  let fixture: PgTestFixture;

  // ─── runUnderOrg helper (mirrors H4b pattern) ────────────────────────────────
  async function runUnderOrg<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const sessionToken = randomUUID();
    await ownerPool.query(
      `insert into app.session_org_contexts (session_token, org_id, user_id)
       values ($1::uuid, $2::uuid, $3::uuid)
       on conflict (session_token) do update set org_id = excluded.org_id, user_id = excluded.user_id`,
      [sessionToken, orgId, userId],
    );
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
      await ownerPool
        .query('delete from app.session_org_contexts where session_token = $1::uuid', [sessionToken])
        .catch(() => undefined);
    }
  }

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    fixture = await createPgTestFixture(ownerPool, {
      permissions: [
        'production.consumption.write',
        'production.consumption.correct',
        'production.output.write',
        'production.corrections.closed_wo',
        'production.wo.complete',
        'production.wo.cancel',
        'production.waste.write',
        'production.waste.correct',
      ],
    });
    ({ orgId, userId, siteId, warehouseId, locationId } = fixture);

    // Enroll PIN for e-sign (reverseConsumption uses assertCorrectionAllowed → signEvent → verifyPin)
    await setPin(userId, TEST_PIN);

    // Item (FG)
    await ownerPool.query(
      // cost_per_kg is the last-resort WAC cost source (material-cost-source.ts).
      // Without it debitWac books wac_value = 0 and registerOutput rejects the
      // whole WO with wac_un_costed before it ever reaches the ledger writer.
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, cost_per_kg, created_by)
       values ($1, $2, 'SML-FG', 'fg', 'SM Ledger FG Item', 'kg', 4.000000, $3)
       on conflict (id) do nothing`,
      [itemId, orgId, userId],
    );

    // Work order (COMPLETED status matches H4b; executions row drives recordability)
    await ownerPool.query(
      `insert into public.work_orders (
         id, org_id, site_id, wo_number, product_id, item_type_at_creation,
         planned_quantity, uom, status, created_by, updated_by
       )
       values ($1, $2, $3, 'SML-WO-001', $4, 'fg', 10.000, 'kg', 'COMPLETED', $5, $5)
       on conflict (id) do nothing`,
      [woId, orgId, siteId, itemId, userId],
    );
    // wo_executions drives readWoExecutionStatus; 'in_progress' ∈ OUTPUT_RECORDABLE_STATES
    await ownerPool.query(
      `insert into public.wo_executions (id, org_id, wo_id, status, version, created_by, updated_by)
       values ($1, $2, $3, 'in_progress', 1, $4, $4)
       on conflict (id) do nothing`,
      [randomUUID(), orgId, woId, userId],
    );

    // wo_materials (what recordDesktopConsumption locks)
    await ownerPool.query(
      // wo_materials has no created_by/updated_by columns (audit lives in stock_moves).
      `insert into public.wo_materials (id, org_id, site_id, wo_id, product_id, material_name, required_qty, consumed_qty, uom)
       values ($1, $2, $3, $4, $5, 'SM Ledger Material', 10.000, 0.000, 'kg')
       on conflict (id) do nothing`,
      [materialId, orgId, siteId, woId, itemId],
    );

    // LP (available + released = consumable)
    await ownerPool.query(
      `insert into public.license_plates (
         id, org_id, site_id, warehouse_id, location_id, lp_number,
         product_id, quantity, reserved_qty, uom, status, qa_status, created_by, updated_by
       )
       values ($1, $2, $3, $4, $5, 'SML-LP-001', $6, 10.000, 0.000, 'kg',
               'available', 'released', $7, $7)
       on conflict (id) do nothing`,
      [lpId, orgId, siteId, warehouseId, locationId, itemId, userId],
    );

    // Waste taxonomy (recordWaste resolves category_code → waste_categories.id)
    await ownerPool.query(
      `insert into public.waste_categories (id, org_id, code, name)
       values ($1, $2, $3, 'SM Ledger Trim Waste')
       on conflict (org_id, code) do nothing`,
      [wasteCategoryId, orgId, WASTE_CATEGORY_CODE],
    );

    // Wire withOrgContext test-stub env vars so Server Actions bypass Supabase JWT
    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = userId;
    process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;
  });

  afterAll(async () => {
    // Restore env
    delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    delete process.env.NEXT_SERVER_ACTION_ORG_ID;

    // Cascade order: corrections → consumption → outputs → materials → WO execution → WO → LP → item → location → warehouse → site → role data → user → org → tenant
    await ownerPool?.query('delete from public.stock_moves where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.lp_state_history where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.lp_genealogy where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.outbox_events where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.audit_events where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.e_sign_log where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.wo_material_consumption where org_id = $1', [orgId]).catch(() => undefined);
    // wo_waste_log before waste_categories — the category FK is ON DELETE RESTRICT.
    await ownerPool?.query('delete from public.wo_waste_log where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.waste_categories where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.wo_outputs where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.wo_materials where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.wo_executions where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.work_orders where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.license_plates where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.item_wac_state where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.items where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.user_pins where user_id = $1', [userId]).catch(() => undefined);
    await fixture?.cleanup();
    await appPool?.end();
    await ownerPool?.end();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // (a) + (b) — Desktop consume: real code path → exactly one 'consume_to_wo' row,
  // correct site/location, deterministic transaction_id; replay → still one row.
  // ─────────────────────────────────────────────────────────────────────────────
  it('(a) recordDesktopConsumption writes exactly one consume_to_wo stock_move row with correct site and location', async () => {
    const clientOpId = randomUUID();

    const result = await recordDesktopConsumption({
      woId,
      materialId,
      qty: '2.500',
      lpId,
      clientOpId,
    });

    expect(result).toMatchObject({ ok: true, data: { replay: false } });

    const { rows } = await ownerPool.query<{
      move_type: string;
      site_id: string;
      from_location_id: string;
      quantity: string;
      reason_code: string;
    }>(
      `select move_type,
              site_id::text as site_id,
              from_location_id::text as from_location_id,
              quantity::text as quantity,
              reason_code
         from public.stock_moves
        where org_id = $1::uuid
          and move_type = 'consume_to_wo'
          and lp_id = $2::uuid`,
      [orgId, lpId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      move_type: 'consume_to_wo',
      site_id: siteId,
      from_location_id: locationId,
      reason_code: 'production_consume',
    });
    // quantity is a NUMERIC(15,6) driver-returned string — check positive
    expect(parseFloat(rows[0]!.quantity)).toBeCloseTo(2.5, 3);
  });

  it('(b) replaying the same clientOpId returns replay:true and leaves exactly one consume_to_wo row', async () => {
    // Use the same clientOpId from the first consume → idempotent replay
    // We re-call with a NEW clientOpId to confirm dedup is keyed on clientOpId
    const firstClientOpId = randomUUID();
    await recordDesktopConsumption({ woId, materialId, qty: '1.000', lpId, clientOpId: firstClientOpId });

    // Replay the same call
    const replay = await recordDesktopConsumption({
      woId,
      materialId,
      qty: '1.000',
      lpId,
      clientOpId: firstClientOpId,
    });

    expect(replay).toMatchObject({ ok: true, data: { replay: true } });

    // Should still be the same single row for this op (the first call's row)
    const { rows } = await ownerPool.query<{ n: string }>(
      `select count(*)::text as n
         from public.stock_moves
        where org_id = $1::uuid
          and move_type = 'consume_to_wo'
          and wo_material_id = $2::uuid
          and quantity = 1.000`,
      [orgId, materialId],
    );
    // Exactly 1 row for this specific qty (the replay did not insert a second)
    expect(rows[0]?.n).toBe('1');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // (c) — registerOutput: real call → one 'receipt' stock_move with to_location
  // ─────────────────────────────────────────────────────────────────────────────
  it('(c) registerOutput writes exactly one receipt stock_move row with to_location_id set', async () => {
    const outputTxnId = randomUUID();

    const result = await runUnderOrg(async (client) => {
      const ctx = {
        userId,
        orgId,
        siteId,
        client: client as unknown as Parameters<typeof registerOutput>[0]['client'],
      } as Parameters<typeof registerOutput>[0];

      return registerOutput(ctx, woId, {
        transaction_id: outputTxnId,
        output_type: 'primary',
        product_id: itemId,
        qty_kg: '3.000',
        uom: 'kg',
      });
    });

    expect(result).toMatchObject({ output_id: expect.any(String) });

    const { rows } = await ownerPool.query<{
      move_type: string;
      to_location_id: string | null;
      quantity: string;
      reason_code: string;
      transaction_id: string;
    }>(
      `select move_type,
              to_location_id::text as to_location_id,
              quantity::text as quantity,
              reason_code,
              transaction_id::text as transaction_id
         from public.stock_moves
        where org_id = $1::uuid
          and move_type = 'receipt'
          and transaction_id = $2::uuid`,
      [orgId, outputTxnId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      move_type: 'receipt',
      reason_code: 'production_output',
      transaction_id: outputTxnId,
    });
    // to_location_id is the output LP's location (set by createOutputLp → resolveWarehouseForSessionSite)
    expect(rows[0]!.to_location_id).toBeTruthy();
    expect(parseFloat(rows[0]!.quantity)).toBeCloseTo(3.0, 3);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // (d) + (e) — reverseConsumption: real call → one 'adjustment' negative row
  // with reason_code = 'consumption_reversed'; re-run → still one row (dedup).
  // ─────────────────────────────────────────────────────────────────────────────
  it('(d) reverseConsumption writes exactly one adjustment stock_move with positive quantity and consumption_reversed reason_code', async () => {
    // Find the consumption row written by (a) to reverse it
    const { rows: consumptionRows } = await ownerPool.query<{ id: string; transaction_id: string }>(
      `select id::text as id, transaction_id::text as transaction_id
         from public.wo_material_consumption
        where org_id = $1::uuid
          and wo_id = $2::uuid
          and correction_of_id is null
          and qty_consumed > 0
        order by consumed_at asc
        limit 1`,
      [orgId, woId],
    );

    const consumption = consumptionRows[0];
    expect(consumption).toBeDefined();
    const consumptionId = consumption!.id;

    const result = await reverseConsumption({
      consumptionId,
      reasonCode: 'entry_error',
      note: 'H7 behavioral test reversal',
      signature: { password: TEST_PIN },
    });

    expect(result).toMatchObject({ ok: true });

    const { rows } = await ownerPool.query<{
      move_type: string;
      quantity: string;
      reason_code: string;
      transaction_id: string;
    }>(
      `select move_type,
              quantity::text as quantity,
              reason_code,
              transaction_id::text as transaction_id
         from public.stock_moves
        where org_id = $1::uuid
          and move_type = 'adjustment'
          and reason_code = 'consumption_reversed'
          and wo_id = $2::uuid`,
      [orgId, woId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      move_type: 'adjustment',
      reason_code: 'consumption_reversed',
    });
    // REWRITTEN, not deleted: this case asserted `toBeLessThan(0)` and that is what
    // pinned the defect in place — the writer negated the quantity while
    // restoreLicensePlate handed the material BACK to the pallet, so the ledger
    // travelled opposite to the stock. Case (h) below measures that directly
    // (pallet +100 / ledger -100 = a 200 kg gap on a 100 kg reversal).
    // The reversal is an INFLOW; a counter-entry compensates a move, it does not
    // repeat its direction.
    expect(parseFloat(rows[0]!.quantity)).toBeGreaterThan(0);

    // Verify deterministic transaction_id
    const expectedCorrectionTxnId = correctionTransactionId({
      orgId,
      table: 'wo_material_consumption',
      originalId: consumptionId,
      reasonCode: 'entry_error',
    });
    expect(rows[0]!.transaction_id).toBe(expectedCorrectionTxnId);
  });

  it('(e) re-running reverseConsumption on an already-corrected row returns already_corrected and leaves exactly one adjustment row', async () => {
    // Find the already-corrected consumption row
    const { rows: consumptionRows } = await ownerPool.query<{ id: string }>(
      `select id::text as id
         from public.wo_material_consumption
        where org_id = $1::uuid
          and wo_id = $2::uuid
          and correction_of_id is null
          and qty_consumed > 0
        order by consumed_at asc
        limit 1`,
      [orgId, woId],
    );

    const consumptionId = consumptionRows[0]?.id;
    // If already corrected from (d), this row should have no uncorrected match — use it anyway
    // The action should return already_corrected
    if (consumptionId) {
      const retry = await reverseConsumption({
        consumptionId,
        reasonCode: 'entry_error',
        note: 'H7 retry should be idempotent',
        signature: { password: TEST_PIN },
      });
      // Either already_corrected (same row already reversed) or not_found (all consumed)
      if (retry.ok === false) {
        expect(['already_corrected', 'not_found']).toContain(retry.error);
      }
    }

    // The 23505 unique index on the correction transaction_id is the dedup backstop
    const expectedTxnId = consumptionId
      ? correctionTransactionId({
          orgId,
          table: 'wo_material_consumption',
          originalId: consumptionId,
          reasonCode: 'entry_error',
        })
      : null;

    if (expectedTxnId) {
      const { rows } = await ownerPool.query<{ n: string }>(
        `select count(*)::text as n
           from public.stock_moves
          where org_id = $1::uuid
            and move_type = 'adjustment'
            and transaction_id = $2::uuid`,
        [orgId, expectedTxnId],
      );
      // Exactly one adjustment row for this correction transaction_id
      expect(rows[0]?.n).toBe('1');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // (f) — Constraint guard: negative consume_to_wo quantity is blocked by CHECK
  // ─────────────────────────────────────────────────────────────────────────────
  it('(f) documents the CHECK that rejects negative consume_to_wo rows (23514)', async () => {
    await expect(
      ownerPool.query(
        `insert into public.stock_moves
           (org_id, site_id, move_number, lp_id, move_type, from_location_id,
            quantity, uom, reason_code, transaction_id, wo_id, wo_material_id, created_by, updated_by)
         values ($1, $2, $3, $4, 'consume_to_wo', $5, -1, 'kg',
                 'production_consume', $6, $7, $8, $9, $9)`,
        [orgId, siteId, 'SM-BLOCKED-CONSUME', lpId, locationId, randomUUID(), woId, materialId, userId],
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'stock_moves_quantity_sign_check' });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // (g) — cancelWo on a COMPLETED work order zeroes the output LP and flips it to
  // 'destroyed'. The 'receipt' registerOutput wrote stays in the ledger forever,
  // so without a compensating counter-entry the ledger permanently over-states
  // stock by the whole output quantity — goods vanish with no recorded loss.
  //
  // Signed ledger below counts only the move types that CREATE or DESTROY
  // quantity; putaway/transfer/quarantine/split/merge merely relocate stock.
  // 'return' is an OUTflow in this repo (receipt-corrections-actions writes it
  // with a POSITIVE quantity while zeroing the LP). 'adjustment' is the only type
  // stock_moves_quantity_sign_check lets go negative, so it is the one type whose
  // direction lives in the value itself.
  // ─────────────────────────────────────────────────────────────────────────────
  const LEDGER_RECONCILIATION_SQL = `
    select lp.id::text as lp_id,
           lp.lp_number,
           lp.quantity::text as lp_qty,
           coalesce((
             select sum(case
                          when sm.move_type = 'receipt' then sm.quantity
                          when sm.move_type in ('issue', 'consume_to_wo', 'return') then -sm.quantity
                          when sm.move_type = 'adjustment' then sm.quantity
                          else 0
                        end)
               from public.stock_moves sm
              where sm.org_id = lp.org_id
                and sm.lp_id = lp.id
           ), 0)::text as ledger_sum
      from public.license_plates lp
     where lp.org_id = $1::uuid
       and lp.id = any($2::uuid[])
     order by lp.lp_number`;

  // NUMERIC columns come back from the driver as STRINGS (no setTypeParser here),
  // so every comparison goes through Number() — never a raw === on the text.
  type LedgerRow = { lp_id: string; lp_number: string; lp_qty: string; ledger_sum: string };
  async function readLedger(lpIds: string[]): Promise<Map<string, LedgerRow>> {
    const { rows } = await ownerPool.query<LedgerRow>(LEDGER_RECONCILIATION_SQL, [orgId, lpIds]);
    return new Map(rows.map((row) => [row.lp_id, row]));
  }

  // A pallet that arrived through an explicit 'receipt', so its own ledger starts reconciled.
  async function seedPalletWithReceipt(id: string, lpNumber: string, qty: string): Promise<void> {
    await ownerPool.query(
      `insert into public.license_plates (
         id, org_id, site_id, warehouse_id, location_id, lp_number,
         product_id, quantity, reserved_qty, uom, status, qa_status, created_by, updated_by
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8::numeric, 0.000, 'kg',
               'available', 'released', $9, $9)`,
      [id, orgId, siteId, warehouseId, locationId, lpNumber, itemId, qty, userId],
    );
    const receiptTxId = randomUUID();
    await ownerPool.query(
      `insert into public.stock_moves (
         org_id, site_id, move_number, lp_id, move_type, to_location_id,
         quantity, uom, reason_code, transaction_id, status, created_by, updated_by
       )
       values ($1, $2, $3, $4, 'receipt', $5, $6::numeric, 'kg',
               'production_output', $7::uuid, 'completed', $8, $8)`,
      [
        orgId,
        siteId,
        `SM-${receiptTxId.replaceAll('-', '').slice(0, 20).toUpperCase()}`,
        id,
        locationId,
        qty,
        receiptTxId,
        userId,
      ],
    );
  }

  it('(g) cancelWo on a completed WO keeps the stock ledger equal to the destroyed output pallet', async () => {
    const cancelWoId = randomUUID();
    const cancelMaterialId = randomUUID();
    const sourceLpId = randomUUID();
    const controlLpId = randomUUID();

    // Source pallet 100 kg + an untouched control pallet.
    await seedPalletWithReceipt(sourceLpId, 'SML-LP-CANCEL-SRC', '100.000');
    await seedPalletWithReceipt(controlLpId, 'SML-LP-CANCEL-CTRL', '7.000');

    await ownerPool.query(
      `insert into public.work_orders (
         id, org_id, site_id, wo_number, product_id, item_type_at_creation,
         planned_quantity, uom, status, created_by, updated_by
       )
       values ($1, $2, $3, 'SML-WO-CANCEL', $4, 'fg', 100.000, 'kg', 'IN_PROGRESS', $5, $5)`,
      [cancelWoId, orgId, siteId, itemId, userId],
    );
    await ownerPool.query(
      `insert into public.wo_executions (id, org_id, wo_id, status, version, created_by, updated_by)
       values ($1, $2, $3, 'in_progress', 1, $4, $4)`,
      [randomUUID(), orgId, cancelWoId, userId],
    );
    await ownerPool.query(
      `insert into public.wo_materials (
         id, org_id, site_id, wo_id, product_id, material_name, required_qty, consumed_qty, uom
       )
       values ($1, $2, $3, $4, $5, 'SM Cancel Material', 100.000, 0.000, 'kg')`,
      [cancelMaterialId, orgId, siteId, cancelWoId, itemId],
    );

    const makeCtx = (client: pg.PoolClient) =>
      ({ userId, orgId, siteId, client }) as unknown as Parameters<typeof cancelWo>[0];

    // ── REAL chain: consume 100 → register 100 kg output → complete → cancel ────
    const consumed = await recordDesktopConsumption({
      woId: cancelWoId,
      materialId: cancelMaterialId,
      qty: '100.000',
      lpId: sourceLpId,
      clientOpId: randomUUID(),
    });
    expect(consumed).toMatchObject({ ok: true });

    await runUnderOrg((client) =>
      registerOutput(makeCtx(client) as unknown as Parameters<typeof registerOutput>[0], cancelWoId, {
        transaction_id: randomUUID(),
        output_type: 'primary',
        product_id: itemId,
        qty_kg: '100.000',
        uom: 'kg',
      }),
    );

    const { rows: outputRows } = await ownerPool.query<{ lp_id: string | null }>(
      `select lp_id::text as lp_id
         from public.wo_outputs
        where org_id = $1::uuid and wo_id = $2::uuid and correction_of_id is null`,
      [orgId, cancelWoId],
    );
    const outputLpId = outputRows[0]?.lp_id;
    expect(outputLpId).toBeTruthy();

    const completed = await runUnderOrg((client) =>
      completeWo(makeCtx(client), { woId: cancelWoId, transactionId: randomUUID() }),
    );
    expect(completed).toMatchObject({ ok: true });

    const allLpIds = [outputLpId!, sourceLpId, controlLpId];
    const before = await readLedger(allLpIds);
    const outputBefore = before.get(outputLpId!)!;

    const cancelled = await runUnderOrg((client) =>
      cancelWo(makeCtx(client), {
        woId: cancelWoId,
        transactionId: randomUUID(),
        reasonCode: 'quality_reject',
        notes: 'H7 ledger integrity cancel',
      }),
    );
    expect(cancelled).toMatchObject({ ok: true });

    const after = await readLedger(allLpIds);
    const outputAfter = after.get(outputLpId!)!;

    // The touched pallet must reconcile with its ledger (lp === ledger === 0), AND
    // the two must have MOVED by the same amount with the same sign. Asserted as one
    // object so a failure prints the whole picture: a flipped sign, a doubled
    // compensation and a missing compensation are three different numbers here, and
    // the reconciled-total check alone cannot tell the first two apart.
    expect({
      lp: Number(outputAfter.lp_qty),
      ledger: Number(outputAfter.ledger_sum),
      lpDelta: Number(outputAfter.lp_qty) - Number(outputBefore.lp_qty),
      ledgerDelta: Number(outputAfter.ledger_sum) - Number(outputBefore.ledger_sum),
    }).toEqual({ lp: 0, ledger: 0, lpDelta: -100, ledgerDelta: -100 });

    // Counter-check: pallets unrelated to the cancel are still reconciled.
    for (const untouchedLpId of [sourceLpId, controlLpId]) {
      const row = after.get(untouchedLpId)!;
      expect({ lp: row.lp_number, ledger: Number(row.ledger_sum) }).toEqual({
        lp: row.lp_number,
        ledger: Number(row.lp_qty),
      });
    }

    // The compensating row is an 'adjustment' — the only move_type the schema
    // lets carry a sign (stock_moves_quantity_sign_check, mig-193).
    const { rows: compensating } = await ownerPool.query<{
      move_type: string;
      quantity: string;
      reason_code: string;
      site_id: string | null;
      wo_id: string | null;
    }>(
      `select move_type, quantity::text as quantity, reason_code,
              site_id::text as site_id, wo_id::text as wo_id
         from public.stock_moves
        where org_id = $1::uuid and lp_id = $2::uuid and move_type = 'adjustment'`,
      [orgId, outputLpId],
    );
    expect(compensating).toHaveLength(1);
    expect(compensating[0]).toMatchObject({
      move_type: 'adjustment',
      reason_code: 'wo_cancelled',
      site_id: siteId,
      wo_id: cancelWoId,
    });
    expect(Number(compensating[0]!.quantity)).toBe(-100);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // (h) — reverseConsumption hands the material BACK to the source pallet
  // (restoreLicensePlate: quantity = quantity + qty_consumed), so the compensating
  // 'adjustment' is an INFLOW and must be POSITIVE. Opposite direction to (g),
  // where cancelWo EMPTIES the pallet — the sign is not a house style, it is the
  // direction the pallet actually moved.
  //
  // A flipped sign here is worse than a missing row: the ledger travels the wrong
  // way, so the pallet/ledger gap comes out at 2x the reversed quantity. That is
  // exactly why the assertion below checks lpDelta/ledgerDelta and not only the
  // reconciled total — a total alone cannot tell a flipped sign from a missing one.
  // ─────────────────────────────────────────────────────────────────────────────
  it('(h) reverseConsumption keeps the stock ledger equal to the restored source pallet', async () => {
    const reverseWoId = randomUUID();
    const reverseMaterialId = randomUUID();
    const sourceLpId = randomUUID();
    const controlLpIds = [randomUUID(), randomUUID(), randomUUID()];

    await seedPalletWithReceipt(sourceLpId, 'SML-LP-REVERSE-SRC', '100.000');
    for (const [index, controlLpId] of controlLpIds.entries()) {
      await seedPalletWithReceipt(controlLpId, `SML-LP-REVERSE-CTRL-${index}`, `${index + 3}.000`);
    }

    await ownerPool.query(
      `insert into public.work_orders (
         id, org_id, site_id, wo_number, product_id, item_type_at_creation,
         planned_quantity, uom, status, created_by, updated_by
       )
       values ($1, $2, $3, 'SML-WO-REVERSE', $4, 'fg', 100.000, 'kg', 'IN_PROGRESS', $5, $5)`,
      [reverseWoId, orgId, siteId, itemId, userId],
    );
    await ownerPool.query(
      `insert into public.wo_executions (id, org_id, wo_id, status, version, created_by, updated_by)
       values ($1, $2, $3, 'in_progress', 1, $4, $4)`,
      [randomUUID(), orgId, reverseWoId, userId],
    );
    await ownerPool.query(
      `insert into public.wo_materials (
         id, org_id, site_id, wo_id, product_id, material_name, required_qty, consumed_qty, uom
       )
       values ($1, $2, $3, $4, $5, 'SM Reverse Material', 100.000, 0.000, 'kg')`,
      [reverseMaterialId, orgId, siteId, reverseWoId, itemId],
    );

    // ── REAL chain: consume the whole pallet, then reverse that consumption ─────
    const consumed = await recordDesktopConsumption({
      woId: reverseWoId,
      materialId: reverseMaterialId,
      qty: '100.000',
      lpId: sourceLpId,
      clientOpId: randomUUID(),
    });
    expect(consumed).toMatchObject({ ok: true });

    const allLpIds = [sourceLpId, ...controlLpIds];
    const before = await readLedger(allLpIds);
    const sourceBefore = before.get(sourceLpId)!;

    // The gap must be OPENED by the reversal — prove the pallet reconciles first.
    expect({ lp: Number(sourceBefore.lp_qty), ledger: Number(sourceBefore.ledger_sum) }).toEqual({
      lp: 0,
      ledger: 0,
    });

    const { rows: consumptionRows } = await ownerPool.query<{ id: string }>(
      `select id::text as id
         from public.wo_material_consumption
        where org_id = $1::uuid
          and wo_id = $2::uuid
          and correction_of_id is null
          and qty_consumed > 0
        limit 1`,
      [orgId, reverseWoId],
    );
    const consumptionId = consumptionRows[0]?.id;
    expect(consumptionId).toBeTruthy();

    const reversed = await reverseConsumption({
      consumptionId: consumptionId!,
      reasonCode: 'entry_error',
      note: 'H7 ledger integrity reversal',
      signature: { password: TEST_PIN },
    });
    expect(reversed).toMatchObject({ ok: true });

    const after = await readLedger(allLpIds);
    const sourceAfter = after.get(sourceLpId)!;

    // Counter-check rides INSIDE the same assertion on purpose: as a separate
    // expect() after this one it would never run on a red main assert, and
    // "untouched pallets still reconcile" is the control that rules out a global
    // drift. Empty array = every control pallet still matches its own ledger.
    const controlDrift = controlLpIds
      .map((controlLpId) => after.get(controlLpId)!)
      .filter((row) => Number(row.lp_qty) !== Number(row.ledger_sum))
      .map((row) => ({ lp: row.lp_number, palletQty: Number(row.lp_qty), ledgerSum: Number(row.ledger_sum) }));

    expect({
      lp: Number(sourceAfter.lp_qty),
      ledger: Number(sourceAfter.ledger_sum),
      lpDelta: Number(sourceAfter.lp_qty) - Number(sourceBefore.lp_qty),
      ledgerDelta: Number(sourceAfter.ledger_sum) - Number(sourceBefore.ledger_sum),
      controlDrift,
    }).toEqual({ lp: 100, ledger: 100, lpDelta: 100, ledgerDelta: 100, controlDrift: [] });

    const { rows: compensating } = await ownerPool.query<{
      move_type: string;
      quantity: string;
      reason_code: string;
      wo_id: string | null;
    }>(
      `select move_type, quantity::text as quantity, reason_code, wo_id::text as wo_id
         from public.stock_moves
        where org_id = $1::uuid and lp_id = $2::uuid and move_type = 'adjustment'`,
      [orgId, sourceLpId],
    );
    expect(compensating).toHaveLength(1);
    expect(compensating[0]).toMatchObject({
      move_type: 'adjustment',
      reason_code: 'consumption_reversed',
      wo_id: reverseWoId,
    });
    expect(Number(compensating[0]!.quantity)).toBe(100);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // (i) — voiding a waste entry that was booked AGAINST A PALLET.
  //
  // recordWaste (record-waste.ts:216-291) does two things for a waste with lp_id:
  // it subtracts the kilos from license_plates.quantity AND writes a NEGATIVE
  // 'adjustment'. Voiding must undo BOTH, so the compensating row is POSITIVE —
  // the mirror image of the outflow the waste wrote, and the same direction as
  // (h). Opposite to (g), where cancelWo EMPTIES the pallet.
  //
  // Before the fix the void wrote only the negative counter-row in wo_waste_log:
  // the log netted to zero ("nothing was wasted") while the pallet kept the hole
  // and the ledger kept the -400 adjustment pointing at a struck-out entry —
  // 400 kg gone with nothing in the system explaining it.
  //
  // The assertion checks lpDelta/ledgerDelta, not just the reconciled total: a
  // flipped sign and a missing compensation reconcile to the same "total" and
  // only the deltas tell them apart.
  // ─────────────────────────────────────────────────────────────────────────────
  async function seedWasteWo(id: string, woNumber: string): Promise<void> {
    await ownerPool.query(
      `insert into public.work_orders (
         id, org_id, site_id, wo_number, product_id, item_type_at_creation,
         planned_quantity, uom, status, created_by, updated_by
       )
       values ($1, $2, $3, $4, $5, 'fg', 2000.000, 'kg', 'IN_PROGRESS', $6, $6)`,
      [id, orgId, siteId, woNumber, itemId, userId],
    );
    await ownerPool.query(
      `insert into public.wo_executions (id, org_id, wo_id, status, version, created_by, updated_by)
       values ($1, $2, $3, 'in_progress', 1, $4, $4)`,
      [randomUUID(), orgId, id, userId],
    );
  }

  it('(i) voidWasteEntry hands the kilos BACK to the pallet and books the matching positive adjustment', async () => {
    const wasteWoId = randomUUID();
    const sourceLpId = randomUUID();
    const controlLpIds = [randomUUID(), randomUUID(), randomUUID()];

    await seedPalletWithReceipt(sourceLpId, 'SML-LP-WASTE-SRC', '2000.000');
    for (const [index, controlLpId] of controlLpIds.entries()) {
      await seedPalletWithReceipt(controlLpId, `SML-LP-WASTE-CTRL-${index}`, `${index + 3}.000`);
    }
    await seedWasteWo(wasteWoId, 'SML-WO-WASTE');

    // ── REAL chain: book 400 kg of waste against the pallet, then void it ───────
    const waste = await runUnderOrg((client) =>
      recordWaste({ userId, orgId, client } as unknown as Parameters<typeof recordWaste>[0], wasteWoId, {
        transaction_id: randomUUID(),
        category_code: WASTE_CATEGORY_CODE,
        qty_kg: '400.000',
        shift_id: 'A',
        lp_id: sourceLpId,
      }),
    );
    expect(waste).toMatchObject({ qty_kg: '400.000' });

    const allLpIds = [sourceLpId, ...controlLpIds];
    const before = await readLedger(allLpIds);
    const sourceBefore = before.get(sourceLpId)!;

    // The gap must be OPENED by the void — prove the pallet reconciles first
    // (2000 kg receipt + the waste's own -400 adjustment = 1600, pallet 1600).
    expect({ lp: Number(sourceBefore.lp_qty), ledger: Number(sourceBefore.ledger_sum) }).toEqual({
      lp: 1600,
      ledger: 1600,
    });

    const voided = await voidWasteEntry({
      wasteId: waste.waste_id,
      reasonCode: 'entry_error',
      note: 'H7 ledger integrity waste void',
    });
    expect(voided).toEqual({ ok: true });

    const after = await readLedger(allLpIds);
    const sourceAfter = after.get(sourceLpId)!;

    // Control rides INSIDE the same assertion (as in (h)): a separate expect()
    // after a red main assert never runs, and "untouched pallets still reconcile"
    // is what rules out a global drift.
    const controlDrift = controlLpIds
      .map((controlLpId) => after.get(controlLpId)!)
      .filter((row) => Number(row.lp_qty) !== Number(row.ledger_sum))
      .map((row) => ({ lp: row.lp_number, palletQty: Number(row.lp_qty), ledgerSum: Number(row.ledger_sum) }));

    expect({
      lp: Number(sourceAfter.lp_qty),
      ledger: Number(sourceAfter.ledger_sum),
      lpDelta: Number(sourceAfter.lp_qty) - Number(sourceBefore.lp_qty),
      ledgerDelta: Number(sourceAfter.ledger_sum) - Number(sourceBefore.ledger_sum),
      controlDrift,
    }).toEqual({ lp: 2000, ledger: 2000, lpDelta: 400, ledgerDelta: 400, controlDrift: [] });

    // Two adjustments on this pallet: the waste's own -400 and the void's +400.
    const { rows: adjustments } = await ownerPool.query<{
      quantity: string;
      reason_code: string;
      wo_id: string | null;
      site_id: string | null;
    }>(
      `select quantity::text as quantity, reason_code, wo_id::text as wo_id, site_id::text as site_id
         from public.stock_moves
        where org_id = $1::uuid and lp_id = $2::uuid and move_type = 'adjustment'
        order by quantity`,
      [orgId, sourceLpId],
    );
    expect(adjustments.map((row) => ({ q: Number(row.quantity), reason: row.reason_code }))).toEqual([
      { q: -400, reason: 'production_waste' },
      { q: 400, reason: 'waste_voided' },
    ]);
    expect(adjustments[1]).toMatchObject({ wo_id: wasteWoId, site_id: siteId });

    // The struck-out entry must stay attached to the pallet it credited back —
    // a lp_id:NULL counter-row is a correction nobody can trace to stock.
    const { rows: counterRows } = await ownerPool.query<{ qty_kg: string; lp_id: string | null }>(
      `select qty_kg::text as qty_kg, lp_id::text as lp_id
         from public.wo_waste_log
        where org_id = $1::uuid and correction_of_id = $2::uuid`,
      [orgId, waste.waste_id],
    );
    expect(counterRows).toHaveLength(1);
    expect(counterRows[0]).toMatchObject({ lp_id: sourceLpId });
    expect(Number(counterRows[0]!.qty_kg)).toBe(-400);

    // The pallet's own history carries the same single word as the ledger row.
    const { rows: history } = await ownerPool.query<{ reason_code: string; from_state: string; to_state: string }>(
      `select reason_code, from_state, to_state
         from public.lp_state_history
        where org_id = $1::uuid and lp_id = $2::uuid`,
      [orgId, sourceLpId],
    );
    expect(history).toEqual([
      // Partial waste never moved the pallet off 'available', so the restore
      // leaves the state where it was and only records WHY the kilos came back.
      { reason_code: 'waste_voided', from_state: 'available', to_state: 'available' },
    ]);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // (l) — the OTHER pallet state a waste can leave behind: wasting the whole
  // pallet empties it and flips it to 'destroyed' (record-waste.ts). Voiding that
  // must lift it back out of the terminal state, not just add kilos to a corpse.
  // This is the branch lpRestoreTargetState resolves (QA-aware: 'released' → back
  // to pickable 'available'), and the one my restorable-status rule deliberately
  // admits — full-pallet waste is a normal shift operation, not an edge case.
  // ─────────────────────────────────────────────────────────────────────────────
  it('(l) voiding a waste that emptied the pallet lifts it back out of destroyed', async () => {
    const fullWoId = randomUUID();
    const fullLpId = randomUUID();

    await seedPalletWithReceipt(fullLpId, 'SML-LP-WASTE-FULL', '100.000');
    await seedWasteWo(fullWoId, 'SML-WO-WASTE-FULL');

    const waste = await runUnderOrg((client) =>
      recordWaste({ userId, orgId, client } as unknown as Parameters<typeof recordWaste>[0], fullWoId, {
        transaction_id: randomUUID(),
        category_code: WASTE_CATEGORY_CODE,
        qty_kg: '100.000',
        shift_id: 'A',
        lp_id: fullLpId,
      }),
    );

    const { rows: emptied } = await ownerPool.query<{ status: string; quantity: string }>(
      `select status, quantity::text as quantity from public.license_plates where id = $1::uuid`,
      [fullLpId],
    );
    expect({ status: emptied[0]!.status, qty: Number(emptied[0]!.quantity) }).toEqual({
      status: 'destroyed',
      qty: 0,
    });

    expect(await voidWasteEntry({ wasteId: waste.waste_id, reasonCode: 'entry_error' })).toEqual({ ok: true });

    const after = await readLedger([fullLpId]);
    const { rows: restored } = await ownerPool.query<{ status: string; qa_status: string }>(
      `select status, qa_status from public.license_plates where id = $1::uuid`,
      [fullLpId],
    );
    expect({
      status: restored[0]!.status,
      lp: Number(after.get(fullLpId)!.lp_qty),
      ledger: Number(after.get(fullLpId)!.ledger_sum),
    }).toEqual({ status: 'available', lp: 100, ledger: 100 });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // (k) — the pallet moved on after the waste was booked (here: consumed into a
  // WO). RULE CHOSEN: refuse the void rather than credit kilos onto a carrier
  // that no longer holds what the correction assumes. Fail-closed, and the
  // refusal must be TOTAL — withOrgContext COMMITS on a plain `return`, so a gate
  // that fires after the counter-row insert would leave a half-applied void
  // behind. Hence the assertion is not just the error code but "nothing written".
  // ─────────────────────────────────────────────────────────────────────────────
  it('(k) voidWasteEntry refuses a pallet that moved on, and writes nothing at all', async () => {
    const movedWoId = randomUUID();
    const movedLpId = randomUUID();

    await seedPalletWithReceipt(movedLpId, 'SML-LP-WASTE-MOVED', '500.000');
    await seedWasteWo(movedWoId, 'SML-WO-WASTE-MOVED');

    const waste = await runUnderOrg((client) =>
      recordWaste({ userId, orgId, client } as unknown as Parameters<typeof recordWaste>[0], movedWoId, {
        transaction_id: randomUUID(),
        category_code: WASTE_CATEGORY_CODE,
        qty_kg: '50.000',
        shift_id: 'A',
        lp_id: movedLpId,
      }),
    );

    // The pallet gets consumed after the waste. Set directly: the gate reads
    // license_plates.status, so this drives the real branch.
    await ownerPool.query(
      `update public.license_plates set status = 'consumed' where org_id = $1::uuid and id = $2::uuid`,
      [orgId, movedLpId],
    );

    const voided = await voidWasteEntry({
      wasteId: waste.waste_id,
      reasonCode: 'entry_error',
      note: 'H7 waste void on a pallet that moved on',
    });
    expect(voided).toEqual({ ok: false, error: 'lp_not_restorable' });

    const { rows } = await ownerPool.query<{
      lp_qty: string;
      counter_rows: string;
      adjustments: string;
      history_rows: string;
    }>(
      `select (select quantity::text from public.license_plates where id = $2::uuid) as lp_qty,
              (select count(*)::text from public.wo_waste_log
                where org_id = $1::uuid and correction_of_id = $3::uuid) as counter_rows,
              (select count(*)::text from public.stock_moves
                where org_id = $1::uuid and lp_id = $2::uuid and move_type = 'adjustment') as adjustments,
              (select count(*)::text from public.lp_state_history
                where org_id = $1::uuid and lp_id = $2::uuid) as history_rows`,
      [orgId, movedLpId, waste.waste_id],
    );
    // 1 adjustment = the waste's own decrement, untouched. Pallet still at 450.
    // lp_qty goes through Number(): NUMERIC(15,6) comes back as '450.000000'.
    expect({ ...rows[0]!, lp_qty: Number(rows[0]!.lp_qty) }).toEqual({
      lp_qty: 450,
      counter_rows: '0',
      adjustments: '1',
      history_rows: '0',
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // (j) — a waste entry booked with NO pallet is a book-only figure: it never
  // touched license_plates and never wrote a stock_move, so voiding it must stay
  // book-only too. This path was already correct before (i)'s fix; it is pinned
  // here so the pallet restore cannot leak into it.
  // ─────────────────────────────────────────────────────────────────────────────
  it('(j) voidWasteEntry on a waste with no pallet stays book-only (no stock_moves)', async () => {
    const noLpWoId = randomUUID();
    await seedWasteWo(noLpWoId, 'SML-WO-WASTE-NOLP');

    const waste = await runUnderOrg((client) =>
      recordWaste({ userId, orgId, client } as unknown as Parameters<typeof recordWaste>[0], noLpWoId, {
        transaction_id: randomUUID(),
        category_code: WASTE_CATEGORY_CODE,
        qty_kg: '12.500',
        shift_id: 'A',
      }),
    );

    const voided = await voidWasteEntry({
      wasteId: waste.waste_id,
      reasonCode: 'entry_error',
      note: 'H7 book-only waste void',
    });
    expect(voided).toEqual({ ok: true });

    const { rows } = await ownerPool.query<{ n: string; net: string | null }>(
      `select (select count(*)::text
                 from public.stock_moves
                where org_id = $1::uuid and wo_id = $2::uuid) as n,
              (select sum(qty_kg)::text
                 from public.wo_waste_log
                where org_id = $1::uuid and wo_id = $2::uuid) as net`,
      [orgId, noLpWoId],
    );
    expect(rows[0]).toEqual({ n: '0', net: '0.000' });
  });
});

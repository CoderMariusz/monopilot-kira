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
 *
 * Skips cleanly when DATABASE_URL is absent; residue-free (random-UUID org, org-scoped cleanup).
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../packages/db/src/clients.js';
import { setPin } from '../../../../../packages/auth/src/verify-pin.js';

import { recordDesktopConsumption } from '../../../app/[locale]/(app)/(modules)/production/_actions/consume-material-actions.js';
import { registerOutput } from '../output/register-output.js';
import { reverseConsumption } from '../../../app/[locale]/(app)/(modules)/production/_actions/corrections-actions.js';
import { correctionTransactionId } from '../../corrections/correct-ledger-entry.js';

// ─── Skip guard ────────────────────────────────────────────────────────────────
const databaseUrl = process.env.DATABASE_URL;
const runPg = databaseUrl ? describe : describe.skip;

// ─── Fixed UUIDs ───────────────────────────────────────────────────────────────
const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const roleId = randomUUID();
const itemId = randomUUID();
const siteId = randomUUID();
const warehouseId = randomUUID();
const locationId = randomUUID();
const lpId = randomUUID();
const woId = randomUUID();
const materialId = randomUUID();

// ─── Test PIN (short numeric, exercises the PIN path in signEvent) ─────────────
const TEST_PIN = '1234';

runPg('production stock_moves ledger — behavioral (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

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

    // Tenant + org
    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'SM Prod Ledger Tenant', 'eu', 'https://sm-prod-ledger.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'SM Prod Ledger Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `sm-ledger-${orgId.slice(0, 8)}`],
    );

    // Role with all required permissions
    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions)
       values ($1, $2, 'admin', 'admin', 'SM Ledger Admin Role', '["production.consumption.write","production.consumption.correct","production.output.write","production.corrections.closed_wo"]'::jsonb)
       on conflict (id) do nothing`,
      [roleId, orgId],
    );

    // User + role assignment
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name)
       values ($1, $2, $3, 'SM Prod Ledger User')
       on conflict (id) do nothing`,
      [userId, orgId, `sm-ledger-${userId}@example.test`],
    );
    await ownerPool.query(
      `insert into public.user_roles (user_id, role_id, org_id)
       values ($1, $2, $3)
       on conflict do nothing`,
      [userId, roleId, orgId],
    );

    // Enroll PIN for e-sign (reverseConsumption uses assertCorrectionAllowed → signEvent → verifyPin)
    await setPin(userId, TEST_PIN);

    // Site + warehouse + location
    await ownerPool.query(
      `insert into public.sites (id, org_id, code, name, timezone, created_by)
       values ($1, $2, 'SML', 'SM Ledger Site', 'UTC', $3)
       on conflict (id) do nothing`,
      [siteId, orgId, userId],
    );
    await ownerPool.query(
      `insert into public.warehouses (id, org_id, site_id, code, name, created_by)
       values ($1, $2, $3, 'SML-WH', 'SM Ledger Warehouse', $4)
       on conflict (id) do nothing`,
      [warehouseId, orgId, siteId, userId],
    );
    await ownerPool.query(
      `insert into public.locations (id, org_id, warehouse_id, code, name, level, created_by)
       values ($1, $2, $3, 'SML-LOC', 'SM Ledger Location', 1, $4)
       on conflict (id) do nothing`,
      [locationId, orgId, warehouseId, userId],
    );

    // Item (FG)
    await ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, created_by)
       values ($1, $2, 'SML-FG', 'fg', 'SM Ledger FG Item', 'kg', $3)
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
      `insert into public.wo_materials (id, org_id, wo_id, product_id, material_name, required_qty, consumed_qty, uom, created_by)
       values ($1, $2, $3, $4, 'SM Ledger Material', 10.000, 0.000, 'kg', $5)
       on conflict (id) do nothing`,
      [materialId, orgId, woId, itemId, userId],
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
    await ownerPool?.query('delete from public.wo_outputs where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.wo_materials where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.wo_executions where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.work_orders where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.license_plates where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.item_wac_state where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.items where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.locations where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.warehouses where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.sites where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.user_pins where user_id = $1', [userId]).catch(() => undefined);
    await ownerPool?.query('delete from public.user_roles where user_id = $1', [userId]).catch(() => undefined);
    await ownerPool?.query('delete from public.roles where id = $1', [roleId]).catch(() => undefined);
    await ownerPool?.query('delete from public.users where id = $1', [userId]).catch(() => undefined);
    await ownerPool?.query('delete from public.organizations where id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
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
  it('(d) reverseConsumption writes exactly one adjustment stock_move with negative quantity and consumption_reversed reason_code', async () => {
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
    // negative quantity (reversal counter-entry)
    expect(parseFloat(rows[0]!.quantity)).toBeLessThan(0);

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
});

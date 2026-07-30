/**
 * 08-Production E1 — REAL DB-backed integration tests for the WO lifecycle.
 *
 * Exercises the state machine + transition services through the real
 * withOrgContext app-role transaction and RLS. Requires DATABASE_URL; skipped in
 * no-DB CI.
 *
 * Coverage (orchestrator GATE list):
 *   - each transition: start → pause → resume → complete → close (+ cancel)
 *   - optimistic-lock conflict (two concurrent transitions, exactly one wins)
 *   - invalid-transition reject (pause a planned WO → 409)
 *   - wo_outputs materialization at start (schedule_outputs → wo_outputs 1:1)
 *   - e-sign on close (supervisor PIN, e_sign_log + paired audit_events row)
 *   - production.* outbox events emitted in-txn
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';

import { setPin } from '../../../../../packages/auth/src/verify-pin';
import { withOrgContext } from '../../auth/with-org-context';
import { startWo } from '../start-wo';
import { pauseWo, resumeWo } from '../pause-resume-wo';
import { completeWo, cancelWo } from '../complete-cancel-wo';
import { closeWo } from '../close-wo';
import { applyTransition } from '../wo-state-machine';
import { WoConcurrentModificationError, type ProductionContext } from '../shared';
import { ownerQueryWithInferredOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from '../../../tests/helpers/owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
// let: the seed_system_roles_on_org_insert trigger (post-185) auto-creates the
// org's 'admin'-slug role on org insert — baseSeed adopts that row's id instead
// of colliding on roles_org_id_slug_key with a fresh uuid.
let roleId = randomUUID();
const fgItemId = randomUUID();
const bomHeaderId = randomUUID();
const factorySpecId = randomUUID();
const SUPERVISOR_PIN = '824193';

let owner: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner);
}

/**
 * Run a seed statement inside a real app.set_org_context transaction — some
 * tables (e.g. public.product, whose fa-allergen auto-refresh trigger calls
 * app.current_org_id()) reject context-less owner inserts. Mirrors the
 * withOrgContext token flow: register the token (owner), set_org_context in-txn.
 */
async function withSeedOrgContext<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const token = randomUUID();
  await owner.query(`insert into app.session_org_contexts (session_token, org_id) values ($1, $2)`, [token, orgId]);
  const c = await owner.connect();
  try {
    await c.query('begin');
    await c.query(`select app.set_org_context($1::uuid, $2::uuid)`, [token, orgId]);
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (err) {
    await c.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    c.release();
    await owner
      .query(`delete from app.session_org_contexts where session_token = $1`, [token])
      .catch(() => undefined);
  }
}

async function baseSeed(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'E1 IT Tenant', 'eu', 'https://e1-it.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'E1 IT Org', 'bakery') on conflict (id) do nothing`,
    [orgId, tenantId],
  );
  // org-admin role: the migration-185 backfill ran at migrate-time BEFORE this org
  // existed, so seed the production.* grants explicitly on this role.
  const roleRow = await owner.query<{ id: string }>(
    `insert into public.roles (id, org_id, code, slug, name, permissions)
     values ($1, $2, 'admin', 'admin', 'E1 Admin', '[]'::jsonb)
     on conflict (org_id, slug) do update set name = excluded.name
     returning id`,
    [roleId, orgId],
  );
  roleId = roleRow.rows[0]?.id ?? roleId;
  await owner.query(`select public.seed_production_permissions_for_org($1)`, [orgId]);
  // Parallel migration seeds this in production; keep the code-only integration
  // setup aligned so cancel RBAC can be asserted before that migration lands here.
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values ($1, 'production.wo.cancel')
     on conflict do nothing`,
    [roleId],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, $4, 'E1 Action User', $3) on conflict (id) do nothing`,
    [userId, orgId, roleId, `e1-action+${userId.slice(0, 8)}@example.test`],
  );
  await owner.query(
    `insert into public.user_roles (org_id, user_id, role_id)
     values ($1, $2, $3) on conflict do nothing`,
    [orgId, userId, roleId],
  );
  // BOM header + line so the T-025 snapshot service can freeze a recipe at start.
  // approved_by/approved_at: status 'active' now requires them
  // (bom_headers_approved_status_requires_approval_check); product_id now FKs
  // public.product(org_id, product_code) — both post-suite migrations, so seed
  // a real NPD product aggregate row first (product_id IS the product_code).
  const bomProductCode = `FG-E1-${bomHeaderId.slice(0, 8)}`;
  await withSeedOrgContext((c) =>
    ownerQueryWithInferredOrgContext(c,
      `insert into public.product (org_id, product_code, created_by_user)
       values ($1, $2, $3) on conflict do nothing`,
      [orgId, bomProductCode, userId],
    ),
  );
  // Insert as draft + lines first, THEN activate: the BOM immutability trigger
  // (post-suite migration) rejects line inserts under an approved/active header.
  await owner.query(
    `insert into public.bom_headers (id, org_id, product_id, origin_module, status, version)
     values ($1, $2, $3, 'technical', 'draft', 1) on conflict (id) do nothing`,
    [bomHeaderId, orgId, bomProductCode],
  );
  await owner.query(
    `insert into public.bom_lines (org_id, bom_header_id, line_no, component_code, quantity, uom)
     values ($1, $2, 1, 'RM-E1-A', 1.000, 'kg')`,
    [orgId, bomHeaderId],
  );
  await owner.query(
    `update public.bom_headers
        set status = 'active', approved_by = $2, approved_at = now()
      where id = $1`,
    [bomHeaderId, userId],
  );
  // The released WO snapshot must bind to a real, same-org factory spec whose
  // BOM matches active_bom_header_id. A random UUID here makes every legal
  // start fail in validateReleasedSnapshotBindings before lifecycle behavior
  // is exercised.
  await owner.query(
    `insert into public.items
       (id, org_id, item_code, item_type, name, uom_base, created_by)
     values ($1, $2, $3, 'fg', 'E1 Finished Good', 'kg', $4)
     on conflict (id) do nothing`,
    [fgItemId, orgId, `FG-E1-ITEM-${fgItemId.slice(0, 8)}`, userId],
  );
  await owner.query(
    `insert into public.factory_specs
       (id, org_id, fg_item_id, spec_code, version, status, source,
        bom_header_id, bom_version, approved_by, approved_at, created_by)
     values ($1, $2, $3, $4, 1, 'approved_for_factory', 'technical',
             $5, 1, $6, pg_catalog.now(), $6)
     on conflict (id) do nothing`,
    [
      factorySpecId,
      orgId,
      fgItemId,
      `FS-E1-${factorySpecId.slice(0, 8)}`,
      bomHeaderId,
      userId,
    ],
  );
  // Seed the supervisor PIN for the close e-sign (argon2id via setPin).
  await setPin(userId, SUPERVISOR_PIN);
}

/** Create a fresh WO (with its schedule_outputs + materials) and return its id. */
async function seedWorkOrder(opts?: { withSegregation?: boolean }): Promise<{ woId: string; componentId: string }> {
  const woId = randomUUID();
  const productId = fgItemId;
  const componentId = randomUUID();
  const allergen = opts?.withSegregation ? `'{"segregation_required": true}'::jsonb` : 'null';
  await owner.query(
    `insert into public.work_orders
       (id, org_id, wo_number, product_id, item_type_at_creation, planned_quantity, uom,
        status, active_bom_header_id, active_factory_spec_id, allergen_profile_snapshot)
     values ($1, $2, $3, $4, 'fg', 100.000, 'kg', 'RELEASED', $5, $6, ${allergen})`,
    [woId, orgId, `WO-${woId.slice(0, 8)}`, productId, bomHeaderId, factorySpecId],
  );
  // One primary + one byproduct schedule_output (planning projection → wo_outputs).
  await owner.query(
    `insert into public.schedule_outputs
       (org_id, planned_wo_id, product_id, output_role, expected_qty, uom, allocation_pct)
     values ($1, $2, $3, 'primary', 90.000, 'kg', 90.00),
            ($1, $2, $4, 'byproduct', 10.000, 'kg', 10.00)`,
    [orgId, woId, productId, randomUUID()],
  );
  // One BOM-snapshot consumption component (for completion / progress reads).
  await owner.query(
    `insert into public.wo_materials
       (org_id, wo_id, product_id, material_name, required_qty, consumed_qty, uom)
     values ($1, $2, $3, 'RM-E1-A', 90.000, 0.000, 'kg')`,
    [orgId, woId, componentId],
  );
  return { woId, componentId };
}

/**
 * Yield-gate arrange step (post-suite gate): completeWo now requires a primary
 * wo_output with qty_kg > 0 — simulate the operator's register-output by
 * setting the materialized primary output's actual quantity.
 */
async function markPrimaryOutputRegistered(woId: string): Promise<void> {
  await owner.query(
    `update public.wo_outputs set qty_kg = 90.000
      where org_id = $1 and wo_id = $2 and output_type = 'primary'`,
    [orgId, woId],
  );
}

/** Post the matching 90 kg material consumption required by the strict-close gate. */
async function postBalancedMaterialConsumption(woId: string, componentId: string): Promise<void> {
  await owner.query(
    `insert into public.wo_material_consumption
       (org_id, transaction_id, wo_id, component_id, lp_id, qty_consumed, uom,
        fefo_adherence_flag, consumed_at)
     values ($1, $2, $3, $4, $5, 90.000, 'kg', true, pg_catalog.now())`,
    [orgId, randomUUID(), woId, componentId, randomUUID()],
  );
  await owner.query(
    `update public.wo_materials
        set consumed_qty = 90.000
      where org_id = $1 and wo_id = $2 and product_id = $3`,
    [orgId, woId, componentId],
  );
}

/** Seed a downtime category for the pause side-effect. */
async function seedDowntimeCategory(): Promise<string> {
  const id = randomUUID();
  await owner.query(
    `insert into public.downtime_categories (id, org_id, code, name, kind)
     values ($1, $2, $3, 'Mechanical', 'unplanned')`,
    [id, orgId, `DT-${id.slice(0, 6)}`],
  );
  return id;
}

async function cleanup(): Promise<void> {
  for (const t of [
    'wo_events',
    'wo_executions',
    'wo_outputs',
    'wo_material_consumption',
    'downtime_events',
    'downtime_categories',
    'schedule_outputs',
    'wo_materials',
    'work_orders',
    'outbox_events',
    'e_sign_log',
    'audit_events',
    'factory_specs',
    'bom_snapshots',
    'bom_lines',
    'bom_headers',
    'items',
  ]) {
    await owner.query(`delete from public.${t} where org_id = $1`, [orgId]).catch(() => undefined);
  }
}

async function outboxTypes(woId: string): Promise<string[]> {
  const res = await owner.query<{ event_type: string }>(
    `select event_type from public.outbox_events where org_id = $1 and aggregate_id = $2 order by id`,
    [orgId, woId],
  );
  return res.rows.map((r) => r.event_type);
}

async function waitForBlockedCasWaiters(expected: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const { rows } = await owner.query<{ waiter_count: number }>(
      `select count(*)::int as waiter_count
         from pg_catalog.pg_stat_activity
        where datname = pg_catalog.current_database()
          and pid <> pg_catalog.pg_backend_pid()
          and wait_event_type = 'Lock'
          and query like '%update public.wo_executions%'`,
    );
    if (Number(rows[0]?.waiter_count) >= expected) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  throw new Error(`expected ${expected} concurrent WO CAS waiters`);
}

run('08-production E1 — WO lifecycle (REAL DB integration)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- owner pool is test setup/assertion only; services use withOrgContext app_user + RLS
    owner = new pg.Pool({ connectionString: databaseUrl });
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = userId;
    process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;
    await cleanup().catch(() => undefined);
    await owner.query(`delete from public.user_pins where user_id = $1`, [userId]).catch(() => undefined);
    await owner.query(`delete from public.user_roles where user_id = $1`, [userId]).catch(() => undefined);
    await owner.query(`delete from public.users where id = $1`, [userId]).catch(() => undefined);
    await owner.query(`delete from public.roles where id = $1`, [roleId]).catch(() => undefined);
    await owner.query(`delete from public.organizations where id = $1`, [orgId]).catch(() => undefined);
    await owner.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await baseSeed();
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await owner.query(`delete from public.user_pins where user_id = $1`, [userId]).catch(() => undefined);
    await owner.query(`delete from public.user_roles where user_id = $1`, [userId]).catch(() => undefined);
    await owner.query(`delete from public.users where id = $1`, [userId]).catch(() => undefined);
    await owner.query(`delete from public.roles where id = $1`, [roleId]).catch(() => undefined);
    await owner.query(`delete from public.organizations where id = $1`, [orgId]).catch(() => undefined);
    await owner.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    delete process.env.NEXT_SERVER_ACTION_ORG_ID;
    await owner.end();
  });

  beforeEach(async () => {
    // Reset per-test transactional state (keep org/role/user/bom/pin).
    for (const t of [
      'wo_events',
      'wo_executions',
      'wo_outputs',
      'wo_material_consumption',
      'downtime_events',
      'downtime_categories',
      'schedule_outputs',
      'wo_materials',
      'work_orders',
      'outbox_events',
    ]) {
      await owner.query(`delete from public.${t} where org_id = $1`, [orgId]);
    }
    await owner.query(
      `insert into public.role_permissions (role_id, permission)
       values ($1, 'production.wo.cancel')
       on conflict do nothing`,
      [roleId],
    );
  });

  it('start materializes wo_outputs from schedule_outputs and emits production.wo.started', async () => {
    const { woId } = await seedWorkOrder();
    const result = await withOrgContext((ctx: ProductionContext) =>
      startWo(ctx, { woId, transactionId: randomUUID(), lineId: 'LINE-1', shiftId: 'A' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('start failed');
    expect(result.data.status).toBe('in_progress');
    expect(result.data.outputsMaterialized).toBe(2);

    const outputs = await owner.query<{ output_type: string; qty_kg: string }>(
      `select output_type, qty_kg
         from public.wo_outputs
        where org_id = $1 and wo_id = $2
        order by output_type`,
      [orgId, woId],
    );
    // planning 'byproduct' → production 'by_product'; 'primary' stays.
    expect(outputs.rows.map((r) => r.output_type).sort()).toEqual(['by_product', 'primary']);
    // Materialized rows are placeholders, not fabricated production output.
    expect(outputs.rows.map((r) => Number(r.qty_kg))).toEqual([0, 0]);

    const exec = await owner.query<{ status: string; version: number }>(
      `select status, version from public.wo_executions where org_id = $1 and wo_id = $2`,
      [orgId, woId],
    );
    expect(exec.rows[0]?.status).toBe('in_progress');
    expect(Number(exec.rows[0]?.version)).toBe(1);

    const wo = await owner.query<{
      status: string;
      active_bom_header_id: string | null;
      active_factory_spec_id: string | null;
    }>(
      `select status, active_bom_header_id::text, active_factory_spec_id::text
         from public.work_orders
        where org_id = $1 and id = $2`,
      [orgId, woId],
    );
    expect(wo.rows[0]).toEqual({
      status: 'IN_PROGRESS',
      active_bom_header_id: bomHeaderId,
      active_factory_spec_id: factorySpecId,
    });

    expect((await outboxTypes(woId)).filter((type) => type === 'production.wo.started')).toHaveLength(1);

    const snap = await owner.query(
      `select 1 from public.bom_snapshots where org_id = $1 and work_order_id = $2`,
      [orgId, woId],
    );
    expect(snap.rowCount).toBe(1);
  });

  it('rejects an invalid transition (pause a planned WO → invalid_state_transition)', async () => {
    const { woId } = await seedWorkOrder();
    const catId = await seedDowntimeCategory();
    const result = await withOrgContext((ctx: ProductionContext) =>
      pauseWo(ctx, { woId, transactionId: randomUUID(), reasonCategoryId: catId, lineId: 'LINE-1' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toBe('invalid_state_transition');
    expect(result.status).toBe(409);
  });

  it('runs the full happy path start → pause → resume → complete → close with e-sign', async () => {
    const { woId, componentId } = await seedWorkOrder();
    const catId = await seedDowntimeCategory();

    const started = await withOrgContext((ctx: ProductionContext) =>
      startWo(ctx, { woId, transactionId: randomUUID(), lineId: 'LINE-1' }),
    );
    expect(started.ok).toBe(true);

    const paused = await withOrgContext((ctx: ProductionContext) =>
      pauseWo(ctx, { woId, transactionId: randomUUID(), reasonCategoryId: catId, lineId: 'LINE-1' }),
    );
    expect(paused.ok).toBe(true);
    if (!paused.ok) throw new Error('pause failed');
    expect(paused.data.status).toBe('paused');
    // open downtime row exists
    const open = await owner.query(
      `select 1 from public.downtime_events where org_id = $1 and wo_id = $2 and source='wo_pause' and ended_at is null`,
      [orgId, woId],
    );
    expect(open.rowCount).toBe(1);
    const openedOutbox = await owner.query<{ state: string | null }>(
      `select payload->>'state' as state
         from public.outbox_events
        where org_id = $1
          and aggregate_id = $2
          and event_type = 'production.downtime.recorded'
          and payload->>'state' = 'opened'`,
      [orgId, woId],
    );
    expect(openedOutbox.rows).toEqual([{ state: 'opened' }]);

    const resumed = await withOrgContext((ctx: ProductionContext) =>
      resumeWo(ctx, { woId, transactionId: randomUUID() }),
    );
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) throw new Error('resume failed');
    expect(resumed.data.status).toBe('in_progress');
    // downtime row now closed
    const closedDt = await owner.query(
      `select 1 from public.downtime_events where org_id = $1 and wo_id = $2 and source='wo_pause' and ended_at is not null`,
      [orgId, woId],
    );
    expect(closedDt.rowCount).toBe(1);

    await markPrimaryOutputRegistered(woId);
    await postBalancedMaterialConsumption(woId, componentId);
    const completed = await withOrgContext((ctx: ProductionContext) =>
      completeWo(ctx, { woId, transactionId: randomUUID() }),
    );
    expect(completed.ok).toBe(true);
    if (!completed.ok) throw new Error('complete failed');
    expect(completed.data.status).toBe('completed');

    const closed = await withOrgContext((ctx: ProductionContext) =>
      closeWo(ctx, {
        woId,
        transactionId: randomUUID(),
        signerUserId: userId,
        pin: SUPERVISOR_PIN,
        reason: 'financial close after shift',
      }),
    );
    expect(closed.ok).toBe(true);
    if (!closed.ok) throw new Error('close failed');
    expect(closed.data.status).toBe('closed');
    expect(closed.data.signatureId).toBeTruthy();

    // e-sign recorded: e_sign_log row + paired security audit_events row.
    const esign = await owner.query(
      `select 1 from public.e_sign_log where org_id = $1 and intent = 'production.wo.close'`,
      [orgId],
    );
    expect(esign.rowCount).toBe(1);
    const audit = await owner.query(
      `select 1 from public.audit_events where org_id = $1 and action = 'e_sign.recorded' and retention_class = 'security'`,
      [orgId],
    );
    expect(audit.rowCount).toBe(1);

    const types = await outboxTypes(woId);
    expect(types).toContain('production.wo.started');
    expect(types).toContain('production.wo.completed');
    expect(types).toContain('production.wo.closed');

    // closed is terminal — a further verb is rejected.
    const reclose = await withOrgContext((ctx: ProductionContext) =>
      cancelWo(ctx, { woId, transactionId: randomUUID(), reasonCode: 'noop' }),
    );
    expect(reclose.ok).toBe(false);
    if (reclose.ok) throw new Error('expected terminal rejection');
    expect(reclose.error).toBe('invalid_state_transition');
  });

  it('blocks close with a wrong PIN (esign_failed) and does not transition', async () => {
    const { woId, componentId } = await seedWorkOrder();
    await withOrgContext((ctx: ProductionContext) => startWo(ctx, { woId, transactionId: randomUUID(), lineId: 'L1' }));
    await markPrimaryOutputRegistered(woId);
    await postBalancedMaterialConsumption(woId, componentId);
    await withOrgContext((ctx: ProductionContext) => completeWo(ctx, { woId, transactionId: randomUUID() }));

    const bad = await withOrgContext((ctx: ProductionContext) =>
      closeWo(ctx, { woId, transactionId: randomUUID(), signerUserId: userId, pin: '000000', reason: 'try' }),
    );
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error('expected esign failure');
    expect(bad.error).toBe('esign_failed');

    const exec = await owner.query<{ status: string }>(
      `select status from public.wo_executions where org_id = $1 and wo_id = $2`,
      [orgId, woId],
    );
    expect(exec.rows[0]?.status).toBe('completed'); // NOT closed
  });

  it('start hard-blocks when allergen segregation is required (unbypassable gate)', async () => {
    const { woId } = await seedWorkOrder({ withSegregation: true });
    const result = await withOrgContext((ctx: ProductionContext) =>
      startWo(ctx, { woId, transactionId: randomUUID(), lineId: 'L1' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected segregation block');
    // C4/F6: canonical code on both desktop + scanner paths; the legacy
    // 'allergen_changeover_required' alias is carried in details.legacyCode.
    expect(result.error).toBe('changeover_signoff_required');
    expect((result.details as { legacyCode?: string } | null)?.legacyCode).toBe(
      'allergen_changeover_required',
    );
  });

  it('start is idempotent under R14 transaction_id replay (single event, single output set)', async () => {
    const { woId } = await seedWorkOrder();
    const txn = randomUUID();
    const a = await withOrgContext((ctx: ProductionContext) => startWo(ctx, { woId, transactionId: txn, lineId: 'L1' }));
    const b = await withOrgContext((ctx: ProductionContext) => startWo(ctx, { woId, transactionId: txn, lineId: 'L1' }));
    expect(a.ok && b.ok).toBe(true);

    let events = await owner.query(
      `select 1 from public.wo_events where org_id = $1 and wo_id = $2 and event_type='start'`,
      [orgId, woId],
    );
    expect(events.rowCount).toBe(1); // exactly one append for the replayed txn
    let outputs = await owner.query(`select 1 from public.wo_outputs where org_id = $1 and wo_id = $2`, [orgId, woId]);
    expect(outputs.rowCount).toBe(2); // no double-materialization
    let startedOutbox = (await outboxTypes(woId)).filter(
      (type) => type === 'production.wo.started',
    );
    expect(startedOutbox).toHaveLength(1);

    let execution = await owner.query<{ status: string; version: number }>(
      `select status, version from public.wo_executions where org_id = $1 and wo_id = $2`,
      [orgId, woId],
    );
    expect(execution.rows[0]?.status).toBe('in_progress');
    expect(Number(execution.rows[0]?.version)).toBe(1);

    // A fresh transaction is not a replay: START from in_progress must reject
    // without appending an event, bumping the version, or adding outputs.
    const freshTxn = await withOrgContext((ctx: ProductionContext) =>
      startWo(ctx, { woId, transactionId: randomUUID(), lineId: 'L1' }),
    );
    expect(freshTxn.ok).toBe(false);
    if (freshTxn.ok) throw new Error('expected a fresh START transaction to be rejected');
    expect(freshTxn.error).toBe('invalid_state_transition');

    events = await owner.query(
      `select 1 from public.wo_events where org_id = $1 and wo_id = $2 and event_type='start'`,
      [orgId, woId],
    );
    outputs = await owner.query(
      `select 1 from public.wo_outputs where org_id = $1 and wo_id = $2`,
      [orgId, woId],
    );
    execution = await owner.query<{ status: string; version: number }>(
      `select status, version from public.wo_executions where org_id = $1 and wo_id = $2`,
      [orgId, woId],
    );
    startedOutbox = (await outboxTypes(woId)).filter(
      (type) => type === 'production.wo.started',
    );
    expect(events.rowCount).toBe(1);
    expect(outputs.rowCount).toBe(2);
    expect(startedOutbox).toHaveLength(1);
    expect(execution.rows[0]?.status).toBe('in_progress');
    expect(Number(execution.rows[0]?.version)).toBe(1);
  });

  it('pause is idempotent under R14 transaction_id replay (single downtime row and outbox event)', async () => {
    const { woId } = await seedWorkOrder();
    const catId = await seedDowntimeCategory();
    const txn = randomUUID();
    await withOrgContext((ctx: ProductionContext) => startWo(ctx, { woId, transactionId: randomUUID(), lineId: 'L1' }));

    const a = await withOrgContext((ctx: ProductionContext) =>
      pauseWo(ctx, { woId, transactionId: txn, reasonCategoryId: catId, lineId: 'L1' }),
    );
    const b = await withOrgContext((ctx: ProductionContext) =>
      pauseWo(ctx, { woId, transactionId: txn, reasonCategoryId: catId, lineId: 'L1' }),
    );
    expect(a.ok && b.ok).toBe(true);

    const events = await owner.query(
      `select 1 from public.wo_events where org_id = $1 and wo_id = $2 and event_type='pause'`,
      [orgId, woId],
    );
    expect(events.rowCount).toBe(1);
    const downtime = await owner.query(
      `select 1
         from public.downtime_events
        where org_id = $1
          and wo_id = $2
          and source = 'wo_pause'
          and ended_at is null`,
      [orgId, woId],
    );
    expect(downtime.rowCount).toBe(1);
    const downtimeOutbox = (await outboxTypes(woId)).filter(
      (type) => type === 'production.downtime.recorded',
    );
    expect(downtimeOutbox).toHaveLength(1);
  });

  it('optimistic-lock: two concurrent transitions on the same version — exactly one wins', async () => {
    const { woId } = await seedWorkOrder();
    const started = await withOrgContext((ctx: ProductionContext) =>
      startWo(ctx, { woId, transactionId: randomUUID(), lineId: 'L1' }),
    );
    expect(started.ok).toBe(true);
    const beforeRace = await owner.query<{ status: string; version: number }>(
      `select status, version from public.wo_executions where org_id = $1 and wo_id = $2`,
      [orgId, woId],
    );
    expect(beforeRace.rows[0]?.status).toBe('in_progress');
    expect(Number(beforeRace.rows[0]?.version)).toBe(1);

    // Hold the execution row only after both contenders have read version N and
    // reached their CAS UPDATE. Releasing the lock then guarantees a real CAS
    // miss instead of allowing a late contender to observe the winner's final
    // state and merely return invalid_state_transition.
    const blocker = await owner.connect();
    type TransitionResult = Awaited<ReturnType<typeof applyTransition>>;
    let contenders: [
      Promise<TransitionResult>,
      Promise<TransitionResult>,
    ] | null = null;
    let raceResults: [
      PromiseSettledResult<TransitionResult>,
      PromiseSettledResult<TransitionResult>,
    ] | null = null;
    try {
      await blocker.query('begin');
      await blocker.query(
        `select 1
           from public.wo_executions
          where org_id = $1 and wo_id = $2
          for update`,
        [orgId, woId],
      );
      contenders = [
        withOrgContext((ctx: ProductionContext) =>
          applyTransition(ctx, { woId, verb: 'complete', transactionId: randomUUID() }),
        ),
        withOrgContext((ctx: ProductionContext) =>
          applyTransition(ctx, { woId, verb: 'complete', transactionId: randomUUID() }),
        ),
      ];
      await waitForBlockedCasWaiters(2);
      await blocker.query('commit');
      raceResults = await Promise.allSettled(contenders);
    } finally {
      await blocker.query('rollback').catch(() => undefined);
      blocker.release();
      if (contenders && !raceResults) {
        raceResults = await Promise.allSettled(contenders);
      }
    }
    if (!raceResults) throw new Error('WO CAS contenders did not settle');
    const [r1, r2] = raceResults;

    const oks = [r1, r2].filter(
      (r) => r.status === 'fulfilled' && r.value.ok,
    ).length;
    const conflicts = [r1, r2].filter(
      (r) => r.status === 'rejected' && r.reason instanceof WoConcurrentModificationError,
    ).length;
    expect(oks).toBe(1);
    expect(conflicts).toBe(1);
    const conflict = [r1, r2].find(
      (r): r is PromiseRejectedResult =>
        r.status === 'rejected' && r.reason instanceof WoConcurrentModificationError,
    );
    expect((conflict?.reason as WoConcurrentModificationError | undefined)?.expectedVersion).toBe(
      Number(beforeRace.rows[0]?.version),
    );

    // The losing txn must NOT have committed an orphan wo_events 'complete' row:
    // exactly one complete event exists (from the winner).
    const completeEvents = await owner.query(
      `select 1 from public.wo_events where org_id = $1 and wo_id = $2 and event_type='complete'`,
      [orgId, woId],
    );
    expect(completeEvents.rowCount).toBe(1);

    const exec = await owner.query<{ status: string; version: number }>(
      `select status, version from public.wo_executions where org_id = $1 and wo_id = $2`,
      [orgId, woId],
    );
    expect(exec.rows[0]?.status).toBe('completed');
    expect(Number(exec.rows[0]?.version)).toBe(Number(beforeRace.rows[0]?.version) + 1);
  });

  it('cancel is a terminal branch from a non-closed state and emits production.wo.closed', async () => {
    const { woId } = await seedWorkOrder();
    await withOrgContext((ctx: ProductionContext) => startWo(ctx, { woId, transactionId: randomUUID(), lineId: 'L1' }));
    const result = await withOrgContext((ctx: ProductionContext) =>
      cancelWo(ctx, { woId, transactionId: randomUUID(), reasonCode: 'planner_cancel' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('cancel failed');
    expect(result.data.status).toBe('cancelled');
    expect(await outboxTypes(woId)).toContain('production.wo.closed');
  });

  it('cancel requires production.wo.cancel, not production.wo.start', async () => {
    const { woId } = await seedWorkOrder();
    const startOnlyRoleId = randomUUID();
    await owner.query(
      `insert into public.roles (id, org_id, code, slug, name, permissions)
       values ($1, $2, $3, $3, 'E1 Start-only Operator', '[]'::jsonb)`,
      [startOnlyRoleId, orgId, `e1-start-only-${startOnlyRoleId.slice(0, 8)}`],
    );
    await owner.query(
      `insert into public.role_permissions (role_id, permission)
       values ($1, 'production.wo.start')`,
      [startOnlyRoleId],
    );
    await owner.query(`update public.users set role_id = $2 where id = $1`, [
      userId,
      startOnlyRoleId,
    ]);
    await owner.query(`delete from public.user_roles where org_id = $1 and user_id = $2`, [
      orgId,
      userId,
    ]);
    await owner.query(
      `insert into public.user_roles (org_id, user_id, role_id) values ($1, $2, $3)`,
      [orgId, userId, startOnlyRoleId],
    );
    try {
      const started = await withOrgContext((ctx: ProductionContext) =>
        startWo(ctx, { woId, transactionId: randomUUID(), lineId: 'L1' }),
      );
      expect(started.ok).toBe(true);

      const result = await withOrgContext((ctx: ProductionContext) =>
        cancelWo(ctx, { woId, transactionId: randomUUID(), reasonCode: 'missing_cancel_permission' }),
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected forbidden');
      expect(result.error).toBe('forbidden');
    } finally {
      await owner.query(`update public.users set role_id = $2 where id = $1`, [userId, roleId]);
      await owner.query(`delete from public.user_roles where org_id = $1 and user_id = $2`, [
        orgId,
        userId,
      ]);
      await owner.query(
        `insert into public.user_roles (org_id, user_id, role_id)
         values ($1, $2, $3)
         on conflict do nothing`,
        [orgId, userId, roleId],
      );
      await owner.query(`delete from public.role_permissions where role_id = $1`, [startOnlyRoleId]);
      await owner.query(`delete from public.roles where id = $1`, [startOnlyRoleId]);
    }
  });
});

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

const databaseUrl = process.env.DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const roleId = randomUUID();
const bomHeaderId = randomUUID();
const factorySpecId = randomUUID();
const SUPERVISOR_PIN = '824193';

let owner: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await owner.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'app_user') then
        create role app_user login password '${appUserPassword}';
      else
        alter role app_user login password '${appUserPassword}';
      end if;
    end
    $$;
  `);
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
  await owner.query(
    `insert into public.roles (id, org_id, code, slug, name, permissions)
     values ($1, $2, 'admin', 'admin', 'E1 Admin', '[]'::jsonb) on conflict (id) do nothing`,
    [roleId, orgId],
  );
  await owner.query(`select public.seed_production_permissions_for_org($1)`, [orgId]);
  await owner.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, 'e1-action@example.test', 'E1 Action User', $3) on conflict (id) do nothing`,
    [userId, orgId, roleId],
  );
  await owner.query(
    `insert into public.user_roles (org_id, user_id, role_id)
     values ($1, $2, $3) on conflict do nothing`,
    [orgId, userId, roleId],
  );
  // BOM header + line so the T-025 snapshot service can freeze a recipe at start.
  await owner.query(
    `insert into public.bom_headers (id, org_id, product_id, origin_module, status, version)
     values ($1, $2, $3, 'technical', 'active', 1) on conflict (id) do nothing`,
    [bomHeaderId, orgId, randomUUID()],
  );
  await owner.query(
    `insert into public.bom_lines (org_id, bom_header_id, line_no, component_code, quantity, uom)
     values ($1, $2, 1, 'RM-E1-A', 1.000, 'kg')`,
    [orgId, bomHeaderId],
  );
  // Seed the supervisor PIN for the close e-sign (argon2id via setPin).
  await setPin(userId, SUPERVISOR_PIN);
}

/** Create a fresh WO (with its schedule_outputs + materials) and return its id. */
async function seedWorkOrder(opts?: { withSegregation?: boolean }): Promise<{ woId: string; componentId: string }> {
  const woId = randomUUID();
  const productId = randomUUID();
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
     values ($1, $2, $3, 'RM-E1-A', 50.000, 0.000, 'kg')`,
    [orgId, woId, componentId],
  );
  return { woId, componentId };
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
    'bom_snapshots',
    'bom_lines',
    'bom_headers',
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

    const outputs = await owner.query<{ output_type: string }>(
      `select output_type from public.wo_outputs where org_id = $1 and wo_id = $2 order by output_type`,
      [orgId, woId],
    );
    // planning 'byproduct' → production 'by_product'; 'primary' stays.
    expect(outputs.rows.map((r) => r.output_type).sort()).toEqual(['by_product', 'primary']);

    const exec = await owner.query<{ status: string; version: number }>(
      `select status, version from public.wo_executions where org_id = $1 and wo_id = $2`,
      [orgId, woId],
    );
    expect(exec.rows[0]?.status).toBe('in_progress');
    expect(Number(exec.rows[0]?.version)).toBe(1);

    expect(await outboxTypes(woId)).toContain('production.wo.started');

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
    const { woId } = await seedWorkOrder();
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
    const { woId } = await seedWorkOrder();
    await withOrgContext((ctx: ProductionContext) => startWo(ctx, { woId, transactionId: randomUUID(), lineId: 'L1' }));
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
    expect(result.error).toBe('allergen_changeover_required');
  });

  it('start is idempotent under R14 transaction_id replay (single event, single output set)', async () => {
    const { woId } = await seedWorkOrder();
    const txn = randomUUID();
    const a = await withOrgContext((ctx: ProductionContext) => startWo(ctx, { woId, transactionId: txn, lineId: 'L1' }));
    const b = await withOrgContext((ctx: ProductionContext) => startWo(ctx, { woId, transactionId: txn, lineId: 'L1' }));
    expect(a.ok && b.ok).toBe(true);

    const events = await owner.query(
      `select 1 from public.wo_events where org_id = $1 and wo_id = $2 and event_type='start'`,
      [orgId, woId],
    );
    expect(events.rowCount).toBe(1); // exactly one append for the replayed txn
    const outputs = await owner.query(`select 1 from public.wo_outputs where org_id = $1 and wo_id = $2`, [orgId, woId]);
    expect(outputs.rowCount).toBe(2); // no double-materialization
  });

  it('optimistic-lock: two concurrent transitions on the same version — exactly one wins', async () => {
    const { woId } = await seedWorkOrder();
    await withOrgContext((ctx: ProductionContext) => startWo(ctx, { woId, transactionId: randomUUID(), lineId: 'L1' }));

    // Two concurrent COMPLETE attempts (distinct txn ids) racing the SAME version.
    // The CAS loser now THROWS WoConcurrentModificationError (so withOrgContext
    // rolls back its orphan wo_events row) — use allSettled so the rejection of
    // the losing txn does not abort the winner.
    const [r1, r2] = await Promise.allSettled([
      withOrgContext((ctx: ProductionContext) =>
        applyTransition(ctx, { woId, verb: 'complete', transactionId: randomUUID() }),
      ),
      withOrgContext((ctx: ProductionContext) =>
        applyTransition(ctx, { woId, verb: 'complete', transactionId: randomUUID() }),
      ),
    ]);

    const oks = [r1, r2].filter(
      (r) => r.status === 'fulfilled' && r.value.ok,
    ).length;
    // The loser either threw WoConcurrentModificationError (CAS miss) or — if the
    // winner committed first and bumped status out of in_progress — returned an
    // invalid_state_transition result. Either is a single losing outcome.
    const conflicts = [r1, r2].filter(
      (r) =>
        (r.status === 'rejected' && r.reason instanceof WoConcurrentModificationError) ||
        (r.status === 'fulfilled' && !r.value.ok && r.value.error === 'invalid_state_transition'),
    ).length;
    expect(oks).toBe(1);
    expect(conflicts).toBe(1);

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
    expect(Number(exec.rows[0]?.version)).toBe(2); // start(1) + exactly one complete(2)
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
});

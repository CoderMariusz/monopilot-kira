/**
 * T-023 — 03-technical Routing cost preview: REAL DB-backed tests.
 *
 * Drives routingCostPreview through withOrgContext (RLS-scoped). Owner SQL seeds
 * a routing with operations, then asserts the NUMERIC-exact arithmetic.
 *
 *   - AC1: one op (setup=30 min, run=10 sec, cost=60/h), volume=100 →
 *       setup 30/60×60 = 30.00 ; run (10×100)/3600×60 = 16.67 ; op_cost = 46.67
 *       (within 0.01). total = 46.67.
 *   - AC2: missing volume → invalid_input.
 *   - AC3: cross-org routing id → not_found (RLS scopes the SELECT to 0 rows).
 *   - read-only: no rows are written/changed by the preview.
 *
 * Skips automatically when DATABASE_URL is unset.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  appUserPassword,
  databaseUrl,
  makeAppUserConnectionString,
  withActionActor,
} from '../../../../../../(npd)/brief/actions/__tests__/brief-integration-helpers';
import { routingCostPreview } from '../_actions/cost-preview';

const run = databaseUrl ? describe : describe.skip;

const PERMS = ['technical.bom.create'];

const seed = {
  tenantId: randomUUID(),
  orgAId: randomUUID(),
  orgBId: randomUUID(),
  userAId: randomUUID(),
  userBId: randomUUID(),
  roleAId: randomUUID(),
  roleBId: randomUUID(),
  itemAId: randomUUID(),
  itemBId: randomUUID(),
  lineAId: randomUUID(),
  machineAId: randomUUID(),
  routingAId: randomUUID(),
  routingBId: randomUUID(),
};

let owner: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await owner.query(`
    do $$
    begin
      perform pg_advisory_xact_lock(hashtext('technical-routing-cost:ensure-app-user'));
      if not exists (select 1 from pg_roles where rolname = 'app_user') then
        create role app_user login password '${appUserPassword}';
      else
        alter role app_user login password '${appUserPassword}';
      end if;
    end
    $$;
  `);
}

async function seedFixtures(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'Cost Preview IT Tenant', 'eu', 'https://cp-it.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, $3, 'CP IT Org A', 'fmcg'), ($4, $2, $5, 'CP IT Org B', 'fmcg')
     on conflict (id) do nothing`,
    [seed.orgAId, seed.tenantId, `cp-a-${seed.orgAId.slice(0, 8)}`, seed.orgBId, `cp-b-${seed.orgBId.slice(0, 8)}`],
  );
  const permsJson = JSON.stringify(PERMS);
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values
       ($1, $2, 'cp-editor-it', false, 'cp-editor-it', 'CP Editor IT', $3::jsonb, false, 60),
       ($4, $5, 'cp-editor-it', false, 'cp-editor-it', 'CP Editor IT B', $3::jsonb, false, 60)
     on conflict (id) do nothing`,
    [seed.roleAId, seed.orgAId, permsJson, seed.roleBId, seed.orgBId],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     select r.id, p.permission
       from (values ($1::uuid), ($2::uuid)) r(id)
       cross join unnest($3::text[]) as p(permission)
     on conflict (role_id, permission) do nothing`,
    [seed.roleAId, seed.roleBId, PERMS],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values ($1, $2, $3, 'CP User A', 'CP User A', $4), ($5, $6, $7, 'CP User B', 'CP User B', $8)
     on conflict (id) do nothing`,
    [
      seed.userAId,
      seed.orgAId,
      `cp-a-${seed.userAId}@example.test`,
      seed.roleAId,
      seed.userBId,
      seed.orgBId,
      `cp-b-${seed.userBId}@example.test`,
      seed.roleBId,
    ],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3), ($4, $5, $6)
     on conflict (user_id, role_id) do nothing`,
    [seed.userAId, seed.roleAId, seed.orgAId, seed.userBId, seed.roleBId, seed.orgBId],
  );
  await owner.query(
    `insert into public.items (id, org_id, item_code, item_type, name, uom_base)
     values ($1, $2, $3, 'fg', 'CP Item A', 'kg'), ($4, $5, $6, 'fg', 'CP Item B', 'kg')
     on conflict (id) do nothing`,
    [seed.itemAId, seed.orgAId, `FG-${seed.itemAId.slice(0, 8)}`, seed.itemBId, seed.orgBId, `FG-${seed.itemBId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.production_lines (id, org_id, code, name, status)
     values ($1, $2, $3, 'CP Line A', 'active')
     on conflict (id) do nothing`,
    [seed.lineAId, seed.orgAId, `CPL-${seed.lineAId.slice(0, 6)}`],
  );
  await owner.query(
    `insert into public.machines (id, org_id, code, name, machine_type, status)
     values ($1, $2, $3, 'CP Machine A', 'mixer', 'active')
     on conflict (id) do nothing`,
    [seed.machineAId, seed.orgAId, `CPM-${seed.machineAId.slice(0, 6)}`],
  );

  // Routing A (org A) with the AC1 single op: setup 30 min, run 10 s, cost 60/h.
  await owner.query(
    `insert into public.routings (id, org_id, item_id, version, status)
     values ($1, $2, $3, 1, 'active')
     on conflict (id) do nothing`,
    [seed.routingAId, seed.orgAId, seed.itemAId],
  );
  await owner.query(
    `insert into public.routing_operations
       (org_id, routing_id, op_no, op_code, op_name, line_id, machine_id, setup_time_min, run_time_per_unit_sec, cost_per_hour)
     values ($1, $2, 1, 'MIX', 'Mixing', $3, $4, 30, 10.00, 60.0000)`,
    [seed.orgAId, seed.routingAId, seed.lineAId, seed.machineAId],
  );

  // Routing B (org B) — used by the cross-org RLS assertion.
  await owner.query(
    `insert into public.routings (id, org_id, item_id, version, status)
     values ($1, $2, $3, 1, 'active')
     on conflict (id) do nothing`,
    [seed.routingBId, seed.orgBId, seed.itemBId],
  );
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.routing_operations where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.routings where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.machines where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.production_lines where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.items where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.user_roles where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(
    `delete from public.role_permissions where role_id in (select id from public.roles where org_id in ($1, $2))`,
    [seed.orgAId, seed.orgBId],
  );
  await owner.query(`delete from public.users where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.roles where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.organizations where id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
}

run('03-technical routing cost preview (NUMERIC-exact, RLS, real DB)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert; the action uses the withOrgContext app_user pool
    owner = new pg.Pool({ connectionString: databaseUrl });
    await seedFixtures();
    process.env.APP_USER_PASSWORD = appUserPassword;
    void makeAppUserConnectionString();
  });

  afterAll(async () => {
    if (owner) {
      await cleanup().catch(() => undefined);
      await owner.end();
    }
  });

  it('AC1: op_cost = 30 + 16.67 = 46.67 for setup=30min, run=10s, cost=60/h, volume=100 (NUMERIC-exact)', async () => {
    const result = await withActionActor(seed.userAId, seed.orgAId, () =>
      routingCostPreview({ routingId: seed.routingAId, volume: 100 }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.operations).toHaveLength(1);
      const op = result.data.operations[0]!;
      expect(op.setupCost).toBe('30.00');
      expect(op.runCost).toBe('16.67');
      expect(Math.abs(Number(op.opCost) - 46.67)).toBeLessThanOrEqual(0.01);
      expect(op.opCost).toBe('46.67');
      expect(result.data.totalCost).toBe('46.67');
      // NUMERIC stays a string (no float coercion in the result shape).
      expect(typeof op.opCost).toBe('string');
    }
  });

  it('AC2: missing volume → invalid_input', async () => {
    const result = await withActionActor(seed.userAId, seed.orgAId, () =>
      routingCostPreview({ routingId: seed.routingAId }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_input');
  });

  it('AC3: a cross-org routing id resolves to not_found (RLS)', async () => {
    const result = await withActionActor(seed.userAId, seed.orgAId, () =>
      routingCostPreview({ routingId: seed.routingBId, volume: 100 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_found');
  });

  it('read-only: the preview writes/changes nothing', async () => {
    const before = await owner.query<{ updated_at: string }>(
      `select updated_at::text from public.routing_operations where routing_id = $1`,
      [seed.routingAId],
    );
    await withActionActor(seed.userAId, seed.orgAId, () =>
      routingCostPreview({ routingId: seed.routingAId, volume: 250 }),
    );
    const after = await owner.query<{ updated_at: string }>(
      `select updated_at::text from public.routing_operations where routing_id = $1`,
      [seed.routingAId],
    );
    expect(after.rows[0]!.updated_at).toBe(before.rows[0]!.updated_at);
  });
});

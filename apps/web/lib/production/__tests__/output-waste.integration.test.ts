/**
 * 08-Production E3 — REAL DB integration tests for output (T-028 + T-032 catch-weight)
 * and waste recording. Drives the services through the real app_user RLS
 * transaction (withAppOrg). Owner SQL is used only for seed/cleanup/assertions.
 *
 * Gated on DATABASE_URL (skip when no local Postgres) — same convention as the
 * NPD integration suites.
 *
 * Coverage:
 *   - output → wo_outputs row + production.output.recorded outbox event
 *   - batch_number = {wo_number}-OUT-NNN, expiry = today + shelf_life_days (V-PROD-04)
 *   - sequential batch increment (OUT-001, OUT-002)
 *   - qty_kg=0 → invalid_input (V-PROD-03), NUMERIC-exact persistence
 *   - catch-weight: warning false/true + missing-array 422 (T-032)
 *   - waste → wo_waste_log row + production.waste.recorded outbox event
 *   - holdsGuard seam: active hold ⇒ quality_hold_active + production.consume.blocked
 *   - RBAC: caller without production.output.write ⇒ forbidden
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

import {
  databaseUrl,
  ensureAppUser,
  makeAppUserConnectionString,
  withAppOrg,
} from '../../../app/(npd)/brief/actions/__tests__/brief-integration-helpers';
import { registerOutput } from '../output/register-output';
import { recordWaste } from '../waste/record-waste';
import {
  ProductionActionError,
  QualityHoldError,
  emitConsumeBlocked,
  type OrgContextLike,
  type QueryClient,
} from '../shared';

const run = databaseUrl ? describe : describe.skip;

const seed = {
  tenantId: randomUUID(),
  orgId: randomUUID(),
  adminRoleId: randomUUID(),
  noPermRoleId: randomUUID(),
  adminUserId: randomUUID(),
  noPermUserId: randomUUID(),
  productId: randomUUID(),
  catchProductId: randomUUID(),
  wasteCategoryId: randomUUID(),
  // W9-K-II: registerOutput now creates the output LP — it needs an org
  // default warehouse (+ location) to exist.
  warehouseId: randomUUID(),
  locationId: randomUUID(),
};

let owner: pg.Pool;
let app: pg.Pool;

function ctxFor(client: pg.PoolClient, userId: string): OrgContextLike {
  return { userId, orgId: seed.orgId, client: client as unknown as QueryClient };
}

async function seedAll(): Promise<void> {
  await ensureAppUser(owner);
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'E3 Tenant', 'eu', 'https://e3.example.test') on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, $3, 'E3 Org', 'fmcg') on conflict (id) do nothing`,
    [seed.orgId, seed.tenantId, `e3-${seed.orgId.slice(0, 8)}`],
  );
  // admin role with the production output+waste write perms
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values ($1, $2, $3, false, $3, 'E3 Admin', '["production.output.write","production.waste.write"]'::jsonb, false, 10)
     on conflict (id) do nothing`,
    [seed.adminRoleId, seed.orgId, `e3-admin-${seed.adminRoleId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values ($1, 'production.output.write'), ($1, 'production.waste.write')
     on conflict (role_id, permission) do nothing`,
    [seed.adminRoleId],
  );
  // role WITHOUT production perms
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values ($1, $2, $3, false, $3, 'E3 NoPerm', '[]'::jsonb, false, 20)
     on conflict (id) do nothing`,
    [seed.noPermRoleId, seed.orgId, `e3-noperm-${seed.noPermRoleId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values ($1, $2, $3, 'E3 Admin', 'E3 Admin', $4), ($5, $2, $6, 'E3 NoPerm', 'E3 NoPerm', $7)
     on conflict (id) do nothing`,
    [
      seed.adminUserId, seed.orgId, `e3-admin-${seed.adminUserId.slice(0, 8)}@x.test`, seed.adminRoleId,
      seed.noPermUserId, `e3-noperm-${seed.noPermUserId.slice(0, 8)}@x.test`, seed.noPermRoleId,
    ],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3), ($4, $5, $3) on conflict (user_id, role_id) do nothing`,
    [seed.adminUserId, seed.adminRoleId, seed.orgId, seed.noPermUserId, seed.noPermRoleId],
  );
  // items: a fixed-weight FG (shelf_life 30) and a catch-weight item (nominal 1.0)
  await owner.query(
    `insert into public.items (id, org_id, item_code, item_type, name, uom_base, weight_mode, shelf_life_days)
     values ($1, $2, $3, 'fg', 'E3 FG', 'kg', 'fixed', 30) on conflict (id) do nothing`,
    [seed.productId, seed.orgId, `E3FG-${seed.productId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.items (id, org_id, item_code, item_type, name, uom_base, weight_mode, shelf_life_days, nominal_weight, variance_tolerance_pct)
     values ($1, $2, $3, 'fg', 'E3 Catch FG', 'kg', 'catch', 30, 1.0, 10.00) on conflict (id) do nothing`,
    [seed.catchProductId, seed.orgId, `E3CATCH-${seed.catchProductId.slice(0, 8)}`],
  );
  // waste category
  await owner.query(
    `insert into public.waste_categories (id, org_id, code, name) values ($1, $2, 'TRIM', 'Trim waste')
     on conflict (id) do nothing`,
    [seed.wasteCategoryId, seed.orgId],
  );
  // W9-K-II: org default warehouse + location for the output LP destination.
  await owner.query(
    `insert into public.warehouses (id, org_id, code, name, warehouse_type, is_default)
     values ($1, $2, $3, 'E3 WH', 'general', true) on conflict (id) do nothing`,
    [seed.warehouseId, seed.orgId, `E3WH-${seed.warehouseId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.locations (id, org_id, warehouse_id, code, name, location_type, level, path)
     values ($1, $2, $3, 'A-01', 'Rack A-01', 'rack', 1, 'A.01') on conflict (id) do nothing`,
    [seed.locationId, seed.orgId, seed.warehouseId],
  );
}

/** Create a WO + its wo_executions row in the given status. Returns the new ids. */
async function makeWo(status: string, productId = seed.productId): Promise<{ woId: string; woNumber: string }> {
  const woId = randomUUID();
  const woNumber = `WO${Math.floor(Math.random() * 1_000_000_000)}`;
  await owner.query(
    `insert into public.work_orders
       (id, org_id, wo_number, product_id, item_type_at_creation, planned_quantity, uom, status)
     values ($1, $2, $3, $4, 'fg', 100, 'kg', 'RELEASED')`,
    [woId, seed.orgId, woNumber, productId],
  );
  await owner.query(
    `insert into public.wo_executions (org_id, wo_id, status) values ($1, $2, $3)`,
    [seed.orgId, woId, status],
  );
  return { woId, woNumber };
}

async function cleanupWoData(): Promise<void> {
  await owner.query(`delete from public.outbox_events where org_id = $1`, [seed.orgId]);
  // W9-K-II: registerOutput also creates the output LP + its genesis ledger row.
  await owner.query(`delete from public.lp_state_history where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.license_plates where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.wo_outputs where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.wo_waste_log where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.wo_executions where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.work_orders where org_id = $1`, [seed.orgId]);
}

run('08-Production E3 output + waste (integration)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert; service uses withAppOrg app_user pool
    owner = new pg.Pool({ connectionString: databaseUrl });
    // eslint-disable-next-line no-restricted-syntax -- direct app_user RLS pool for real org-scoped service execution
    app = new pg.Pool({ connectionString: makeAppUserConnectionString() });
    await seedAll();
  }, 120_000);

  afterEach(async () => {
    await cleanupWoData();
  });

  afterAll(async () => {
    await owner.query(`delete from public.locations where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.warehouses where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.items where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.waste_categories where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.user_roles where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.role_permissions where role_id in ($1,$2)`, [seed.adminRoleId, seed.noPermRoleId]);
    await owner.query(`delete from public.users where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.roles where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.organizations where id = $1`, [seed.orgId]);
    await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
    await app.end();
    await owner.end();
  });

  it('T-028 AC1: primary output → wo_outputs row + batch OUT-001 + expiry today+30 + outbox', async () => {
    const { woId, woNumber } = await makeWo('in_progress');
    const txId = randomUUID();
    const result = await withAppOrg(owner, app, seed.orgId, (client) =>
      registerOutput(ctxFor(client, seed.adminUserId), woId, {
        transaction_id: txId,
        output_type: 'primary',
        product_id: seed.productId,
        qty_kg: '100',
      }),
    );
    expect(result.batch_number).toBe(`${woNumber}-OUT-001`);
    // expiry = today + 30d
    const expected = new Date();
    expected.setUTCDate(expected.getUTCDate() + 30);
    expect(result.expiry_date).toBe(expected.toISOString().slice(0, 10));

    const { rows } = await owner.query<{ qty_kg: string; output_type: string }>(
      `select qty_kg, output_type from public.wo_outputs where wo_id = $1`,
      [woId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.qty_kg).toBe('100.000'); // NUMERIC-exact
    expect(rows[0]!.output_type).toBe('primary');

    const ob = await owner.query<{ event_type: string }>(
      `select event_type from public.outbox_events where org_id = $1 and event_type = 'production.output.recorded'`,
      [seed.orgId],
    );
    expect(ob.rows).toHaveLength(1);
  });

  it('T-028 AC2: two sequential primary outputs → OUT-001 then OUT-002', async () => {
    const { woId, woNumber } = await makeWo('in_progress');
    const r1 = await withAppOrg(owner, app, seed.orgId, (client) =>
      registerOutput(ctxFor(client, seed.adminUserId), woId, {
        transaction_id: randomUUID(), output_type: 'primary', product_id: seed.productId, qty_kg: '50',
      }),
    );
    const r2 = await withAppOrg(owner, app, seed.orgId, (client) =>
      registerOutput(ctxFor(client, seed.adminUserId), woId, {
        transaction_id: randomUUID(), output_type: 'primary', product_id: seed.productId, qty_kg: '50',
      }),
    );
    expect(r1.batch_number).toBe(`${woNumber}-OUT-001`);
    expect(r2.batch_number).toBe(`${woNumber}-OUT-002`);
  });

  it('T-028 AC3: qty_kg=0 → invalid_input (V-PROD-03), no row written', async () => {
    const { woId } = await makeWo('in_progress');
    await expect(
      withAppOrg(owner, app, seed.orgId, (client) =>
        registerOutput(ctxFor(client, seed.adminUserId), woId, {
          transaction_id: randomUUID(), output_type: 'primary', product_id: seed.productId, qty_kg: '0',
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    const { rows } = await owner.query(`select 1 from public.wo_outputs where wo_id = $1`, [woId]);
    expect(rows).toHaveLength(0);
  });

  it('RBAC: caller without production.output.write → forbidden', async () => {
    const { woId } = await makeWo('in_progress');
    await expect(
      withAppOrg(owner, app, seed.orgId, (client) =>
        registerOutput(ctxFor(client, seed.noPermUserId), woId, {
          transaction_id: randomUUID(), output_type: 'primary', product_id: seed.productId, qty_kg: '10',
        }),
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('WO not in recordable state (planned) → wo_not_recordable', async () => {
    const { woId } = await makeWo('planned');
    await expect(
      withAppOrg(owner, app, seed.orgId, (client) =>
        registerOutput(ctxFor(client, seed.adminUserId), woId, {
          transaction_id: randomUUID(), output_type: 'primary', product_id: seed.productId, qty_kg: '10',
        }),
      ),
    ).rejects.toMatchObject({ code: 'wo_not_recordable' });
  });

  it('T-032 AC1: catch-weight near reference → warning=false; details persisted', async () => {
    const { woId } = await makeWo('in_progress', seed.catchProductId);
    const result = await withAppOrg(owner, app, seed.orgId, (client) =>
      registerOutput(ctxFor(client, seed.adminUserId), woId, {
        transaction_id: randomUUID(), output_type: 'primary', product_id: seed.catchProductId,
        qty_kg: '3', catch_weight_kg_per_unit: ['1.0', '1.05', '0.95'],
      }),
    );
    expect(result.catch_weight_summary?.avg_kg).toBe('1.000');
    expect(result.catch_weight_summary?.warning).toBe(false);
    const { rows } = await owner.query<{ catch_weight_details: { variance_warning: boolean } }>(
      `select catch_weight_details from public.wo_outputs where wo_id = $1`,
      [woId],
    );
    expect(rows[0]!.catch_weight_details.variance_warning).toBe(false);
  });

  it('T-032 AC2: catch-weight >10% variance → warning=true, variance_pct=1.0', async () => {
    const { woId } = await makeWo('in_progress', seed.catchProductId);
    const result = await withAppOrg(owner, app, seed.orgId, (client) =>
      registerOutput(ctxFor(client, seed.adminUserId), woId, {
        transaction_id: randomUUID(), output_type: 'primary', product_id: seed.catchProductId,
        qty_kg: '6', catch_weight_kg_per_unit: ['2.0', '2.0', '2.0'],
      }),
    );
    expect(result.catch_weight_summary?.warning).toBe(true);
    expect(result.catch_weight_summary?.variance_pct).toBe('1.0000');
  });

  it('T-032 AC3: catch item missing per-unit array → invalid_input listing catch_weight_kg_per_unit', async () => {
    const { woId } = await makeWo('in_progress', seed.catchProductId);
    await expect(
      withAppOrg(owner, app, seed.orgId, (client) =>
        registerOutput(ctxFor(client, seed.adminUserId), woId, {
          transaction_id: randomUUID(), output_type: 'primary', product_id: seed.catchProductId, qty_kg: '3',
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid_input', details: { fields: ['catch_weight_kg_per_unit'] } });
  });

  it('waste → wo_waste_log row + production.waste.recorded outbox event', async () => {
    const { woId } = await makeWo('in_progress');
    const result = await withAppOrg(owner, app, seed.orgId, (client) =>
      recordWaste(ctxFor(client, seed.adminUserId), woId, {
        transaction_id: randomUUID(), category_code: 'TRIM', qty_kg: '2.5',
        reason_code: 'SPILL', shift_id: 'A',
      }),
    );
    expect(result.category_code).toBe('TRIM');
    const { rows } = await owner.query<{ qty_kg: string; category_id: string }>(
      `select qty_kg, category_id from public.wo_waste_log where wo_id = $1`,
      [woId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.qty_kg).toBe('2.500'); // NUMERIC-exact
    expect(rows[0]!.category_id).toBe(seed.wasteCategoryId);
    const ob = await owner.query(
      `select 1 from public.outbox_events where org_id = $1 and event_type = 'production.waste.recorded'`,
      [seed.orgId],
    );
    expect(ob.rows).toHaveLength(1);
  });

  it('waste qty_kg<=0 → invalid_input (V-PROD-05)', async () => {
    const { woId } = await makeWo('in_progress');
    await expect(
      withAppOrg(owner, app, seed.orgId, (client) =>
        recordWaste(ctxFor(client, seed.adminUserId), woId, {
          transaction_id: randomUUID(), category_code: 'TRIM', qty_kg: '0', shift_id: 'A',
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('waste unknown category_code → invalid_reference (V-PROD-05)', async () => {
    const { woId } = await makeWo('in_progress');
    await expect(
      withAppOrg(owner, app, seed.orgId, (client) =>
        recordWaste(ctxFor(client, seed.adminUserId), woId, {
          transaction_id: randomUUID(), category_code: 'NOPE', qty_kg: '1', shift_id: 'A',
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid_reference' });
  });

  it('holdsGuard seam: with v_active_holds present + active hold → quality_hold_active + production.consume.blocked', async () => {
    // Build a minimal v_active_holds view so the seam engages, then assert the
    // output path is blocked and emits the blocked event. This proves the gate
    // wiring without depending on the (unbuilt) 09-quality module.
    const lpId = randomUUID();
    // DDL cannot use bind params — inline the literal uuid.
    // Stub mirrors the SHIPPED v_active_holds (migration 197): polymorphic
    // (reference_type, reference_id) read model with hold_id + priority — NOT the
    // legacy lp_id/lot_id shape. The local seam keys lpId → reference_type='lp'.
    await owner.query(
      `create or replace view public.v_active_holds as
         select gen_random_uuid() as hold_id, app.current_org_id() as org_id,
                'lp'::text as reference_type, '${lpId}'::uuid as reference_id,
                'high'::text as priority, 'open'::text as hold_status`,
    );
    await owner.query(`grant select on public.v_active_holds to app_user`);
    try {
      const { woId } = await makeWo('in_progress');
      const txId = randomUUID();
      // The mutating txn throws QualityHoldError and rolls back (no output row).
      let caught: unknown;
      await withAppOrg(owner, app, seed.orgId, (client) =>
        registerOutput(ctxFor(client, seed.adminUserId), woId, {
          transaction_id: txId, output_type: 'primary', product_id: seed.productId,
          qty_kg: '10', lp_id: lpId,
        }),
      ).catch((e) => { caught = e; });
      expect(caught).toBeInstanceOf(QualityHoldError);

      // No output row was written (rolled back).
      const out = await owner.query(`select 1 from public.wo_outputs where wo_id = $1`, [woId]);
      expect(out.rows).toHaveLength(0);

      // Route's catch path emits production.consume.blocked on a committed txn.
      await withAppOrg(owner, app, seed.orgId, (client) =>
        emitConsumeBlocked(ctxFor(client, seed.adminUserId), caught as QualityHoldError),
      );
      const ob = await owner.query(
        `select 1 from public.outbox_events where org_id = $1 and event_type = 'production.consume.blocked'`,
        [seed.orgId],
      );
      expect(ob.rows).toHaveLength(1);
    } finally {
      await owner.query(`drop view if exists public.v_active_holds`);
    }
  });

  it('ProductionActionError carries an HTTP status', () => {
    const e = new ProductionActionError('forbidden', 403);
    expect(e.status).toBe(403);
    expect(e.code).toBe('forbidden');
  });
});

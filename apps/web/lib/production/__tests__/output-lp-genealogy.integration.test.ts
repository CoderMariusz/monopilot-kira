/**
 * W9-K-II — REAL DB integration tests: production output → License Plate +
 * genealogy (audit F-A04 MED + F-B08 HIGH).
 *
 * Proves, against live Postgres through the real app_user RLS transaction:
 *   - registerOutput with no caller lp_id CREATES a license_plates row in the
 *     same txn: org-default warehouse + first location, qty/uom mirroring the
 *     wo_outputs row, batch + expiry carried over, status 'received',
 *     qa_status 'pending', origin 'production', wo_id back-link;
 *   - wo_outputs.lp_id is back-linked to the new LP;
 *   - genealogy: parent_lp_id = FIRST consumed LP (single-parent column) and
 *     ALL consumed LPs land in ext_jsonb.consumed_lp_ids;
 *   - the recursive CTE reader (lib/warehouse/genealogy.ts) returns the chain
 *     both directions (consumed RM LP ⇄ output FG LP);
 *   - replay of the same transaction_id → already_recorded, NO duplicate LP;
 *   - lp_state_history genesis row written;
 *   - production.output.recorded outbox payload carries the created lp_id.
 *
 * Gated on DATABASE_URL (skip without local Postgres) — same convention as
 * output-waste.integration.test.ts.
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
import { queryGenealogy } from '../../warehouse/genealogy';
import { registerOutput } from '../output/register-output';
import { type OrgContextLike, type QueryClient } from '../shared';

const run = databaseUrl ? describe : describe.skip;

const seed = {
  tenantId: randomUUID(),
  orgId: randomUUID(),
  adminRoleId: randomUUID(),
  adminUserId: randomUUID(),
  fgProductId: randomUUID(),
  rmProductId: randomUUID(),
  siteId: randomUUID(),
  warehouseId: randomUUID(),
  locationId: randomUUID(),
  parentLpAId: randomUUID(),
  parentLpBId: randomUUID(),
};

let owner: pg.Pool;
let app: pg.Pool;

function ctxFor(client: pg.PoolClient, userId: string): OrgContextLike {
  return { userId, orgId: seed.orgId, siteId: seed.siteId, client: client as unknown as QueryClient };
}

async function seedAll(): Promise<void> {
  await ensureAppUser(owner);
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'W9KII Tenant', 'eu', 'https://w9kii.example.test') on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, $3, 'W9KII Org', 'fmcg') on conflict (id) do nothing`,
    [seed.orgId, seed.tenantId, `w9kii-${seed.orgId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values ($1, $2, $3, false, $3, 'W9KII Admin', '["production.output.write"]'::jsonb, false, 10)
     on conflict (id) do nothing`,
    [seed.adminRoleId, seed.orgId, `w9kii-admin-${seed.adminRoleId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values ($1, 'production.output.write') on conflict (role_id, permission) do nothing`,
    [seed.adminRoleId],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values ($1, $2, $3, 'W9KII Admin', 'W9KII Admin', $4) on conflict (id) do nothing`,
    [seed.adminUserId, seed.orgId, `w9kii-${seed.adminUserId.slice(0, 8)}@x.test`, seed.adminRoleId],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3) on conflict (user_id, role_id) do nothing`,
    [seed.adminUserId, seed.adminRoleId, seed.orgId],
  );
  // FG (the output product, shelf life 30d) + RM (the consumed component).
  await owner.query(
    `insert into public.items (id, org_id, item_code, item_type, name, uom_base, weight_mode, shelf_life_days)
     values ($1, $2, $3, 'fg', 'W9KII FG', 'kg', 'fixed', 30),
            ($4, $2, $5, 'rm', 'W9KII RM', 'kg', 'fixed', 90)
     on conflict (id) do nothing`,
    [seed.fgProductId, seed.orgId, `W9FG-${seed.fgProductId.slice(0, 8)}`,
     seed.rmProductId, `W9RM-${seed.rmProductId.slice(0, 8)}`],
  );
  // Org default warehouse + one location (the output LP destination).
  await owner.query(
    `insert into public.warehouses (id, org_id, site_id, code, name, warehouse_type, is_default)
     values ($1, $2, $3, $4, 'W9KII Main WH', 'general', true) on conflict (id) do nothing`,
    [seed.warehouseId, seed.orgId, seed.siteId, `W9WH-${seed.warehouseId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.locations (id, org_id, warehouse_id, code, name, location_type, level, path)
     values ($1, $2, $3, 'A-01', 'Rack A-01', 'rack', 1, 'A.01') on conflict (id) do nothing`,
    [seed.locationId, seed.orgId, seed.warehouseId],
  );
  // Two RM parent LPs that the WO will consume from (genealogy ancestors).
  await owner.query(
    `insert into public.license_plates
       (id, org_id, warehouse_id, location_id, lp_number, product_id, quantity, uom,
        status, qa_status, batch_number, origin)
     values
       ($1, $2, $3, $4, $5, $6, 100, 'kg', 'consumed', 'released', 'RM-BATCH-A', 'grn'),
       ($7, $2, $3, $4, $8, $6, 100, 'kg', 'consumed', 'released', 'RM-BATCH-B', 'grn')
     on conflict (id) do nothing`,
    [seed.parentLpAId, seed.orgId, seed.warehouseId, seed.locationId,
     `LP-W9A-${seed.parentLpAId.slice(0, 8)}`, seed.rmProductId,
     seed.parentLpBId, `LP-W9B-${seed.parentLpBId.slice(0, 8)}`],
  );
}

/** WO + execution + (optionally) consumption ledger rows against the parent LPs. */
async function makeWo(opts: { consume: boolean }): Promise<{ woId: string; woNumber: string }> {
  const woId = randomUUID();
  const woNumber = `WO9K${Math.floor(Math.random() * 1_000_000_000)}`;
  await owner.query(
    `insert into public.work_orders
       (id, org_id, wo_number, product_id, item_type_at_creation, planned_quantity, uom, status)
     values ($1, $2, $3, $4, 'fg', 100, 'kg', 'RELEASED')`,
    [woId, seed.orgId, woNumber, seed.fgProductId],
  );
  await owner.query(
    `insert into public.wo_executions (org_id, wo_id, status) values ($1, $2, 'in_progress')`,
    [seed.orgId, woId],
  );
  if (opts.consume) {
    // LP A consumed FIRST (primary parent), LP B second.
    await owner.query(
      `insert into public.wo_material_consumption
         (org_id, transaction_id, wo_id, component_id, lp_id, qty_consumed, uom,
          fefo_adherence_flag, consumed_at)
       values
         ($1, $2, $3, $4, $5, 60, 'kg', true, now() - interval '10 minutes'),
         ($1, $6, $3, $4, $7, 40, 'kg', true, now() - interval '5 minutes')`,
      [seed.orgId, randomUUID(), woId, seed.rmProductId, seed.parentLpAId,
       randomUUID(), seed.parentLpBId],
    );
  }
  return { woId, woNumber };
}

async function cleanupWoData(): Promise<void> {
  await owner.query(`delete from public.outbox_events where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.lp_state_history where org_id = $1`, [seed.orgId]);
  await owner.query(
    `delete from public.license_plates where org_id = $1 and id not in ($2, $3)`,
    [seed.orgId, seed.parentLpAId, seed.parentLpBId],
  );
  await owner.query(`delete from public.wo_material_consumption where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.wo_outputs where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.wo_executions where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.work_orders where org_id = $1`, [seed.orgId]);
}

run('W9-K-II output → LP + genealogy (integration)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert; the service runs on the withAppOrg app_user pool
    owner = new pg.Pool({ connectionString: databaseUrl });
    // eslint-disable-next-line no-restricted-syntax -- direct app_user RLS pool for real org-scoped service execution
    app = new pg.Pool({ connectionString: makeAppUserConnectionString() });
    await seedAll();
  }, 120_000);

  afterEach(async () => {
    await cleanupWoData();
  });

  afterAll(async () => {
    await owner.query(`delete from public.lp_state_history where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.license_plates where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.locations where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.warehouses where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.items where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.user_roles where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.role_permissions where role_id = $1`, [seed.adminRoleId]);
    await owner.query(`delete from public.users where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.roles where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.organizations where id = $1`, [seed.orgId]);
    await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
    await app.end();
    await owner.end();
  });

  it('creates the output LP (warehouse/location/batch/expiry/status) and back-links wo_outputs.lp_id', async () => {
    const { woId } = await makeWo({ consume: true });
    const result = await withAppOrg(owner, app, seed.orgId, (client) =>
      registerOutput(ctxFor(client, seed.adminUserId), woId, {
        transaction_id: randomUUID(),
        output_type: 'primary',
        product_id: seed.fgProductId,
        qty_kg: '100',
      }),
    );

    expect(result.lp_id).toBeTruthy();
    expect(result.lp_number).toMatch(/^LP-\d+-/);

    const { rows } = await owner.query<{
      warehouse_id: string; location_id: string; lp_number: string; product_id: string;
      quantity: string; uom: string; status: string; qa_status: string;
      batch_number: string; expiry_date: string | null; best_before_date: string | null;
      origin: string; wo_id: string;
    }>(`select warehouse_id, location_id, lp_number, product_id, quantity::text as quantity, uom,
               status, qa_status, batch_number,
               to_char(expiry_date, 'YYYY-MM-DD') as expiry_date,
               to_char(best_before_date, 'YYYY-MM-DD') as best_before_date,
               origin, wo_id
          from public.license_plates where id = $1`, [result.lp_id]);
    expect(rows).toHaveLength(1);
    const lp = rows[0]!;
    expect(lp.warehouse_id).toBe(seed.warehouseId); // org default warehouse
    expect(lp.location_id).toBe(seed.locationId); // its first location
    expect(lp.lp_number).toBe(result.lp_number);
    expect(lp.product_id).toBe(seed.fgProductId);
    expect(lp.quantity).toBe('100.000000'); // NUMERIC(18,6), mirrors wo_outputs qty
    expect(lp.uom).toBe('kg');
    expect(lp.status).toBe('received'); // NOT 'available' — QA promotion path owns that
    expect(lp.qa_status).toBe('pending');
    expect(lp.batch_number).toBe(result.batch_number);
    expect(lp.origin).toBe('production');
    expect(lp.wo_id).toBe(woId);
    // expiry: today + 30d shelf life, same as the wo_outputs row (F-B07: BOTH columns set).
    expect(lp.expiry_date).toBe(result.expiry_date);
    expect(lp.best_before_date).toBe(result.expiry_date);

    // wo_outputs back-link.
    const out = await owner.query<{ lp_id: string }>(
      `select lp_id from public.wo_outputs where wo_id = $1`, [woId]);
    expect(out.rows[0]!.lp_id).toBe(result.lp_id);

    // outbox payload carries the created lp_id.
    const ob = await owner.query<{ payload: { lp_id: string } }>(
      `select payload from public.outbox_events
        where org_id = $1 and event_type = 'production.output.recorded'`, [seed.orgId]);
    expect(ob.rows).toHaveLength(1);
    expect(ob.rows[0]!.payload.lp_id).toBe(result.lp_id);

    // lp_state_history genesis row.
    const hist = await owner.query<{ from_state: string | null; to_state: string; reason_code: string }>(
      `select from_state, to_state, reason_code from public.lp_state_history
        where org_id = $1 and lp_id = $2`, [seed.orgId, result.lp_id]);
    expect(hist.rows).toEqual([
      { from_state: null, to_state: 'received', reason_code: 'production_output' },
    ]);
  });

  it('genealogy: parent_lp_id = FIRST consumed LP; ALL consumed LPs in ext_jsonb.consumed_lp_ids', async () => {
    const { woId } = await makeWo({ consume: true });
    const result = await withAppOrg(owner, app, seed.orgId, (client) =>
      registerOutput(ctxFor(client, seed.adminUserId), woId, {
        transaction_id: randomUUID(),
        output_type: 'primary',
        product_id: seed.fgProductId,
        qty_kg: '95.5',
      }),
    );

    const { rows } = await owner.query<{ parent_lp_id: string; ext_jsonb: { consumed_lp_ids: string[] } }>(
      `select parent_lp_id, ext_jsonb from public.license_plates where id = $1`, [result.lp_id]);
    expect(rows[0]!.parent_lp_id).toBe(seed.parentLpAId); // consumed first
    expect(rows[0]!.ext_jsonb.consumed_lp_ids).toEqual([seed.parentLpAId, seed.parentLpBId]);
  });

  it('genealogy reader returns the new chain both directions (RM LP ⇄ output LP)', async () => {
    const { woId } = await makeWo({ consume: true });
    const result = await withAppOrg(owner, app, seed.orgId, (client) =>
      registerOutput(ctxFor(client, seed.adminUserId), woId, {
        transaction_id: randomUUID(),
        output_type: 'primary',
        product_id: seed.fgProductId,
        qty_kg: '100',
      }),
    );

    // From the OUTPUT LP: ancestor = primary consumed RM LP.
    const fromOutput = await withAppOrg(owner, app, seed.orgId, (client) =>
      queryGenealogy(client as unknown as QueryClient, result.lp_id!),
    );
    expect(fromOutput.map((n) => [n.direction, n.lpId])).toEqual([
      ['ancestor', seed.parentLpAId],
      ['self', result.lp_id],
    ]);

    // From the RM parent LP: descendant = the output LP.
    const fromParent = await withAppOrg(owner, app, seed.orgId, (client) =>
      queryGenealogy(client as unknown as QueryClient, seed.parentLpAId),
    );
    expect(fromParent.map((n) => [n.direction, n.lpId])).toEqual([
      ['self', seed.parentLpAId],
      ['descendant', result.lp_id],
    ]);
  });

  it('no consumption ledger rows → LP created with parent_lp_id null + empty consumed_lp_ids', async () => {
    const { woId } = await makeWo({ consume: false });
    const result = await withAppOrg(owner, app, seed.orgId, (client) =>
      registerOutput(ctxFor(client, seed.adminUserId), woId, {
        transaction_id: randomUUID(),
        output_type: 'primary',
        product_id: seed.fgProductId,
        qty_kg: '10',
      }),
    );
    const { rows } = await owner.query<{ parent_lp_id: string | null; ext_jsonb: { consumed_lp_ids: string[] } }>(
      `select parent_lp_id, ext_jsonb from public.license_plates where id = $1`, [result.lp_id]);
    expect(rows[0]!.parent_lp_id).toBeNull();
    expect(rows[0]!.ext_jsonb.consumed_lp_ids).toEqual([]);
  });

  it('LP-less consumes (nil-UUID sentinel) → output LP parent_lp_id stays null (no phantom parent)', async () => {
    // A WO whose only consumption rows are no-LP consumes, which the consume
    // action records as lp_id = '00000000-0000-0000-0000-000000000000'. The
    // sentinel must NOT become the output's parent_lp_id (that LP row does not
    // exist — it would corrupt genealogy). loadConsumedLpIds filters it out.
    const { woId } = await makeWo({ consume: false });
    await owner.query(
      `insert into public.wo_material_consumption
         (org_id, transaction_id, wo_id, component_id, lp_id, qty_consumed, uom,
          fefo_adherence_flag, consumed_at)
       values
         ($1, $2, $3, $4, '00000000-0000-0000-0000-000000000000', 30, 'kg', true, now() - interval '8 minutes'),
         ($1, $5, $3, $4, '00000000-0000-0000-0000-000000000000', 20, 'kg', true, now() - interval '4 minutes')`,
      [seed.orgId, randomUUID(), woId, seed.rmProductId, randomUUID()],
    );
    const result = await withAppOrg(owner, app, seed.orgId, (client) =>
      registerOutput(ctxFor(client, seed.adminUserId), woId, {
        transaction_id: randomUUID(),
        output_type: 'primary',
        product_id: seed.fgProductId,
        qty_kg: '50',
      }),
    );
    const { rows } = await owner.query<{ parent_lp_id: string | null; ext_jsonb: { consumed_lp_ids: string[] } }>(
      `select parent_lp_id, ext_jsonb from public.license_plates where id = $1`, [result.lp_id]);
    expect(rows[0]!.parent_lp_id).toBeNull();
    expect(rows[0]!.ext_jsonb.consumed_lp_ids).toEqual([]);
  });

  it('replay (same transaction_id) → already_recorded and NO duplicate LP', async () => {
    const { woId } = await makeWo({ consume: true });
    const txId = randomUUID();
    const body = {
      transaction_id: txId,
      output_type: 'primary' as const,
      product_id: seed.fgProductId,
      qty_kg: '100',
    };
    const first = await withAppOrg(owner, app, seed.orgId, (client) =>
      registerOutput(ctxFor(client, seed.adminUserId), woId, body),
    );
    expect(first.lp_id).toBeTruthy();

    await expect(
      withAppOrg(owner, app, seed.orgId, (client) =>
        registerOutput(ctxFor(client, seed.adminUserId), woId, body),
      ),
    ).rejects.toMatchObject({ code: 'already_recorded', status: 409 });

    // Exactly ONE output LP exists for this WO (replay txn rolled back its LP).
    const { rows } = await owner.query<{ n: string }>(
      `select count(*)::text as n from public.license_plates where org_id = $1 and wo_id = $2`,
      [seed.orgId, woId],
    );
    expect(rows[0]!.n).toBe('1');
  });
});

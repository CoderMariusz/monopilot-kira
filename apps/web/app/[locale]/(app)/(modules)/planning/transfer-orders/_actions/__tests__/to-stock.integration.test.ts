/**
 * W9-K-II — REAL DB integration tests: transfer-order ship/receive stock model
 * (audit F-C05 HIGH: "TO receive = bare status flip = phantom stock").
 *
 * Runs transitionTransferOrderStatus through the REAL withOrgContext HOF
 * (app_user RLS transaction; test-stub actor resolution) against live Postgres.
 * Requires migration 283 (transfer_order_line_lps). Proves:
 *   - SHIP validates availability server-side: qty > pickable stock at source
 *     → 'insufficient_stock', NOTHING written, TO stays draft;
 *   - SHIP picks FEFO (earliest expiry first), decrements source LPs, flips
 *     fully-depleted LPs to 'shipped', records picks in transfer_order_line_lps
 *     + stock_moves;
 *   - RECEIVE creates destination LPs at to_warehouse (origin 'transfer',
 *     parent_lp_id = source LP, batch/expiry carried, qa carried) and
 *     back-links dest_lp_id — total stock is CONSERVED (no phantom);
 *   - the genealogy reader sees source LP → dest LP as ancestor/descendant;
 *   - RECEIVE without a destination warehouse → 'invalid_state';
 *   - CANCEL in transit restores source quantities (no stranded stock).
 *
 * Gated on DATABASE_URL — same convention as the sibling integration suites.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

import {
  databaseUrl,
  ensureAppUser,
  makeAppUserConnectionString,
  withAppOrg,
} from '../../../../../../../(npd)/brief/actions/__tests__/brief-integration-helpers';
import { queryGenealogy, type GenealogyQueryClient } from '../../../../../../../../lib/warehouse/genealogy';

const run = databaseUrl ? describe : describe.skip;

const seed = {
  tenantId: randomUUID(),
  orgId: randomUUID(),
  roleId: randomUUID(),
  userId: randomUUID(),
  itemId: randomUUID(),
  srcWarehouseId: randomUUID(),
  srcLocationId: randomUUID(),
  dstWarehouseId: randomUUID(),
  dstLocationId: randomUUID(),
};

let owner: pg.Pool;
let app: pg.Pool;

async function seedAll(): Promise<void> {
  await ensureAppUser(owner);
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'W9TO Tenant', 'eu', 'https://w9to.example.test') on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, $3, 'W9TO Org', 'fmcg') on conflict (id) do nothing`,
    [seed.orgId, seed.tenantId, `w9to-${seed.orgId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values ($1, $2, $3, false, $3, 'W9TO Planner', '["npd.planning.write"]'::jsonb, false, 10)
     on conflict (id) do nothing`,
    [seed.roleId, seed.orgId, `w9to-planner-${seed.roleId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values ($1, 'npd.planning.write') on conflict (role_id, permission) do nothing`,
    [seed.roleId],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values ($1, $2, $3, 'W9TO Planner', 'W9TO Planner', $4) on conflict (id) do nothing`,
    [seed.userId, seed.orgId, `w9to-${seed.userId.slice(0, 8)}@x.test`, seed.roleId],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3) on conflict (user_id, role_id) do nothing`,
    [seed.userId, seed.roleId, seed.orgId],
  );
  await owner.query(
    `insert into public.items (id, org_id, item_code, item_type, name, uom_base, weight_mode, shelf_life_days)
     values ($1, $2, $3, 'rm', 'W9TO RM', 'kg', 'fixed', 90) on conflict (id) do nothing`,
    [seed.itemId, seed.orgId, `W9TORM-${seed.itemId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.warehouses (id, org_id, code, name, warehouse_type, is_default)
     values ($1, $2, $3, 'W9TO Source WH', 'general', true),
            ($4, $2, $5, 'W9TO Dest WH', 'general', false)
     on conflict (id) do nothing`,
    [seed.srcWarehouseId, seed.orgId, `W9SRC-${seed.srcWarehouseId.slice(0, 8)}`,
     seed.dstWarehouseId, `W9DST-${seed.dstWarehouseId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.locations (id, org_id, warehouse_id, code, name, location_type, level, path)
     values ($1, $2, $3, 'S-01', 'Src Rack', 'rack', 1, 'S.01'),
            ($4, $2, $5, 'D-01', 'Dst Rack', 'rack', 1, 'D.01')
     on conflict (id) do nothing`,
    [seed.srcLocationId, seed.orgId, seed.srcWarehouseId,
     seed.dstLocationId, seed.dstWarehouseId],
  );
}

/** Two pickable source LPs: LP-A 60kg expiring SOONER, LP-B 50kg later (FEFO order A→B). */
async function makeSourceStock(): Promise<{ lpAId: string; lpBId: string }> {
  const lpAId = randomUUID();
  const lpBId = randomUUID();
  await owner.query(
    `insert into public.license_plates
       (id, org_id, warehouse_id, location_id, lp_number, product_id, quantity, uom,
        status, qa_status, batch_number, expiry_date, origin)
     values
       ($1, $2, $3, $4, $5, $6, 60, 'kg', 'available', 'released', 'TOB-A', now() + interval '10 days', 'grn'),
       ($7, $2, $3, $4, $8, $6, 50, 'kg', 'available', 'released', 'TOB-B', now() + interval '20 days', 'grn')`,
    [lpAId, seed.orgId, seed.srcWarehouseId, seed.srcLocationId,
     `LP-TOA-${lpAId.slice(0, 8)}`, seed.itemId,
     lpBId, `LP-TOB-${lpBId.slice(0, 8)}`],
  );
  return { lpAId, lpBId };
}

async function makeTo(opts: { qty: string; toWarehouse?: string | null }): Promise<{ toId: string; lineId: string }> {
  const toId = randomUUID();
  const lineId = randomUUID();
  await owner.query(
    `insert into public.transfer_orders
       (id, org_id, to_number, from_warehouse_id, to_warehouse_id, status)
     values ($1, $2, $3, $4, $5, 'draft')`,
    [toId, seed.orgId, `TO-W9-${toId.slice(0, 8)}`, seed.srcWarehouseId,
     opts.toWarehouse === null ? null : (opts.toWarehouse ?? seed.dstWarehouseId)],
  );
  await owner.query(
    `insert into public.transfer_order_lines (id, org_id, to_id, item_id, qty, uom, line_no)
     values ($1, $2, $3, $4, $5::numeric, 'kg', 1)`,
    [lineId, seed.orgId, toId, seed.itemId, opts.qty],
  );
  return { toId, lineId };
}

async function cleanupPerTest(): Promise<void> {
  await owner.query(`delete from public.transfer_order_line_lps where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.stock_moves where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.lp_state_history where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.license_plates where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.transfer_order_lines where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.transfer_orders where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.audit_events where org_id = $1`, [seed.orgId]);
}

run('W9-K-II transfer-order ship/receive stock model (integration)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- test-only owner pool for seed/assert; the action runs through the real withOrgContext pools
    owner = new pg.Pool({ connectionString: databaseUrl });
    // eslint-disable-next-line no-restricted-syntax -- app_user RLS pool for the genealogy-reader assertion
    app = new pg.Pool({ connectionString: makeAppUserConnectionString() });
    // Drive withOrgContext's test-stub resolver (real app-role + RLS txn, no JWT).
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = seed.userId;
    process.env.NEXT_SERVER_ACTION_ORG_ID = seed.orgId;
    await seedAll();
  }, 120_000);

  afterEach(async () => {
    await cleanupPerTest();
  });

  afterAll(async () => {
    await owner.query(`delete from public.locations where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.warehouses where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.items where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.user_roles where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.role_permissions where role_id = $1`, [seed.roleId]);
    await owner.query(`delete from public.users where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.roles where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.organizations where id = $1`, [seed.orgId]);
    await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
    delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    delete process.env.NEXT_SERVER_ACTION_ORG_ID;
    await app.end();
    await owner.end();
  });

  it('SHIP rejects qty > available at source (insufficient_stock) and writes NOTHING', async () => {
    await makeSourceStock(); // 110 kg pickable
    const { toId } = await makeTo({ qty: '500' });

    const { transitionTransferOrderStatus } = await import('../actions');
    const result = await transitionTransferOrderStatus(toId, 'in_transit');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('insufficient_stock');

    const to = await owner.query<{ status: string }>(
      `select status from public.transfer_orders where id = $1`, [toId]);
    expect(to.rows[0]!.status).toBe('draft');
    const lps = await owner.query<{ quantity: string; status: string }>(
      `select quantity::text as quantity, status from public.license_plates where org_id = $1 order by batch_number`,
      [seed.orgId]);
    expect(lps.rows).toEqual([
      { quantity: '60.000000', status: 'available' },
      { quantity: '50.000000', status: 'available' },
    ]);
    const links = await owner.query(`select 1 from public.transfer_order_line_lps where org_id = $1`, [seed.orgId]);
    expect(links.rows).toHaveLength(0);
  });

  it('SHIP picks FEFO, decrements source LPs, depletion → shipped, and records picks + moves', async () => {
    const { lpAId, lpBId } = await makeSourceStock();
    const { toId, lineId } = await makeTo({ qty: '80' });

    const { transitionTransferOrderStatus } = await import('../actions');
    const result = await transitionTransferOrderStatus(toId, 'in_transit');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe('in_transit');

    // FEFO: LP-A (sooner expiry) fully consumed first, LP-B partially.
    const lps = await owner.query<{ id: string; quantity: string; status: string }>(
      `select id, quantity::text as quantity, status from public.license_plates where org_id = $1`,
      [seed.orgId]);
    const lpA = lps.rows.find((r) => r.id === lpAId)!;
    const lpB = lps.rows.find((r) => r.id === lpBId)!;
    expect(lpA).toMatchObject({ quantity: '0.000000', status: 'shipped' });
    expect(lpB).toMatchObject({ quantity: '30.000000', status: 'available' });

    const links = await owner.query<{ source_lp_id: string; dest_lp_id: string | null; qty: string }>(
      `select source_lp_id, dest_lp_id, qty::text as qty
         from public.transfer_order_line_lps
        where org_id = $1 and to_line_id = $2
        order by created_at asc`,
      [seed.orgId, lineId]);
    expect(links.rows).toEqual([
      { source_lp_id: lpAId, dest_lp_id: null, qty: '60.000000' },
      { source_lp_id: lpBId, dest_lp_id: null, qty: '20.000000' },
    ]);

    const moves = await owner.query<{ lp_id: string; move_type: string; quantity: string }>(
      `select lp_id, move_type, quantity::text as quantity from public.stock_moves
        where org_id = $1 order by quantity desc`, [seed.orgId]);
    expect(moves.rows).toEqual([
      { lp_id: lpAId, move_type: 'transfer', quantity: '60.000000' },
      { lp_id: lpBId, move_type: 'transfer', quantity: '20.000000' },
    ]);

    const hist = await owner.query<{ lp_id: string; from_state: string; to_state: string }>(
      `select lp_id, from_state, to_state from public.lp_state_history where org_id = $1`, [seed.orgId]);
    expect(hist.rows).toEqual([{ lp_id: lpAId, from_state: 'available', to_state: 'shipped' }]);
  });

  it('RECEIVE materializes destination LPs (parent link, batch/expiry carried) — stock conserved', async () => {
    const { lpAId, lpBId } = await makeSourceStock();
    const { toId } = await makeTo({ qty: '80' });

    const { transitionTransferOrderStatus } = await import('../actions');
    expect((await transitionTransferOrderStatus(toId, 'in_transit')).ok).toBe(true);
    const received = await transitionTransferOrderStatus(toId, 'received');
    expect(received.ok).toBe(true);
    if (received.ok) expect(received.data.status).toBe('received');

    const destLps = await owner.query<{
      id: string; parent_lp_id: string; warehouse_id: string; location_id: string;
      quantity: string; uom: string; status: string; qa_status: string;
      batch_number: string; origin: string; lp_number: string;
    }>(
      `select id, parent_lp_id, warehouse_id, location_id, quantity::text as quantity, uom,
              status, qa_status, batch_number, origin, lp_number
         from public.license_plates
        where org_id = $1 and warehouse_id = $2
        order by quantity desc`,
      [seed.orgId, seed.dstWarehouseId]);
    expect(destLps.rows).toHaveLength(2);
    const [destA, destB] = destLps.rows;
    expect(destA).toMatchObject({
      parent_lp_id: lpAId, location_id: seed.dstLocationId, quantity: '60.000000',
      uom: 'kg', status: 'available', qa_status: 'released', batch_number: 'TOB-A', origin: 'transfer',
    });
    expect(destA!.lp_number).toMatch(/^LP-\d+-/);
    expect(destB).toMatchObject({
      parent_lp_id: lpBId, quantity: '20.000000', batch_number: 'TOB-B', origin: 'transfer',
    });

    // Linkage rows back-linked.
    const links = await owner.query<{ dest_lp_id: string | null }>(
      `select dest_lp_id from public.transfer_order_line_lps where org_id = $1`, [seed.orgId]);
    expect(links.rows.map((r) => r.dest_lp_id).sort()).toEqual([destA!.id, destB!.id].sort());

    // CONSERVATION (the anti-phantom assertion): source remaining + destination = original 110.
    const total = await owner.query<{ total: string }>(
      `select sum(quantity)::text as total from public.license_plates where org_id = $1`, [seed.orgId]);
    expect(total.rows[0]!.total).toBe('110.000000');

    // Genealogy reader sees source → dest chain.
    const chain = await withAppOrg(owner, app, seed.orgId, (client) =>
      queryGenealogy(client as unknown as GenealogyQueryClient, lpAId),
    );
    expect(chain.map((n) => [n.direction, n.lpId])).toEqual([
      ['self', lpAId],
      ['descendant', destA!.id],
    ]);
  });

  it('RECEIVE without a destination warehouse → invalid_state (no LPs conjured)', async () => {
    await makeSourceStock();
    const { toId } = await makeTo({ qty: '10', toWarehouse: null });

    const { transitionTransferOrderStatus } = await import('../actions');
    expect((await transitionTransferOrderStatus(toId, 'in_transit')).ok).toBe(true);
    const received = await transitionTransferOrderStatus(toId, 'received');
    expect(received.ok).toBe(false);
    if (!received.ok) {
      expect(received.error).toBe('invalid_state');
      expect(received.message).toBe('to_warehouse_required');
    }
    const to = await owner.query<{ status: string }>(
      `select status from public.transfer_orders where id = $1`, [toId]);
    expect(to.rows[0]!.status).toBe('in_transit');
  });

  it('CANCEL in transit restores source LP quantities (no stranded stock)', async () => {
    const { lpAId, lpBId } = await makeSourceStock();
    const { toId } = await makeTo({ qty: '80' });

    const { transitionTransferOrderStatus } = await import('../actions');
    expect((await transitionTransferOrderStatus(toId, 'in_transit')).ok).toBe(true);
    const cancelled = await transitionTransferOrderStatus(toId, 'cancelled');
    expect(cancelled.ok).toBe(true);

    const lps = await owner.query<{ id: string; quantity: string; status: string }>(
      `select id, quantity::text as quantity, status from public.license_plates where org_id = $1`,
      [seed.orgId]);
    expect(lps.rows.find((r) => r.id === lpAId)).toMatchObject({ quantity: '60.000000', status: 'available' });
    expect(lps.rows.find((r) => r.id === lpBId)).toMatchObject({ quantity: '50.000000', status: 'available' });

    const links = await owner.query(`select 1 from public.transfer_order_line_lps where org_id = $1`, [seed.orgId]);
    expect(links.rows).toHaveLength(0);
  });

  // ── F3 (W9 cross-review HIGH) — partial receive blocks cancel ───────────────
  it('CANCEL after a PARTIAL receive → partially_received, NOTHING mutated', async () => {
    const { lpAId, lpBId } = await makeSourceStock();
    const { toId } = await makeTo({ qty: '80' });

    const { transitionTransferOrderStatus } = await import('../actions');
    expect((await transitionTransferOrderStatus(toId, 'in_transit')).ok).toBe(true);

    // Simulate a partial receive: ONE junction row already materialized a
    // destination LP (dest_lp_id NOT NULL), the other is still in transit.
    const destLpId = randomUUID();
    await owner.query(
      `insert into public.license_plates
         (id, org_id, warehouse_id, location_id, lp_number, product_id, quantity, uom,
          status, qa_status, batch_number, origin)
       values ($1, $2, $3, $4, $5, $6, 60, 'kg', 'available', 'released', 'TOB-A', 'transfer')`,
      [destLpId, seed.orgId, seed.dstWarehouseId, seed.dstLocationId,
       `LP-DST-${destLpId.slice(0, 8)}`, seed.itemId],
    );
    await owner.query(
      `update public.transfer_order_line_lps set dest_lp_id = $1
        where org_id = $2 and to_id = $3 and source_lp_id = $4`,
      [destLpId, seed.orgId, toId, lpAId],
    );

    const before = await owner.query<{ id: string; quantity: string; status: string }>(
      `select id, quantity::text as quantity, status from public.license_plates where org_id = $1 order by id`,
      [seed.orgId]);

    const cancelled = await transitionTransferOrderStatus(toId, 'cancelled');
    expect(cancelled.ok).toBe(false);
    if (!cancelled.ok) {
      expect(cancelled.error).toBe('partially_received');
      expect(cancelled.message).toContain('already-received destination stock');
    }

    // NOTHING mutated: TO still in_transit, every LP (source A shipped-empty,
    // source B partially picked, dest LP) byte-identical, junction rows intact.
    const to = await owner.query<{ status: string }>(
      `select status from public.transfer_orders where id = $1`, [toId]);
    expect(to.rows[0]!.status).toBe('in_transit');
    const after = await owner.query<{ id: string; quantity: string; status: string }>(
      `select id, quantity::text as quantity, status from public.license_plates where org_id = $1 order by id`,
      [seed.orgId]);
    expect(after.rows).toEqual(before.rows);
    const links = await owner.query<{ source_lp_id: string; dest_lp_id: string | null }>(
      `select source_lp_id, dest_lp_id from public.transfer_order_line_lps where org_id = $1 order by created_at`,
      [seed.orgId]);
    expect(links.rows).toHaveLength(2);
    expect(links.rows.find((r) => r.source_lp_id === lpAId)?.dest_lp_id).toBe(destLpId);
    expect(links.rows.find((r) => r.source_lp_id === lpBId)?.dest_lp_id).toBeNull();
  });
});

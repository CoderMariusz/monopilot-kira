/**
 * C058 (P0) — duplicate-product TO lines must conserve matter across the full
 * ship → receive → reverse → cancel lifecycle. Reproduces SOL-R10 F01 inflation.
 *
 * Requires DATABASE_URL — P0 tests MUST NOT silently skip.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';

vi.mock('../../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

import { setPin } from '../../../../../../../../../../packages/auth/src/verify-pin.js';
import { getOwnerConnection } from '../../../../../../../../../../packages/db/src/clients.js';
import {
  ensureAppUser,
} from '../../../../../../../(npd)/brief/actions/__tests__/brief-integration-helpers';
import { toItemUomKey } from '../to-conservation';

type TransitionFn = typeof import('../actions').transitionTransferOrderStatus;
type ReverseFn = typeof import('../reverse-receive').reverseToReceiveLine;

let transitionTransferOrderStatus: TransitionFn;
let reverseToReceiveLine: ReverseFn;

const TEST_PIN = '2468';

type Seed = {
  tenantId: string;
  orgId: string;
  roleId: string;
  userId: string;
  itemKgId: string;
  itemPcsId: string;
  srcWarehouseId: string;
  srcLocationId: string;
  dstWarehouseId: string;
  dstLocationId: string;
};

function makeSeed(): Seed {
  return {
    tenantId: randomUUID(),
    orgId: randomUUID(),
    roleId: randomUUID(),
    userId: randomUUID(),
    itemKgId: randomUUID(),
    itemPcsId: randomUUID(),
    srcWarehouseId: randomUUID(),
    srcLocationId: randomUUID(),
    dstWarehouseId: randomUUID(),
    dstLocationId: randomUUID(),
  };
}

type MatterBreakdown = { onHand: string; inTransit: string; total: string };

let owner: pg.Pool;
let seed: Seed;

async function matterForItem(itemId: string, uom: string, toId?: string): Promise<MatterBreakdown> {
  const { rows: onHandRows } = await owner.query<{ total: string }>(
    `select coalesce(sum(quantity), 0)::text as total
       from public.license_plates
      where org_id = $1 and product_id = $2 and uom = $3`,
    [seed.orgId, itemId, uom],
  );
  let inTransit = '0';
  if (toId) {
    const { rows: transitRows } = await owner.query<{ total: string }>(
      `select coalesce(sum(tll.qty), 0)::text as total
         from public.transfer_order_line_lps tll
         join public.transfer_order_lines tol
           on tol.org_id = tll.org_id and tol.id = tll.to_line_id
        where tll.org_id = $1
          and tll.to_id = $2
          and tll.dest_lp_id is null
          and tol.item_id = $3
          and tol.uom = $4`,
      [seed.orgId, toId, itemId, uom],
    );
    inTransit = transitRows[0]!.total;
  }
  const onHand = onHandRows[0]!.total;
  const { rows: sumRows } = await owner.query<{ total: string }>(
    `select ($1::numeric + $2::numeric)::text as total`,
    [onHand, inTransit],
  );
  return { onHand, inTransit, total: sumRows[0]!.total };
}

async function stockMoveNetForLp(lpId: string): Promise<string> {
  const { rows } = await owner.query<{ total: string }>(
    `select coalesce(sum(quantity), 0)::text as total
       from public.stock_moves
      where org_id = $1 and lp_id = $2`,
    [seed.orgId, lpId],
  );
  return rows[0]!.total;
}

async function seedAll(): Promise<void> {
  await ensureAppUser(owner);
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'C058 Tenant', 'eu', 'https://c058.example.test') on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, $3, 'C058 Org', 'fmcg') on conflict (id) do nothing`,
    [seed.orgId, seed.tenantId, `c058-${seed.orgId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values ($1, $2, $3, false, $3, 'C058 Planner', '["planning.to.manage","warehouse.transfer.correct"]'::jsonb, false, 10)
     on conflict (id) do nothing`,
    [seed.roleId, seed.orgId, `c058-planner-${seed.roleId.slice(0, 8)}`],
  );
  for (const permission of ['planning.to.manage', 'warehouse.transfer.correct']) {
    await owner.query(
      `insert into public.role_permissions (role_id, permission)
       values ($1, $2) on conflict (role_id, permission) do nothing`,
      [seed.roleId, permission],
    );
  }
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values ($1, $2, $3, 'C058 Planner', 'C058 Planner', $4) on conflict (id) do nothing`,
    [seed.userId, seed.orgId, `c058-${seed.userId.slice(0, 8)}@x.test`, seed.roleId],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3) on conflict (user_id, role_id) do nothing`,
    [seed.userId, seed.roleId, seed.orgId],
  );
  await setPin(seed.userId, TEST_PIN);
  await owner.query(
    `insert into public.items (id, org_id, item_code, item_type, name, uom_base, weight_mode, shelf_life_days)
     values ($1, $2, $3, 'rm', 'C058 RM kg', 'kg', 'fixed', 90),
            ($4, $2, $5, 'fg', 'C058 FG pcs', 'pcs', 'fixed', 90)
     on conflict (id) do nothing`,
    [seed.itemKgId, seed.orgId, `C058KG-${seed.itemKgId.slice(0, 8)}`,
     seed.itemPcsId, `C058PCS-${seed.itemPcsId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.warehouses (id, org_id, code, name, warehouse_type, is_default)
     values ($1, $2, $3, 'C058 Source WH', 'general', true),
            ($4, $2, $5, 'C058 Dest WH', 'general', false)
     on conflict (id) do nothing`,
    [seed.srcWarehouseId, seed.orgId, `C058SRC-${seed.srcWarehouseId.slice(0, 8)}`,
     seed.dstWarehouseId, `C058DST-${seed.dstWarehouseId.slice(0, 8)}`],
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

async function makeSourceLp(itemId: string, qty: string, uom: 'kg' | 'pcs'): Promise<string> {
  const lpId = randomUUID();
  await owner.query(
    `insert into public.license_plates
       (id, org_id, warehouse_id, location_id, lp_number, product_id, quantity, uom,
        status, qa_status, batch_number, expiry_date, origin)
     values ($1, $2, $3, $4, $5, $6, $7::numeric, $8, 'available', 'released', 'C058-BATCH', now() + interval '30 days', 'grn')`,
    [lpId, seed.orgId, seed.srcWarehouseId, seed.srcLocationId,
     `LP-C058-${lpId.slice(0, 8)}`, itemId, qty, uom],
  );
  return lpId;
}

type ToLineSpec = { itemId: string; qty: string; uom: string; lineNo: number };

async function makeTo(lines: ToLineSpec[]): Promise<string> {
  const toId = randomUUID();
  await owner.query(
    `insert into public.transfer_orders
       (id, org_id, to_number, from_warehouse_id, to_warehouse_id, status)
     values ($1, $2, $3, $4, $5, 'draft')`,
    [toId, seed.orgId, `TO-C058-${toId.slice(0, 8)}`, seed.srcWarehouseId, seed.dstWarehouseId],
  );
  for (const line of lines) {
    await owner.query(
      `insert into public.transfer_order_lines (id, org_id, to_id, item_id, qty, uom, line_no)
       values ($1, $2, $3, $4, $5::numeric, $6, $7)`,
      [randomUUID(), seed.orgId, toId, line.itemId, line.qty, line.uom, line.lineNo],
    );
  }
  return toId;
}

async function cleanupPerTest(): Promise<void> {
  await owner.query(`delete from public.outbox_events where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.e_sign_log where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.transfer_order_line_lps where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.stock_moves where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.lp_state_history where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.lp_genealogy where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.license_plates where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.transfer_order_lines where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.transfer_orders where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.audit_events where org_id = $1`, [seed.orgId]);
}

function expectMatter(
  actual: MatterBreakdown,
  expected: { onHand: string; inTransit: string; total: string },
): void {
  expect(actual.onHand).toBe(expected.onHand);
  expect(actual.inTransit).toBe(expected.inTransit);
  expect(actual.total).toBe(expected.total);
}

describe('C058 duplicate-product TO matter conservation (integration)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL ?? process.env.DATABASE_URL_APP;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for C058 P0 integration tests — refusing silent skip');
    }
    if (!process.env.DATABASE_URL_OWNER && !process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL_OWNER (or DATABASE_URL) is required for owner seed pool');
    }
    seed = makeSeed();
    owner = getOwnerConnection();
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = seed.userId;
    process.env.NEXT_SERVER_ACTION_ORG_ID = seed.orgId;
    if (!process.env.DATABASE_URL_APP && process.env.DATABASE_URL) {
      process.env.DATABASE_URL_APP = process.env.DATABASE_URL;
    }
    await seedAll();
    const actions = await import('../actions');
    const reverse = await import('../reverse-receive');
    transitionTransferOrderStatus = actions.transitionTransferOrderStatus;
    reverseToReceiveLine = reverse.reverseToReceiveLine;
  }, 120_000);

  afterEach(async () => {
    await cleanupPerTest();
  });

  afterAll(async () => {
    await owner.query(`delete from public.locations where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.warehouses where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.items where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.e_sign_log where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.user_roles where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.role_permissions where role_id = $1`, [seed.roleId]);
    await owner.query(`delete from public.users where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.roles where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.organizations where id = $1`, [seed.orgId]);
    await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
    delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    delete process.env.NEXT_SERVER_ACTION_ORG_ID;
    await owner.end();
  });

  it('ship→receive→reverse both lines→cancel keeps per-(item,uom) matter at 3 kg', async () => {
    const sourceLpId = await makeSourceLp(seed.itemKgId, '3', 'kg');
    const baseline = await matterForItem(seed.itemKgId, 'kg');
    expectMatter(baseline, { onHand: '3.000000', inTransit: '0', total: '3.000000' });

    const toId = await makeTo([
      { itemId: seed.itemKgId, qty: '1', uom: 'kg', lineNo: 1 },
      { itemId: seed.itemKgId, qty: '2', uom: 'kg', lineNo: 2 },
    ]);
    const shipped = await transitionTransferOrderStatus(toId, 'in_transit');
    expect(shipped.ok).toBe(true);
    expectMatter(await matterForItem(seed.itemKgId, 'kg', toId), {
      onHand: '0.000000',
      inTransit: '3.000000',
      total: '3.000000',
    });
    expect(await stockMoveNetForLp(sourceLpId)).toBe('3.000000');

    const shipMoves = await owner.query<{ from_location_id: string | null; to_location_id: string | null; quantity: string }>(
      `select from_location_id::text, to_location_id::text, quantity::text
         from public.stock_moves where org_id = $1 and lp_id = $2 and reason_text like 'TO ship%'`,
      [seed.orgId, sourceLpId],
    );
    expect(shipMoves.rows.every((m) => m.from_location_id !== null && m.to_location_id === null)).toBe(true);
    expect(shipMoves.rows.reduce((acc, m) => acc + Number(m.quantity), 0)).toBe(3);

    const received = await transitionTransferOrderStatus(toId, 'received');
    expect(received.ok).toBe(true);
    expectMatter(await matterForItem(seed.itemKgId, 'kg', toId), {
      onHand: '3.000000',
      inTransit: '0',
      total: '3.000000',
    });

    const destTotal = await owner.query<{ total: string }>(
      `select coalesce(sum(quantity), 0)::text as total
         from public.license_plates
        where org_id = $1 and warehouse_id = $2`,
      [seed.orgId, seed.dstWarehouseId],
    );
    expect(destTotal.rows[0]!.total).toBe('3.000000');

    const links = await owner.query<{
      to_line_id: string;
      dest_lp_id: string;
      qty: string;
    }>(
      `select to_line_id::text as to_line_id, dest_lp_id::text as dest_lp_id, qty::text as qty
         from public.transfer_order_line_lps
        where org_id = $1 and to_id = $2
        order by qty asc`,
      [seed.orgId, toId],
    );
    expect(links.rows).toHaveLength(2);

    for (const link of links.rows) {
      const reversed = await reverseToReceiveLine({
        toId,
        lineId: link.to_line_id,
        destLpId: link.dest_lp_id,
        quantity: link.qty,
        reasonCode: 'entry_error',
        note: 'C058 conservation test reversal',
        signature: {
          password: TEST_PIN,
          intent: 'warehouse.transfer_receive.reverse',
          nonce: randomUUID(),
        },
      });
      expect(reversed.ok).toBe(true);
      expectMatter(await matterForItem(seed.itemKgId, 'kg', toId), {
        onHand: '3.000000',
        inTransit: '0',
        total: '3.000000',
      });
    }

    const cancelled = await transitionTransferOrderStatus(toId, 'cancelled');
    expect(cancelled.ok).toBe(true);
    expectMatter(await matterForItem(seed.itemKgId, 'kg'), {
      onHand: '3.000000',
      inTransit: '0',
      total: '3.000000',
    });
    expect(await stockMoveNetForLp(sourceLpId)).toBe('6.000000');

    const remainingLinks = await owner.query(
      `select 1 from public.transfer_order_line_lps where org_id = $1 and to_id = $2`,
      [seed.orgId, toId],
    );
    expect(remainingLinks.rows).toHaveLength(0);
  });

  it('direct ship→cancel on duplicate lines restores source and reconciles stock_moves', async () => {
    const sourceLpId = await makeSourceLp(seed.itemKgId, '3', 'kg');
    const baseline = await matterForItem(seed.itemKgId, 'kg');
    expectMatter(baseline, { onHand: '3.000000', inTransit: '0', total: '3.000000' });

    const toId = await makeTo([
      { itemId: seed.itemKgId, qty: '1', uom: 'kg', lineNo: 1 },
      { itemId: seed.itemKgId, qty: '2', uom: 'kg', lineNo: 2 },
    ]);
    const shipped = await transitionTransferOrderStatus(toId, 'in_transit');
    expect(shipped.ok).toBe(true);
    expectMatter(await matterForItem(seed.itemKgId, 'kg', toId), {
      onHand: '0.000000',
      inTransit: '3.000000',
      total: '3.000000',
    });

    const cancelled = await transitionTransferOrderStatus(toId, 'cancelled');
    expect(cancelled.ok).toBe(true);
    expectMatter(await matterForItem(seed.itemKgId, 'kg'), {
      onHand: '3.000000',
      inTransit: '0',
      total: '3.000000',
    });

    const cancelMoves = await owner.query<{ from_location_id: string | null; to_location_id: string | null; quantity: string }>(
      `select from_location_id::text, to_location_id::text, quantity::text
         from public.stock_moves where org_id = $1 and lp_id = $2 and reason_text like 'TO cancel%'`,
      [seed.orgId, sourceLpId],
    );
    expect(cancelMoves.rows.length).toBeGreaterThan(0);
    expect(cancelMoves.rows.every((m) => m.from_location_id === null && m.to_location_id !== null)).toBe(true);
    expect(cancelMoves.rows.reduce((acc, m) => acc + Number(m.quantity), 0)).toBe(3);
    expect(await stockMoveNetForLp(sourceLpId)).toBe('6.000000');
  });

  it('conserves independently per item when TO has multiple products', async () => {
    await makeSourceLp(seed.itemKgId, '2', 'kg');
    await makeSourceLp(seed.itemPcsId, '5', 'pcs');
    const kgBaseline = await matterForItem(seed.itemKgId, 'kg');
    const pcsBaseline = await matterForItem(seed.itemPcsId, 'pcs');

    const toId = await makeTo([
      { itemId: seed.itemKgId, qty: '2', uom: 'kg', lineNo: 1 },
      { itemId: seed.itemPcsId, qty: '5', uom: 'pcs', lineNo: 2 },
    ]);
    expect((await transitionTransferOrderStatus(toId, 'in_transit')).ok).toBe(true);
    expectMatter(await matterForItem(seed.itemKgId, 'kg', toId), {
      onHand: '0.000000',
      inTransit: '2.000000',
      total: '2.000000',
    });
    expectMatter(await matterForItem(seed.itemPcsId, 'pcs', toId), {
      onHand: '0.000000',
      inTransit: '5.000000',
      total: '5.000000',
    });

    expect((await transitionTransferOrderStatus(toId, 'cancelled')).ok).toBe(true);
    expectMatter(await matterForItem(seed.itemKgId, 'kg'), kgBaseline);
    expectMatter(await matterForItem(seed.itemPcsId, 'pcs'), pcsBaseline);
    expect(toItemUomKey(seed.itemKgId, 'kg')).not.toBe(toItemUomKey(seed.itemPcsId, 'pcs'));
  });

  it('conserves per UOM when same item appears with different UOM lines', async () => {
    const dualUomItemId = seed.itemKgId;
    await makeSourceLp(dualUomItemId, '4', 'kg');
    const pcsLpId = await makeSourceLp(dualUomItemId, '10', 'pcs');

    const toId = await makeTo([
      { itemId: dualUomItemId, qty: '4', uom: 'kg', lineNo: 1 },
      { itemId: dualUomItemId, qty: '10', uom: 'pcs', lineNo: 2 },
    ]);
    expect((await transitionTransferOrderStatus(toId, 'in_transit')).ok).toBe(true);
    expectMatter(await matterForItem(dualUomItemId, 'kg', toId), {
      onHand: '0.000000',
      inTransit: '4.000000',
      total: '4.000000',
    });
    expectMatter(await matterForItem(dualUomItemId, 'pcs', toId), {
      onHand: '0.000000',
      inTransit: '10.000000',
      total: '10.000000',
    });

    expect((await transitionTransferOrderStatus(toId, 'cancelled')).ok).toBe(true);
    expectMatter(await matterForItem(dualUomItemId, 'kg'), {
      onHand: '4.000000',
      inTransit: '0',
      total: '4.000000',
    });
    expectMatter(await matterForItem(dualUomItemId, 'pcs'), {
      onHand: '10.000000',
      inTransit: '0',
      total: '10.000000',
    });
    expect(await stockMoveNetForLp(pcsLpId)).toBe('20.000000');
  });
});

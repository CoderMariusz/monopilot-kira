/**
 * Wave 14 — TO import all_or_nothing rollback (real Postgres).
 * Skips when DATABASE_URL is unset.
 *
 * Order 2 failure is forced via a call-2 spy returning persistence_failed — the TO
 * core has no blocked-supplier analogue; group 1 still performs real inserts on the
 * shared withOrgContext transaction before the forced failure.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../../../../../../packages/db/src/clients.js';
import * as transferCore from '../create-transfer-order-core';
import { commitToImport } from '../import-to';
import type { ToImportRow } from '../import-to.types';

const databaseUrl = process.env.DATABASE_URL;
const runPg = databaseUrl ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const roleId = randomUUID();
const whAId = randomUUID();
const whBId = randomUUID();
const itemAId = randomUUID();
const itemBId = randomUUID();

const WH_A = 'W14-WH-A';
const WH_B = 'W14-WH-B';
const ITEM_A = 'W14-ITEM-A';
const ITEM_B = 'W14-ITEM-B';
const ORDER1_REF = 'W14-TO-EXT-A';
const ORDER2_REF = 'W14-TO-EXT-B';

function toRow(overrides: Partial<ToImportRow> = {}): ToImportRow {
  return {
    external_ref: ORDER1_REF,
    from_warehouse_code: WH_A,
    to_warehouse_code: WH_B,
    item_code: ITEM_A,
    qty: 10,
    uom: 'kg',
    date: '2027-06-24',
    ...overrides,
  };
}

function twoOrderImportRows(): ToImportRow[] {
  return [
    toRow({ external_ref: ORDER1_REF, from_warehouse_code: WH_A, to_warehouse_code: WH_B, item_code: ITEM_A, uom: 'kg' }),
    toRow({ external_ref: ORDER1_REF, from_warehouse_code: WH_A, to_warehouse_code: WH_B, item_code: ITEM_B, uom: 'ea' }),
    toRow({ external_ref: ORDER2_REF, from_warehouse_code: WH_B, to_warehouse_code: WH_A, item_code: ITEM_A, uom: 'kg' }),
    toRow({ external_ref: ORDER2_REF, from_warehouse_code: WH_B, to_warehouse_code: WH_A, item_code: ITEM_B, uom: 'box' }),
  ];
}

runPg('TO import all_or_nothing rollback (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;
  const originalCore = transferCore.createTransferOrderCore;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Wave14 TO Import Tenant', 'eu', 'https://wave14-to-import.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'Wave14 TO Import Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `wave14-to-${orgId.slice(0, 8)}`],
    );
    await ownerPool
      .query(`select public.seed_planning_procurement_manage_permissions_for_org($1::uuid)`, [orgId])
      .catch(() => undefined);
    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions)
       values ($1, $2, $3, $3, 'Wave14 TO Import Role', '[]'::jsonb)
       on conflict (id) do nothing`,
      [roleId, orgId, `wave14-to-${roleId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, $3, 'Wave14 TO Import User', $4)
       on conflict (id) do nothing`,
      [userId, orgId, `wave14-to-${userId}@example.test`, roleId],
    );
    await ownerPool.query(
      `insert into public.user_roles (org_id, user_id, role_id)
       values ($1, $2, $3) on conflict do nothing`,
      [orgId, userId, roleId],
    );
    for (const permission of ['planning.to.manage']) {
      await ownerPool.query(
        `insert into public.role_permissions (role_id, permission)
         values ($1, $2) on conflict do nothing`,
        [roleId, permission],
      );
    }
    await ownerPool.query(
      `insert into public.warehouses (id, org_id, code, name, warehouse_type)
       values ($1, $2, $3, 'Wave14 WH A', 'main'),
              ($4, $2, $5, 'Wave14 WH B', 'main')
       on conflict (id) do nothing`,
      [whAId, orgId, WH_A, whBId, WH_B],
    );
    await ownerPool.query(
      `insert into public.items
         (id, org_id, item_code, item_type, name, uom_base, output_uom, each_per_box, status, uom_secondary)
       values ($1, $2, $3, 'rm', 'Wave14 Item A', 'kg', 'base', 1, 'active', null),
              ($4, $2, $5, 'fg', 'Wave14 Item B', 'pcs', 'base', 12, 'active', 'box')
       on conflict (id) do nothing`,
      [itemAId, orgId, ITEM_A, itemBId, ITEM_B],
    );
    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = userId;
    process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;
  });

  beforeEach(async () => {
    await ownerPool.query(`delete from public.transfer_order_lines where org_id = $1::uuid`, [orgId]);
    await ownerPool.query(`delete from public.transfer_orders where org_id = $1::uuid`, [orgId]);
    await ownerPool.query(`delete from public.audit_events where org_id = $1::uuid`, [orgId]);
    await ownerPool.query(
      `delete from public.import_export_jobs
        where org_id = $1::uuid and kind = 'import' and target = 'transfer_orders'`,
      [orgId],
    );

    vi.restoreAllMocks();
    let coreCall = 0;
    vi.spyOn(transferCore, 'createTransferOrderCore').mockImplementation(async (ctx, input) => {
      coreCall += 1;
      if (coreCall >= 2) {
        return {
          ok: false,
          error: 'persistence_failed',
          message: 'wave14 pg test simulated order-2 failure',
        };
      }
      return originalCore(ctx, input);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    delete process.env.NEXT_SERVER_ACTION_ORG_ID;

    await ownerPool?.query(`delete from public.transfer_order_lines where org_id = $1::uuid`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.transfer_orders where org_id = $1::uuid`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.audit_events where org_id = $1::uuid`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.import_export_jobs where org_id = $1::uuid`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.items where org_id = $1::uuid`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.warehouses where org_id = $1::uuid`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.role_permissions where role_id = $1::uuid`, [roleId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.user_roles where org_id = $1::uuid`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.users where org_id = $1::uuid`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.roles where org_id = $1::uuid`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.organizations where id = $1::uuid`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.tenants where id = $1::uuid`, [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  async function countTransferOrders(toNumber: string): Promise<number> {
    const { rows } = await ownerPool.query<{ count: string }>(
      `select count(*)::text as count
         from public.transfer_orders
        where org_id = $1::uuid
          and to_number = $2`,
      [orgId, toNumber],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async function countImportJobs(): Promise<number> {
    const { rows } = await ownerPool.query<{ count: string }>(
      `select count(*)::text as count
         from public.import_export_jobs
        where org_id = $1::uuid
          and kind = 'import'
          and target = 'transfer_orders'`,
      [orgId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async function countAuditEvents(): Promise<number> {
    const { rows } = await ownerPool.query<{ count: string }>(
      `select count(*)::text as count from public.audit_events where org_id = $1::uuid`,
      [orgId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  it('all_or_nothing rolls back order 1 when order 2 fails at runtime', async () => {
    const result = await commitToImport(twoOrderImportRows(), { mode: 'all_or_nothing' });

    expect(result.created).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.failed.length).toBeGreaterThan(0);
    expect(await countTransferOrders(ORDER1_REF)).toBe(0);
    expect(await countTransferOrders(ORDER2_REF)).toBe(0);
    expect(await countImportJobs()).toBe(0);
    expect(await countAuditEvents(), 'no audit rows persist on all_or_nothing rollback').toBe(0);
  });

  it('skip_invalid commits order 1 while order 2 is reported failed (contrast)', async () => {
    const result = await commitToImport(twoOrderImportRows(), { mode: 'skip_invalid' });

    expect(result.created).toEqual([{ to_number: ORDER1_REF, external_ref: ORDER1_REF }]);
    expect(result.failed.length).toBeGreaterThan(0);
    expect(await countTransferOrders(ORDER1_REF)).toBe(1);
    expect(await countTransferOrders(ORDER2_REF)).toBe(0);
    expect(await countImportJobs()).toBe(1);
    expect(await countAuditEvents(), 'best-effort commit persists audit rows').toBeGreaterThan(0);
  });
});

/**
 * Wave 14 — PO import all_or_nothing rollback (real Postgres).
 * Skips when DATABASE_URL is unset.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../../../../../../packages/db/src/clients.js';
import { commitPoImport } from '../import-po';
import type { PoImportRow } from '../import-po.types';

const databaseUrl = process.env.DATABASE_URL;
const runPg = databaseUrl ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const roleId = randomUUID();
const siteId = randomUUID();
const supplierActiveId = randomUUID();
const supplierBlockedId = randomUUID();
const itemAId = randomUUID();
const itemBId = randomUUID();

const SUP_ACTIVE = 'W14-SUP-A';
const SUP_BLOCKED = 'W14-SUP-B';
const ITEM_A = 'W14-ITEM-A';
const ITEM_B = 'W14-ITEM-B';
const GROUP1_REF = 'W14-PO-EXT-A';
const GROUP2_REF = 'W14-PO-EXT-B';
const FUTURE_DATE = '2027-06-24';

function poRow(overrides: Partial<PoImportRow> = {}): PoImportRow {
  return {
    external_ref: GROUP1_REF,
    supplier_code: SUP_ACTIVE,
    item_code: ITEM_A,
    qty: 10,
    uom: 'kg',
    price: 6.25,
    currency: 'EUR',
    expected_delivery: FUTURE_DATE,
    notes: 'wave14 pg rollback',
    ...overrides,
  };
}

function twoGroupImportRows(): PoImportRow[] {
  return [
    poRow({ external_ref: GROUP1_REF, supplier_code: SUP_ACTIVE, item_code: ITEM_A, uom: 'kg' }),
    poRow({ external_ref: GROUP1_REF, supplier_code: SUP_ACTIVE, item_code: ITEM_B, uom: 'ea' }),
    poRow({ external_ref: GROUP2_REF, supplier_code: SUP_BLOCKED, item_code: ITEM_A, uom: 'kg', currency: 'GBP' }),
    poRow({ external_ref: GROUP2_REF, supplier_code: SUP_BLOCKED, item_code: ITEM_B, uom: 'box', currency: 'GBP' }),
  ];
}

runPg('PO import all_or_nothing rollback (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Wave14 PO Import Tenant', 'eu', 'https://wave14-po-import.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'Wave14 PO Import Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `wave14-po-${orgId.slice(0, 8)}`],
    );
    await ownerPool
      .query(`select public.seed_planning_procurement_manage_permissions_for_org($1::uuid)`, [orgId])
      .catch(() => undefined);
    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions)
       values ($1, $2, $3, $3, 'Wave14 PO Import Role', '[]'::jsonb)
       on conflict (id) do nothing`,
      [roleId, orgId, `wave14-po-${roleId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, $3, 'Wave14 PO Import User', $4)
       on conflict (id) do nothing`,
      [userId, orgId, `wave14-po-${userId}@example.test`, roleId],
    );
    await ownerPool.query(
      `insert into public.user_roles (org_id, user_id, role_id)
       values ($1, $2, $3) on conflict do nothing`,
      [orgId, userId, roleId],
    );
    for (const permission of ['planning.po.manage']) {
      await ownerPool.query(
        `insert into public.role_permissions (role_id, permission)
         values ($1, $2) on conflict do nothing`,
        [roleId, permission],
      );
    }
    await ownerPool.query(
      `insert into public.sites (id, org_id, site_code, name, is_default, is_active)
       values ($1, $2, 'W14-SITE', 'Wave14 PO Site', true, true)
       on conflict (id) do nothing`,
      [siteId, orgId],
    );
    await ownerPool.query(
      `insert into public.suppliers
         (id, org_id, code, name, currency, status)
       values ($1, $2, $3, 'Wave14 Active Supplier', 'EUR', 'active'),
              ($4, $2, $5, 'Wave14 Blocked Supplier', 'GBP', 'blocked')
       on conflict (id) do nothing`,
      [supplierActiveId, orgId, SUP_ACTIVE, supplierBlockedId, SUP_BLOCKED],
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-01T12:00:00.000Z'));
    await ownerPool.query(`delete from public.purchase_order_lines where org_id = $1::uuid`, [orgId]);
    await ownerPool.query(`delete from public.purchase_orders where org_id = $1::uuid`, [orgId]);
    await ownerPool.query(`delete from public.audit_events where org_id = $1::uuid`, [orgId]);
    await ownerPool.query(
      `delete from public.import_export_jobs
        where org_id = $1::uuid and kind = 'import' and target = 'purchase_orders'`,
      [orgId],
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    delete process.env.NEXT_SERVER_ACTION_ORG_ID;

    await ownerPool?.query(`delete from public.purchase_order_lines where org_id = $1::uuid`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.purchase_orders where org_id = $1::uuid`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.audit_events where org_id = $1::uuid`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.import_export_jobs where org_id = $1::uuid`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.items where org_id = $1::uuid`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.suppliers where org_id = $1::uuid`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.sites where org_id = $1::uuid`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.role_permissions where role_id = $1::uuid`, [roleId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.user_roles where org_id = $1::uuid`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.users where org_id = $1::uuid`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.roles where org_id = $1::uuid`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.organizations where id = $1::uuid`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.tenants where id = $1::uuid`, [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  async function countPurchaseOrders(poNumber: string): Promise<number> {
    const { rows } = await ownerPool.query<{ count: string }>(
      `select count(*)::text as count
         from public.purchase_orders
        where org_id = $1::uuid
          and po_number = $2`,
      [orgId, poNumber],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async function countImportJobs(): Promise<number> {
    const { rows } = await ownerPool.query<{ count: string }>(
      `select count(*)::text as count
         from public.import_export_jobs
        where org_id = $1::uuid
          and kind = 'import'
          and target = 'purchase_orders'`,
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

  it('all_or_nothing rolls back group 1 when group 2 hits blocked supplier at runtime', async () => {
    const result = await commitPoImport(twoGroupImportRows(), { mode: 'all_or_nothing' });

    expect(result.created).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.failed.length).toBeGreaterThan(0);
    expect(await countPurchaseOrders(GROUP1_REF)).toBe(0);
    expect(await countPurchaseOrders(GROUP2_REF)).toBe(0);
    expect(await countImportJobs()).toBe(0);
    expect(await countAuditEvents(), 'no audit rows persist on all_or_nothing rollback').toBe(0);
  });

  it('skip_invalid commits group 1 while group 2 is reported failed (contrast)', async () => {
    const result = await commitPoImport(twoGroupImportRows(), { mode: 'skip_invalid' });

    expect(result.created).toEqual([{ po_number: GROUP1_REF, external_ref: GROUP1_REF }]);
    expect(result.failed.length).toBeGreaterThan(0);
    expect(await countPurchaseOrders(GROUP1_REF)).toBe(1);
    expect(await countPurchaseOrders(GROUP2_REF)).toBe(0);
    expect(await countImportJobs()).toBe(1);
    expect(await countAuditEvents(), 'best-effort commit persists audit rows').toBeGreaterThan(0);
  });
});

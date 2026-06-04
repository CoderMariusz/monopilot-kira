import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getOwnerConnection } from '../test-utils/test-pool.js';

// 08-Production T-004 — wo_waste_log schema (migration 183).
// Asserts: waste_categories FK (V-PROD-05), shift_id NOT NULL (V-PROD-19), qty_kg > 0 CHECK,
// the three indexes, RLS enabled+forced with app.current_org_id() and no GUC reads.

const runIntegrationSuite = process.env.DATABASE_URL ? describe : describe.skip;

const tenantId = '08040000-0000-4000-8000-000000000001';
const orgId = '08040000-0000-4000-8000-0000000000a0';

async function seed(admin: pg.Pool) {
  await admin.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-004 Waste Tenant', 'eu', 'https://t-004-waste.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  await admin.query(
    `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
     values ($1, $2, 'Waste Org', 'fmcg', 't-004-waste')
     on conflict (id) do nothing`,
    [orgId, tenantId],
  );
}

async function cleanup(admin: pg.Pool) {
  await admin.query(`delete from public.wo_waste_log where org_id = $1`, [orgId]).catch(() => undefined);
  await admin.query(`delete from public.waste_categories where org_id = $1`, [orgId]).catch(() => undefined);
  await admin.query(`delete from public.work_orders where org_id = $1`, [orgId]).catch(() => undefined);
}

runIntegrationSuite('08-production wo_waste_log schema (migration 183)', () => {
  let admin: pg.Pool;
  let woId: string;
  let categoryId: string;

  beforeAll(async () => {
    admin = getOwnerConnection();
    await seed(admin);
    await cleanup(admin);
    woId = randomUUID();
    categoryId = randomUUID();
    await admin.query(
      `insert into public.work_orders (id, org_id, wo_number, product_id, item_type_at_creation, planned_quantity, uom)
       values ($1, $2, 'WO-WASTE-1', $3, 'fg', 100.000, 'kg')`,
      [woId, orgId, randomUUID()],
    );
    await admin.query(
      `insert into public.waste_categories (id, org_id, code, name) values ($1, $2, 'TRIM', 'Trimmings')`,
      [categoryId, orgId],
    );
  });

  afterAll(async () => {
    await cleanup(admin);
    await admin.query(`delete from public.organizations where id = $1`, [orgId]).catch(() => undefined);
    await admin.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await admin.end();
  });

  it('AC1 — category_id pointing to a non-existent waste_categories row raises FK violation (V-PROD-05)', async () => {
    await expect(
      admin.query(
        `insert into public.wo_waste_log (transaction_id, org_id, wo_id, category_id, qty_kg, shift_id)
         values ($1, $2, $3, $4, 5.000, 'A')`,
        [randomUUID(), orgId, woId, randomUUID()],
      ),
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it('AC2 — shift_id NULL is rejected by NOT NULL (V-PROD-19); valid row inserts', async () => {
    await expect(
      admin.query(
        `insert into public.wo_waste_log (transaction_id, org_id, wo_id, category_id, qty_kg, shift_id)
         values ($1, $2, $3, $4, 5.000, NULL)`,
        [randomUUID(), orgId, woId, categoryId],
      ),
    ).rejects.toThrow(/not-null|null value/i);

    // qty_kg <= 0 rejected by CHECK
    await expect(
      admin.query(
        `insert into public.wo_waste_log (transaction_id, org_id, wo_id, category_id, qty_kg, shift_id)
         values ($1, $2, $3, $4, 0, 'A')`,
        [randomUUID(), orgId, woId, categoryId],
      ),
    ).rejects.toThrow(/check|qty_kg/i);

    const txn = randomUUID();
    await admin.query(
      `insert into public.wo_waste_log (transaction_id, org_id, wo_id, category_id, qty_kg, shift_id)
       values ($1, $2, $3, $4, 12.500, 'A')`,
      [txn, orgId, woId, categoryId],
    );
    // transaction_id UNIQUE (R14) — duplicate rejected.
    await expect(
      admin.query(
        `insert into public.wo_waste_log (transaction_id, org_id, wo_id, category_id, qty_kg, shift_id)
         values ($1, $2, $3, $4, 1.000, 'B')`,
        [txn, orgId, woId, categoryId],
      ),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it('AC3 — idx_waste_category_time + idx_waste_tenant_time exist on (col, recorded_at); RLS forced', async () => {
    const { rows: idx } = await admin.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes
       where tablename = 'wo_waste_log' and indexname in ('idx_waste_wo','idx_waste_category_time','idx_waste_tenant_time')`,
    );
    const byName = new Map(idx.map((r) => [r.indexname, r.indexdef.toLowerCase()]));
    expect(byName.has('idx_waste_wo')).toBe(true);
    expect(byName.get('idx_waste_category_time')).toContain('recorded_at');
    expect(byName.get('idx_waste_category_time')).toContain('category_id');
    expect(byName.get('idx_waste_tenant_time')).toContain('recorded_at');
    expect(byName.get('idx_waste_tenant_time')).toContain('org_id');

    const { rows: rls } = await admin.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relrowsecurity, relforcerowsecurity from pg_class where relname = 'wo_waste_log' and relkind = 'r'`,
    );
    expect(rls[0].relrowsecurity).toBe(true);
    expect(rls[0].relforcerowsecurity).toBe(true);

    const { rows: pol } = await admin.query<{ qual: string | null; with_check: string | null }>(
      `select qual, with_check from pg_policies where tablename = 'wo_waste_log'`,
    );
    expect(pol).toHaveLength(1);
    const blob = `${pol[0].qual ?? ''} ${pol[0].with_check ?? ''}`;
    expect(blob).toContain('app.current_org_id()');
    expect(blob).not.toContain('app.tenant_id');
  });
});

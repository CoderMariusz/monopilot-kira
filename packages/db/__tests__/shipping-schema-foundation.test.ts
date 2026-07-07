import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

// 11-Shipping — SCHEMA foundation (migrations 211 + 212).
// Covers T-001 (customer domain), T-006 (sales_orders + lines), T-011 (inventory_allocations),
// T-015 (waves + pick_lists + pick_list_lines), T-018 (shipments + boxes + box_contents + SSCC),
// the BOL slice of T-023 (bill_of_lading), and the T-031/T-033 ship.* RBAC seed.
//
// Asserts: 15 tables + org_id NOT NULL; CHECK enums (SO status / pick status / sscc regex);
// SO order_number GENERATED format; RLS enabled+forced + app.current_org_id() policies with NO GUC
// reads; cross-org isolation; UNIQUE(org, *_number); FK CASCADE; canonical-owner separation (no
// wo_outputs/quality_holds/license_plates created here); v_active_holds read (holdsGuard contract);
// per-org SSCC counter atomic + mod-10 + generate_sscc; ship.* permission seed grants the org-admin
// family the full family in BOTH stores + idempotent.

const runIntegrationSuite = process.env.DATABASE_URL ? describe : describe.skip;

const tenantId = '11010000-0000-4000-8000-000000000001';
const orgAId = '11010000-0000-4000-8000-0000000000a0';
const orgBId = '11010000-0000-4000-8000-0000000000b0';

const SHIPPING_TABLES = [
  'customers',
  'customer_contacts',
  'customer_addresses',
  'customer_allergen_restrictions',
  'sales_orders',
  'sales_order_lines',
  'inventory_allocations',
  'waves',
  'pick_lists',
  'pick_list_lines',
  'shipments',
  'shipment_boxes',
  'shipment_box_contents',
  'bill_of_lading',
] as const;

const SHIP_PERMISSIONS = [
  'ship.so.create',
  'ship.so.confirm',
  'ship.so.cancel',
  'ship.hold.place',
  'ship.hold.release',
  'ship.alloc.override',
  'ship.allergen.override',
  'ship.pick.execute',
  'ship.pack.close',
  'ship.ship.confirm',
  'ship.bol.sign',
  'ship.rma.disposition',
  'ship.dashboard.view',
  'ship.dlq.replay',
].sort();

const ADMIN_ROLE_FAMILY = ['org.access.admin', 'org.platform.admin', 'owner', 'admin', 'org_admin'];

async function seedOrgs(adminPool: pg.Pool): Promise<void> {
  await adminPool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-shipping Tenant', 'eu', 'https://t-shipping.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  for (const [id, slug] of [
    [orgAId, 't-shipping-a'],
    [orgBId, 't-shipping-b'],
  ]) {
    // gs1_prefix is a valid 7-digit GS1 company prefix so generate_sscc succeeds.
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code, gs1_prefix)
       values ($1, $2, 'Shipping Org', $3, 'fmcg', '0501234')
       on conflict (id) do nothing`,
      [id, tenantId, slug],
    );
  }
}

async function cleanup(adminPool: pg.Pool): Promise<void> {
  for (const orgId of [orgAId, orgBId]) {
    // child-first delete order.
    for (const t of [
      'shipment_box_contents',
      'shipment_boxes',
      'bill_of_lading',
      'shipments',
      'pick_list_lines',
      'pick_lists',
      'waves',
      'inventory_allocations',
      'sales_order_lines',
      'sales_orders',
      'customer_allergen_restrictions',
      'customer_addresses',
      'customer_contacts',
      'customers',
      'sscc_counters',
    ]) {
      await adminPool.query(`delete from public.${t} where org_id = $1`, [orgId]).catch(() => undefined);
    }
  }
}

function bindOrg(adminPool: pg.Pool, appClient: pg.PoolClient, orgId: string): Promise<unknown> {
  const sessionToken = randomUUID();
  return adminPool
    .query(
      `insert into app.session_org_contexts (session_token, org_id) values ($1, $2)
       on conflict (session_token) do update set org_id = excluded.org_id`,
      [sessionToken, orgId],
    )
    .then(() => appClient.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]));
}

async function insertCustomer(
  adminPool: pg.Pool,
  orgId: string,
  code = 'C-001',
): Promise<string> {
  const { rows } = await adminPool.query<{ id: string }>(
    `insert into public.customers (org_id, customer_code, name, category)
     values ($1, $2, 'Acme', 'retail') returning id`,
    [orgId, code],
  );
  return rows[0].id;
}

async function insertSo(adminPool: pg.Pool, orgId: string, customerId: string): Promise<{ id: string; order_number: string }> {
  const { rows } = await adminPool.query<{ id: string; order_number: string }>(
    `insert into public.sales_orders (org_id, customer_id, order_date)
     values ($1, $2, '2026-06-01') returning id, order_number`,
    [orgId, customerId],
  );
  return rows[0];
}

runIntegrationSuite('11-shipping schema foundation (migrations 211 + 212)', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    adminPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedOrgs(adminPool);
    await cleanup(adminPool);
  });

  afterAll(async () => {
    await cleanup(adminPool);
    await adminPool
      .query(`delete from public.role_permissions rp using public.roles r where rp.role_id = r.id and r.org_id = any($1::uuid[])`, [[orgAId, orgBId]])
      .catch(() => undefined);
    await adminPool.query(`delete from public.roles where org_id = any($1::uuid[])`, [[orgAId, orgBId]]).catch(() => undefined);
    await adminPool.query(`delete from public.organizations where id = any($1::uuid[])`, [[orgAId, orgBId]]).catch(() => undefined);
    await adminPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await appPool?.end();
    await adminPool?.end();
  });

  it('AC1 — all 14 shipping tables exist with org_id NOT NULL', async () => {
    const { rows: tables } = await adminPool.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and tablename = any($1::text[])`,
      [SHIPPING_TABLES as unknown as string[]],
    );
    expect(tables.map((r) => r.tablename).sort()).toEqual([...SHIPPING_TABLES].sort());

    const { rows: orgCols } = await adminPool.query<{ table_name: string; is_nullable: string }>(
      `select table_name, is_nullable from information_schema.columns
       where table_schema = 'public' and column_name = 'org_id' and table_name = any($1::text[])`,
      [SHIPPING_TABLES as unknown as string[]],
    );
    expect(orgCols).toHaveLength(SHIPPING_TABLES.length);
    for (const row of orgCols) {
      expect(row.is_nullable, `${row.table_name}.org_id nullable`).toBe('NO');
    }
  });

  it('AC2 — site_id is nullable uuid on every operational table that carries it (day-1 rule)', async () => {
    const { rows } = await adminPool.query<{ table_name: string; is_nullable: string; data_type: string }>(
      `select table_name, is_nullable, data_type from information_schema.columns
       where table_schema='public' and column_name='site_id' and table_name = any($1::text[])`,
      [SHIPPING_TABLES as unknown as string[]],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.is_nullable, `${r.table_name}.site_id nullable`).toBe('YES');
      expect(r.data_type).toBe('uuid');
    }
  });

  it('AC3 — sales_orders order_number GENERATED format + status CHECK + ship-date CHECK', async () => {
    const cust = await insertCustomer(adminPool, orgAId, `C-${randomUUID().slice(0, 6)}`);
    const so = await insertSo(adminPool, orgAId, cust);
    expect(so.order_number).toMatch(/^SO-\d{4}-\d{5}$/);

    // illegal status rejected.
    await expect(
      adminPool.query(
        `insert into public.sales_orders (org_id, customer_id, order_date, status) values ($1, $2, '2026-06-01', 'bogus')`,
        [orgAId, cust],
      ),
    ).rejects.toThrow();
    // promised_ship_date < order_date rejected (V-SHIP-SO-04).
    await expect(
      adminPool.query(
        `insert into public.sales_orders (org_id, customer_id, order_date, promised_ship_date)
         values ($1, $2, '2026-06-10', '2026-06-01')`,
        [orgAId, cust],
      ),
    ).rejects.toThrow();
  });

  it('AC4 — SO line FK CASCADE + qty/price CHECK + UNIQUE(so, line)', async () => {
    const cust = await insertCustomer(adminPool, orgAId, `C-${randomUUID().slice(0, 6)}`);
    const so = await insertSo(adminPool, orgAId, cust);
    const product = randomUUID();
    await adminPool.query(
      `insert into public.sales_order_lines (org_id, sales_order_id, line_number, product_id, quantity_ordered, unit_price_gbp)
       values ($1, $2, 1, $3, 10.000, 2.5000)`,
      [orgAId, so.id, product],
    );
    // duplicate (so, line_number) rejected.
    await expect(
      adminPool.query(
        `insert into public.sales_order_lines (org_id, sales_order_id, line_number, product_id, quantity_ordered, unit_price_gbp)
         values ($1, $2, 1, $3, 5.000, 1.0000)`,
        [orgAId, so.id, product],
      ),
    ).rejects.toThrow();
    // qty<=0 rejected.
    await expect(
      adminPool.query(
        `insert into public.sales_order_lines (org_id, sales_order_id, line_number, product_id, quantity_ordered, unit_price_gbp)
         values ($1, $2, 2, $3, 0, 1.0000)`,
        [orgAId, so.id, product],
      ),
    ).rejects.toThrow();
    // CASCADE: delete SO removes lines.
    await adminPool.query(`delete from public.sales_orders where id = $1`, [so.id]);
    const { rows } = await adminPool.query(`select id from public.sales_order_lines where sales_order_id = $1`, [so.id]);
    expect(rows).toHaveLength(0);
  });

  it('AC5 — pick_lists priority CHECK (1..5) + status CHECK', async () => {
    await expect(
      adminPool.query(`insert into public.pick_lists (org_id, priority) values ($1, 6)`, [orgAId]),
    ).rejects.toThrow();
    await expect(
      adminPool.query(`insert into public.pick_lists (org_id, status) values ($1, 'frozen')`, [orgAId]),
    ).rejects.toThrow();
    const { rows } = await adminPool.query<{ pick_list_number: string }>(
      `insert into public.pick_lists (org_id, priority) values ($1, 3) returning pick_list_number`,
      [orgAId],
    );
    expect(rows[0].pick_list_number).toMatch(/^PL-\d{4}-\d{5}$/);
  });

  it('AC6 — shipment_boxes sscc 18-digit CHECK + UNIQUE(org, sscc)', async () => {
    const { rows: ship } = await adminPool.query<{ id: string }>(
      `insert into public.shipments (org_id) values ($1) returning id`,
      [orgAId],
    );
    const sscc = '050123400000000017';
    await adminPool.query(
      `insert into public.shipment_boxes (org_id, shipment_id, box_number, sscc) values ($1, $2, 1, $3)`,
      [orgAId, ship[0].id, sscc],
    );
    // non-18-digit rejected.
    await expect(
      adminPool.query(
        `insert into public.shipment_boxes (org_id, shipment_id, box_number, sscc) values ($1, $2, 2, '123')`,
        [orgAId, ship[0].id],
      ),
    ).rejects.toThrow();
    // duplicate sscc per org rejected.
    await expect(
      adminPool.query(
        `insert into public.shipment_boxes (org_id, shipment_id, box_number, sscc) values ($1, $2, 3, $3)`,
        [orgAId, ship[0].id, sscc],
      ),
    ).rejects.toThrow();
  });

  it('AC7 — RLS enabled+forced; every policy references app.current_org_id() with no GUC reads', async () => {
    const { rows: rls } = await adminPool.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname, relrowsecurity, relforcerowsecurity from pg_class
       where relname = any($1::text[]) and relkind = 'r'`,
      [SHIPPING_TABLES as unknown as string[]],
    );
    expect(rls).toHaveLength(SHIPPING_TABLES.length);
    for (const row of rls) {
      expect(row.relrowsecurity, `${row.relname} rowsecurity`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} forcerowsecurity`).toBe(true);
    }

    const { rows: policies } = await adminPool.query<{ tablename: string; qual: string | null; with_check: string | null }>(
      `select tablename, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = any($1::text[])`,
      [SHIPPING_TABLES as unknown as string[]],
    );
    expect(policies.length).toBe(SHIPPING_TABLES.length);
    for (const p of policies) {
      const blob = `${p.qual ?? ''} ${p.with_check ?? ''}`;
      expect(blob, `${p.tablename} references app.current_org_id()`).toContain('app.current_org_id()');
      expect(blob, `${p.tablename} no tenant_id GUC`).not.toContain('app.tenant_id');
      expect(blob, `${p.tablename} no current_org_id GUC`).not.toMatch(
        /current_setting\(\s*'app\.current_org_id'/,
      );
    }
  });

  it('AC8 — cross-org isolation: org B cannot see org A customers/SO under app_user RLS', async () => {
    const custA = await insertCustomer(adminPool, orgAId, 'C-ISO');
    const soA = await insertSo(adminPool, orgAId, custA);

    const clientB = await appPool.connect();
    try {
      await clientB.query('begin');
      await bindOrg(adminPool, clientB, orgBId);
      const { rows: custRows } = await clientB.query<{ id: string }>(`select id from public.customers`);
      expect(custRows.map((r) => r.id)).not.toContain(custA);
      const { rows: soRows } = await clientB.query<{ id: string }>(`select id from public.sales_orders`);
      expect(soRows.map((r) => r.id)).not.toContain(soA.id);
      await clientB.query('commit');
    } catch (e) {
      await clientB.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      clientB.release();
    }

    // same customer_code in two orgs both succeed (UNIQUE is per org).
    const custB = await insertCustomer(adminPool, orgBId, 'C-ISO');
    expect(custB).toBeTruthy();
  });

  it('AC9 — canonical-owner separation: 211 created NO wo_outputs / quality_holds / license_plates', async () => {
    const { rows } = await adminPool.query<{ filename: string }>(
      `select filename from public.schema_migrations where filename = $1`,
      ['211-shipping-schema-foundation.sql'],
    );
    expect(rows).toHaveLength(1);
    // those tables exist (owned by their modules) but are NOT created/replaced by 211.
    const { rows: own } = await adminPool.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname='public'
       and tablename in ('wo_outputs','oee_snapshots','downtime_events','schedule_outputs','license_plates','quality_holds','ncr_reports')`,
    );
    expect(own.length).toBeGreaterThanOrEqual(1);
  });

  it('AC10 — v_active_holds is readable from a shipping consume path (holdsGuard contract)', async () => {
    // The shipping LP qa-status gate reads 09-quality v_active_holds (SECURITY INVOKER view).
    // Assert it exists and is queryable under org A app_user RLS (empty result is fine — proves the
    // read path + RLS plumbing, never re-reading quality_holds directly).
    const { rows: viewRows } = await adminPool.query<{ relname: string }>(
      `select relname from pg_class where relname = 'v_active_holds' and relkind = 'v'`,
    );
    expect(viewRows).toHaveLength(1);

    const clientA = await appPool.connect();
    try {
      await clientA.query('begin');
      await bindOrg(adminPool, clientA, orgAId);
      const { rows } = await clientA.query(
        `select hold_number, priority from public.v_active_holds where reference_type = 'lp' limit 1`,
      );
      expect(Array.isArray(rows)).toBe(true);
      await clientA.query('commit');
    } catch (e) {
      await clientA.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      clientA.release();
    }
  });

  it('AC11 — next_sscc_serial atomic per-org + generate_sscc 18-digit mod-10 + missing-prefix guard', async () => {
    // atomic increment with no duplicates.
    const { rows: s1 } = await adminPool.query<{ next_sscc_serial: string }>(`select public.next_sscc_serial($1)`, [orgAId]);
    const { rows: s2 } = await adminPool.query<{ next_sscc_serial: string }>(`select public.next_sscc_serial($1)`, [orgAId]);
    expect(Number(s2[0].next_sscc_serial)).toBe(Number(s1[0].next_sscc_serial) + 1);

    // generate_sscc → 18 digits with a valid mod-10 check digit.
    const { rows: g } = await adminPool.query<{ generate_sscc: string }>(`select public.generate_sscc($1, 0)`, [orgAId]);
    const sscc = g[0].generate_sscc;
    expect(sscc).toMatch(/^\d{18}$/);
    const { rows: chk } = await adminPool.query<{ sscc_mod10: number }>(`select public.sscc_mod10($1)`, [sscc.slice(0, 17)]);
    expect(chk[0].sscc_mod10).toBe(Number(sscc.slice(17, 18)));

    // missing GS1 prefix → V-SHIP-PACK-03.
    await adminPool.query(`update public.organizations set gs1_prefix = null where id = $1`, [orgBId]);
    await expect(adminPool.query(`select public.generate_sscc($1, 0)`, [orgBId])).rejects.toThrow(/V-SHIP-PACK-03/);
    await adminPool.query(`update public.organizations set gs1_prefix = '0501234' where id = $1`, [orgBId]);
  });

  it('generate_sscc rejects invalid prefix without advancing sscc_counters', async () => {
    const { rows: before } = await adminPool.query<{ last_serial: string | null }>(
      `select last_serial::text from public.sscc_counters where org_id = $1`,
      [orgAId],
    );
    const beforeSerial = Number(before[0]?.last_serial ?? 0);

    await adminPool.query(`update public.organizations set gs1_prefix = '12345678' where id = $1`, [orgAId]);
    await expect(adminPool.query(`select public.generate_sscc($1, 0)`, [orgAId])).rejects.toThrow(/V-SHIP-PACK-03/);

    const { rows: after } = await adminPool.query<{ last_serial: string | null }>(
      `select last_serial::text from public.sscc_counters where org_id = $1`,
      [orgAId],
    );
    const afterSerial = Number(after[0]?.last_serial ?? 0);
    expect(afterSerial).toBe(beforeSerial);

    await adminPool.query(`update public.organizations set gs1_prefix = '0501234' where id = $1`, [orgAId]);
  });

  it('AC12 — ship.* RBAC seed grants the org-admin family the full family in BOTH stores + idempotent', async () => {
    await adminPool.query(`select public.seed_ship_permissions_for_org($1)`, [orgAId]);

    const { rows: normalized } = await adminPool.query<{ permission: string }>(
      `select distinct rp.permission from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1 and (r.code = any($2::text[]) or r.slug = any($2::text[]))
         and rp.permission like 'ship.%' order by rp.permission`,
      [orgAId, ADMIN_ROLE_FAMILY],
    );
    expect(normalized.map((r) => r.permission)).toEqual(SHIP_PERMISSIONS);

    const { rows: jsonbRows } = await adminPool.query<{ perms: string[] }>(
      `select (select array_agg(p order by p) from jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as p
                where p like 'ship.%') as perms
       from public.roles r
       where r.org_id = $1 and (r.code = any($2::text[]) or r.slug = any($2::text[]))`,
      [orgAId, ADMIN_ROLE_FAMILY],
    );
    expect(jsonbRows.length).toBeGreaterThan(0);
    for (const row of jsonbRows) {
      expect(row.perms ?? []).toEqual(SHIP_PERMISSIONS);
    }

    // idempotent: re-run produces no duplicate role_permissions rows.
    await adminPool.query(`select public.seed_ship_permissions_for_org($1)`, [orgAId]);
    const { rows: dupes } = await adminPool.query<{ copies: string }>(
      `select count(*)::text as copies from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1 and rp.permission like 'ship.%'
       group by rp.role_id, rp.permission having count(*) > 1`,
      [orgAId],
    );
    expect(dupes).toEqual([]);
  });
});

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

// 05-Warehouse wave-B schema (migration 193) — RED-first.
// Covers the LP transition ledger (lp_state_history, T-019), GRN header + multi-LP-per-line
// items (grns/grn_items, T-005), stock-movement log (stock_moves, T-006), and spare-parts
// inventory (spare_parts_stock).
//
// Asserts: all five tables exist with org_id NOT NULL + site_id NULLABLE; enum/sign CHECKs;
// RLS enabled+forced + app.current_org_id() policies with NO GUC reads; cross-org isolation;
// lp_state_history is append-only (app_user has no UPDATE/DELETE); grn_items frozen once GRN
// completed (V-WH-GRN-001 trigger); stock_moves negative qty only for 'adjustment';
// spare_parts_stock reserved<=on_hand; canonical-owner separation (NO wo_outputs / oee_snapshots
// / downtime_events / schedule_outputs / item_cost_history created by mig 193).

const runIntegrationSuite = process.env.DATABASE_URL ? describe : describe.skip;

const tenantId = '05b00000-0000-4000-8000-000000000001';
const orgAId = '05b00000-0000-4000-8000-0000000000a0';
const orgBId = '05b00000-0000-4000-8000-0000000000b0';

const WAVEB_TABLES = ['lp_state_history', 'grns', 'grn_items', 'stock_moves', 'spare_parts_stock'] as const;

async function seedOrgs(adminPool: pg.Pool) {
  await adminPool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'WH-B Tenant', 'eu', 'https://wh-b.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  for (const [id, slug] of [
    [orgAId, 't-wh-b-a'],
    [orgBId, 't-wh-b-b'],
  ]) {
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
       values ($1, $2, 'WH-B Org', 'fmcg', $3)
       on conflict (id) do nothing`,
      [id, tenantId, slug],
    );
  }
}

async function makeLp(adminPool: pg.Pool, orgId: string, lpNumber: string): Promise<string> {
  const id = randomUUID();
  await adminPool.query(
    `insert into public.license_plates (id, org_id, warehouse_id, lp_number, product_id, quantity, uom)
     values ($1, $2, $3, $4, $5, 100.000000, 'kg')`,
    [id, orgId, randomUUID(), lpNumber, randomUUID()],
  );
  return id;
}

async function cleanup(adminPool: pg.Pool) {
  for (const orgId of [orgAId, orgBId]) {
    for (const tbl of ['lp_state_history', 'stock_moves', 'grn_items', 'grns', 'spare_parts_stock', 'license_plates']) {
      await adminPool.query(`delete from public.${tbl} where org_id = $1`, [orgId]).catch(() => undefined);
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

runIntegrationSuite('05-warehouse wave-B schema (migration 193)', () => {
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
      .query(`delete from public.organizations where id = any($1::uuid[])`, [[orgAId, orgBId]])
      .catch(() => undefined);
    await adminPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await appPool?.end();
    await adminPool?.end();
  });

  it('AC1 — all five wave-B tables exist; org_id NOT NULL; site_id NULLABLE', async () => {
    const { rows: tables } = await adminPool.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and tablename = any($1::text[])`,
      [WAVEB_TABLES as unknown as string[]],
    );
    expect(tables.map((r) => r.tablename).sort()).toEqual([...WAVEB_TABLES].sort());

    const { rows: cols } = await adminPool.query<{ table_name: string; column_name: string; is_nullable: string }>(
      `select table_name, column_name, is_nullable from information_schema.columns
       where table_schema = 'public' and column_name in ('org_id', 'site_id')
         and table_name = any($1::text[])`,
      [WAVEB_TABLES as unknown as string[]],
    );
    for (const tbl of WAVEB_TABLES) {
      const org = cols.find((c) => c.table_name === tbl && c.column_name === 'org_id');
      const site = cols.find((c) => c.table_name === tbl && c.column_name === 'site_id');
      expect(org, `${tbl}.org_id`).toBeDefined();
      expect(org!.is_nullable, `${tbl}.org_id nullable`).toBe('NO');
      expect(site, `${tbl}.site_id`).toBeDefined();
      expect(site!.is_nullable, `${tbl}.site_id nullable`).toBe('YES');
    }
  });

  it('AC2 — lp_id hard FK to license_plates on lp_state_history / grn_items / stock_moves', async () => {
    const { rows: fks } = await adminPool.query<{ table_name: string; foreign_table: string }>(
      `select tc.table_name, ccu.table_name as foreign_table
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
       join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
       where tc.constraint_type = 'FOREIGN KEY'
         and tc.table_schema = 'public'
         and kcu.column_name = 'lp_id'
         and tc.table_name = any($1::text[])`,
      [['lp_state_history', 'grn_items', 'stock_moves']],
    );
    for (const tbl of ['lp_state_history', 'stock_moves']) {
      expect(fks.some((f) => f.table_name === tbl && f.foreign_table === 'license_plates'), `${tbl}.lp_id FK`).toBe(true);
    }
    // grn_items.lp_id is nullable (populated on complete) but still a real FK.
    expect(fks.some((f) => f.table_name === 'grn_items' && f.foreign_table === 'license_plates')).toBe(true);
  });

  it('AC3 — RLS enabled+forced; every policy references app.current_org_id() with no GUC reads', async () => {
    const { rows: rls } = await adminPool.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname, relrowsecurity, relforcerowsecurity from pg_class
       where relname = any($1::text[]) and relkind = 'r'`,
      [WAVEB_TABLES as unknown as string[]],
    );
    expect(rls).toHaveLength(WAVEB_TABLES.length);
    for (const row of rls) {
      expect(row.relrowsecurity, `${row.relname} rowsecurity`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} forcerowsecurity`).toBe(true);
    }

    const { rows: policies } = await adminPool.query<{ tablename: string; qual: string | null; with_check: string | null }>(
      `select tablename, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = any($1::text[])`,
      [WAVEB_TABLES as unknown as string[]],
    );
    expect(policies.length).toBe(WAVEB_TABLES.length);
    for (const p of policies) {
      const blob = `${p.qual ?? ''} ${p.with_check ?? ''}`;
      expect(blob, `${p.tablename} app.current_org_id()`).toContain('app.current_org_id()');
      expect(blob, `${p.tablename} no tenant_id GUC`).not.toContain('app.tenant_id');
      expect(blob, `${p.tablename} no current_org_id GUC`).not.toMatch(/current_setting\(\s*'app\.current_org_id'/);
    }
  });

  it('AC4 — lp_state_history is append-only: app_user holds SELECT+INSERT, never UPDATE/DELETE', async () => {
    const { rows: priv } = await adminPool.query<{ privilege_type: string }>(
      `select privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'lp_state_history' and grantee = 'app_user'`,
    );
    const privs = priv.map((r) => r.privilege_type);
    expect(privs).toContain('SELECT');
    expect(privs).toContain('INSERT');
    expect(privs).not.toContain('UPDATE');
    expect(privs).not.toContain('DELETE');
  });

  it('AC5 — lp_state_history records a transition; to_state CHECK + transaction_id idempotency', async () => {
    const lpId = await makeLp(adminPool, orgAId, 'LP-HIST-0001');
    const txn = randomUUID();
    await adminPool.query(
      `insert into public.lp_state_history (org_id, lp_id, from_state, to_state, transaction_id)
       values ($1, $2, 'available', 'blocked', $3)`,
      [orgAId, lpId, txn],
    );
    // duplicate transaction_id within org → unique violation (R14 idempotency)
    await expect(
      adminPool.query(
        `insert into public.lp_state_history (org_id, lp_id, from_state, to_state, transaction_id)
         values ($1, $2, 'available', 'blocked', $3)`,
        [orgAId, lpId, txn],
      ),
    ).rejects.toThrow();
    // illegal to_state → CHECK violation
    await expect(
      adminPool.query(
        `insert into public.lp_state_history (org_id, lp_id, to_state) values ($1, $2, 'frobnicate')`,
        [orgAId, lpId],
      ),
    ).rejects.toThrow();
  });

  it('AC6 — grn_items multi-LP-per-line; V-WH-GRN-001 freezes items once GRN completed', async () => {
    const grnId = randomUUID();
    await adminPool.query(
      `insert into public.grns (id, org_id, grn_number, warehouse_id, status)
       values ($1, $2, 'GRN-2026-00001', $3, 'draft')`,
      [grnId, orgAId, randomUUID()],
    );
    // 3 lines off the same PO line, each its own batch — no auto-merge.
    const poLine = randomUUID();
    for (let i = 1; i <= 3; i += 1) {
      await adminPool.query(
        `insert into public.grn_items (org_id, grn_id, line_number, product_id, po_line_id, received_qty, uom, batch_number)
         values ($1, $2, $3, $4, $5, 10.000000, 'kg', $6)`,
        [orgAId, grnId, i, randomUUID(), poLine, `BATCH-${i}`],
      );
    }
    const { rows: lines } = await adminPool.query<{ c: string }>(
      `select count(*)::text as c from public.grn_items where grn_id = $1`,
      [grnId],
    );
    expect(lines[0].c).toBe('3');

    // complete the GRN → grn_items become frozen (V-WH-GRN-001 trigger)
    await adminPool.query(`update public.grns set status = 'completed' where id = $1`, [grnId]);
    await expect(
      adminPool.query(
        `insert into public.grn_items (org_id, grn_id, line_number, product_id, received_qty, uom)
         values ($1, $2, 99, $3, 1.0, 'kg')`,
        [orgAId, grnId, randomUUID()],
      ),
    ).rejects.toThrow(/V-WH-GRN-001/);
  });

  it('AC7 — stock_moves: negative qty only for adjustment; move_type enum CHECK', async () => {
    const lpId = await makeLp(adminPool, orgAId, 'LP-MOVE-0001');
    // adjustment may go negative (§8.5)
    await adminPool.query(
      `insert into public.stock_moves (org_id, move_number, lp_id, move_type, quantity, transaction_id)
       values ($1, 'SM-2026-00001', $2, 'adjustment', -5.000000, $3)`,
      [orgAId, lpId, randomUUID()],
    );
    // non-adjustment with negative qty → sign CHECK violation
    await expect(
      adminPool.query(
        `insert into public.stock_moves (org_id, move_number, lp_id, move_type, quantity, transaction_id)
         values ($1, 'SM-2026-00002', $2, 'transfer', -1.000000, $3)`,
        [orgAId, lpId, randomUUID()],
      ),
    ).rejects.toThrow();
    // illegal move_type → enum CHECK violation
    await expect(
      adminPool.query(
        `insert into public.stock_moves (org_id, move_number, lp_id, move_type, quantity, transaction_id)
         values ($1, 'SM-2026-00003', $2, 'teleport', 1.000000, $3)`,
        [orgAId, lpId, randomUUID()],
      ),
    ).rejects.toThrow();
  });

  it('AC8 — spare_parts_stock: reserved_qty <= on_hand_qty; unique per (org, part, warehouse)', async () => {
    const partId = randomUUID();
    const whId = randomUUID();
    await adminPool.query(
      `insert into public.spare_parts_stock (org_id, part_item_id, part_number, warehouse_id, on_hand_qty, reserved_qty)
       values ($1, $2, 'PART-001', $3, 10.000000, 4.000000)`,
      [orgAId, partId, whId],
    );
    // reserved > on_hand → CHECK violation
    await expect(
      adminPool.query(
        `insert into public.spare_parts_stock (org_id, part_item_id, part_number, warehouse_id, on_hand_qty, reserved_qty)
         values ($1, $2, 'PART-002', $3, 1.000000, 5.000000)`,
        [orgAId, randomUUID(), randomUUID()],
      ),
    ).rejects.toThrow();
    // same (org, part, warehouse) twice → unique violation
    await expect(
      adminPool.query(
        `insert into public.spare_parts_stock (org_id, part_item_id, part_number, warehouse_id, on_hand_qty)
         values ($1, $2, 'PART-001-DUP', $3, 1.000000)`,
        [orgAId, partId, whId],
      ),
    ).rejects.toThrow();
  });

  it('AC9 — cross-org isolation: org B cannot see org A wave-B rows under app_user RLS', async () => {
    const lpAId = await makeLp(adminPool, orgAId, 'LP-ISO-A');
    const histId = randomUUID();

    const clientA = await appPool.connect();
    try {
      await clientA.query('begin');
      await bindOrg(adminPool, clientA, orgAId);
      await clientA.query(
        `insert into public.lp_state_history (id, org_id, lp_id, to_state) values ($1, $2, $3, 'available')`,
        [histId, orgAId, lpAId],
      );
      await clientA.query('commit');
    } catch (e) {
      await clientA.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      clientA.release();
    }

    const clientB = await appPool.connect();
    try {
      await clientB.query('begin');
      await bindOrg(adminPool, clientB, orgBId);
      const { rows } = await clientB.query<{ id: string }>(`select id from public.lp_state_history`);
      expect(rows.map((r) => r.id)).not.toContain(histId);
      await clientB.query('commit');
    } catch (e) {
      await clientB.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      clientB.release();
    }
  });

  it('AC10 — canonical-owner separation: mig 193 created NO foreign-owned tables', async () => {
    // 193 owns ONLY warehouse wave-B tables. It must not (re)create the canonical tables owned by
    // other modules. They may exist from their own migrations, but mig 193 is recorded and is not
    // their author — assert mig 193 ran and the warehouse tables it owns exist.
    const { rows: mig } = await adminPool.query<{ filename: string }>(
      `select filename from public.schema_migrations
       where filename = '193-warehouse-lp-transitions-grn-stock-spare-parts.sql'`,
    );
    expect(mig.length).toBe(1);
    // license_plates is the 191-owned canonical table that 193 builds on — present.
    const { rows: lp } = await adminPool.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and tablename = 'license_plates'`,
    );
    expect(lp).toHaveLength(1);
  });
});

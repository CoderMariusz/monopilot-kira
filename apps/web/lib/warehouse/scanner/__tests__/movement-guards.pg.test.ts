/**
 * Scanner move/pick guards against a REAL database — no mocks.
 *
 * movement.test.ts drives a hand-rolled fake `QueryClient`, so the two guards
 * proved here could not be covered there: both depend on values the fake
 * invents (`site_id` from the destination join, `available_qty` computed as
 * `quantity - reserved_qty` by Postgres).
 *
 * Both directions are asserted for both guards — a refusal must refuse AND the
 * legal operation must still go through with the right numbers.
 *
 * Isolation: everything runs inside ONE outer transaction that is rolled back.
 * The code under test opens its own `begin`/`commit`, so the client handed to
 * it is a shim that rewrites those to savepoints (same txid, so the
 * txn-scoped org context in app.active_org_contexts still resolves).
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getOwnerConnection } from '@monopilot/db/clients.js';

import { moveScannerLp, pickScannerLp, WarehouseScannerError } from '../movement';

import type { QueryClient } from '../../../scanner/db';
import type { ScannerSessionRow } from '../../../scanner/session';

const databaseUrl = process.env.DATABASE_URL;
const runPg = databaseUrl ? describe : describe.skip;

const orgId = randomUUID();
const userId = randomUUID();

runPg('scanner movement guards — real database', () => {
  let pool: pg.Pool;
  let client: pg.PoolClient;
  let shim: QueryClient;
  let session: ScannerSessionRow;

  const ids = {
    siteA: randomUUID(),
    siteB: randomUUID(),
    whA: randomUUID(),
    whB: randomUUID(),
    locA1: randomUUID(),
    locA2: randomUUID(),
    locB1: randomUUID(),
    staging: randomUUID(),
    line: randomUUID(),
    product: randomUUID(),
    lpFree: randomUUID(),
    lpReserved: randomUUID(),
    lpCross: randomUUID(),
    wo: randomUUID(),
    materialFree: randomUUID(),
    materialReserved: randomUUID(),
  };

  /** `begin`/`commit`/`rollback` → savepoints, so the outer txn survives. */
  function makeShim(c: pg.PoolClient): QueryClient {
    let depth = 0;
    return {
      async query<T = unknown>(sql: string, params?: readonly unknown[]) {
        const verb = sql.trim().toLowerCase();
        if (verb === 'begin') return c.query(`savepoint sp_${++depth}`) as never;
        if (verb === 'commit') return c.query(`release savepoint sp_${depth--}`) as never;
        if (verb === 'rollback') {
          return c.query(`rollback to savepoint sp_${depth}; release savepoint sp_${depth--}`) as never;
        }
        return c.query<T extends object ? T : never>(sql, params as unknown[]) as never;
      },
    } as QueryClient;
  }

  async function seed() {
    await client.query(`insert into public.tenants (id, name, data_plane_url) values ($1,'Scanner Guard Tenant','http://localhost')`, [orgId]);
    await client.query(
      `insert into public.organizations (id, tenant_id, name, industry_code) values ($1,$1,'Scanner Guard Org','generic')`,
      [orgId],
    );
    // stock_moves.created_by → users. No user_sites rows, so app.user_can_see_site
    // stays unrestricted (branch 3) — this test is about the site GUARD, not RLS scoping.
    await client.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1,$2,'scanner-guard@test.local','Scanner Guard', (select id from public.roles limit 1))`,
      [userId, orgId],
    );
    await client.query(`insert into public.sites (id, org_id, site_code, name) values ($1,$2,'STA','Site A'), ($3,$2,'STB','Site B')`, [ids.siteA, orgId, ids.siteB]);
    await client.query(
      `insert into public.warehouses (id, org_id, site_id, code, name, warehouse_type)
       values ($1,$2,$3,'WHA','WH A','main'), ($4,$2,$5,'WHB','WH B','main')`,
      [ids.whA, orgId, ids.siteA, ids.whB, ids.siteB],
    );
    await client.query(
      `insert into public.locations (id, org_id, warehouse_id, code, name, location_type, level, path)
       values ($1,$2,$3,'A-01','A-01','storage',1,'A-01'),
              ($4,$2,$3,'A-02','A-02','storage',1,'A-02'),
              ($5,$2,$6,'B-01','B-01','storage',1,'B-01'),
              ($7,$2,$3,'A-STG','A-STG','storage',1,'A-STG')`,
      [ids.locA1, orgId, ids.whA, ids.locA2, ids.locB1, ids.whB, ids.staging],
    );
    await client.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base) values ($1,$2,'RAW-1','rm','Raw 1','kg')`,
      [ids.product, orgId],
    );
    await client.query(
      `insert into public.production_lines (id, org_id, site_id, code, name, default_location_id) values ($1,$2,$3,'L1','Line 1',$4)`,
      [ids.line, orgId, ids.siteA, ids.staging],
    );
    // qty 10 / reserved 0 → available 10 (legal pick);  qty 10 / reserved 10 → available 0 (B2).
    await client.query(
      `insert into public.license_plates
         (id, org_id, site_id, warehouse_id, location_id, lp_number, product_id, quantity, reserved_qty, uom, status, qa_status)
       values ($1,$2,$3,$4,$5,'LP-FREE',$6,10,0,'kg','available','released'),
              ($7,$2,$3,$4,$5,'LP-RESERVED',$6,10,10,'kg','allocated','released'),
              ($8,$2,$3,$4,$5,'LP-CROSS',$6,10,0,'kg','available','released')`,
      [ids.lpFree, orgId, ids.siteA, ids.whA, ids.locA1, ids.product, ids.lpReserved, ids.lpCross],
    );
    await client.query(
      `insert into public.work_orders
         (id, org_id, site_id, production_line_id, wo_number, product_id, planned_quantity, uom, status, item_type_at_creation)
       values ($1,$2,$3,$4,'WO-1',$5,10,'kg','RELEASED','rm')`,
      [ids.wo, orgId, ids.siteA, ids.line, ids.product],
    );
    await client.query(
      `insert into public.wo_materials (id, org_id, wo_id, product_id, material_name, required_qty, uom)
       values ($1,$2,$3,$4,'Raw 1',10,'kg'), ($5,$2,$3,$4,'Raw 1',10,'kg')`,
      [ids.materialFree, orgId, ids.wo, ids.product, ids.materialReserved],
    );
    const { rows } = await client.query<{ id: string }>(
      `insert into public.scanner_sessions (org_id, user_id, mode, session_token_hash, expires_at, site_id, line_id)
       values ($1,$2,'personal','hash', now() + interval '1 hour', $3, $4) returning id`,
      [orgId, userId, ids.siteA, ids.line],
    );
    session = {
      id: rows[0]!.id,
      org_id: orgId,
      user_id: userId,
      device_id: null,
      site_id: ids.siteA,
      line_id: ids.line,
      shift: null,
      mode: 'personal',
      session_token_hash: 'hash',
      expires_at: new Date(),
      ended_at: null,
      created_at: new Date(),
      last_seen_at: new Date(),
    } as ScannerSessionRow;
  }

  beforeAll(async () => {
    pool = getOwnerConnection();
    client = await pool.connect();
    await client.query('begin');
    await seed();
    shim = makeShim(client);
  });

  afterAll(async () => {
    await client?.query('rollback').catch(() => undefined);
    client?.release();
    await pool?.end();
  });

  async function lpSite(lpId: string) {
    const { rows } = await client.query<{ site_id: string; location_id: string }>(
      `select site_id::text, location_id::text from public.license_plates where id = $1::uuid`,
      [lpId],
    );
    return rows[0]!;
  }

  it('B1 — REJECTS a move to a location at another site and points at transfer orders', async () => {
    const before = await lpSite(ids.lpCross);
    const error = await moveScannerLp(shim, session, {
      clientOpId: randomUUID(),
      lpId: ids.lpCross,
      toLocationId: ids.locB1,
      moveType: 'transfer',
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(WarehouseScannerError);
    expect((error as WarehouseScannerError).code).toBe('cross_site_move');
    expect((error as WarehouseScannerError).message).toMatch(/transfer order/i);

    const after = await lpSite(ids.lpCross);
    expect(after.site_id).toBe(before.site_id);
    expect(after.location_id).toBe(before.location_id);
    const { rows } = await client.query(`select 1 from public.stock_moves where lp_id = $1::uuid`, [ids.lpCross]);
    expect(rows).toHaveLength(0);
  });

  it('B1 — ALLOWS a move within the same site', async () => {
    const result = await moveScannerLp(shim, session, {
      clientOpId: randomUUID(),
      lpId: ids.lpCross,
      toLocationId: ids.locA2,
      moveType: 'transfer',
    });
    expect(result.ok).toBe(true);
    const after = await lpSite(ids.lpCross);
    expect(after.location_id).toBe(ids.locA2);
    expect(after.site_id).toBe(ids.siteA);
  });

  it('B2 — REJECTS picking a fully reserved pallet (no zero-quantity issue move)', async () => {
    const before = await lpSite(ids.lpReserved);
    const error = await pickScannerLp(shim, session, {
      clientOpId: randomUUID(),
      woId: ids.wo,
      materialId: ids.materialReserved,
      lpId: ids.lpReserved,
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(WarehouseScannerError);
    expect((error as WarehouseScannerError).code).toBe('insufficient_stock');

    const after = await lpSite(ids.lpReserved);
    expect(after.location_id).toBe(before.location_id);
    const { rows } = await client.query(`select 1 from public.stock_moves where lp_id = $1::uuid`, [ids.lpReserved]);
    expect(rows).toHaveLength(0);
  });

  it('B2 — ALLOWS picking an unreserved pallet and books the real quantity (not zero)', async () => {
    const result = await pickScannerLp(shim, session, {
      clientOpId: randomUUID(),
      woId: ids.wo,
      materialId: ids.materialFree,
      lpId: ids.lpFree,
    });
    expect(result.ok).toBe(true);

    const { rows } = await client.query<{ quantity: string; move_type: string; to_location_id: string }>(
      `select quantity::text, move_type, to_location_id::text from public.stock_moves where lp_id = $1::uuid`,
      [ids.lpFree],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.quantity)).toBe(10);
    expect(rows[0]!.move_type).toBe('issue');
    expect(rows[0]!.to_location_id).toBe(ids.staging);
  });
});

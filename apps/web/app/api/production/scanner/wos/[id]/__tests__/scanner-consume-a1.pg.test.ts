/**
 * A1 correction — scanner consume route integration (C1/C2/S6).
 *
 * Reason-code path (no explicit lpId): FEFO LP resolution, real stock decrement,
 * and fractional qty persistence without silent truncation. Skips when DATABASE_URL
 * is unset.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../../../../packages/db/src/clients.js';
import type { ScannerSessionRow } from '../../../../../../../../lib/scanner/session';

const databaseUrl = process.env.DATABASE_URL;
const runPg = databaseUrl ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const roleId = randomUUID();
const itemId = randomUUID();
const siteId = randomUUID();
const warehouseId = randomUUID();
const locationId = randomUUID();
const lpId = randomUUID();
const woId = randomUUID();
const materialId = randomUUID();
const sessionId = randomUUID();
const deviceId = randomUUID();

const pgHarness = vi.hoisted(() => ({
  appPool: null as pg.Pool | null,
  session: null as ScannerSessionRow | null,
}));

vi.mock('../../../../../../../../lib/scanner/guard', () => ({
  requireScannerSession: vi.fn(async (_request, _body, _operation, fn) => {
    const pool = pgHarness.appPool;
    const session = pgHarness.session;
    if (!pool || !session) throw new Error('scanner pg harness not initialised');
    const client = await pool.connect();
    try {
      return await fn({ client, session, token: 'scanner-token' });
    } finally {
      client.release();
    }
  }),
}));

vi.mock('../../../../../../../../lib/scanner/txn-org-context', async (importOriginal) => importOriginal());

runPg('scanner consume route — reason-code fractional persistence (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    pgHarness.appPool = appPool;
    pgHarness.session = {
      id: sessionId,
      org_id: orgId,
      user_id: userId,
      device_id: deviceId,
      site_id: siteId,
      line_id: null,
      shift: 'A',
      mode: 'personal',
      session_token_hash: 'a1-scanner-hash',
      expires_at: new Date('2030-01-01T00:00:00Z'),
      ended_at: null,
      created_at: new Date('2026-01-01T00:00:00Z'),
      last_seen_at: new Date('2026-01-01T00:00:00Z'),
    };

    await ownerPool.query(
      `insert into app.session_org_contexts (session_token, org_id, user_id)
       values ($1::uuid, $2::uuid, $3::uuid)
       on conflict (session_token) do update set org_id = excluded.org_id, user_id = excluded.user_id`,
      [randomUUID(), orgId, userId],
    );

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'A1 Scanner Tenant', 'eu', 'https://a1-scanner.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'A1 Scanner Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `a1-scanner-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions)
       values ($1, $2, 'admin', 'admin', 'A1 Scanner Admin',
               '["production.consumption.write"]'::jsonb)
       on conflict (id) do nothing`,
      [roleId, orgId],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, $3, 'A1 Scanner User', $4)
       on conflict (id) do nothing`,
      [userId, orgId, `a1-scanner-${userId}@example.test`, roleId],
    );
    await ownerPool.query(
      `insert into public.user_roles (user_id, role_id, org_id)
       values ($1, $2, $3)
       on conflict do nothing`,
      [userId, roleId, orgId],
    );
    await ownerPool.query(
      `insert into public.sites (id, org_id, code, name, timezone, created_by)
       values ($1, $2, 'A1S', 'A1 Scanner Site', 'UTC', $3)
       on conflict (id) do nothing`,
      [siteId, orgId, userId],
    );
    await ownerPool.query(
      `insert into public.warehouses (id, org_id, site_id, code, name, created_by)
       values ($1, $2, $3, 'A1S-WH', 'A1 Scanner Warehouse', $4)
       on conflict (id) do nothing`,
      [warehouseId, orgId, siteId, userId],
    );
    await ownerPool.query(
      `insert into public.locations (id, org_id, warehouse_id, code, name, level, created_by)
       values ($1, $2, $3, 'A1S-LOC', 'A1 Scanner Location', 1, $4)
       on conflict (id) do nothing`,
      [locationId, orgId, warehouseId, userId],
    );
    await ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, created_by)
       values ($1, $2, $3, 'rm', 'A1 Scanner RM', 'kg', $4)
       on conflict (id) do nothing`,
      [itemId, orgId, `A1SCAN-${itemId.slice(0, 8)}`, userId],
    );
    await ownerPool.query(
      `insert into public.work_orders (
         id, org_id, site_id, wo_number, product_id, item_type_at_creation,
         planned_quantity, uom, status, created_by, updated_by
       )
       values ($1, $2, $3, 'A1S-WO-001', $4, 'fg', 10.000, 'kg', 'IN_PROGRESS', $5, $5)
       on conflict (id) do nothing`,
      [woId, orgId, siteId, itemId, userId],
    );
    await ownerPool.query(
      `insert into public.wo_executions (id, org_id, wo_id, status, version, created_by, updated_by)
       values ($1, $2, $3, 'in_progress', 1, $4, $4)
       on conflict (id) do nothing`,
      [randomUUID(), orgId, woId, userId],
    );
    await ownerPool.query(
      `insert into public.wo_materials (id, org_id, wo_id, product_id, material_name, required_qty, consumed_qty, uom, created_by)
       values ($1, $2, $3, $4, 'A1 Scanner Material', 10.000, 0.000, 'kg', $5)
       on conflict (id) do nothing`,
      [materialId, orgId, woId, itemId, userId],
    );
    await ownerPool.query(
      `insert into public.license_plates (
         id, org_id, site_id, warehouse_id, location_id, lp_number,
         product_id, quantity, reserved_qty, uom, status, qa_status,
         expiry_date, created_by, updated_by
       )
       values ($1, $2, $3, $4, $5, 'A1S-LP-001', $6, 10.000, 0.000, 'kg',
               'available', 'released', '2027-01-01T00:00:00Z', $7, $7)
       on conflict (id) do nothing`,
      [lpId, orgId, siteId, warehouseId, locationId, itemId, userId],
    );
    await ownerPool.query(
      `insert into public.tenant_variations (org_id, feature_flags)
       values ($1, '{"overconsume_threshold_pct":0,"overconsume_warn_pct":0}'::jsonb)
       on conflict (org_id) do update set feature_flags = excluded.feature_flags`,
      [orgId],
    );
  });

  afterAll(async () => {
    pgHarness.appPool = null;
    pgHarness.session = null;

    await ownerPool?.query('delete from public.scanner_audit_log where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.stock_moves where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.outbox_events where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.wo_material_consumption where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.wo_materials where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.wo_executions where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.work_orders where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.license_plates where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.items where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.locations where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.warehouses where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.sites where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.user_roles where user_id = $1', [userId]).catch(() => undefined);
    await ownerPool?.query('delete from public.roles where id = $1', [roleId]).catch(() => undefined);
    await ownerPool?.query('delete from public.users where id = $1', [userId]).catch(() => undefined);
    await ownerPool?.query('delete from public.tenant_variations where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.organizations where id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('reason-code consume decrements LP stock and persists fractional qty (C1/S6)', async () => {
    const clientOpId = randomUUID();
    const { POST } = await import('../consume/route');

    const response = await POST(
      new Request(`https://web.test/api/production/scanner/wos/${woId}/consume`, {
        method: 'POST',
        headers: { authorization: 'Bearer scanner-token', 'content-type': 'application/json' },
        body: JSON.stringify({
          clientOpId,
          materialId,
          qty: '2.52',
          reasonCode: 'A1-FEFO-AUTO',
        }),
      }) as never,
      { params: Promise.resolve({ id: woId }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      consumedQty: '2.52',
      uom: 'kg',
      replay: false,
    });

    const lpRow = await ownerPool.query<{ quantity: string }>(
      `select quantity::text as quantity
         from public.license_plates
        where org_id = $1::uuid and id = $2::uuid`,
      [orgId, lpId],
    );
    expect(lpRow.rows[0]?.quantity).toMatch(/^7\.4[78]/);

    const consumption = await ownerPool.query<{ qty_consumed: string; lp_id: string }>(
      `select qty_consumed::text as qty_consumed, lp_id::text as lp_id
         from public.wo_material_consumption
        where org_id = $1::uuid
          and wo_id = $2::uuid
        order by consumed_at desc
        limit 1`,
      [orgId, woId],
    );
    expect(consumption.rows[0]).toMatchObject({
      qty_consumed: '2.52',
      lp_id: lpId,
    });
  });
});

/**
 * FIX3-PROD — production dashboard WO-list SQL (real Postgres).
 * Requires DATABASE_URL — loud fail, no describe.skip.
 *
 * Reproduces live 42883 `text / numeric` when lateral qty_kg is cast to text.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../../../../packages/db/src/clients.js';
import {
  PRODUCTION_DASHBOARD_WO_LIST_SQL,
  PRODUCTION_DASHBOARD_WO_LIST_SQL_BROKEN_TEXT_LATERAL,
} from '../_lib/dashboard-queries';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('dashboard-data.pg.test.ts requires DATABASE_URL (no silent describe.skip)');
}

const tenantId = randomUUID();
const orgId = randomUUID();
const siteId = randomUUID();
const userId = randomUUID();
const productId = randomUUID();
const bomHeaderId = randomUUID();
const woId = randomUUID();

describe('production dashboard WO list SQL (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'FIX3 Dashboard Tenant', 'eu', 'https://fix3-dashboard.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'FIX3 Dashboard Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `fix3-dash-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.sites
         (id, org_id, site_code, name, is_default, is_active, timezone)
       values ($1, $2, 'FIX3', 'FIX3 Dashboard Site', true, true, 'Europe/London')
       on conflict (id) do nothing`,
      [siteId, orgId],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name)
       values ($1, $2, $3, 'FIX3 Dashboard User')
       on conflict (id) do nothing`,
      [userId, orgId, `fix3-dash-${userId}@example.test`],
    );
    await ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, created_by)
       values ($1, $2, 'FG-FIX3', 'fg', 'FIX3 Dashboard FG', 'kg', $3)
       on conflict (id) do nothing`,
      [productId, orgId, userId],
    );
    await ownerPool.query(
      `insert into public.bom_headers (id, org_id, product_id, version, status, yield_pct, created_by)
       values ($1, $2, $3, 1, 'active', 100, $4)
       on conflict (id) do nothing`,
      [bomHeaderId, orgId, productId, userId],
    );
    await ownerPool.query(
      `insert into public.work_orders
         (id, org_id, site_id, wo_number, product_id, item_type_at_creation,
          planned_quantity, uom, status, active_bom_header_id)
       values ($1, $2, $3, 'WO-FIX3-001', $4, 'fg', 50.000, 'kg', 'IN_PROGRESS', $5)
       on conflict (id) do nothing`,
      [woId, orgId, siteId, productId, bomHeaderId],
    );
    await ownerPool.query(
      `insert into public.wo_outputs
         (org_id, site_id, wo_id, output_type, product_id, batch_number, qty_kg, uom)
       values ($1, $2, $3, 'primary', $4, 'WO-FIX3-001-OUT-001', 0.960, 'kg')`,
      [orgId, siteId, woId, productId],
    );
  });

  afterAll(async () => {
    await ownerPool?.query('delete from public.wo_outputs where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.work_orders where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.bom_headers where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.items where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.users where id = $1', [userId]).catch(() => undefined);
    await ownerPool?.query('delete from public.sites where id = $1', [siteId]).catch(() => undefined);
    await ownerPool?.query('delete from public.organizations where id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  async function runUnderOrg<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const sessionToken = randomUUID();
    await ownerPool.query(
      `insert into app.session_org_contexts (session_token, org_id, user_id)
       values ($1::uuid, $2::uuid, $3::uuid)
       on conflict (session_token) do update set org_id = excluded.org_id, user_id = excluded.user_id`,
      [sessionToken, orgId, userId],
    );
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
      const result = await fn(client);
      await client.query('rollback');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
      await ownerPool
        .query('delete from app.session_org_contexts where session_token = $1::uuid', [sessionToken])
        .catch(() => undefined);
    }
  }

  it('computes progress_pct from numeric lateral qty_kg / planned_quantity', async () => {
    await runUnderOrg(async (client) => {
      const { rows } = await client.query<{
        id: string;
        produced_quantity: string;
        progress_pct: string;
      }>(PRODUCTION_DASHBOARD_WO_LIST_SQL);

      const row = rows.find((r) => r.id === woId);
      expect(row).toBeDefined();
      expect(row?.produced_quantity).toBe('0.960');
      expect(row?.progress_pct).toBe('2');
    });
  });

  it('reproduces live 42883 when lateral qty_kg is cast to text', async () => {
    await runUnderOrg(async (client) => {
      await expect(client.query(PRODUCTION_DASHBOARD_WO_LIST_SQL_BROKEN_TEXT_LATERAL)).rejects.toMatchObject({
        code: '42883',
      });
    });
  });
});

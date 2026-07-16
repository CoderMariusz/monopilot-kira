/**
 * N-PRD-3 — strict-close gate converts non-kg consumption to kg (real Postgres).
 * Skips when DATABASE_URL is unset.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../packages/db/src/clients.js';
import { evaluateClosedProductionStrict } from '../evaluate-closed-production-strict.js';

const databaseUrl = process.env.DATABASE_URL;
const runPg = databaseUrl ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const productId = randomUUID();
const componentId = randomUUID();
const bomHeaderId = randomUUID();
const woId = randomUUID();

runPg('evaluateClosedProductionStrict non-kg consumption (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'PRD-B Strict Tenant', 'eu', 'https://prd-b.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'PRD-B Strict Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `prd-b-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name)
       values ($1, $2, $3, 'PRD-B User')
       on conflict (id) do nothing`,
      [userId, orgId, `prd-b-${userId}@example.test`],
    );
    await ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, created_by)
       values
         ($1, $2, 'FG-PRDB', 'fg', 'PRD-B FG', 'kg', $4),
         ($3, $2, 'RM-PRDB', 'rm', 'PRD-B RM', 'kg', $4)
       on conflict (id) do nothing`,
      [productId, orgId, componentId, userId],
    );
    await ownerPool.query(
      `insert into public.bom_headers (id, org_id, product_id, version, status, yield_pct, created_by)
       values ($1, $2, $3, 1, 'active', 100, $4)
       on conflict (id) do nothing`,
      [bomHeaderId, orgId, productId, userId],
    );
    await ownerPool.query(
      `insert into public.work_orders
         (id, org_id, wo_number, product_id, item_type_at_creation, planned_quantity, uom, status, active_bom_header_id)
       values ($1, $2, 'WO-PRDB-001', $3, 'fg', 1, 'kg', 'in_progress', $4)
       on conflict (id) do nothing`,
      [woId, orgId, productId, bomHeaderId],
    );
    await ownerPool.query(
      `insert into public.wo_outputs
         (org_id, wo_id, output_type, product_id, batch_number, qty_kg, uom)
       values ($1, $2, 'primary', $3, 'WO-PRDB-001-OUT-001', 1.000, 'kg')`,
      [orgId, woId, productId],
    );
    await ownerPool.query(
      `insert into public.wo_material_consumption
         (org_id, transaction_id, wo_id, component_id, lp_id, qty_consumed, uom, fefo_adherence_flag, consumed_at)
       values ($1, $2, $3, $4, $5, 1000, 'g', true, now())`,
      [orgId, randomUUID(), woId, componentId, '00000000-0000-0000-0000-000000000001'],
    );
  });

  afterAll(async () => {
    await ownerPool?.query('delete from public.wo_material_consumption where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.wo_outputs where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.work_orders where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.bom_headers where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.items where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.users where id = $1', [userId]).catch(() => undefined);
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

  it('treats 1000 g consumption as 1 kg within tolerance against 1 kg output', async () => {
    await runUnderOrg(async (client) => {
      const row = await evaluateClosedProductionStrict(client, woId);
      expect(row).not.toBeNull();
      expect(row?.posted_consumption_kg).toBe('1');
      expect(row?.output_kg).toBe('1');
      expect(row?.within_tolerance).toBe(true);
    });
  });
});

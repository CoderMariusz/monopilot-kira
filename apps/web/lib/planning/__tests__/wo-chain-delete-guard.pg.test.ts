/**
 * A1 correction — real-DB multi-hop WO chain delete guard (C5).
 *
 * A (draft) → B (cancelled) → C (completed): deleting A must be blocked because
 * the recursive traversal reaches progressed WO C. Skips when DATABASE_URL unset.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../packages/db/src/clients.js';

import { assertDraftWorkOrderDeletable } from '../wo-chain-delete-guard.js';

const databaseUrl = process.env.DATABASE_URL;
const runPg = databaseUrl ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const itemId = randomUUID();
const siteId = randomUUID();
const woA = randomUUID();
const woB = randomUUID();
const woC = randomUUID();

runPg('wo-chain-delete-guard multi-hop chain (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'A1 Chain Tenant', 'eu', 'https://a1-chain.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'A1 Chain Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `a1-chain-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name)
       values ($1, $2, $3, 'A1 Chain User')
       on conflict (id) do nothing`,
      [userId, orgId, `a1-chain-${userId}@example.test`],
    );
    await ownerPool.query(
      `insert into public.sites (id, org_id, code, name, timezone, created_by)
       values ($1, $2, 'A1C', 'A1 Chain Site', 'UTC', $3)
       on conflict (id) do nothing`,
      [siteId, orgId, userId],
    );
    await ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, created_by)
       values ($1, $2, $3, 'fg', 'A1 Chain FG', 'kg', $4)
       on conflict (id) do nothing`,
      [itemId, orgId, `A1CHAIN-${itemId.slice(0, 8)}`, userId],
    );

    await ownerPool.query(
      `insert into public.work_orders (
         id, org_id, site_id, wo_number, product_id, item_type_at_creation,
         planned_quantity, uom, status, created_by, updated_by
       )
       values
         ($1, $2, $3, 'WO-A-DRAFT', $4, 'fg', 10.000, 'kg', 'DRAFT', $5, $5),
         ($6, $2, $3, 'WO-B-CANC', $4, 'fg', 10.000, 'kg', 'CANCELLED', $5, $5),
         ($7, $2, $3, 'WO-C-DONE', $4, 'fg', 10.000, 'kg', 'COMPLETED', $5, $5)
       on conflict (id) do nothing`,
      [woA, orgId, siteId, itemId, userId, woB, woC],
    );

    await ownerPool.query(
      `insert into public.wo_dependencies (org_id, parent_wo_id, child_wo_id, required_qty)
       values
         ($1, $2, $3, 10.000),
         ($1, $3, $4, 10.000)
       on conflict (org_id, parent_wo_id, child_wo_id) do nothing`,
      [orgId, woA, woB, woC],
    );

    await ownerPool.query(
      `insert into public.wo_outputs (
         id, org_id, site_id, transaction_id, wo_id, output_type, product_id,
         batch_number, qty_kg, uom, created_by, updated_by
       )
       values ($1, $2, $3, $4, $5, 'primary', $6, 'BATCH-C', 10.000, 'kg', $7, $7)
       on conflict (id) do nothing`,
      [randomUUID(), orgId, siteId, randomUUID(), woC, itemId, userId],
    );
  });

  afterAll(async () => {
    await ownerPool?.query('delete from public.wo_outputs where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.wo_dependencies where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.work_orders where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.items where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.sites where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.users where id = $1', [userId]).catch(() => undefined);
    await ownerPool?.query('delete from public.organizations where id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  async function runUnderOrg<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const sessionToken = randomUUID();
    await ownerPool.query(
      `insert into app.session_org_contexts (session_token, org_id)
       values ($1::uuid, $2::uuid)
       on conflict (session_token) do update set org_id = excluded.org_id`,
      [sessionToken, orgId],
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

  it('blocks deleting draft A when chain A→B(cancelled)→C(completed) has progressed C (C5)', async () => {
    await runUnderOrg(async (client) => {
      await expect(assertDraftWorkOrderDeletable(client, woA)).resolves.toEqual({
        ok: false,
        error: 'chain_delete_blocked',
      });
    });
  });
});

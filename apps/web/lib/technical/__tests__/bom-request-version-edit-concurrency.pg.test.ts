/**
 * Wave 15 — concurrent bom_request_version_edit idempotency (N-20).
 * Skips when DATABASE_URL is unset.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../packages/db/src/clients.js';

const databaseUrl = process.env.DATABASE_URL;
const runPg = databaseUrl ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const sourceBomId = randomUUID();
const productCode = `W15-BOM-${orgId.slice(0, 8)}`;

async function withOrgClient(
  appPool: pg.Pool,
  ownerPool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<void>,
): Promise<void> {
  const sessionToken = randomUUID();
  await ownerPool.query(
    `insert into app.session_org_contexts (session_token, org_id, user_id)
     values ($1::uuid, $2::uuid, $3::uuid)
     on conflict (session_token) do update
       set org_id = excluded.org_id, user_id = excluded.user_id`,
    [sessionToken, orgId, userId],
  );
  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    await fn(client);
    await client.query('commit');
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

runPg('bom_request_version_edit concurrency (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Wave15 BOM Tenant', 'eu', 'https://wave15-bom.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'Wave15 BOM Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `w15-bom-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       select $1, $2, $3, 'Wave15 BOM User', r.id
         from public.roles r
        where r.org_id = $2
        order by r.slug
        limit 1
       on conflict (id) do nothing`,
      [userId, orgId, `w15-bom-${userId}@example.test`],
    );
    await ownerPool.query(
      `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
       values ($1, $2, 'Wave15 FG', 1, $3)
       on conflict (org_id, product_code) do nothing`,
      [productCode, orgId, userId],
    );
    await ownerPool.query(
      `insert into public.bom_headers
         (id, org_id, product_id, origin_module, status, version, created_by_user)
       values ($1, $2, $3, 'technical', 'active', 1, $4)
       on conflict (id) do nothing`,
      [sourceBomId, orgId, productCode, userId],
    );
  });

  afterAll(async () => {
    await ownerPool?.query('delete from public.outbox_events where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.bom_lines where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.bom_co_products where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.bom_headers where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.product where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.users where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.organizations where id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('returns the same in-flight draft for concurrent immutable-version edits', async () => {
    const callEdit = async (): Promise<string> => {
      let draftId = '';
      await withOrgClient(appPool, ownerPool, async (client) => {
        const { rows } = await client.query<{
          bom_header_id: string;
          decision: string;
          supersedes_bom_header_id: string;
        }>(
          `select bom_header_id::text, decision, supersedes_bom_header_id::text
             from public.bom_request_version_edit($1::uuid, $2::uuid, $3)`,
          [sourceBomId, userId, 'concurrent edit'],
        );
        draftId = rows[0]?.bom_header_id ?? '';
        expect(rows[0]?.supersedes_bom_header_id).toBe(sourceBomId);
        expect(['cloned', 'existing']).toContain(rows[0]?.decision);
      });
      return draftId;
    };

    const [firstId, secondId] = await Promise.all([callEdit(), callEdit()]);
    expect(firstId).toBeTruthy();
    expect(secondId).toBe(firstId);

    const { rows: childRows } = await ownerPool.query<{ id: string }>(
      `select id::text
         from public.bom_headers
        where org_id = $1::uuid
          and supersedes_bom_header_id = $2::uuid
          and status in ('draft', 'in_review')`,
      [orgId, sourceBomId],
    );
    expect(childRows).toHaveLength(1);
    expect(childRows[0]?.id).toBe(firstId);
  });
});

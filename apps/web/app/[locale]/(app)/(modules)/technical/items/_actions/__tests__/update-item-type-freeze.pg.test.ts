/**
 * Wave 15 — DB item_type freeze trigger (N-47).
 * Skips when DATABASE_URL is unset.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../../../../../../packages/db/src/clients.js';

const databaseUrl = process.env.DATABASE_URL;
const runPg = databaseUrl ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const activeFgId = randomUUID();
const draftReferencedId = randomUUID();
const draftReferencedBomId = randomUUID();
const draftReferencedProductCode = `W15-REF-${orgId.slice(0, 8)}`;
const activeBomId = randomUUID();

const productCode = `W15-IT-${orgId.slice(0, 8)}`;

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

runPg('items item_type freeze trigger (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Wave15 ItemType Tenant', 'eu', 'https://wave15-itemtype.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'Wave15 ItemType Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `w15-it-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name)
       values ($1, $2, $3, 'Wave15 ItemType User')
       on conflict (id) do nothing`,
      [userId, orgId, `w15-it-${userId}@example.test`],
    );
    await ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, status)
       values ($1, $2, $3, 'fg', 'Active FG', 'kg', 'active'),
              ($4, $2, $5, 'fg', 'Referenced Draft FG', 'kg', 'draft')
       on conflict (id) do nothing`,
      [activeFgId, orgId, `ACT-${activeFgId.slice(0, 8)}`, draftReferencedId, `REF-${draftReferencedId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
       values ($1, $2, 'Active FG', 1, $3),
              ($4, $2, 'Referenced Draft FG', 1, $3)
       on conflict (org_id, product_code) do nothing`,
      [productCode, orgId, userId, draftReferencedProductCode],
    );
    await ownerPool.query(
      `insert into public.bom_headers
         (id, org_id, product_id, item_id, origin_module, status, version, created_by_user)
       values ($1, $2, $3, $4, 'technical', 'active', 1, $5),
              ($6, $2, $7, $8, 'technical', 'draft', 1, $5)
       on conflict (id) do nothing`,
      [
        activeBomId,
        orgId,
        productCode,
        activeFgId,
        userId,
        draftReferencedBomId,
        draftReferencedProductCode,
        draftReferencedId,
      ],
    );
  });

  afterAll(async () => {
    await ownerPool?.query('delete from public.bom_headers where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.product where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.items where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.users where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.organizations where id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('rejects item_type changes for active and referenced items', async () => {
    await expect(
      withOrgClient(appPool, ownerPool, async (client) => {
        await client.query(
          `update public.items
              set item_type = 'rm'
            where id = $1::uuid
              and org_id = app.current_org_id()`,
          [activeFgId],
        );
      }),
    ).rejects.toMatchObject({ code: '23514' });

    await expect(
      withOrgClient(appPool, ownerPool, async (client) => {
        await client.query(
          `update public.items
              set item_type = 'rm'
            where id = $1::uuid
              and org_id = app.current_org_id()`,
          [draftReferencedId],
        );
      }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('allows item_type changes for draft unreferenced items', async () => {
    const unreferencedId = randomUUID();
    await ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, status)
       values ($1, $2, $3, 'fg', 'Unreferenced Draft', 'kg', 'draft')
       on conflict (id) do nothing`,
      [unreferencedId, orgId, `UNR-${unreferencedId.slice(0, 8)}`],
    );

    await withOrgClient(appPool, ownerPool, async (client) => {
      await client.query(
        `update public.items
            set item_type = 'rm'
          where id = $1::uuid
            and org_id = app.current_org_id()`,
        [unreferencedId],
      );
    });

    const { rows } = await ownerPool.query<{ item_type: string }>(
      `select item_type from public.items where id = $1::uuid`,
      [unreferencedId],
    );
    expect(rows[0]?.item_type).toBe('rm');
  });

  it('serializes concurrent BOM creation against item_type updates', async () => {
    const raceItemId = randomUUID();
    const raceProductCode = `RACE-${raceItemId.slice(0, 8)}`;
    await ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, status)
       values ($1, $2, $3, 'fg', 'Race FG', 'kg', 'draft')
       on conflict (id) do nothing`,
      [raceItemId, orgId, raceProductCode],
    );
    await ownerPool.query(
      `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
       values ($1, $2, 'Race FG', 1, $3)
       on conflict (org_id, product_code) do nothing`,
      [raceProductCode, orgId, userId],
    );

    const typeChange = withOrgClient(appPool, ownerPool, async (client) => {
      await client.query('select pg_sleep(0.05)');
      await client.query(
        `update public.items
            set item_type = 'rm'
          where id = $1::uuid
            and org_id = app.current_org_id()`,
        [raceItemId],
      );
    });

    const bomInsert = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return withOrgClient(appPool, ownerPool, async (client) => {
        await client.query(
          `insert into public.bom_headers
             (org_id, product_id, item_id, origin_module, status, version, created_by_user)
           values (app.current_org_id(), $1, $2::uuid, 'technical', 'draft', 1, $3::uuid)`,
          [raceProductCode, raceItemId, userId],
        );
      });
    })();

    const results = await Promise.allSettled([typeChange, bomInsert]);
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected.length).toBeGreaterThanOrEqual(1);
    expect(rejected.some((result) => (result as PromiseRejectedResult).reason?.code === '23514')).toBe(true);
  });
});

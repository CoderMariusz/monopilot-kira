/**
 * Wave 15 — factory-spec recall vs WO bind advisory lock (N-23).
 * Skips when DATABASE_URL is unset.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../packages/db/src/clients.js';
import { recallFactorySpecInTransaction } from '../recall-factory-spec-core';
import { fetchEligibleFactorySpecUnderBindLock } from '../factory-spec-bind-lock';

const databaseUrl = process.env.DATABASE_URL;
const runPg = databaseUrl ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const fgItemId = randomUUID();
const specId = randomUUID();
const specCode = `W15-FS-${orgId.slice(0, 8)}`;

async function withOrgClient<T>(
  appPool: pg.Pool,
  ownerPool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
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
    const result = await fn(client);
    await client.query('commit');
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

runPg('factory-spec recall vs WO bind lock (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Wave15 Recall Tenant', 'eu', 'https://wave15-recall.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'Wave15 Recall Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `w15-recall-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name)
       values ($1, $2, $3, 'Wave15 Recall User')
       on conflict (id) do nothing`,
      [userId, orgId, `w15-recall-${userId}@example.test`],
    );
    await ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, status)
       values ($1, $2, $3, 'fg', 'Wave15 FG', 'kg', 'active')
       on conflict (id) do nothing`,
      [fgItemId, orgId, `FG-${fgItemId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.factory_specs
         (id, org_id, fg_item_id, spec_code, version, status, released_by, released_at)
       values ($1, $2, $3, $4, 1, 'released_to_factory', $5, now())
       on conflict (id) do nothing`,
      [specId, orgId, fgItemId, specCode, userId],
    );
  });

  afterAll(async () => {
    await ownerPool?.query('delete from public.audit_events where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.factory_release_status where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.work_orders where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.factory_specs where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.items where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.users where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.organizations where id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('prevents binding a recalled spec while recall holds the product advisory lock', async () => {
    const recallDone = (async () => {
      await withOrgClient(appPool, ownerPool, async (client) => {
        const result = await recallFactorySpecInTransaction(
          { userId, client },
          { specId, reason: 'concurrency test' },
        );
        expect(result).toEqual({ ok: true, recalled: true });
      });
    })();

    const bindAttempt = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return withOrgClient(appPool, ownerPool, async (client) =>
        fetchEligibleFactorySpecUnderBindLock(client, fgItemId),
      );
    })();

    await recallDone;
    const boundSpec = await bindAttempt;
    expect(boundSpec).toBeNull();

    const { rows } = await ownerPool.query<{ status: string }>(
      `select status from public.factory_specs where id = $1::uuid`,
      [specId],
    );
    expect(rows[0]?.status).toBe('draft');
  });
});

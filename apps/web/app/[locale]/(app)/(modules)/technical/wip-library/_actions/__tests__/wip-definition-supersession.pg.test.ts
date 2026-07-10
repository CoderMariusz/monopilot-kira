/**
 * Wave 15 — WIP definition supersession lifecycle (N-22).
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
const itemId = randomUUID();
const activeDefId = randomUUID();

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

runPg('WIP definition supersession lifecycle (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Wave15 WIP Tenant', 'eu', 'https://wave15-wip.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'Wave15 WIP Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `w15-wip-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name)
       values ($1, $2, $3, 'Wave15 WIP User')
       on conflict (id) do nothing`,
      [userId, orgId, `w15-wip-${userId}@example.test`],
    );
    await ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, status)
       values ($1, $2, $3, 'intermediate', 'Cream base item', 'kg', 'active')
       on conflict (id) do nothing`,
      [itemId, orgId, `WIP-${itemId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.wip_definitions
         (id, org_id, item_id, name, base_uom, yield_pct, version, status, reusable, created_by)
       values ($1, $2, $3, 'Cream base', 'kg', 100, 3, 'active', true, $4)
       on conflict (id) do nothing`,
      [activeDefId, orgId, itemId, userId],
    );
  });

  afterAll(async () => {
    await ownerPool?.query('delete from public.wip_definition_ingredients where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.wip_definitions where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.items where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.users where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.organizations where id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('archives the predecessor and activates the successor without unique-index violations', async () => {
    let successorId = '';
    await withOrgClient(appPool, ownerPool, async (client) => {
      await client.query(
        `select wip.id
           from public.wip_definitions wip
          where wip.id = $1::uuid
            and wip.org_id = app.current_org_id()
          for update`,
        [activeDefId],
      );

      const inserted = await client.query<{ id: string }>(
        `insert into public.wip_definitions
           (org_id, item_id, name, description, base_uom, yield_pct, version, status, reusable,
            supersedes_wip_definition_id, created_by)
         values
           (app.current_org_id(), $1::uuid, 'Cream base', 'v4 content', 'kg', 100::numeric, 4, 'draft', true,
            $2::uuid, $3::uuid)
         returning id::text`,
        [itemId, activeDefId, userId],
      );
      successorId = inserted.rows[0]?.id ?? '';
      expect(successorId).toBeTruthy();

      await client.query(
        `update public.wip_definitions wip
            set status = 'archived', updated_at = now()
          where wip.id = $1::uuid
            and wip.org_id = app.current_org_id()
            and wip.status = 'active'`,
        [activeDefId],
      );
      await client.query(
        `update public.wip_definitions wip
            set status = 'active', updated_at = now()
          where wip.id = $1::uuid
            and wip.org_id = app.current_org_id()`,
        [successorId],
      );
    });

    const { rows } = await ownerPool.query<{ id: string; status: string; description: string | null }>(
      `select id::text, status, description
         from public.wip_definitions
        where org_id = $1::uuid
          and lower(name) = lower('Cream base')
        order by version`,
      [orgId],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: activeDefId, status: 'archived', description: null });
    expect(rows[1]).toMatchObject({ id: successorId, status: 'active', description: 'v4 content' });
  });
});

/**
 * Wave 15 — factory-spec recall vs WO bind advisory lock (N-23).
 * Skips when DATABASE_URL is unset.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createWorkOrderCore } from '../../../app/[locale]/(app)/(modules)/planning/work-orders/_actions/create-work-order-core';
import { getAppConnection, getOwnerConnection } from '../../../../../packages/db/src/clients.js';
import { acquireFactorySpecProductBindLock } from '../factory-spec-bind-lock';

const databaseUrl = process.env.DATABASE_URL;
const runPg = databaseUrl ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const roleId = randomUUID();
const siteId = randomUUID();
const fgItemId = randomUUID();
const specId = randomUUID();
const specCode = `W15-FS-${orgId.slice(0, 8)}`;
const itemCode = `FG-${fgItemId.slice(0, 8)}`;

function createBarrier() {
  const waiters = new Map<string, Array<() => void>>();
  const signaled = new Set<string>();

  return {
    async wait(name: string): Promise<void> {
      if (signaled.has(name)) return;
      await new Promise<void>((resolve) => {
        const queue = waiters.get(name) ?? [];
        queue.push(resolve);
        waiters.set(name, queue);
      });
    },
    signal(name: string): void {
      signaled.add(name);
      for (const resolve of waiters.get(name) ?? []) resolve();
      waiters.delete(name);
    },
  };
}

/**
 * Signals when createWorkOrderCore's path issues the production factory-spec bind lock.
 * Recall waits on this so overlap is proven at the advisory lock, not before txn start.
 */
function observeFactorySpecBindLock(
  client: pg.PoolClient,
  onProductionBindLock: () => void,
): pg.PoolClient {
  const nativeQuery = client.query.bind(client);
  client.query = async (queryText, values) => {
    const sql = typeof queryText === 'string' ? queryText : queryText.text ?? '';
    if (/pg_advisory_xact_lock/i.test(sql) && /factory_spec_bind/i.test(sql)) {
      onProductionBindLock();
    }
    return nativeQuery(queryText, values);
  };
  return client;
}

async function withOpenOrgClient<T>(
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
    return await fn(client);
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
      `insert into public.roles (id, org_id, slug, code, name, permissions)
       values ($1, $2, 'planner', 'planner', 'Wave15 Planner', '["npd.planning.write"]'::jsonb)
       on conflict (id) do nothing`,
      [roleId, orgId],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name)
       values ($1, $2, $3, 'Wave15 Recall User')
       on conflict (id) do nothing`,
      [userId, orgId, `w15-recall-${userId}@example.test`],
    );
    await ownerPool.query(
      `insert into public.user_roles (user_id, role_id, org_id)
       values ($1, $2, $3)
       on conflict do nothing`,
      [userId, roleId, orgId],
    );
    await ownerPool.query(
      `insert into public.sites (id, org_id, code, name, timezone, created_by)
       values ($1, $2, 'W15', 'Wave15 Recall Site', 'UTC', $3)
       on conflict (id) do nothing`,
      [siteId, orgId, userId],
    );
    await ownerPool.query(
      `insert into public.org_document_settings
         (org_id, doc_type, number_prefix, number_date_part, number_seq_padding, archive_after_days)
       values ($1, 'wo', 'WO', 'YYYYMM', 4, 365)
       on conflict (org_id, doc_type) do nothing`,
      [orgId],
    );
    await ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, status)
       values ($1, $2, $3, 'fg', 'Wave15 FG', 'kg', 'active')
       on conflict (id) do nothing`,
      [fgItemId, orgId, itemCode],
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
    await ownerPool?.query('delete from public.wo_status_history where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.schedule_outputs where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.audit_events where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.factory_release_status where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.work_orders where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.factory_specs where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.org_document_settings where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.items where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.sites where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.user_roles where user_id = $1', [userId]).catch(() => undefined);
    await ownerPool?.query('delete from public.roles where id = $1', [roleId]).catch(() => undefined);
    await ownerPool?.query('delete from public.users where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.organizations where id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('blocks WO bind while recall holds the advisory lock and never binds the recalled spec', async () => {
    const barrier = createBarrier();

    const recallTx = (async () => {
      await withOpenOrgClient(appPool, ownerPool, async (client) => {
        const locked = await client.query<{ id: string }>(
          `select spec.id::text as id
             from public.factory_specs spec
            where spec.org_id = app.current_org_id()
              and spec.id = $1::uuid
            for update`,
          [specId],
        );
        expect(locked.rows[0]?.id).toBe(specId);

        await acquireFactorySpecProductBindLock(client, fgItemId);
        barrier.signal('lock-held');

        await barrier.wait('bind-at-lock');

        await client.query(
          `update public.factory_specs
              set status = 'draft',
                  approved_by = null,
                  approved_at = null,
                  released_by = null,
                  released_at = null,
                  updated_at = now()
            where org_id = app.current_org_id()
              and id = $1::uuid
              and status = 'released_to_factory'`,
          [specId],
        );
        await client.query('commit');
      });
    })();

    const bindTx = (async () => {
      await barrier.wait('lock-held');

      return withOpenOrgClient(appPool, ownerPool, async (client) => {
        const observingClient = observeFactorySpecBindLock(client, () => {
          barrier.signal('bind-at-lock');
        });
        const result = await createWorkOrderCore(
          { userId, orgId, client: observingClient },
          {
            productId: fgItemId,
            itemCode,
            plannedQuantity: '10',
            siteId,
          },
        );
        await client.query('commit');
        return result;
      });
    })();

    const [, bindResult] = await Promise.all([recallTx, bindTx]);
    expect(bindResult).toMatchObject({ ok: true });

    const { rows: specRows } = await ownerPool.query<{ status: string }>(
      `select status from public.factory_specs where id = $1::uuid`,
      [specId],
    );
    expect(specRows[0]?.status).toBe('draft');

    const { rows: woRows } = await ownerPool.query<{ active_factory_spec_id: string | null }>(
      `select active_factory_spec_id::text
         from public.work_orders
        where org_id = $1::uuid`,
      [orgId],
    );
    expect(woRows).toHaveLength(1);
    expect(woRows[0]?.active_factory_spec_id).toBeNull();
  });
});

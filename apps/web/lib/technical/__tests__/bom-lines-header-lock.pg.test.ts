/**
 * Wave 17 — bom_lines UPDATE serialization against header approval lock (N-48).
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
const bomHeaderId = randomUUID();
const bomLineId = randomUUID();
const activeRmId = randomUUID();
const inactiveRmId = randomUUID();
const productCode = `W17-BOM-${orgId.slice(0, 8)}`;

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

runPg('bom_lines header lock vs approval (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Wave17 BOM Tenant', 'eu', 'https://wave17-bom.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'Wave17 BOM Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `w17-bom-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       select $1, $2, $3, 'Wave17 BOM User', r.id
         from public.roles r
        where r.org_id = $2
        order by r.slug
        limit 1
       on conflict (id) do nothing`,
      [userId, orgId, `w17-bom-${userId}@example.test`],
    );
    await ownerPool.query(
      `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
       values ($1, $2, 'Wave17 FG', 1, $3)
       on conflict (org_id, product_code) do nothing`,
      [productCode, orgId, userId],
    );
    await ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, status)
       values ($1, $2, $3, 'rm', 'Active RM', 'kg', 'active'),
              ($4, $2, $5, 'rm', 'Inactive RM', 'kg', 'blocked')
       on conflict (id) do nothing`,
      [activeRmId, orgId, `RM-ACT-${orgId.slice(0, 6)}`, inactiveRmId, `RM-INA-${orgId.slice(0, 6)}`],
    );
    await ownerPool.query(
      `insert into public.bom_headers
         (id, org_id, product_id, origin_module, status, version, created_by_user)
       values ($1, $2, $3, 'technical', 'draft', 1, $4)
       on conflict (id) do nothing`,
      [bomHeaderId, orgId, productCode, userId],
    );
    await ownerPool.query(
      `insert into public.bom_lines
         (id, org_id, bom_header_id, line_no, component_code, component_type, quantity, uom, item_id)
       values ($1, $2, $3, 1, $4, 'RM', 1, 'kg', $5)
       on conflict (id) do nothing`,
      [bomLineId, orgId, bomHeaderId, `RM-ACT-${orgId.slice(0, 6)}`, activeRmId],
    );
  });

  afterAll(async () => {
    await ownerPool?.query('delete from public.bom_lines where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.bom_headers where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.items where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.product where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.users where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.organizations where id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('blocks line UPDATE until approval releases the header lock, then rejects immutability', async () => {
    const barrier = createBarrier();
    const inactiveCode = `RM-INA-${orgId.slice(0, 6)}`;

    const approvalTx = (async () => {
      await withOrgClient(appPool, ownerPool, async (client) => {
        const { rows } = await client.query<{ status: string }>(
          `select status from public.bom_headers where id = $1::uuid for update`,
          [bomHeaderId],
        );
        expect(rows[0]?.status).toBe('draft');

        const { rows: blocked } = await client.query<{ blocked: number }>(
          `select count(*)::int as blocked
             from public.bom_lines l
             join public.items i on i.id = l.item_id
            where l.bom_header_id = $1::uuid
              and i.status <> 'active'`,
          [bomHeaderId],
        );
        expect(blocked[0]?.blocked).toBe(0);

        barrier.signal('header-locked');
        await barrier.wait('line-update-attempted');

        await client.query(
          `update public.bom_headers
              set status = 'technical_approved'
            where id = $1::uuid`,
          [bomHeaderId],
        );
      });
    })();

    await barrier.wait('header-locked');

    const lineUpdate = withOrgClient(appPool, ownerPool, async (client) => {
      barrier.signal('line-update-attempted');
      await client.query(
        `update public.bom_lines
            set item_id = $2::uuid,
                component_code = $3
          where id = $1::uuid`,
        [bomLineId, inactiveRmId, inactiveCode],
      );
    });

    await expect(lineUpdate).rejects.toThrow(/immutable|approved or active/i);
    await approvalTx;

    const { rows: line } = await ownerPool.query<{ item_id: string }>(
      `select item_id::text from public.bom_lines where id = $1::uuid`,
      [bomLineId],
    );
    expect(line[0]?.item_id).toBe(activeRmId);

    const { rows: header } = await ownerPool.query<{ status: string }>(
      `select status from public.bom_headers where id = $1::uuid`,
      [bomHeaderId],
    );
    expect(header[0]?.status).toBe('technical_approved');
  });
});

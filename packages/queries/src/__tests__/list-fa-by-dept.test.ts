import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { ownerQueryWithInferredOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const run = databaseUrl ? describe : describe.skip;

const seed = {
  tenantId: randomUUID(),
  orgAId: randomUUID(),
  orgBId: randomUUID(),
  userAId: randomUUID(),
  userBId: randomUUID(),
  roleAId: randomUUID(),
  roleBId: randomUUID(),
};

let owner: pg.Pool;
let app: pg.Pool;

function appUserConnectionString(): string {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const url = new URL(databaseUrl);
  url.username = 'app_user';
  url.password = appUserPassword;
  return url.toString();
}

async function ensureAppUser(): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner);
}

async function seedIdentities(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-018 Queries Tenant', 'eu', 'https://t018-queries.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values
       ($1, $2, $3, 'T-018 Queries Org A', 'fmcg'),
       ($4, $2, $5, 'T-018 Queries Org B', 'fmcg')
     on conflict (id) do nothing`,
    [
      seed.orgAId,
      seed.tenantId,
      `t018-q-a-${seed.orgAId.slice(0, 8)}`,
      seed.orgBId,
      `t018-q-b-${seed.orgBId.slice(0, 8)}`,
    ],
  );
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values
       ($1, $2, $5, false, $5, 'T-018 Queries A', '[]'::jsonb, false, 10),
       ($3, $4, $6, false, $6, 'T-018 Queries B', '[]'::jsonb, false, 10)
     on conflict (id) do nothing`,
    [
      seed.roleAId,
      seed.orgAId,
      seed.roleBId,
      seed.orgBId,
      `t018_q_a_${seed.roleAId.slice(0, 8)}`,
      `t018_q_b_${seed.roleBId.slice(0, 8)}`,
    ],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values
       ($1, $2, $3, 'T-018 Queries A', 'T-018 Queries A', $4),
       ($5, $6, $7, 'T-018 Queries B', 'T-018 Queries B', $8)
     on conflict (id) do nothing`,
    [
      seed.userAId,
      seed.orgAId,
      `t018-q-a-${seed.userAId}@example.test`,
      seed.roleAId,
      seed.userBId,
      seed.orgBId,
      `t018-q-b-${seed.userBId}@example.test`,
      seed.roleBId,
    ],
  );
}

async function withAppOrg<T>(orgId: string, action: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const sessionToken = randomUUID();
  await owner.query(
    `insert into app.session_org_contexts (session_token, org_id) values ($1::uuid, $2::uuid)`,
    [sessionToken, orgId],
  );

  const client = await app.connect();
  try {
    await client.query('begin');
    await client.query(`select app.set_org_context($1::uuid, $2::uuid)`, [sessionToken, orgId]);
    const result = await action(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await owner
      .query(`delete from app.session_org_contexts where session_token = $1::uuid`, [sessionToken])
      .catch(() => undefined);
  }
}

async function seedProduct(orgId: string, userId: string, productCode: string, closedCore: string | null): Promise<void> {
  await ownerQueryWithInferredOrgContext(owner,
    `insert into public.product
       (org_id, product_code, product_name, pack_size, number_of_cases, recipe_components, closed_core, created_by_user, app_version)
     values ($1::uuid, $2, $3, 'Case', 12, 'Flour;Water', $4, $5::uuid, 't018-query-test')`,
    [orgId, productCode, `T-018 ${productCode}`, closedCore, userId],
  );
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.product where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.users where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.roles where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.organizations where id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
}

run('listFaByDept — REAL DB integration (T-018)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/cleanup; assertions use app_user RLS
    owner = new pg.Pool({ connectionString: databaseUrl });
    // eslint-disable-next-line no-restricted-syntax -- direct app_user pool proves non-vacuous RLS behavior
    app = new pg.Pool({ connectionString: appUserConnectionString() });
    await seedIdentities();
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await app.end();
    await owner.end();
  });

  it('excludes closed Core rows by default, includes them when showClosed is true, and respects RLS org scope', async () => {
      const { listFaByDept } = await import('../list-fa-by-dept.js');
    const closedCode = `T018-Q-CLOSED-${randomUUID().slice(0, 8)}`;
    const openCode = `T018-Q-OPEN-${randomUUID().slice(0, 8)}`;
    const otherOrgCode = `T018-Q-OTHER-${randomUUID().slice(0, 8)}`;
    await seedProduct(seed.orgAId, seed.userAId, closedCode, 'Yes');
    await seedProduct(seed.orgAId, seed.userAId, openCode, '');
    await seedProduct(seed.orgBId, seed.userBId, otherOrgCode, '');

    await withAppOrg(seed.orgAId, async (client) => {
      const defaultRows = await listFaByDept('Core', { client });
      expect(defaultRows.map((row: { productCode: string }) => row.productCode)).toContain(openCode);
      expect(defaultRows.map((row: { productCode: string }) => row.productCode)).not.toContain(closedCode);
      expect(defaultRows.map((row: { productCode: string }) => row.productCode)).not.toContain(otherOrgCode);

      const showClosedRows = await listFaByDept('Core', { showClosed: true, client });
      expect(showClosedRows.map((row: { productCode: string }) => row.productCode)).toContain(openCode);
      expect(showClosedRows.map((row: { productCode: string }) => row.productCode)).toContain(closedCode);
      expect(showClosedRows.map((row: { productCode: string }) => row.productCode)).not.toContain(otherOrgCode);
    });

    await withAppOrg(seed.orgBId, async (client) => {
      await expect(
        client.query(
          `insert into public.product
             (org_id, product_code, product_name, pack_size, number_of_cases, recipe_components, closed_core, created_by_user, app_version)
           values ($1::uuid, $2, 'Cross Org Bad Insert', 'Case', 12, 'Flour;Water', '', $3::uuid, 't018-cross-org')`,
          [seed.orgAId, `T018-Q-BAD-${randomUUID().slice(0, 8)}`, seed.userAId],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    });
  });

  it('uses the org_id + closed_core composite index for the default Core autofilter lookup', async () => {
    await withAppOrg(seed.orgAId, async (client) => {
      await client.query(`set local enable_seqscan = off`);
      await client.query(`set local enable_bitmapscan = off`);
      const explain = await client.query<{ 'QUERY PLAN': string }>(
        `explain (costs off)
         select product_code
          from public.product
         where org_id = (select app.current_org_id())
            and closed_core <> 'Yes'
          order by closed_core, product_code`,
      );
      const plan = explain.rows.map((row) => row['QUERY PLAN']).join('\n');
      expect(plan).toMatch(/product_org_closed_core_idx/);
    });
  });
});

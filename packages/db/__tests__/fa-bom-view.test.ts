import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';
import { ownerQueryWithInferredOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/133-fa-bom-view.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '04500000-0000-4000-8000-000000000000';
const orgA = '04500000-0000-4000-8000-00000000000a';
const orgB = '04500000-0000-4000-8000-00000000000b';
const orgAUser = '04500000-0000-4000-8000-0000000000aa';
const orgBUser = '04500000-0000-4000-8000-0000000000bb';

async function ensureAppUser(pool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(pool);
}

async function seedBaseRows(pool: pg.Pool) {
  await ensureAppUser(pool);
  await pool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'T-045 Tenant', 'eu', 'https://t-045.example.test')
      on conflict (id) do update
        set name = excluded.name,
            region_cluster = excluded.region_cluster,
            data_plane_url = excluded.data_plane_url
    `,
    [tenantId],
  );
  await pool.query(
    `
      insert into public.organizations (id, tenant_id, name, industry_code)
      values ($1, $2, 'T-045 Org A', 'bakery'),
             ($3, $2, 'T-045 Org B', 'fmcg')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            name = excluded.name,
            industry_code = excluded.industry_code
    `,
    [orgA, tenantId, orgB],
  );
  await pool.query(
    `
      insert into public.roles (org_id, code, name, permissions, is_system)
      values ($1, 'npd_manager', 'T-045 NPD Manager', '["npd.dashboard.view","npd.bom.export"]'::jsonb, true),
             ($2, 'viewer', 'T-045 Viewer', '["npd.dashboard.view"]'::jsonb, true)
      on conflict (org_id, code) do update
        set code = excluded.code,
            name = excluded.name,
            permissions = excluded.permissions,
            is_system = excluded.is_system
    `,
    [orgA, orgB],
  );
  await pool.query(
    `
      insert into public.users (id, org_id, email, name, role_id)
      values (
        $1,
        $2,
        't-045-a@example.test',
        'T-045 User A',
        (select id from public.roles where org_id = $2 and code = 'npd_manager')
      ),
      (
        $3,
        $4,
        't-045-b@example.test',
        'T-045 User B',
        (select id from public.roles where org_id = $4 and code = 'viewer')
      )
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [orgAUser, orgA, orgBUser, orgB],
  );
}

async function trustOrgContext(pool: pg.Pool, sessionToken: string, orgId: string) {
  await pool.query(
    `
      insert into app.session_org_contexts (session_token, org_id)
      values ($1, $2)
      on conflict (session_token) do update set org_id = excluded.org_id
    `,
    [sessionToken, orgId],
  );
}

async function withOrgClient<T>(
  appPool: pg.Pool,
  ownerPool: pg.Pool,
  orgId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
  options: { commit?: boolean } = {},
) {
  const sessionToken = randomUUID();
  await trustOrgContext(ownerPool, sessionToken, orgId);

  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const result = await fn(client);
    await client.query(options.commit ? 'commit' : 'rollback');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function seedBom(
  pool: pg.Pool,
  input: { orgId: string; userId: string; productCode: string; componentCode: string; d365Status?: string },
) {
  const headerId = randomUUID();
  await pool.query('delete from public.bom_headers where product_id = $1', [input.productCode]);
  await pool.query('delete from public.product where product_code = $1', [input.productCode]);
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.product (product_code, org_id, product_name, built, created_by_user)
      values ($1, $2, $3, false, $4)
    `,
    [input.productCode, input.orgId, `${input.productCode} FG`, input.userId],
  );
  await pool.query(
    `
      insert into public.bom_headers
        (id, org_id, product_id, origin_module, status, version, created_by_user)
      values ($1, $2, $3, 'npd', 'draft', 1, $4)
    `,
    [headerId, input.orgId, input.productCode, input.userId],
  );
  await pool.query(
    `
      insert into public.bom_lines
        (org_id, bom_header_id, line_no, component_code, component_type, quantity, uom, manufacturing_operation_name, source)
      values ($1, $2, 1, $3, 'RM', 2.500000, 'kg', 'Mixing', 'prod_detail')
    `,
    [input.orgId, headerId, input.componentCode],
  );
  if (input.d365Status) {
    await pool.query(
      `
        insert into public.d365_import_cache (org_id, code, status)
        values ($1, $2, $3)
        on conflict (org_id, code) do update set status = excluded.status
      `,
      [input.orgId, input.componentCode, input.d365Status],
    );
  }
  await pool.query(
    `
      update public.bom_headers
      set status = 'active',
          approved_by = $1,
          approved_at = pg_catalog.now()
      where id = $2
    `,
    [input.userId, headerId],
  );
}

describe('133 FA BOM view migration contract', () => {
  it('creates the required migration without tenant_id/current_setting leakage', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/133-fa-bom-view.sql').toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/create\s+view\s+public\.fa_bom_view/i);
    expect(sql).toMatch(/public\.get_fa_bom/i);
    expect(sql).toMatch(/public\.d365_import_cache/i);
    expect(sql).toMatch(/coalesce\s*\([^)]*d365/i);
    expect(sql).toMatch(/security_invoker\s*=\s*true/i);
    expect(sql).not.toMatch(/\btenant_id\b|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });
});

runIntegrationTest('133 FA BOM view behavior', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedBaseRows(ownerPool);
  });

  afterAll(async () => {
    await appPool?.end();
    await ownerPool?.end();
  });

  it('returns view rows in BOM line order with Empty d365_status default', async () => {
    const productCode = `FA5101-${randomUUID()}`;
    await seedBom(ownerPool, {
      orgId: orgA,
      userId: orgAUser,
      productCode,
      componentCode: 'RM-T045-EMPTY',
    });

    const rows = await withOrgClient(appPool, ownerPool, orgA, (client) =>
      client.query<{
        product_code: string;
        component_type: string;
        component_code: string;
        quantity: string;
        process_stage: string;
        source: string;
        d365_status: string;
      }>(
        `
          select product_code, component_type, component_code, quantity::text, process_stage, source, d365_status
          from public.fa_bom_view
          where product_code = $1
          order by line_no
        `,
        [productCode],
      ),
    );

    expect(rows.rows).toEqual([
      {
        product_code: productCode,
        component_type: 'RM',
        component_code: 'RM-T045-EMPTY',
        quantity: '2.500000',
        process_stage: 'Mixing',
        source: 'prod_detail',
        d365_status: 'Empty',
      },
    ]);
  });

  it('keeps fa_bom_view non-vacuously isolated by org under RLS and rejects cross-org writes', async () => {
    const productA = `FA5101-RLS-A-${randomUUID()}`;
    const productB = `FA5101-RLS-B-${randomUUID()}`;
    await seedBom(ownerPool, {
      orgId: orgA,
      userId: orgAUser,
      productCode: productA,
      componentCode: 'RM-T045-A',
      d365Status: 'Found',
    });
    await seedBom(ownerPool, {
      orgId: orgB,
      userId: orgBUser,
      productCode: productB,
      componentCode: 'RM-T045-B',
      d365Status: 'Missing',
    });

    const visibleToA = await withOrgClient(appPool, ownerPool, orgA, (client) =>
      client.query<{ product_code: string }>('select product_code from public.fa_bom_view order by product_code'),
    );
    expect(visibleToA.rows.map((row) => row.product_code)).toContain(productA);
    expect(visibleToA.rows.map((row) => row.product_code)).not.toContain(productB);

    await expect(
      withOrgClient(
        appPool,
        ownerPool,
        orgA,
        (client) =>
          client.query(
            `
              insert into public.d365_import_cache (org_id, code, status)
              values ($1::uuid, 'RM-T045-CROSS', 'Found')
            `,
            [orgB],
          ),
        { commit: true },
      ),
    ).rejects.toThrow(/row-level security|violates/i);
  });
});

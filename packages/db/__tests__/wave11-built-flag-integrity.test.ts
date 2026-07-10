import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';
import {
  ensureAppUser as ensureAppUserWithAdvisoryLock,
  ownerQueryWithOrgContext,
} from './owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '77110000-0000-4000-8000-000000000001';
const orgId = '77110000-0000-4000-8000-000000000009';
const userId = '77110000-0000-4000-8000-0000000000aa';
const roleId = '77110000-0000-4000-8000-0000000000bb';
const productCode = 'W11-BUILT-FG';

async function seedOrg(pool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(pool);
  await pool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'Wave11 Built Flag Tenant', 'eu', 'https://wave11-built.example.test')
     on conflict (id) do update set name = excluded.name`,
    [tenantId],
  );
  await pool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'Wave11 Built Flag Org', 'bakery')
     on conflict (id) do update set name = excluded.name`,
    [orgId, tenantId],
  );
  await pool.query(
    `insert into public.roles (id, org_id, code, name, permissions, is_system)
     values ($1, $2, 'wave11_built', 'Wave11 Built Role', '[]'::jsonb, true)
     on conflict (org_id, code) do update set name = excluded.name`,
    [roleId, orgId],
  );
  await pool.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, 'wave11-built@example.test', 'Wave11 Built User', $3)
     on conflict (id) do update set org_id = excluded.org_id, role_id = excluded.role_id`,
    [userId, orgId, roleId],
  );
}

async function trustOrgContext(pool: pg.Pool, sessionToken: string) {
  await pool.query(
    `insert into app.session_org_contexts (session_token, org_id)
     values ($1, $2)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );
}

async function cleanupProduct(pool: pg.Pool, code: string) {
  await ownerQueryWithOrgContext(pool, orgId, 'delete from public.outbox_events where org_id = $1 and aggregate_id = $2', [
    orgId,
    code,
  ]);
  await ownerQueryWithOrgContext(pool, orgId, 'delete from public.npd_wip_processes where org_id = $1', [orgId]);
  await ownerQueryWithOrgContext(pool, orgId, 'delete from public.prod_detail where org_id = $1 and product_code = $2', [
    orgId,
    code,
  ]);
  await ownerQueryWithOrgContext(pool, orgId, 'delete from public.product where product_code = $1', [code]);
}

async function seedBuiltProduct(pool: pg.Pool, code: string) {
  await cleanupProduct(pool, code);
  await ownerQueryWithOrgContext(
    pool,
    orgId,
    `insert into public.product (product_code, org_id, product_name, built, schema_version, created_by_user)
     values ($1, $2, 'Wave11 Built Product', true, 1, $3)`,
    [code, orgId, userId],
  );
}

async function readBuilt(pool: pg.Pool, code: string): Promise<boolean> {
  const { rows } = await ownerQueryWithOrgContext(
    pool,
    orgId,
    'select built from public.product where product_code = $1',
    [code],
  );
  return rows[0]?.built === true;
}

async function countBuiltResetEvents(pool: pg.Pool, code: string, source?: string): Promise<number> {
  const { rows } = await ownerQueryWithOrgContext(
    pool,
    orgId,
    `select count(*)::int as n
       from public.outbox_events
      where org_id = $1
        and event_type = 'fa.built_reset'
        and aggregate_id = $2
        and ($3::text is null or payload->>'source' = $3)`,
    [orgId, code, source ?? null],
  );
  return Number(rows[0]?.n ?? 0);
}

async function withAppOrgContext<T>(
  appPool: pg.Pool,
  adminPool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const sessionToken = randomUUID();
  await trustOrgContext(adminPool, sessionToken);
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
  }
}

describe('Wave 11 built-flag migration contracts (static)', () => {
  const migrations = [
    '468-product-built-column-grant-lockdown.sql',
    '469-product-built-v18-guard-current-user.sql',
    '470-prod-detail-built-reset-insert-delete.sql',
    '471-wip-process-built-reset.sql',
    '472-items-built-reset-on-label-edit.sql',
  ] as const;

  it.each(migrations)('%s exists and uses idempotent patterns', (filename) => {
    const path = resolve(packageRoot, 'migrations', filename);
    expect(existsSync(path), `expected ${path}`).toBe(true);
    const sql = readFileSync(path, 'utf8');
    expect(sql).toMatch(/create or replace|drop trigger if exists|revoke update on public\.product/i);
    expect(sql).not.toMatch(/\btenant_id\b/i);
  });

  it('468 excludes built from app_user UPDATE grant', () => {
    const sql = readFileSync(resolve(packageRoot, 'migrations/468-product-built-column-grant-lockdown.sql'), 'utf8');
    expect(sql).toMatch(/revoke update on public\.product from app_user/i);
    expect(sql).toMatch(/attname <> 'built'/i);
    expect(sql).toMatch(/grant update \(%s\) on public\.product to app_user/i);
  });

  it('469 switches V18 downgrade guard to current_user', () => {
    const sql = readFileSync(resolve(packageRoot, 'migrations/469-product-built-v18-guard-current-user.sql'), 'utf8');
    expect(sql).toMatch(/if new\.built is false and old\.built is true and current_user = 'app_user'/i);
    expect(sql).toMatch(/V18_BUILT_DOWNGRADE_REQUIRES_AUDIT/i);
    expect(sql).not.toMatch(/if new\.built is false and old\.built is true and session_user = 'app_user'/i);
  });
});

runIntegrationSuite('Wave 11 built-flag integrity (integration)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;
  let hasWipTable = false;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedOrg(ownerPool);
    const wip = await ownerPool.query<{ reg: string | null }>(
      `select to_regclass('public.npd_wip_processes')::text as reg`,
    );
    hasWipTable = wip.rows[0]?.reg === 'npd_wip_processes';
  });

  afterAll(async () => {
    await cleanupProduct(ownerPool, productCode).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('N-24: app_user lacks UPDATE privilege on public.product.built', async () => {
    await withAppOrgContext(appPool, ownerPool, async (client) => {
      const { rows } = await client.query<{ can_update: boolean }>(
        `select has_column_privilege('app_user', 'public.product', 'built', 'UPDATE') as can_update`,
      );
      expect(rows[0]?.can_update).toBe(false);
      const other = await client.query<{ col: string; ok: boolean }>(
        `select a.attname as col,
                has_column_privilege('app_user', 'public.product', a.attname, 'UPDATE') as ok
           from pg_attribute a
          where a.attrelid = 'public.product'::regclass
            and a.attnum > 0
            and not a.attisdropped
            and a.attname in ('product_name', 'built')
          order by a.attname`,
      );
      expect(other.rows).toEqual([
        { col: 'built', ok: false },
        { col: 'product_name', ok: true },
      ]);
    });
  });

  it('N-25a: audited prod_detail UPDATE reset clears built and emits fa.built_reset', async () => {
    await seedBuiltProduct(ownerPool, productCode);
    expect(await readBuilt(ownerPool, productCode)).toBe(true);

    await ownerQueryWithOrgContext(
      ownerPool,
      orgId,
      `insert into public.prod_detail (product_code, org_id, component_index, intermediate_code)
       values ($1, $2, 1, 'INT-W11')`,
      [productCode, orgId],
    );

    await ownerQueryWithOrgContext(
      ownerPool,
      orgId,
      `update public.prod_detail
          set intermediate_code = 'INT-W11-B'
        where org_id = $1 and product_code = $2 and component_index = 1`,
      [orgId, productCode],
    );

    expect(await readBuilt(ownerPool, productCode)).toBe(false);
    expect(await countBuiltResetEvents(ownerPool, productCode, 'prod_detail')).toBeGreaterThan(0);
  });

  it('N-25b: app_user direct built downgrade is blocked', async () => {
    await seedBuiltProduct(ownerPool, productCode);

    await withAppOrgContext(appPool, ownerPool, async (client) => {
      await expect(
        client.query('update public.product set built = false where product_code = $1', [productCode]),
      ).rejects.toThrow(/permission denied|V18_BUILT_DOWNGRADE_REQUIRES_AUDIT|42501|23514/i);
    });

    expect(await readBuilt(ownerPool, productCode)).toBe(true);
  });

  it('N-26: prod_detail INSERT and DELETE on a built product reset built', async () => {
    await seedBuiltProduct(ownerPool, productCode);

    await ownerQueryWithOrgContext(
      ownerPool,
      orgId,
      `insert into public.prod_detail (product_code, org_id, component_index, intermediate_code)
       values ($1, $2, 1, 'INT-INS')`,
      [productCode, orgId],
    );
    expect(await readBuilt(ownerPool, productCode)).toBe(false);
    const afterInsertEvents = await countBuiltResetEvents(ownerPool, productCode, 'prod_detail');
    expect(afterInsertEvents).toBeGreaterThan(0);

    await ownerQueryWithOrgContext(ownerPool, orgId, 'update public.product set built = true where product_code = $1', [
      productCode,
    ]);
    expect(await readBuilt(ownerPool, productCode)).toBe(true);

    await ownerQueryWithOrgContext(
      ownerPool,
      orgId,
      'delete from public.prod_detail where org_id = $1 and product_code = $2',
      [orgId, productCode],
    );
    expect(await readBuilt(ownerPool, productCode)).toBe(false);
    expect(await countBuiltResetEvents(ownerPool, productCode, 'prod_detail')).toBeGreaterThan(afterInsertEvents);
  });

  it('N-27: npd_wip_processes mutation resets built on the parent FG', async () => {
    if (!hasWipTable) return;

    await seedBuiltProduct(ownerPool, productCode);
    const detail = await ownerQueryWithOrgContext<{ id: string }>(
      ownerPool,
      orgId,
      `insert into public.prod_detail (product_code, org_id, component_index, intermediate_code)
       values ($1, $2, 1, 'INT-WIP')
       returning id::text as id`,
      [productCode, orgId],
    );
    const prodDetailId = detail.rows[0]?.id;
    expect(prodDetailId).toBeTruthy();

    await ownerQueryWithOrgContext(ownerPool, orgId, 'update public.product set built = true where product_code = $1', [
      productCode,
    ]);
    expect(await readBuilt(ownerPool, productCode)).toBe(true);

    const wip = await ownerQueryWithOrgContext<{ id: string }>(
      ownerPool,
      orgId,
      `insert into public.npd_wip_processes (org_id, prod_detail_id, process_name, display_order)
       values ($1, $2::uuid, 'Mixing', 1)
       returning id::text as id`,
      [orgId, prodDetailId],
    );
    expect(await readBuilt(ownerPool, productCode)).toBe(false);
    expect(await countBuiltResetEvents(ownerPool, productCode, 'npd_wip_processes')).toBeGreaterThan(0);

    const wipId = wip.rows[0]?.id;
    await ownerQueryWithOrgContext(ownerPool, orgId, 'update public.product set built = true where product_code = $1', [
      productCode,
    ]);
    await ownerQueryWithOrgContext(
      ownerPool,
      orgId,
      `update public.npd_wip_processes set process_name = 'Blending' where id = $1::uuid`,
      [wipId],
    );
    expect(await readBuilt(ownerPool, productCode)).toBe(false);
  });

  it('N-28: direct items label/GTIN edit on built FG resets built', async () => {
    await seedBuiltProduct(ownerPool, productCode);
    const item = await ownerQueryWithOrgContext<{ id: string }>(
      ownerPool,
      orgId,
      'select id::text as id from public.items where org_id = $1 and item_code = $2',
      [orgId, productCode],
    );
    const itemId = item.rows[0]?.id;
    expect(itemId).toBeTruthy();

    await ownerQueryWithOrgContext(
      ownerPool,
      orgId,
      `update public.items
          set name = 'Renamed Wave11 FG', gs1_gtin = '05912345678903'
        where id = $1::uuid`,
      [itemId],
    );

    expect(await readBuilt(ownerPool, productCode)).toBe(false);
    expect(await countBuiltResetEvents(ownerPool, productCode, 'items')).toBeGreaterThan(0);
  });
});

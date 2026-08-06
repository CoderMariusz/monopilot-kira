import { randomUUID } from 'node:crypto';
import type pg from 'pg';

export const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;
type PoolLike = Queryable & { connect: () => Promise<pg.PoolClient> };

const fixtureColumns = {
  tenants: ['id', 'name', 'region_cluster', 'data_plane_url'],
  organizations: ['id', 'tenant_id', 'name', 'slug', 'industry_code'],
  roles: ['id', 'org_id', 'slug', 'system', 'code', 'name', 'permissions', 'is_system', 'display_order'],
  users: ['id', 'org_id', 'email', 'display_name', 'name', 'role_id'],
  sites: ['id', 'org_id', 'site_code', 'name', 'is_default', 'is_active', 'timezone', 'created_by'],
  warehouses: ['id', 'org_id', 'site_id', 'code', 'name', 'warehouse_type', 'is_default'],
  locations: ['id', 'org_id', 'warehouse_id', 'code', 'name', 'location_type', 'level', 'path', 'is_active'],
} as const;

type FixtureTable = keyof typeof fixtureColumns;

export type PgTestFixture = {
  tenantId: string;
  orgId: string;
  roleId: string;
  userId: string;
  siteId: string;
  warehouseId: string;
  locationId: string;
  cleanup: () => Promise<void>;
};

// Format-only (8-4-4-4-12 hex). MUST NOT enforce the RFC-4122 version/variant bytes
// ([1-5] / [89ab]). inferOrgContext below uses this to pick the org id out of the query
// params; the canonical org 00000000-0000-0000-0000-000000000002 (migration 030) has
// version=0 and variant=0, so a strict regex rejected it — and because every extractor
// treats "rejected" as "not found", inferOrgContext fell through to the scan-all-params
// loop and adopted the FIRST v4-looking param (typically a user_id or row id) as the org
// context. That surfaced as `session_org_contexts_org_id_fkey`, which names neither the
// real cause nor the real org.
function asUuid(value: unknown): string | undefined {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}

function paramAt(params: readonly unknown[], index: string): string | undefined {
  return asUuid(params[Number(index) - 1]);
}

export function inferOrgContext(sql: string, params: readonly unknown[] = []): string {
  const byPredicate = sql.match(/\borg_id\s*=\s*\$(\d+)/i);
  if (byPredicate) {
    const orgId = paramAt(params, byPredicate[1]);
    if (orgId) return orgId;
  }

  const byAnyPredicate = sql.match(/\borg_id\s*=\s*any\s*\(\s*\$(\d+)/i);
  if (byAnyPredicate) {
    const value = params[Number(byAnyPredicate[1]) - 1];
    if (Array.isArray(value)) {
      const orgId = value.map(asUuid).find(Boolean);
      if (orgId) return orgId;
    }
  }

  const byInPredicate = sql.match(/\borg_id\s+in\s*\(([^)]*)\)/i);
  if (byInPredicate) {
    for (const marker of byInPredicate[1].matchAll(/\$(\d+)/g)) {
      const orgId = paramAt(params, marker[1]);
      if (orgId) return orgId;
    }
  }

  const insertColumns = sql.match(/\binsert\s+into\s+(?:"Reference"\.)?(?:"[^"]+"|public\.\w+)\s*\(([^)]*)\)/i);
  if (insertColumns) {
    const columns = insertColumns[1]
      .split(',')
      .map((column) => column.replace(/"/g, '').trim().toLowerCase());
    const orgColumnIndex = columns.indexOf('org_id');
    if (orgColumnIndex >= 0) {
      const values = sql.match(/\bvalues\s*\(([^)]*)\)/i);
      const marker = values?.[1].split(',')[orgColumnIndex]?.match(/\$(\d+)/);
      if (marker) {
        const orgId = paramAt(params, marker[1]);
        if (orgId) return orgId;
      }
    }
  }

  for (const param of params) {
    const orgId = asUuid(param);
    if (orgId) return orgId;
    if (Array.isArray(param)) {
      const nestedOrgId = param.map(asUuid).find(Boolean);
      if (nestedOrgId) return nestedOrgId;
    }
  }

  throw new Error(`Unable to infer org context for guarded owner query: ${sql.slice(0, 160)}`);
}

export async function ensureAppUser(owner: Queryable, password = appUserPassword): Promise<void> {
  await owner.query(`
    do $$
    begin
      perform pg_advisory_xact_lock(hashtext('test:ensure-app-user'));
      if not exists (select 1 from pg_roles where rolname = 'app_user') then
        create role app_user login password '${password}';
      else
        alter role app_user login password '${password}';
      end if;
    end
    $$;
  `);
}

export async function createPgTestFixture(
  owner: Queryable,
  options: { permissions: readonly string[] },
): Promise<PgTestFixture> {
  const shouldRelease = 'idleCount' in owner;
  const client = shouldRelease ? await (owner as unknown as PoolLike).connect() : owner;
  const ids = {
    tenantId: randomUUID(),
    orgId: randomUUID(),
    roleId: randomUUID(),
    userId: randomUUID(),
    siteId: randomUUID(),
    warehouseId: randomUUID(),
    locationId: randomUUID(),
  };
  const sessionToken = randomUUID();
  let transactionStarted = false;
  let sessionRegistered = false;

  try {
    const role = await client.query<{
      role: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(
      `select current_user as role, rolsuper, rolbypassrls
         from pg_roles
        where rolname = current_user`,
    );
    const currentRole = role.rows[0];
    if (!currentRole?.rolsuper && !currentRole?.rolbypassrls) {
      throw new Error(
        `createPgTestFixture: ${currentRole?.role ?? 'current role'} is neither superuser nor BYPASSRLS; ` +
          'use DATABASE_URL_OWNER because public.organizations/public.users FORCE RLS',
      );
    }

    const required = await client.query<{ table_name: FixtureTable; column_name: string }>(
      `select table_name, column_name
         from information_schema.columns
        where table_schema = 'public'
          and table_name = any($1::text[])
          and is_nullable = 'NO'
          and column_default is null
          and is_generated = 'NEVER'
          and identity_generation is null
        order by table_name, ordinal_position`,
      [Object.keys(fixtureColumns)],
    );
    for (const table of Object.keys(fixtureColumns) as FixtureTable[]) {
      const uncovered = required.rows
        .filter((column) => column.table_name === table)
        .map((column) => column.column_name)
        .filter((column) => !(fixtureColumns[table] as readonly string[]).includes(column));
      if (uncovered.length > 0) {
        throw new Error(`createPgTestFixture: public.${table} requires uncovered column(s): ${uncovered.join(', ')}`);
      }
    }

    await client.query('begin');
    transactionStarted = true;
    await client.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1::uuid, $2, 'eu', $3)`,
      [ids.tenantId, `PG fixture ${ids.tenantId.slice(0, 8)}`, 'https://pg-fixture.example.test'],
    );
    await client.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1::uuid, $2::uuid, $3, $4, 'fmcg')`,
      [ids.orgId, ids.tenantId, `PG fixture ${ids.orgId.slice(0, 8)}`, `pg-fixture-${ids.orgId.slice(0, 8)}`],
    );
    await client.query(
      `insert into app.session_org_contexts (session_token, org_id, user_id)
       values ($1::uuid, $2::uuid, null)`,
      [sessionToken, ids.orgId],
    );
    sessionRegistered = true;
    await client.query(`select app.set_org_context($1::uuid, $2::uuid)`, [sessionToken, ids.orgId]);
    await client.query(
      `insert into public.roles
         (id, org_id, slug, system, code, name, permissions, is_system, display_order)
       values ($1::uuid, $2::uuid, $3, false, $3, $4, $5::jsonb, false, 900)`,
      [
        ids.roleId,
        ids.orgId,
        `pg-fixture-${ids.roleId.slice(0, 8)}`,
        'PG Fixture Role',
        JSON.stringify(options.permissions),
      ],
    );
    await client.query(
      `insert into public.users (id, org_id, email, display_name, name, role_id)
       values ($1::uuid, $2::uuid, $3, 'PG Fixture User', 'PG Fixture User', $4::uuid)`,
      [ids.userId, ids.orgId, `pg-fixture-${ids.userId}@example.test`, ids.roleId],
    );
    await client.query(
      `update app.session_org_contexts
          set user_id = $2::uuid
        where session_token = $1::uuid`,
      [sessionToken, ids.userId],
    );
    await client.query(`select app.set_org_context($1::uuid, $2::uuid)`, [sessionToken, ids.orgId]);
    await client.query(
      `insert into public.role_permissions (role_id, permission)
       select $1::uuid, permission
         from unnest($2::text[]) permission
       on conflict (role_id, permission) do nothing`,
      [ids.roleId, [...options.permissions]],
    );
    await client.query(
      `insert into public.user_roles (user_id, role_id, org_id)
       values ($1::uuid, $2::uuid, $3::uuid)`,
      [ids.userId, ids.roleId, ids.orgId],
    );
    await client.query(
      `insert into public.sites
         (id, org_id, site_code, name, is_default, is_active, timezone, created_by)
       values ($1::uuid, $2::uuid, $3, 'PG Fixture Site', true, true, 'Europe/London', $4::uuid)`,
      [ids.siteId, ids.orgId, `FX${ids.siteId.slice(0, 6)}`, ids.userId],
    );
    await client.query(
      `insert into public.warehouses
         (id, org_id, site_id, code, name, warehouse_type, is_default)
       values ($1::uuid, $2::uuid, $3::uuid, $4, 'PG Fixture Warehouse', 'standard', true)`,
      [ids.warehouseId, ids.orgId, ids.siteId, `FX-${ids.warehouseId.slice(0, 8)}`],
    );
    await client.query(
      `insert into public.locations
         (id, org_id, warehouse_id, code, name, location_type, level, path, is_active)
       values ($1::uuid, $2::uuid, $3::uuid, 'ROOT', 'PG Fixture Root', 'storage', 0, 'ROOT', true)`,
      [ids.locationId, ids.orgId, ids.warehouseId],
    );
    await client.query('commit');
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    if (sessionRegistered) {
      await client
        .query(`delete from app.session_org_contexts where session_token = $1::uuid`, [sessionToken])
        .catch(() => undefined);
    }
    if (shouldRelease && 'release' in client) {
      (client as pg.PoolClient).release();
    }
  }

  return {
    ...ids,
    cleanup: () => cleanupPgTestFixture(owner, ids),
  };
}

async function cleanupPgTestFixture(
  owner: Queryable,
  ids: Omit<PgTestFixture, 'cleanup'>,
): Promise<void> {
  const shouldRelease = 'idleCount' in owner;
  const client = shouldRelease ? await (owner as unknown as PoolLike).connect() : owner;
  const sessionToken = randomUUID();
  try {
    await client.query('begin');
    await client.query(
      `insert into app.session_org_contexts (session_token, org_id, user_id)
       values ($1::uuid, $2::uuid, $3::uuid)`,
      [sessionToken, ids.orgId, ids.userId],
    );
    await client.query(`select app.set_org_context($1::uuid, $2::uuid)`, [sessionToken, ids.orgId]);
    await client.query(`delete from public.locations where id = $1::uuid`, [ids.locationId]);
    await client.query(`delete from public.warehouses where id = $1::uuid`, [ids.warehouseId]);
    await client.query(`delete from public.sites where id = $1::uuid`, [ids.siteId]);
    await client.query(`delete from public.user_roles where user_id = $1::uuid`, [ids.userId]);
    await client.query(`delete from public.role_permissions where role_id = $1::uuid`, [ids.roleId]);
    await client.query(`delete from public.users where id = $1::uuid`, [ids.userId]);
    await client.query(`delete from public.roles where id = $1::uuid`, [ids.roleId]);
    await client.query(`delete from public.organizations where id = $1::uuid`, [ids.orgId]);
    await client.query(`delete from public.tenants where id = $1::uuid`, [ids.tenantId]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client
      .query(`delete from app.session_org_contexts where session_token = $1::uuid`, [sessionToken])
      .catch(() => undefined);
    if (shouldRelease && 'release' in client) {
      (client as pg.PoolClient).release();
    }
  }
}

export async function ownerQueryWithOrgContext<T extends pg.QueryResultRow = pg.QueryResultRow>(
  owner: Queryable,
  orgId: string,
  sql: string,
  params: readonly unknown[] = [],
): Promise<pg.QueryResult<T>> {
  const sessionToken = randomUUID();
  // Only a real Pool should be treated as poolable: pg.Client also has
  // .connect(), but re-connecting an already-connected Client throws.
  const shouldRelease = 'idleCount' in owner;
  const client = shouldRelease ? await (owner as unknown as PoolLike).connect() : owner;
  const mutableParams = [...params];
  try {
    await client.query('begin');
    await client.query(
      `insert into app.session_org_contexts (session_token, org_id) values ($1::uuid, $2::uuid)`,
      [sessionToken, orgId],
    );
    await client.query(`select app.set_org_context($1::uuid, $2::uuid)`, [sessionToken, orgId]);
    const result = await client.query<T>(sql, mutableParams);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client
      .query(`delete from app.session_org_contexts where session_token = $1::uuid`, [sessionToken])
      .catch(() => undefined);
    if (shouldRelease && 'release' in client) {
      (client as pg.PoolClient).release();
    }
  }
}

export async function ownerQueryWithInferredOrgContext<T extends pg.QueryResultRow = pg.QueryResultRow>(
  owner: Queryable,
  sql: string,
  params: readonly unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return ownerQueryWithOrgContext<T>(owner, await inferOrgContextForQuery(owner, sql, params), sql, params);
}

async function inferOrgContextForQuery(owner: Queryable, sql: string, params: readonly unknown[]): Promise<string> {
  try {
    return inferOrgContext(sql, params);
  } catch (error) {
    const productCodeMarker = sql.match(/\bproduct_code\s*=\s*\$(\d+)/i);
    const productCode = productCodeMarker ? params[Number(productCodeMarker[1]) - 1] : undefined;
    if (typeof productCode === 'string') {
      const result = await owner.query<{ org_id: string }>(
        `
          select org_id from public.product where product_code = $1
          union
          select org_id from public.prod_detail where product_code = $1
          union
          select org_id from public.fa_allergen_overrides where product_code = $1
          limit 1
        `,
        [productCode],
      );
      const orgId = result.rows[0]?.org_id;
      if (orgId) return orgId;
    }

    const likeLiteral = sql.match(/\bproduct_code\s+like\s+'([^']+)'/i);
    if (likeLiteral) {
      const result = await owner.query<{ org_id: string }>(
        `
          select org_id from public.product where product_code like $1
          union
          select org_id from public.prod_detail where product_code like $1
          union
          select org_id from public.fa_allergen_overrides where product_code like $1
          limit 1
        `,
        [likeLiteral[1]],
      );
      const orgId = result.rows[0]?.org_id;
      if (orgId) return orgId;
      const fallback = await owner.query<{ id: string }>(`select id from public.organizations limit 1`);
      if (fallback.rows[0]?.id) return fallback.rows[0].id;
    }

    throw error;
  }
}

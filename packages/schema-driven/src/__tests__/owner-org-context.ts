import { randomUUID } from 'node:crypto';
import type pg from 'pg';

export const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;
type PoolLike = Queryable & { connect: () => Promise<pg.PoolClient> };

function asUuid(value: unknown): string | undefined {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
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

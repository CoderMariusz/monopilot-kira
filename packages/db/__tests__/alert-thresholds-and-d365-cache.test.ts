import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;
const runIntegrationTest = databaseUrl ? it : it.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/084-alert-thresholds-and-d365-cache.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

describe('T-049 alert thresholds and d365 import cache - static contract', () => {
  it('creates the current 084 migration with org_id-scoped RLS, not stale tenant_id scope', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+"Reference"\."AlertThresholds"/i);
    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.d365_import_cache/i);
    expect(migration).toMatch(/primary\s+key\s*\(\s*org_id\s*,\s*threshold_key\s*\)/i);
    expect(migration).toMatch(/primary\s+key\s*\(\s*org_id\s*,\s*code\s*\)/i);
    expect(migration).toMatch(/alter\s+table\s+"Reference"\."AlertThresholds"\s+force\s+row\s+level\s+security/i);
    expect(migration).toMatch(/alter\s+table\s+public\.d365_import_cache\s+force\s+row\s+level\s+security/i);
    expect(migration).toMatch(/org_id\s*=\s*app\.current_org_id\s*\(\s*\)/i);
    expect(migration).not.toMatch(/\btenant_id\b|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });

  it('declares the d365_import_cache status CHECK and required query indexes', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/constraint\s+d365_import_cache_status_check\s+check\s*\(\s*status\s+in\s*\('Found',\s*'NoCost',\s*'Missing'\)\s*\)/i);
    expect(migration).not.toMatch(/'Empty'/i);
    expect(migration).toMatch(/on\s+"Reference"\."AlertThresholds"\s*\(\s*org_id\s*,\s*threshold_key\s*\)/i);
    expect(migration).toMatch(/on\s+public\.d365_import_cache\s*\(\s*org_id\s*,\s*status\s*\)/i);
    expect(migration).toMatch(/on\s+public\.d365_import_cache\s*\(\s*org_id\s*,\s*last_synced_at/i);
  });
});

runIntegrationSuite('T-049 alert thresholds and d365 import cache - database contract', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;

  const tenantId = randomUUID();
  const orgA = randomUUID();
  const orgB = randomUUID();
  const sessionTokenA = randomUUID();

  beforeAll(async () => {
    if (!databaseUrl) return;

    adminPool = getOwnerConnection();
    appPool = getAppConnection();

    await adminPool.query(`
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = 'app_user') then
          create role app_user login password '${appUserPassword}';
        else
          alter role app_user login password '${appUserPassword}';
        end if;
      end
      $$;
    `);

    await adminPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T-049 Tenant', 'eu', 'https://t-049.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
       values ($1, $2, 'T-049 Org A', 'fmcg', 't-049-org-a')
       on conflict (id) do nothing`,
      [orgA, tenantId],
    );
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
       values ($1, $2, 'T-049 Org B', 'fmcg', 't-049-org-b')
       on conflict (id) do nothing`,
      [orgB, tenantId],
    );

    await adminPool.query(
      `insert into public.d365_import_cache (org_id, code, status, comment)
       values ($1, 'MAT-A', 'Found', 'visible to org A')
       on conflict (org_id, code) do nothing`,
      [orgA],
    );
    await adminPool.query(
      `insert into public.d365_import_cache (org_id, code, status, comment)
       values ($1, 'MAT-B', 'Missing', 'hidden from org A')
       on conflict (org_id, code) do nothing`,
      [orgB],
    );

    await adminPool.query(
      `insert into app.session_org_contexts (session_token, org_id)
       values ($1, $2)
       on conflict (session_token) do update set org_id = excluded.org_id`,
      [sessionTokenA, orgA],
    );
  });

  afterAll(async () => {
    if (!adminPool) return;

    await adminPool
      .query(`delete from app.session_org_contexts where session_token = $1`, [sessionTokenA])
      .catch(() => undefined);
    await adminPool
      .query(`delete from public.d365_import_cache where org_id in ($1, $2)`, [orgA, orgB])
      .catch(() => undefined);
    await adminPool
      .query(`delete from "Reference"."AlertThresholds" where org_id in ($1, $2)`, [orgA, orgB])
      .catch(() => undefined);
    await adminPool
      .query(`delete from public.organizations where id in ($1, $2)`, [orgA, orgB])
      .catch(() => undefined);
    await adminPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);

    await appPool?.end();
    await adminPool?.end();
  });

  runIntegrationTest('AC1: Reference.AlertThresholds has required columns, composite PK, indexes, and forced RLS', async () => {
    const columns = await adminPool.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable
         from information_schema.columns
        where table_schema = 'Reference'
          and table_name = 'AlertThresholds'
        order by ordinal_position`,
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual([
      'org_id',
      'threshold_key',
      'value_int',
      'value_text',
      'updated_at',
    ]);
    expect(columns.rows.find((row) => row.column_name === 'org_id')?.is_nullable).toBe('NO');
    expect(columns.rows.find((row) => row.column_name === 'threshold_key')?.is_nullable).toBe('NO');

    const pk = await adminPool.query<{ column_name: string }>(
      `select kcu.column_name
         from information_schema.table_constraints tc
         join information_schema.key_column_usage kcu
           on kcu.constraint_schema = tc.constraint_schema
          and kcu.constraint_name = tc.constraint_name
        where tc.table_schema = 'Reference'
          and tc.table_name = 'AlertThresholds'
          and tc.constraint_type = 'PRIMARY KEY'
        order by kcu.ordinal_position`,
    );
    expect(pk.rows.map((row) => row.column_name)).toEqual(['org_id', 'threshold_key']);

    const rls = await adminPool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relrowsecurity, relforcerowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'Reference'
          and c.relname = 'AlertThresholds'`,
    );
    expect(rls.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });

    const indexes = await adminPool.query<{ indexdef: string }>(
      `select indexdef
         from pg_indexes
        where schemaname = 'Reference'
          and tablename = 'AlertThresholds'`,
    );
    expect(indexes.rows.some((row) => /\(org_id, threshold_key\)/i.test(row.indexdef))).toBe(true);
  });

  runIntegrationTest('AC2: d365_import_cache rejects status values outside Found, NoCost, Missing', async () => {
    let caughtCode: string | undefined;
    try {
      await adminPool.query(
        `insert into public.d365_import_cache (org_id, code, status)
         values ($1, 'MAT-INVALID', 'Invalid')`,
        [orgA],
      );
    } catch (err: unknown) {
      caughtCode = (err as { code?: string }).code;
    }

    expect(caughtCode, 'expected SQLSTATE 23514 (check_violation)').toBe('23514');
  });

  runIntegrationTest('AC3: app_user with org-A context reads only org-A d365_import_cache rows', async () => {
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionTokenA, orgA]);
      const result = await client.query<{ org_id: string; code: string; status: string }>(
        `select org_id, code, status
           from public.d365_import_cache
          order by code`,
      );
      await client.query('rollback');

      expect(result.rows).toEqual([{ org_id: orgA, code: 'MAT-A', status: 'Found' }]);
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  });

  runIntegrationTest('d365_import_cache has forced RLS, app.current_org_id policies, and required indexes', async () => {
    const rls = await adminPool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relrowsecurity, relforcerowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'd365_import_cache'`,
    );
    expect(rls.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });

    const policies = await adminPool.query<{ qual: string | null; with_check: string | null }>(
      `select qual, with_check
         from pg_policies
        where schemaname = 'public'
          and tablename = 'd365_import_cache'`,
    );
    expect(policies.rows.length).toBeGreaterThanOrEqual(1);
    expect(
      policies.rows.every((row) => `${row.qual ?? ''} ${row.with_check ?? ''}`.includes('app.current_org_id()')),
    ).toBe(true);

    const indexes = await adminPool.query<{ indexdef: string }>(
      `select indexdef
         from pg_indexes
        where schemaname = 'public'
          and tablename = 'd365_import_cache'`,
    );
    expect(indexes.rows.some((row) => /\(org_id, status\)/i.test(row.indexdef))).toBe(true);
    expect(indexes.rows.some((row) => /\(org_id, last_synced_at/i.test(row.indexdef))).toBe(true);
  });
});

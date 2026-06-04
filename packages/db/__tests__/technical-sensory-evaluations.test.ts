import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

/**
 * T-084 — Technical sensory evaluation read model / contract (migration 166).
 *
 * RED-first: asserts the table, the full status set (including `not_required`),
 * forced RLS cross-org isolation, and idempotent re-application BEFORE the
 * migration exists. Modeled on technical-permission-seed.test.ts (seed shape) and
 * items.migration.test.ts (RLS isolation under app_user via trusted org context).
 */

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/166-technical-sensory-evaluations.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '16600000-0000-4000-8000-000000000001';
const orgA = '16600000-0000-4000-8000-0000000000aa';
const orgB = '16600000-0000-4000-8000-0000000000bb';
const orgARole = '16600000-0000-4000-8000-00000000a111';
const orgBRole = '16600000-0000-4000-8000-00000000b222';
const orgAUser = '16600000-0000-4000-8000-00000000aaaa';
const orgBUser = '16600000-0000-4000-8000-00000000bbbb';

const STATUS_SET = ['fail', 'hold', 'not_required', 'pass', 'pending', 'required'];

function appUserConnectionString() {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for app_user integration tests');
  }
  const url = new URL(databaseUrl);
  url.username = 'app_user';
  url.password = appUserPassword;
  return url.toString();
}

async function ensureAppUser(adminPool: pg.Pool) {
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
}

async function seedOrgData(adminPool: pg.Pool) {
  await ensureAppUser(adminPool);
  await adminPool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'Sensory Read Model Tenant', 'eu', 'https://sensory.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  await adminPool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'Sensory Org A', 'bakery'),
            ($3, $2, 'Sensory Org B', 'fmcg')
     on conflict (id) do nothing`,
    [orgA, tenantId, orgB],
  );
  await adminPool.query(
    `insert into public.roles (id, org_id, code, name, permissions, is_system)
     values ($1, $2, 'sensory_user', 'Sensory Role A', '[]'::jsonb, true),
            ($3, $4, 'sensory_user', 'Sensory Role B', '[]'::jsonb, true)
     on conflict (org_id, code) do nothing`,
    [orgARole, orgA, orgBRole, orgB],
  );
  await adminPool.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, 'sensory-a@example.test', 'Sensory User A', $3),
            ($4, $5, 'sensory-b@example.test', 'Sensory User B', $6)
     on conflict (id) do nothing`,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
}

async function seedTrustedOrgContext(adminPool: pg.Pool, sessionToken: string, orgId: string) {
  await adminPool.query(
    `insert into app.session_org_contexts (session_token, org_id)
     values ($1, $2)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );
}

async function cleanupRows(adminPool: pg.Pool) {
  await adminPool
    .query(`delete from public.technical_sensory_evaluations where subject_ref like 'T084-%'`)
    .catch(() => undefined);
  await adminPool
    .query(`delete from app.session_org_contexts where org_id in ($1, $2)`, [orgA, orgB])
    .catch(() => undefined);
}

describe('166 technical sensory evaluations migration file', () => {
  it('exists and uses app.current_org_id without raw tenant/current_org GUC reads', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/166-technical-sensory-evaluations.sql').toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.technical_sensory_evaluations/i);
    expect(migration).toMatch(/technical_sensory_evaluations_org_isolation/i);
    expect(migration).toMatch(/app\.current_org_id\s*\(\s*\)/i);
    // site_id day-1: present and nullable (no references()/registry).
    expect(migration).toMatch(/site_id\s+uuid\s*,/i);
    expect(migration).not.toMatch(/site_id\s+uuid[^,]*references/i);
    // status set includes not_required.
    expect(migration).toMatch(/not_required/);
    expect(migration).not.toMatch(/current_setting\s*\(\s*['"]app\.(tenant_id|current_org_id)['"]/i);
    // No FA-* legacy identifiers in the schema.
    expect(migration).not.toMatch(/\bFA-/);
  });
});

runIntegrationSuite('166 technical sensory evaluations table', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;
  let originalDatabaseUrlApp: string | undefined;

  beforeAll(async () => {
    originalDatabaseUrlApp = process.env.DATABASE_URL_APP;
    process.env.DATABASE_URL_APP = appUserConnectionString();
    adminPool = getOwnerConnection();
    appPool = getAppConnection();

    await seedOrgData(adminPool);
    // Idempotent: applying the migration twice must be a clean no-op.
    await adminPool.query(readFileSync(migrationPath, 'utf8'));
    await adminPool.query(readFileSync(migrationPath, 'utf8'));
    await cleanupRows(adminPool);
  });

  afterAll(async () => {
    await cleanupRows(adminPool).catch(() => undefined);
    await appPool?.end();
    await adminPool?.end();
    if (originalDatabaseUrlApp === undefined) {
      delete process.env.DATABASE_URL_APP;
    } else {
      process.env.DATABASE_URL_APP = originalDatabaseUrlApp;
    }
  });

  it('creates the org-scoped read-model column set with per-subject identity', async () => {
    const columns = await adminPool.query<{ column_name: string }>(
      `select column_name
       from information_schema.columns
       where table_schema = 'public' and table_name = 'technical_sensory_evaluations'
       order by ordinal_position`,
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual([
      'id',
      'org_id',
      'site_id',
      'subject_type',
      'subject_ref',
      'subject_item_id',
      'status',
      'status_reason',
      'policy_required',
      'evaluated_at',
      'evaluated_by',
      'schema_version',
      'created_by',
      'created_at',
      'updated_at',
    ]);

    const constraints = await adminPool.query<{ conname: string; def: string }>(
      `select conname, pg_get_constraintdef(oid) as def
       from pg_constraint
       where conrelid = 'public.technical_sensory_evaluations'::regclass
       order by conname`,
    );
    const constraintText = constraints.rows.map((row) => `${row.conname}: ${row.def}`).join('\n');
    expect(constraintText).toContain(
      "CHECK ((status = ANY (ARRAY['required'::text, 'pending'::text, 'pass'::text, 'fail'::text, 'hold'::text, 'not_required'::text])))",
    );
    expect(constraintText).toContain('UNIQUE (org_id, subject_type, subject_ref)');
  });

  it('site_id is nullable day-1 with no foreign key', async () => {
    const siteCol = await adminPool.query<{ is_nullable: string }>(
      `select is_nullable
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'technical_sensory_evaluations'
         and column_name = 'site_id'`,
    );
    expect(siteCol.rows[0]?.is_nullable).toBe('YES');

    const siteFk = await adminPool.query<{ conname: string }>(
      `select conname
       from pg_constraint
       where conrelid = 'public.technical_sensory_evaluations'::regclass
         and contype = 'f'
         and 'site_id' = any (
           select attname from pg_attribute
           where attrelid = conrelid and attnum = any (conkey)
         )`,
    );
    expect(siteFk.rows).toEqual([]);
  });

  it('creates required indexes and forced RLS', async () => {
    const indexes = await adminPool.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef
       from pg_indexes
       where schemaname = 'public' and tablename = 'technical_sensory_evaluations'
       order by indexname`,
    );
    const indexMap = new Map(indexes.rows.map((row) => [row.indexname, row.indexdef]));
    expect(indexMap.get('idx_technical_sensory_evaluations_org_subject')).toContain(
      '(org_id, subject_type, subject_ref)',
    );
    expect(indexMap.get('idx_technical_sensory_evaluations_org_site')).toContain('(org_id, site_id)');
    expect(indexMap.get('idx_technical_sensory_evaluations_org_status')).toContain('(org_id, status)');
    expect(indexMap.get('idx_technical_sensory_evaluations_item')).toContain(
      'WHERE (subject_item_id IS NOT NULL)',
    );

    const rls = await adminPool.query<{ rowsecurity: boolean; forcerowsecurity: boolean }>(
      `select relrowsecurity as rowsecurity, relforcerowsecurity as forcerowsecurity
       from pg_class
       where oid = 'public.technical_sensory_evaluations'::regclass`,
    );
    expect(rls.rows).toEqual([{ rowsecurity: true, forcerowsecurity: true }]);
  });

  it('publishes the org-isolation policy through app.current_org_id only', async () => {
    const policies = await adminPool.query<{ policyname: string; qual: string | null; with_check: string | null }>(
      `select policyname, qual, with_check
       from pg_policies
       where schemaname = 'public' and tablename = 'technical_sensory_evaluations'`,
    );
    expect(policies.rows).toHaveLength(1);
    expect(policies.rows[0]?.policyname).toBe('technical_sensory_evaluations_org_isolation');
    const policyText = `${policies.rows[0]?.qual ?? ''} ${policies.rows[0]?.with_check ?? ''}`;
    expect(policyText).toContain('app.current_org_id()');
    expect(policyText).not.toMatch(/current_setting\('app\.(tenant_id|current_org_id)'/);
  });

  it('accepts every status in the contract set including not_required', async () => {
    const session = randomUUID();
    await seedTrustedOrgContext(adminPool, session, orgA);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [session, orgA]);
      for (const status of STATUS_SET) {
        const policyRequired = status === 'not_required' ? false : true;
        await client.query(
          `insert into public.technical_sensory_evaluations
             (org_id, subject_type, subject_ref, status, policy_required)
           values ($1, 'product', $2, $3, $4)`,
          [orgA, `T084-${status}`, status, policyRequired],
        );
      }
      const rows = await client.query<{ status: string }>(
        `select status from public.technical_sensory_evaluations
         where subject_ref like 'T084-%' order by status`,
      );
      expect(rows.rows.map((r) => r.status)).toEqual(STATUS_SET);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('rejects an out-of-contract status value', async () => {
    const session = randomUUID();
    await seedTrustedOrgContext(adminPool, session, orgA);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [session, orgA]);
      await expect(
        client.query(
          `insert into public.technical_sensory_evaluations
             (org_id, subject_type, subject_ref, status)
           values ($1, 'product', 'T084-BAD', 'in_progress')`,
          [orgA],
        ),
      ).rejects.toThrow(/technical_sensory_evaluations_status_check|violates check/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('isolates rows between two organizations under app_user', async () => {
    const orgASession = randomUUID();
    const orgBSession = randomUUID();
    await seedTrustedOrgContext(adminPool, orgASession, orgA);
    await seedTrustedOrgContext(adminPool, orgBSession, orgB);

    const clientA = await appPool.connect();
    const clientB = await appPool.connect();
    try {
      await clientA.query('begin');
      await clientA.query('select app.set_org_context($1::uuid, $2::uuid)', [orgASession, orgA]);
      await clientA.query(
        `insert into public.technical_sensory_evaluations
           (org_id, subject_type, subject_ref, status, policy_required, status_reason)
         values ($1, 'product', 'T084-ISO-A', 'fail', true, 'off-flavour')`,
        [orgA],
      );

      await clientB.query('begin');
      await clientB.query('select app.set_org_context($1::uuid, $2::uuid)', [orgBSession, orgB]);
      await clientB.query(
        `insert into public.technical_sensory_evaluations
           (org_id, subject_type, subject_ref, status)
         values ($1, 'product', 'T084-ISO-B', 'not_required')`,
        [orgB],
      );

      const visibleToA = await clientA.query<{ subject_ref: string; status: string }>(
        `select subject_ref, status from public.technical_sensory_evaluations
         where subject_ref like 'T084-ISO-%' order by subject_ref`,
      );
      expect(visibleToA.rows).toEqual([{ subject_ref: 'T084-ISO-A', status: 'fail' }]);

      const visibleToB = await clientB.query<{ subject_ref: string }>(
        `select subject_ref from public.technical_sensory_evaluations
         where subject_ref like 'T084-ISO-%' order by subject_ref`,
      );
      expect(visibleToB.rows).toEqual([{ subject_ref: 'T084-ISO-B' }]);

      // org A cannot write a row scoped to org B (with check enforces org isolation).
      await expect(
        clientA.query(
          `insert into public.technical_sensory_evaluations
             (org_id, subject_type, subject_ref, status)
           values ($1, 'product', 'T084-SPOOF-B', 'pending')`,
          [orgB],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    } finally {
      await clientA.query('rollback').catch(() => undefined);
      await clientB.query('rollback').catch(() => undefined);
      clientA.release();
      clientB.release();
    }
  });
});

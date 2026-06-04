import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

// T-007 — migration 164: d365_sync_jobs + d365_sync_dlq.
// DISTINCT from d365_sync_runs (migration 065, Settings audit viewer) — these are the
// worker-facing job queue + poison-message DLQ. RED-first DB tests covering:
//   - both tables exist with the PRD column set + status enums
//   - idempotency_key UNIQUE per org (V-TEC-72 / R14) -> AC1
//   - DLQ.error_message NOT NULL + non-blank (V-TEC-71) -> AC2
//   - RLS org isolation, no rows visible without an org context -> AC3
//   - idempotent re-apply of the migration file

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/164-d365-sync-jobs-and-dlq.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '16400000-0000-4000-8000-000000000001';
const orgA = '16400000-0000-4000-8000-0000000000aa';
const orgB = '16400000-0000-4000-8000-0000000000bb';
const orgARole = '16400000-0000-4000-8000-00000000a111';
const orgBRole = '16400000-0000-4000-8000-00000000b222';
const orgAUser = '16400000-0000-4000-8000-00000000aaaa';
const orgBUser = '16400000-0000-4000-8000-00000000bbbb';

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
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'D365 Sync Tenant', 'eu', 'https://d365-sync.example.test')
      on conflict (id) do update
        set name = excluded.name,
            region_cluster = excluded.region_cluster,
            data_plane_url = excluded.data_plane_url
    `,
    [tenantId],
  );
  await adminPool.query(
    `
      insert into public.organizations (id, tenant_id, name, industry_code)
      values ($1, $2, 'D365 Sync Org A', 'bakery'),
             ($3, $2, 'D365 Sync Org B', 'fmcg')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            name = excluded.name,
            industry_code = excluded.industry_code
    `,
    [orgA, tenantId, orgB],
  );
  await adminPool.query(
    `
      insert into public.roles (id, org_id, code, name, permissions, is_system)
      values ($1, $2, 'd365_sync_user', 'D365 Sync Role A', '[]'::jsonb, true),
             ($3, $4, 'd365_sync_user', 'D365 Sync Role B', '[]'::jsonb, true)
      on conflict (org_id, code) do update
        set name = excluded.name,
            permissions = excluded.permissions,
            is_system = excluded.is_system
    `,
    [orgARole, orgA, orgBRole, orgB],
  );
  await adminPool.query(
    `
      insert into public.users (id, org_id, email, name, role_id)
      values ($1, $2, 'd365-sync-a@example.test', 'D365 Sync User A', $3),
             ($4, $5, 'd365-sync-b@example.test', 'D365 Sync User B', $6)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
}

async function seedTrustedOrgContext(adminPool: pg.Pool, sessionToken: string, orgId: string) {
  await adminPool.query(
    `
      insert into app.session_org_contexts (session_token, org_id)
      values ($1, $2)
      on conflict (session_token) do update set org_id = excluded.org_id
    `,
    [sessionToken, orgId],
  );
}

async function cleanupRows(adminPool: pg.Pool) {
  await adminPool.query(`delete from public.d365_sync_dlq where org_id in ($1, $2)`, [orgA, orgB]);
  await adminPool.query(`delete from public.d365_sync_jobs where org_id in ($1, $2)`, [orgA, orgB]);
  await adminPool.query(`delete from app.session_org_contexts where org_id in ($1, $2)`, [orgA, orgB]);
}

describe('164 d365 sync migration file', () => {
  it('exists and uses app.current_org_id without raw tenant/current_org GUC reads', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/164-d365-sync-jobs-and-dlq.sql').toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.d365_sync_jobs/i);
    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.d365_sync_dlq/i);
    expect(migration).toMatch(/d365_sync_jobs_org_isolation/i);
    expect(migration).toMatch(/d365_sync_dlq_org_isolation/i);
    expect(migration).toMatch(/app\.current_org_id\s*\(\s*\)/i);
    expect(migration).not.toMatch(/current_setting\s*\(\s*['"]app\.(tenant_id|current_org_id)['"]/i);
    // idempotency_key UNIQUE per org; site_id day-1; error_message NOT NULL on DLQ.
    expect(migration).toMatch(/d365_sync_jobs_org_idempotency_key_unique\s+unique\s*\(\s*org_id,\s*idempotency_key\s*\)/i);
    expect(migration).toMatch(/site_id\s+uuid/i);
    expect(migration).toMatch(/error_message\s+text\s+not null/i);
    // Soft D365 reference only — never a hard FK to a D365 id. (line-scoped: no `references`
    // clause on the same column definition line as d365_item_id).
    expect(migration).not.toMatch(/^\s*d365_item_id\b[^\n]*\breferences\b/im);
  });
});

runIntegrationTest('164 d365 sync jobs + dlq tables', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;
  let originalDatabaseUrlApp: string | undefined;

  beforeAll(async () => {
    originalDatabaseUrlApp = process.env.DATABASE_URL_APP;
    process.env.DATABASE_URL_APP = appUserConnectionString();
    adminPool = getOwnerConnection();
    appPool = getAppConnection();

    await seedOrgData(adminPool);
    // Apply twice — proves the migration file is idempotent (CREATE IF NOT EXISTS / DROP..IF EXISTS).
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

  it('creates d365_sync_jobs with status/direction/job_type checks, site_id, and per-org idempotency unique', async () => {
    const columns = await adminPool.query<{ column_name: string }>(
      `
        select column_name
        from information_schema.columns
        where table_schema = 'public' and table_name = 'd365_sync_jobs'
        order by ordinal_position
      `,
    );
    const colNames = columns.rows.map((row) => row.column_name);
    for (const expected of [
      'id',
      'org_id',
      'site_id',
      'direction',
      'job_type',
      'target_entity',
      'status',
      'idempotency_key',
      'record_key',
      'd365_item_id',
      'payload_version',
      'retry_count',
      'max_retries',
      'next_retry_at',
      'records_processed',
      'records_failed',
      'error_message',
      'payload',
      'scheduled_at',
      'started_at',
      'finished_at',
      'created_by',
      'created_at',
      'updated_at',
    ]) {
      expect(colNames, `missing column ${expected}`).toContain(expected);
    }

    const constraints = await adminPool.query<{ conname: string; def: string }>(
      `
        select conname, pg_get_constraintdef(oid) as def
        from pg_constraint
        where conrelid = 'public.d365_sync_jobs'::regclass
        order by conname
      `,
    );
    const constraintText = constraints.rows.map((row) => `${row.conname}: ${row.def}`).join('\n');
    expect(constraintText).toContain("CHECK ((direction = ANY (ARRAY['pull'::text, 'push'::text])))");
    expect(constraintText).toContain(
      "CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'dead_lettered'::text])))",
    );
    expect(constraintText).toContain('UNIQUE (org_id, idempotency_key)');
  });

  it('creates d365_sync_dlq with a NOT NULL error_message and a soft (nullable) job_id link', async () => {
    const cols = await adminPool.query<{ column_name: string; is_nullable: string }>(
      `
        select column_name, is_nullable
        from information_schema.columns
        where table_schema = 'public' and table_name = 'd365_sync_dlq'
      `,
    );
    const byName = new Map(cols.rows.map((r) => [r.column_name, r.is_nullable]));
    expect(byName.get('error_message')).toBe('NO');
    expect(byName.get('org_id')).toBe('NO');
    expect(byName.get('job_id')).toBe('YES');
    expect(byName.get('site_id')).toBe('YES');

    // job_id FK is ON DELETE SET NULL (soft link), not cascade.
    const fk = await adminPool.query<{ def: string }>(
      `
        select pg_get_constraintdef(oid) as def
        from pg_constraint
        where conrelid = 'public.d365_sync_dlq'::regclass and contype = 'f'
          and conname like '%job_id%'
      `,
    );
    const fkText = fk.rows.map((r) => r.def).join('\n');
    expect(fkText).toMatch(/REFERENCES d365_sync_jobs\(id\) ON DELETE SET NULL/i);
  });

  it('enables forced RLS + a single org-isolation policy via app.current_org_id on both tables', async () => {
    for (const tableName of ['d365_sync_jobs', 'd365_sync_dlq']) {
      const rls = await adminPool.query<{ rowsecurity: boolean; forcerowsecurity: boolean }>(
        `
          select relrowsecurity as rowsecurity, relforcerowsecurity as forcerowsecurity
          from pg_class
          where oid = ('public.' || $1)::regclass
        `,
        [tableName],
      );
      expect(rls.rows, tableName).toEqual([{ rowsecurity: true, forcerowsecurity: true }]);

      const policies = await adminPool.query<{ policyname: string; qual: string | null; with_check: string | null }>(
        `
          select policyname, qual, with_check
          from pg_policies
          where schemaname = 'public' and tablename = $1
        `,
        [tableName],
      );
      expect(policies.rows, tableName).toHaveLength(1);
      const policyText = `${policies.rows[0]?.qual ?? ''} ${policies.rows[0]?.with_check ?? ''}`;
      expect(policyText).toContain('app.current_org_id()');
      expect(policyText).not.toMatch(/current_setting\('app\.(tenant_id|current_org_id)'/);
    }
  });

  it('AC1 — rejects a second job with the same (org_id, idempotency_key) via unique violation', async () => {
    const key = `idem-${randomUUID()}`;
    await adminPool.query(
      `
        insert into public.d365_sync_jobs (org_id, direction, job_type, target_entity, idempotency_key)
        values ($1, 'pull', 'items', 'items', $2)
      `,
      [orgA, key],
    );
    await expect(
      adminPool.query(
        `
          insert into public.d365_sync_jobs (org_id, direction, job_type, target_entity, idempotency_key)
          values ($1, 'pull', 'items', 'items', $2)
        `,
        [orgA, key],
      ),
    ).rejects.toThrow(/duplicate key value violates unique constraint/i);

    // Same idempotency_key is allowed in a DIFFERENT org (uniqueness is per-org).
    await expect(
      adminPool.query(
        `
          insert into public.d365_sync_jobs (org_id, direction, job_type, target_entity, idempotency_key)
          values ($1, 'pull', 'items', 'items', $2)
        `,
        [orgB, key],
      ),
    ).resolves.toBeDefined();
  });

  it('AC2 — rejects a DLQ row with NULL or blank error_message', async () => {
    await expect(
      adminPool.query(
        `
          insert into public.d365_sync_dlq (org_id, direction, job_type, target_entity, error_message)
          values ($1, 'push', 'wo_confirmation', 'journal', null)
        `,
        [orgA],
      ),
    ).rejects.toThrow(/null value in column "error_message"|violates not-null/i);

    await expect(
      adminPool.query(
        `
          insert into public.d365_sync_dlq (org_id, direction, job_type, target_entity, error_message)
          values ($1, 'push', 'wo_confirmation', 'journal', '   ')
        `,
        [orgA],
      ),
    ).rejects.toThrow(/d365_sync_dlq_error_message_not_blank_check|violates check constraint/i);
  });

  it('AC3 — app_user sees no rows in either table without an org context', async () => {
    await adminPool.query(
      `
        insert into public.d365_sync_jobs (org_id, direction, job_type, target_entity, idempotency_key)
        values ($1, 'pull', 'items', 'items', $2)
      `,
      [orgA, `nullctx-${randomUUID()}`],
    );
    await adminPool.query(
      `
        insert into public.d365_sync_dlq (org_id, direction, job_type, target_entity, error_message)
        values ($1, 'push', 'journal', 'journal', 'boom')
      `,
      [orgA],
    );

    const jobs = await appPool.query(`select id from public.d365_sync_jobs`);
    const dlq = await appPool.query(`select id from public.d365_sync_dlq`);
    expect(jobs.rowCount).toBe(0);
    expect(dlq.rowCount).toBe(0);
  });

  it('isolates job + dlq rows between two organizations under app_user', async () => {
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
        `
          insert into public.d365_sync_jobs (org_id, direction, job_type, target_entity, idempotency_key)
          values ($1, 'pull', 'items', 'items', 'JOB-A')
        `,
        [orgA],
      );
      await clientA.query(
        `
          insert into public.d365_sync_dlq (org_id, direction, job_type, target_entity, error_message)
          values ($1, 'push', 'journal', 'journal', 'A failed')
        `,
        [orgA],
      );

      await clientB.query('begin');
      await clientB.query('select app.set_org_context($1::uuid, $2::uuid)', [orgBSession, orgB]);
      await clientB.query(
        `
          insert into public.d365_sync_jobs (org_id, direction, job_type, target_entity, idempotency_key)
          values ($1, 'pull', 'items', 'items', 'JOB-B')
        `,
        [orgB],
      );

      const jobsVisibleToA = await clientA.query<{ idempotency_key: string }>(
        `select idempotency_key from public.d365_sync_jobs where idempotency_key like 'JOB-%' order by idempotency_key`,
      );
      expect(jobsVisibleToA.rows).toEqual([{ idempotency_key: 'JOB-A' }]);

      const dlqVisibleToB = await clientB.query(`select id from public.d365_sync_dlq`);
      expect(dlqVisibleToB.rowCount).toBe(0);

      // Cross-org write under org A's context must be blocked by the WITH CHECK clause.
      await expect(
        clientA.query(
          `
            insert into public.d365_sync_jobs (org_id, direction, job_type, target_entity, idempotency_key)
            values ($1, 'pull', 'items', 'items', 'SPOOF-B')
          `,
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

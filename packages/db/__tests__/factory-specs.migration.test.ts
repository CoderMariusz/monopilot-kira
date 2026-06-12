import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/165-factory-specs.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '16500000-0000-4000-8000-000000000001';
const orgA = '16500000-0000-4000-8000-0000000000aa';
const orgB = '16500000-0000-4000-8000-0000000000bb';
const orgARole = '16500000-0000-4000-8000-00000000a111';
const orgBRole = '16500000-0000-4000-8000-00000000b222';
const orgAUser = '16500000-0000-4000-8000-00000000aaaa';
const orgBUser = '16500000-0000-4000-8000-00000000bbbb';
const fgItemA = '16500000-0000-4000-8000-0000000fffaa';
const fgItemB = '16500000-0000-4000-8000-0000000fffbb';

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
  await ensureAppUserWithAdvisoryLock(adminPool);
}

async function seedOrgData(adminPool: pg.Pool) {
  await ensureAppUser(adminPool);
  await adminPool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'Factory Specs Tenant', 'eu', 'https://factory-specs.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  await adminPool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'Factory Specs Org A', 'bakery'),
            ($3, $2, 'Factory Specs Org B', 'fmcg')
     on conflict (id) do nothing`,
    [orgA, tenantId, orgB],
  );
  await adminPool.query(
    `insert into public.roles (id, org_id, code, name, permissions, is_system)
     values ($1, $2, 'factory_specs_user', 'Factory Specs Role A', '[]'::jsonb, true),
            ($3, $4, 'factory_specs_user', 'Factory Specs Role B', '[]'::jsonb, true)
     on conflict (org_id, code) do nothing`,
    [orgARole, orgA, orgBRole, orgB],
  );
  await adminPool.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, 'factory-specs-a@example.test', 'Factory Specs User A', $3),
            ($4, $5, 'factory-specs-b@example.test', 'Factory Specs User B', $6)
     on conflict (id) do nothing`,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
  // FG items (FK targets for factory_specs.fg_item_id)
  await adminPool.query(
    `insert into public.items (id, org_id, item_code, item_type, name, uom_base)
     values ($1, $2, 'T165-FG-A', 'fg', 'Factory Spec FG A', 'kg'),
            ($3, $4, 'T165-FG-B', 'fg', 'Factory Spec FG B', 'kg')
     on conflict (id) do nothing`,
    [fgItemA, orgA, fgItemB, orgB],
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
  await adminPool.query(`delete from public.factory_specs where org_id in ($1, $2)`, [orgA, orgB]);
  await adminPool.query(`delete from app.session_org_contexts where org_id in ($1, $2)`, [orgA, orgB]);
}

describe('165 factory_specs migration file', () => {
  it('exists and uses app.current_org_id without raw tenant/current_org GUC reads', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/165-factory-specs.sql').toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.factory_specs/i);
    expect(migration).toMatch(/app\.current_org_id\s*\(\s*\)/i);
    // No tenant_id column/identifier (Wave0 lock). A comment "NOT tenant_id" is fine; a
    // column declaration `tenant_id <type>` is not.
    expect(migration).not.toMatch(/^\s*tenant_id\s+(uuid|text)/im);
    expect(migration).not.toMatch(/current_setting\s*\(\s*['"]app\.(tenant_id|current_org_id)['"]/i);
    // FG canonical — no legacy FA-* identifiers in new schema
    expect(migration).not.toMatch(/\bFA-[A-Z0-9]/);
  });
});

runIntegrationTest('165 factory_specs table', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;
  let originalDatabaseUrlApp: string | undefined;

  beforeAll(async () => {
    originalDatabaseUrlApp = process.env.DATABASE_URL_APP;
    process.env.DATABASE_URL_APP = appUserConnectionString();
    adminPool = getOwnerConnection();
    appPool = getAppConnection();

    await seedOrgData(adminPool);
    // Idempotency: applying twice must be a clean no-op.
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

  it('creates the versioned column set with status enum + version + soft bom/site refs', async () => {
    const columns = await adminPool.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'factory_specs'
       order by ordinal_position`,
    );
    const names = columns.rows.map((row) => row.column_name);
    for (const required of [
      'id',
      'org_id',
      'site_id',
      'fg_item_id',
      'spec_code',
      'version',
      'status',
      'source',
      'bom_header_id',
      'bom_version',
      'supersedes_factory_spec_id',
      'approved_by',
      'approved_at',
      'released_by',
      'released_at',
      'd365_item_id',
      'created_by',
      'created_at',
      'updated_at',
      'schema_version',
    ]) {
      expect(names, `missing column ${required}`).toContain(required);
    }

    const constraints = await adminPool.query<{ conname: string; def: string }>(
      `select conname, pg_get_constraintdef(oid) as def
       from pg_constraint where conrelid = 'public.factory_specs'::regclass order by conname`,
    );
    const constraintText = constraints.rows.map((r) => `${r.conname}: ${r.def}`).join('\n');
    // versioned identity
    expect(constraintText).toContain('UNIQUE (org_id, fg_item_id, version)');
    // status enum surface
    expect(constraintText).toMatch(/status = ANY/i);
    expect(constraintText).toContain("'draft'");
    expect(constraintText).toContain("'approved_for_factory'");
    // FG fk to items
    expect(constraintText).toMatch(/fg_item_id\).*REFERENCES items/i);
    // d365 soft text reference, never an FK to a d365 id (per-constraint, not dotall)
    const hasD365Fk = constraints.rows.some(
      (r) => r.def.toUpperCase().includes('FOREIGN KEY') && r.def.toLowerCase().includes('d365'),
    );
    expect(hasD365Fk).toBe(false);
  });

  it('keeps site_id nullable with no FK and no registry dependency', async () => {
    const siteCol = await adminPool.query<{ is_nullable: string; data_type: string }>(
      `select is_nullable, data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'factory_specs' and column_name = 'site_id'`,
    );
    expect(siteCol.rows[0]?.is_nullable).toBe('YES');
    expect(siteCol.rows[0]?.data_type).toBe('uuid');
    const siteFk = await adminPool.query<{ count: string }>(
      `select count(*)::text as count from pg_constraint
       where conrelid = 'public.factory_specs'::regclass and contype = 'f'
         and pg_get_constraintdef(oid) ilike '%sites%'`,
    );
    expect(siteFk.rows[0]?.count).toBe('0');
  });

  it('creates fk indexes + a single active-approved-per-fg partial unique + forced RLS', async () => {
    const indexes = await adminPool.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes
       where schemaname = 'public' and tablename = 'factory_specs' order by indexname`,
    );
    const defs = indexes.rows.map((r) => r.indexdef).join('\n');
    expect(defs).toMatch(/\(org_id, fg_item_id/i);
    // exactly one approved-for-factory active version per (org, fg)
    expect(defs).toMatch(/UNIQUE INDEX.*WHERE \(status = '(approved_for_factory|released_to_factory)/is);

    const rls = await adminPool.query<{ rowsecurity: boolean; forcerowsecurity: boolean }>(
      `select relrowsecurity as rowsecurity, relforcerowsecurity as forcerowsecurity
       from pg_class where oid = 'public.factory_specs'::regclass`,
    );
    expect(rls.rows).toEqual([{ rowsecurity: true, forcerowsecurity: true }]);
  });

  it('publishes the org-isolation policy through app.current_org_id only', async () => {
    const policies = await adminPool.query<{ policyname: string; qual: string | null; with_check: string | null }>(
      `select policyname, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = 'factory_specs'`,
    );
    expect(policies.rows.length).toBeGreaterThanOrEqual(1);
    const policyText = policies.rows.map((p) => `${p.qual ?? ''} ${p.with_check ?? ''}`).join(' ');
    expect(policyText).toContain('app.current_org_id()');
    expect(policyText).not.toMatch(/current_setting\('app\.(tenant_id|current_org_id)'/);
  });

  it('AC3 — NPD Builder draft: source=npd_builder yields status draft with empty approval fields', async () => {
    const orgASession = randomUUID();
    await seedTrustedOrgContext(adminPool, orgASession, orgA);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [orgASession, orgA]);
      const { rows } = await client.query<{ status: string; approved_by: string | null; approved_at: string | null }>(
        `insert into public.factory_specs (org_id, fg_item_id, spec_code, version, source)
         values ($1, $2, 'T165-SPEC-A', 1, 'npd_builder')
         returning status, approved_by, approved_at`,
        [orgA, fgItemA],
      );
      expect(rows[0]?.status).toBe('draft');
      expect(rows[0]?.approved_by).toBeNull();
      expect(rows[0]?.approved_at).toBeNull();
      await client.query('rollback');
    } finally {
      client.release();
    }
  });

  it('AC1 — clone-on-write: an approved_for_factory row cannot be mutated in place', async () => {
    const orgASession = randomUUID();
    await seedTrustedOrgContext(adminPool, orgASession, orgA);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [orgASession, orgA]);
      const inserted = await client.query<{ id: string }>(
        `insert into public.factory_specs
           (org_id, fg_item_id, spec_code, version, status, source, approved_by, approved_at)
         values ($1, $2, 'T165-SPEC-APPROVED', 2, 'approved_for_factory', 'technical', $3, now())
         returning id`,
        [orgA, fgItemA, orgAUser],
      );
      const id = inserted.rows[0]?.id;
      // In-place edit of a business field on an approved row must be rejected.
      await expect(
        client.query(`update public.factory_specs set spec_code = 'T165-MUTATED' where id = $1`, [id]),
      ).rejects.toThrow(/immutab|approved|cannot|clone-on-write/i);
      await client.query('rollback');
    } finally {
      client.release();
    }
  });

  it('AC2 — clone-on-write: v3 draft can be created while approved v2 remains unchanged', async () => {
    const orgASession = randomUUID();
    await seedTrustedOrgContext(adminPool, orgASession, orgA);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [orgASession, orgA]);
      await client.query(
        `insert into public.factory_specs
           (org_id, fg_item_id, spec_code, version, status, source, approved_by, approved_at)
         values ($1, $2, 'T165-SPEC-V2', 2, 'approved_for_factory', 'technical', $3, now())`,
        [orgA, fgItemA, orgAUser],
      );
      const v3 = await client.query<{ version: number; status: string }>(
        `insert into public.factory_specs (org_id, fg_item_id, spec_code, version, source)
         values ($1, $2, 'T165-SPEC-V3', 3, 'technical')
         returning version, status`,
        [orgA, fgItemA],
      );
      expect(v3.rows[0]?.version).toBe(3);
      expect(v3.rows[0]?.status).toBe('draft');
      const v2 = await client.query<{ status: string; spec_code: string }>(
        `select status, spec_code from public.factory_specs where org_id = $1 and fg_item_id = $2 and version = 2`,
        [orgA, fgItemA],
      );
      expect(v2.rows[0]?.status).toBe('approved_for_factory');
      expect(v2.rows[0]?.spec_code).toBe('T165-SPEC-V2');
      await client.query('rollback');
    } finally {
      client.release();
    }
  });

  it('allows an approved row to transition to superseded (clone supersedes prior version)', async () => {
    const orgASession = randomUUID();
    await seedTrustedOrgContext(adminPool, orgASession, orgA);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [orgASession, orgA]);
      const inserted = await client.query<{ id: string }>(
        `insert into public.factory_specs
           (org_id, fg_item_id, spec_code, version, status, source, approved_by, approved_at)
         values ($1, $2, 'T165-SPEC-SUP', 4, 'approved_for_factory', 'technical', $3, now())
         returning id`,
        [orgA, fgItemA, orgAUser],
      );
      const id = inserted.rows[0]?.id;
      await expect(
        client.query(`update public.factory_specs set status = 'superseded' where id = $1`, [id]),
      ).resolves.toBeTruthy();
      await client.query('rollback');
    } finally {
      client.release();
    }
  });

  it('isolates factory_spec rows between two organizations under app_user', async () => {
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
        `insert into public.factory_specs (org_id, fg_item_id, spec_code, version, source)
         values ($1, $2, 'T165-ISO-A', 1, 'technical')`,
        [orgA, fgItemA],
      );

      await clientB.query('begin');
      await clientB.query('select app.set_org_context($1::uuid, $2::uuid)', [orgBSession, orgB]);
      await clientB.query(
        `insert into public.factory_specs (org_id, fg_item_id, spec_code, version, source)
         values ($1, $2, 'T165-ISO-B', 1, 'technical')`,
        [orgB, fgItemB],
      );

      const visibleToA = await clientA.query<{ spec_code: string }>(
        `select spec_code from public.factory_specs where spec_code like 'T165-ISO-%' order by spec_code`,
      );
      expect(visibleToA.rows).toEqual([{ spec_code: 'T165-ISO-A' }]);

      const visibleToB = await clientB.query<{ spec_code: string }>(
        `select spec_code from public.factory_specs where spec_code like 'T165-ISO-%' order by spec_code`,
      );
      expect(visibleToB.rows).toEqual([{ spec_code: 'T165-ISO-B' }]);

      await expect(
        clientA.query(
          `insert into public.factory_specs (org_id, fg_item_id, spec_code, version, source)
           values ($1, $2, 'T165-SPOOF-B', 1, 'technical')`,
          [orgB, fgItemB],
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

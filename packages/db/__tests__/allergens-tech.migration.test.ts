import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/161-allergen-tables.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '16100000-0000-4000-8000-000000000001';
const orgA = '16100000-0000-4000-8000-0000000000aa';
const orgB = '16100000-0000-4000-8000-0000000000bb';
const orgARole = '16100000-0000-4000-8000-00000000a111';
const orgBRole = '16100000-0000-4000-8000-00000000b222';
const orgAUser = '16100000-0000-4000-8000-00000000aaaa';
const orgBUser = '16100000-0000-4000-8000-00000000bbbb';
const itemA = '16100000-0000-4000-8000-0000000a1111';
const itemB = '16100000-0000-4000-8000-0000000b2222';

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
      values ($1, 'Allergen Tech Tenant', 'eu', 'https://allergen-tech.example.test')
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
      values ($1, $2, 'Allergen Tech Org A', 'bakery'),
             ($3, $2, 'Allergen Tech Org B', 'fmcg')
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
      values ($1, $2, 'allergen_tech_user', 'Allergen Tech Role A', '[]'::jsonb, true),
             ($3, $4, 'allergen_tech_user', 'Allergen Tech Role B', '[]'::jsonb, true)
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
      values ($1, $2, 'allergen-tech-a@example.test', 'Allergen Tech User A', $3),
             ($4, $5, 'allergen-tech-b@example.test', 'Allergen Tech User B', $6)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
  await adminPool.query(
    `
      insert into public.items (id, org_id, item_code, item_type, name, uom_base)
      values ($1, $2, 'T161-FG-A', 'fg', 'Allergen FG A', 'kg'),
             ($3, $4, 'T161-FG-B', 'fg', 'Allergen FG B', 'kg')
      on conflict (id) do nothing
    `,
    [itemA, orgA, itemB, orgB],
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
  await adminPool.query(`delete from public.item_allergen_profile_overrides where org_id in ($1, $2)`, [orgA, orgB]);
  await adminPool.query(`delete from public.item_allergen_profiles where org_id in ($1, $2)`, [orgA, orgB]);
  await adminPool.query(`delete from public.allergen_contamination_risk where org_id in ($1, $2)`, [orgA, orgB]);
  await adminPool.query(
    `delete from public.manufacturing_operation_allergen_additions where org_id in ($1, $2)`,
    [orgA, orgB],
  );
  await adminPool.query(`delete from app.session_org_contexts where org_id in ($1, $2)`, [orgA, orgB]);
}

describe('161 allergen tables migration file', () => {
  it('exists and uses app.current_org_id without raw tenant/current_org GUC reads', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/161-allergen-tables.sql').toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.item_allergen_profiles/i);
    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.item_allergen_profile_overrides/i);
    expect(migration).toMatch(
      /create\s+table\s+if\s+not\s+exists\s+public\.manufacturing_operation_allergen_additions/i,
    );
    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.allergen_contamination_risk/i);
    expect(migration).toMatch(/app\.current_org_id\s*\(\s*\)/i);
    expect(migration).not.toMatch(/current_setting\s*\(\s*['"]app\.(tenant_id|current_org_id)['"]/i);
  });

  it('does NOT introduce a hard FK on allergen_code (soft reference per ADR-028)', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    // No column declaration line and no foreign-key constraint may bind allergen_code.
    const allergenFkLine = migration
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .some((line) => /allergen_code\b[^,]*\breferences\b/i.test(line));
    expect(allergenFkLine).toBe(false);
    expect(migration).not.toMatch(/foreign\s+key\s*\([^)]*allergen_code/i);
  });

  it('carries site_id day-1 (nullable, no FK) on every operational table', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    // Column declarations only (line starts with optional whitespace then `site_id uuid,`),
    // not header comment lines that mention site_id.
    const siteIdDecls = migration.match(/^\s*site_id\s+uuid\s*,\s*$/gim) ?? [];
    // one per: profiles, overrides, mfg-op additions, contamination risk
    expect(siteIdDecls.length).toBe(4);
    expect(migration).not.toMatch(/site_id\s+uuid[^,\n]*references/i);
  });
});

runIntegrationTest('161 allergen tables', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;
  let originalDatabaseUrlApp: string | undefined;

  beforeAll(async () => {
    originalDatabaseUrlApp = process.env.DATABASE_URL_APP;
    process.env.DATABASE_URL_APP = appUserConnectionString();
    adminPool = getOwnerConnection();
    appPool = getAppConnection();

    await seedOrgData(adminPool);
    // Idempotency: applying twice must be a no-op.
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

  it('creates item_allergen_profiles with the PRD column set + composite PK', async () => {
    const columns = await adminPool.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'item_allergen_profiles'
       order by ordinal_position`,
    );
    expect(columns.rows.map((r) => r.column_name)).toEqual([
      'org_id',
      'item_id',
      'allergen_code',
      'source',
      'intensity',
      'confidence',
      'site_id',
      'declared_by',
      'declared_at',
      'manual_override_reason',
      'created_at',
      'updated_at',
    ]);

    const constraints = await adminPool.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid = 'public.item_allergen_profiles'::regclass`,
    );
    const text = constraints.rows.map((r) => r.def).join('\n');
    expect(text).toContain('PRIMARY KEY (org_id, item_id, allergen_code)');
    expect(text).toMatch(/intensity = ANY \(ARRAY\['contains'::text, 'may_contain'::text, 'trace'::text\]\)/);
    expect(text).toMatch(/source = ANY/);
    expect(text).toMatch(/confidence = ANY/);
  });

  it('forces RLS + a single org-isolation policy via app.current_org_id() on all four tables', async () => {
    const tables = [
      'item_allergen_profiles',
      'item_allergen_profile_overrides',
      'manufacturing_operation_allergen_additions',
      'allergen_contamination_risk',
    ];
    for (const t of tables) {
      const rls = await adminPool.query<{ rowsecurity: boolean; forcerowsecurity: boolean }>(
        `select relrowsecurity as rowsecurity, relforcerowsecurity as forcerowsecurity
         from pg_class where oid = ('public.' || $1)::regclass`,
        [t],
      );
      expect(rls.rows, `RLS forced on ${t}`).toEqual([{ rowsecurity: true, forcerowsecurity: true }]);

      const policies = await adminPool.query<{ qual: string | null; with_check: string | null }>(
        `select qual, with_check from pg_policies where schemaname = 'public' and tablename = $1`,
        [t],
      );
      expect(policies.rows, `one policy on ${t}`).toHaveLength(1);
      const policyText = `${policies.rows[0]?.qual ?? ''} ${policies.rows[0]?.with_check ?? ''}`;
      expect(policyText).toContain('app.current_org_id()');
      expect(policyText).not.toMatch(/current_setting\('app\.(tenant_id|current_org_id)'/);
    }
  });

  it('AC1 — rejects an invalid intensity on item_allergen_profiles via CHECK', async () => {
    await expect(
      adminPool.query(
        `insert into public.item_allergen_profiles (org_id, item_id, allergen_code, source, intensity)
         values ($1, $2, 'gluten', 'brief_declared', 'definitely')`,
        [orgA, itemA],
      ),
    ).rejects.toThrow(/item_allergen_profiles_intensity_check|violates check/i);
  });

  it('AC3 — rejects an invalid risk_level on allergen_contamination_risk via CHECK', async () => {
    await expect(
      adminPool.query(
        `insert into public.allergen_contamination_risk (org_id, line_id, allergen_code, risk_level)
         values ($1, null, 'gluten', 'catastrophic')`,
        [orgA],
      ),
    ).rejects.toThrow(/allergen_contamination_risk.*check|violates check/i);
  });

  it('requires a non-empty reason when source is manual_override (V-TEC-42)', async () => {
    await expect(
      adminPool.query(
        `insert into public.item_allergen_profiles (org_id, item_id, allergen_code, source, manual_override_reason)
         values ($1, $2, 'milk', 'manual_override', '   ')`,
        [orgA, itemA],
      ),
    ).rejects.toThrow(/override_reason_check|violates check/i);
  });

  it('rejects an unknown manufacturing_operation_allergen_additions / contamination target combos', async () => {
    // contamination risk must target a line and/or machine
    await expect(
      adminPool.query(
        `insert into public.allergen_contamination_risk (org_id, allergen_code, risk_level)
         values ($1, 'gluten', 'high')`,
        [orgA],
      ),
    ).rejects.toThrow(/target_check|violates check/i);
  });

  it('AC2 — isolates allergen profile rows between two organizations under app_user', async () => {
    const orgASession = randomUUID();
    const orgBSession = randomUUID();
    await seedTrustedOrgContext(adminPool, orgASession, orgA);
    await seedTrustedOrgContext(adminPool, orgBSession, orgB);

    const clientA = await appPool.connect();
    const clientB = await appPool.connect();
    try {
      await clientA.query('begin');
      await clientA.query('select app.set_org_context($1::uuid, $2::uuid)', [orgASession, orgA]);
      // Same allergen_code shared across orgs (AC2 precondition).
      await clientA.query(
        `insert into public.item_allergen_profiles (org_id, item_id, allergen_code, source)
         values ($1, $2, 'gluten', 'brief_declared')`,
        [orgA, itemA],
      );

      await clientB.query('begin');
      await clientB.query('select app.set_org_context($1::uuid, $2::uuid)', [orgBSession, orgB]);
      await clientB.query(
        `insert into public.item_allergen_profiles (org_id, item_id, allergen_code, source)
         values ($1, $2, 'gluten', 'supplier_spec')`,
        [orgB, itemB],
      );

      const visibleToA = await clientA.query<{ item_id: string; source: string }>(
        `select item_id, source from public.item_allergen_profiles where allergen_code = 'gluten'`,
      );
      expect(visibleToA.rows).toEqual([{ item_id: itemA, source: 'brief_declared' }]);

      const visibleToB = await clientB.query<{ item_id: string; source: string }>(
        `select item_id, source from public.item_allergen_profiles where allergen_code = 'gluten'`,
      );
      expect(visibleToB.rows).toEqual([{ item_id: itemB, source: 'supplier_spec' }]);

      // Cross-org spoof write must be rejected by WITH CHECK.
      await expect(
        clientA.query(
          `insert into public.item_allergen_profiles (org_id, item_id, allergen_code, source)
           values ($1, $2, 'eggs', 'brief_declared')`,
          [orgB, itemB],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    } finally {
      await clientA.query('rollback').catch(() => undefined);
      await clientB.query('rollback').catch(() => undefined);
      clientA.release();
      clientB.release();
    }
  });

  it('records per-(item x allergen x actor x ts) override history as an append-only ledger', async () => {
    const session = randomUUID();
    await seedTrustedOrgContext(adminPool, session, orgA);

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [session, orgA]);

      // Two override actions on the SAME (item, allergen) by the SAME actor at
      // different timestamps — both must persist (history, not upsert).
      await client.query(
        `insert into public.item_allergen_profile_overrides
           (org_id, item_id, allergen_code, action, intensity, confidence, reason, overridden_by, overridden_at)
         values ($1, $2, 'gluten', 'set', 'contains', 'declared', 'initial supplier declaration', $3, now() - interval '1 hour')`,
        [orgA, itemA, orgAUser],
      );
      await client.query(
        `insert into public.item_allergen_profile_overrides
           (org_id, item_id, allergen_code, action, intensity, confidence, reason, overridden_by, overridden_at)
         values ($1, $2, 'gluten', 'adjust_intensity', 'may_contain', 'tested', 'lab downgraded after ELISA', $3, now())`,
        [orgA, itemA, orgAUser],
      );

      const history = await client.query<{ action: string; intensity: string }>(
        `select action, intensity from public.item_allergen_profile_overrides
         where item_id = $1 and allergen_code = 'gluten'
         order by overridden_at`,
        [itemA],
      );
      expect(history.rows).toEqual([
        { action: 'set', intensity: 'contains' },
        { action: 'adjust_intensity', intensity: 'may_contain' },
      ]);

      // Append-only: app_user has no UPDATE / DELETE grant on the ledger.
      // Each failing statement aborts its sub-transaction, so wrap in savepoints.
      await client.query('savepoint sp_update');
      await expect(
        client.query(`update public.item_allergen_profile_overrides set reason = 'tamper' where item_id = $1`, [itemA]),
      ).rejects.toThrow(/permission denied/i);
      await client.query('rollback to savepoint sp_update');

      await client.query('savepoint sp_delete');
      await expect(
        client.query(`delete from public.item_allergen_profile_overrides where item_id = $1`, [itemA]),
      ).rejects.toThrow(/permission denied/i);
      await client.query('rollback to savepoint sp_delete');
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });
});

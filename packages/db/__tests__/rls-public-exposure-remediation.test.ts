import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = resolve(packageRoot, 'migrations');
const require = createRequire(import.meta.url);
const hasPostgresTestcontainer = (() => {
  try {
    require.resolve('@testcontainers/postgresql');
    return true;
  } catch {
    return false;
  }
})();
// The live cross-org isolation suite needs BOTH the testcontainers dep AND a
// running Docker daemon. It is opt-in via RLS_LIVE_TESTS=1 (set in Docker-enabled
// CI) so it executes there and skips cleanly where Docker is absent. The deployed
// DB is additionally proven via Supabase security advisors (0 ERROR) at apply time.
const runTestcontainerSuite =
  hasPostgresTestcontainer && process.env.RLS_LIVE_TESTS === '1' ? describe : describe.skip;
const appUserPassword = 'app-user-test-password';

const orgA = '11111111-1111-4111-8111-111111111111';
const orgB = '22222222-2222-4222-8222-222222222222';
const tenantA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const tenantB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const userA = 'aaaaaaaa-1111-4111-8111-111111111111';
const userB = 'bbbbbbbb-2222-4222-8222-222222222222';

const orgScopedTables = [
  'tenant_variations',
  'consumed_approval_tokens',
  'tenant_migrations',
] as const;

const anonRevokedTables = [
  'tenant_variations',
  'consumed_approval_tokens',
  'tenant_migrations',
  'modules',
  'allergens',
  'line_machines',
  'role_categories',
  'tenant_migrations_legacy_t038',
  'audit_log',
  'audit_log_2026_01',
  'audit_log_2026_02',
  'audit_log_2026_03',
  'audit_log_2026_04',
  'audit_log_2026_05',
  'audit_log_2026_06',
  'audit_log_2026_07',
  'audit_log_2026_08',
  'audit_log_2026_09',
  'audit_log_2026_10',
  'audit_log_2026_11',
  'audit_log_2026_12',
] as const;

type StartedPostgres = {
  getConnectionUri(): string;
  stop(): Promise<void>;
};

type PostgreSqlContainerCtor = new (image: string) => {
  withDatabase(database: string): {
    withUsername(username: string): {
      withPassword(password: string): {
        start(): Promise<StartedPostgres>;
      };
    };
  };
};

let container: StartedPostgres | undefined;
let ownerPool: pg.Pool | undefined;
let appPool: pg.Pool | undefined;

async function startPostgres16(): Promise<StartedPostgres> {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<{ PostgreSqlContainer: PostgreSqlContainerCtor }>;
  const { PostgreSqlContainer } = await dynamicImport('@testcontainers/postgresql');
  return new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('monopilot_rls_t129')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();
}

async function createSupabaseRoles(pool: pg.Pool) {
  await pool.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'app_user') then
        create role app_user login password '${appUserPassword}' nosuperuser nocreatedb nocreaterole inherit nobypassrls;
      else
        alter role app_user login password '${appUserPassword}' nosuperuser nobypassrls;
      end if;
    end
    $$;
  `);
}

async function applyMigrations(pool: pg.Pool) {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((left, right) => {
      const leftNumber = Number(left.match(/^\d+/)?.[0] ?? '0');
      const rightNumber = Number(right.match(/^\d+/)?.[0] ?? '0');
      return leftNumber === rightNumber ? left.localeCompare(right) : leftNumber - rightNumber;
    });

  for (const file of files) {
    const sql = readFileSync(resolve(migrationsDir, file), 'utf8');
    await pool.query(sql);
  }
}

async function seedOrgScopedRows(pool: pg.Pool) {
  await pool.query(`
    truncate table
      public.consumed_approval_tokens,
      public.tenant_migrations,
      public.tenant_variations,
      public.users,
      public.organizations,
      public.tenants
    cascade
  `);

  await pool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'Tenant A', 'eu', 'https://a.example.test'),
            ($2, 'Tenant B', 'eu', 'https://b.example.test')`,
    [tenantA, tenantB],
  );
  await pool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'Org A', 'bakery'),
            ($3, $4, 'Org B', 'fmcg')`,
    [orgA, tenantA, orgB, tenantB],
  );
  await pool.query(
    `insert into public.users (id, org_id, email)
     values ($1, $2, 'user-a@example.test'),
            ($3, $4, 'user-b@example.test')`,
    [userA, orgA, userB, orgB],
  );

  await pool.query(
    `insert into public.tenant_variations (org_id)
     values ($1), ($2)`,
    [orgA, orgB],
  );
  await pool.query(
    `insert into public.consumed_approval_tokens (jti, org_id)
     values ($1, $2), ($3, $4)`,
    [randomUUID(), orgA, randomUUID(), orgB],
  );
  await pool.query(
    `insert into public.tenant_migrations (org_id, component, current_version, target_version)
     values ($1, 'settings', 'v1', 'v2'),
            ($2, 'settings', 'v1', 'v2')`,
    [orgA, orgB],
  );
}

async function seedTrustedOrgContext(pool: pg.Pool, sessionToken: string, orgId: string) {
  await pool.query('insert into app.session_org_contexts (session_token, org_id) values ($1, $2)', [
    sessionToken,
    orgId,
  ]);
}

function appConnectionUri(ownerUri: string): string {
  const url = new URL(ownerUri);
  url.username = 'app_user';
  url.password = appUserPassword;
  return url.toString();
}

// Static migration-text assertions (always run — no Docker required; mirrors the
// repo convention in 044-settings-security-scim-ipallowlist.test.ts). The live
// testcontainers suite below adds real cross-org isolation proof where Docker is
// available; the deployed-DB proof is captured separately via Supabase advisors.
describe('migration 051 — RLS public-exposure remediation (static SQL contract)', () => {
  const migration = readFileSync(
    resolve(migrationsDir, '051-rls-public-exposure-remediation.sql'),
    'utf8',
  );

  it.each(['tenant_variations', 'consumed_approval_tokens', 'tenant_migrations'] as const)(
    'org-scopes public.%s with app.current_org_id() + app_user grants',
    (table) => {
      expect(migration).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
      expect(migration).toMatch(new RegExp(`alter table public\\.${table} force row level security`, 'i'));
      expect(migration).toMatch(new RegExp(`on public\\.${table}[\\s\\S]*?org_id = app\\.current_org_id\\(\\)`, 'i'));
      expect(migration).toMatch(new RegExp(`revoke select on public\\.${table} from public, anon, authenticated`, 'i'));
      expect(migration).toMatch(new RegExp(`grant select, insert, update, delete on public\\.${table} to app_user`, 'i'));
    },
  );

  it.each(['modules', 'allergens', 'line_machines', 'role_categories'] as const)(
    'enables RLS on reference table public.%s and revokes anon/authenticated SELECT',
    (table) => {
      expect(migration).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
      expect(migration).toMatch(new RegExp(`alter table public\\.${table} force row level security`, 'i'));
      expect(migration).toMatch(new RegExp(`revoke select on public\\.${table} from public, anon, authenticated`, 'i'));
      expect(migration).toMatch(new RegExp(`grant select[\\s\\S]*?on public\\.${table} to app_user`, 'i'));
    },
  );

  it('locks legacy + audit tables (RLS, no anon/authenticated)', () => {
    expect(migration).toMatch(/alter table public\.tenant_migrations_legacy_t038 enable row level security/i);
    expect(migration).toMatch(/revoke select on public\.tenant_migrations_legacy_t038 from public, anon, authenticated/i);
    expect(migration).toMatch(/audit_log_2026_01/);
    expect(migration).toMatch(/audit_log_2026_12/);
    expect(migration).toMatch(/revoke select on public\.%I from public, anon, authenticated/i);
  });

  it('adds explicit policies for tenants + tenant_idp_config (no rls_enabled_no_policy)', () => {
    expect(migration).toMatch(/create policy tenants_current_org_context/i);
    expect(migration).toMatch(/create policy tenant_idp_config_current_org_context/i);
    expect(migration).toMatch(/org\.id = app\.current_org_id\(\)/i);
  });

  it('revokes EXECUTE on the flagged SECURITY DEFINER functions and fixes search_path', () => {
    for (const fn of [
      'audit_events_impersonation_guard',
      'audit_log_create_partitions',
      'audit_log_detach_old',
      'prune_audit_events',
      'prune_consumed_approval_tokens',
      'prune_reference_csv_import_reports',
      'seed_reference_data_on_org_insert',
      'seed_system_roles_on_org_insert',
      'seed_tenant_idp_config',
      'touch_updated_at',
      'set_user_pins_updated_at',
    ]) {
      expect(migration).toMatch(new RegExp(`'${fn}'`));
    }
    expect(migration).toMatch(/revoke execute on function[\s\S]*?from public, anon, authenticated/i);
    expect(migration).toMatch(/set_user_pins_updated_at\(\) set search_path/i);
  });
});

runTestcontainerSuite('T-129 SEC-RLS public exposure remediation', () => {
  beforeAll(async () => {
    container = await startPostgres16();
    ownerPool = new pg.Pool({ connectionString: container.getConnectionUri() });

    await createSupabaseRoles(ownerPool);
    await applyMigrations(ownerPool);
    await seedOrgScopedRows(ownerPool);

    appPool = new pg.Pool({ connectionString: appConnectionUri(container.getConnectionUri()) });
  });

  afterAll(async () => {
    await appPool?.end();
    await ownerPool?.end();
    await container?.stop();
  });

  it('runs runtime assertions as app_user without superuser or BYPASSRLS', async () => {
    const result = await appPool?.query<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>(`
      select current_user, rolsuper, rolbypassrls
      from pg_roles
      where rolname = current_user
    `);

    expect(result?.rows).toEqual([{ current_user: 'app_user', rolsuper: false, rolbypassrls: false }]);
  });

  it.each(orgScopedTables)('%s hides cross-org rows under app.current_org_id()', async (tableName) => {
    const sessionToken = randomUUID();
    await seedTrustedOrgContext(ownerPool!, sessionToken, orgA);

    const client = await appPool!.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      const visible = await client.query(`select org_id from public.${tableName} order by org_id`);
      expect(visible.rows, `${tableName} must have a non-vacuous org A row`).toEqual([{ org_id: orgA }]);

      const crossOrg = await client.query(`select org_id from public.${tableName} where org_id = $1::uuid`, [orgB]);
      expect(crossOrg.rowCount).toBe(0);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('removes PUBLIC/anon/authenticated SELECT grants from all listed exposed tables that exist', async () => {
    const existingTables = await ownerPool!.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = 'public'
         and table_name = any($1::text[])`,
      [anonRevokedTables],
    );
    const existingNames = existingTables.rows.map((row) => row.table_name).sort();
    expect(existingNames, 'the remediation test must exercise real listed tables').not.toHaveLength(0);

    const grants = await ownerPool!.query<{ table_name: string; grantee: string; privilege_type: string }>(
      `select table_name, grantee, privilege_type
       from information_schema.role_table_grants
       where table_schema = 'public'
         and table_name = any($1::text[])
         and grantee in ('PUBLIC', 'anon', 'authenticated')
         and privilege_type = 'SELECT'
       order by table_name, grantee`,
      [anonRevokedTables],
    );

    expect(grants.rows).toEqual([]);
  });
});

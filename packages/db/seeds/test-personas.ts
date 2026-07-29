import { pathToFileURL } from 'node:url';

import pg, { type PoolClient } from 'pg';

import {
  ALL_MAINTENANCE_PERMISSIONS,
  ALL_PERMISSIONS,
  Permission,
  type Permission as PermissionValue,
} from '../../rbac/src/permissions.enum.js';

const { Pool } = pg;

const TEST_PASSWORD = 'MonoPilot-Test-2026!';

type PersonaKey =
  | 'admin'
  | 'no_asset_deactivate'
  | 'second_signer'
  | 'single_site_operator'
  | 'no_module_access';

type TestPersona = {
  key: PersonaKey;
  userId: string;
  email: string;
  password: string;
  name: string;
  roleCode: string;
  roleName: string;
  permissionSource: 'existing_role' | 'managed';
  permissions: readonly PermissionValue[];
  siteScope: 'unrestricted' | 'single';
  systemRole: boolean;
};

const lineOperatorPermissions = [
  Permission.PRODUCTION_WO_START,
  Permission.PRODUCTION_WO_PAUSE,
  Permission.PRODUCTION_WO_RESUME,
  Permission.PRODUCTION_WO_COMPLETE,
  Permission.PRODUCTION_CONSUMPTION_WRITE,
  Permission.PRODUCTION_OUTPUT_WRITE,
  Permission.PRODUCTION_WASTE_WRITE,
  Permission.PRODUCTION_DOWNTIME_WRITE,
  Permission.WAREHOUSE_LP_CONSUME,
] as const;

export const TEST_PERSONAS = [
  {
    key: 'admin',
    userId: '7f290000-0000-4000-8000-000000000001',
    email: 'persona.admin@monopilot.test',
    password: TEST_PASSWORD,
    name: 'Test Persona — Admin',
    roleCode: 'admin',
    roleName: 'Admin',
    permissionSource: 'existing_role',
    permissions: [],
    siteScope: 'unrestricted',
    systemRole: true,
  },
  {
    key: 'no_asset_deactivate',
    userId: '7f290000-0000-4000-8000-000000000002',
    email: 'persona.no-asset-deactivate@monopilot.test',
    password: TEST_PASSWORD,
    name: 'Test Persona — No Asset Deactivate',
    roleCode: 'test_no_asset_deactivate',
    roleName: 'Test — Maintenance without asset deactivate',
    permissionSource: 'managed',
    permissions: ALL_MAINTENANCE_PERMISSIONS.filter(
      (permission) => permission !== Permission.MNT_ASSET_DEACTIVATE,
    ),
    siteScope: 'unrestricted',
    systemRole: false,
  },
  {
    key: 'second_signer',
    userId: '7f290000-0000-4000-8000-000000000003',
    email: 'persona.second-signer@monopilot.test',
    password: TEST_PASSWORD,
    name: 'Test Persona — Second Signer',
    roleCode: 'test_second_signer',
    roleName: 'Test — Maintenance second signer',
    permissionSource: 'managed',
    permissions: [
      Permission.MNT_ASSET_READ,
      Permission.MNT_LOTO_APPLY,
      Permission.MNT_CALIB_RECORD,
    ],
    siteScope: 'unrestricted',
    systemRole: false,
  },
  {
    key: 'single_site_operator',
    userId: '7f290000-0000-4000-8000-000000000004',
    email: 'persona.single-site-operator@monopilot.test',
    password: TEST_PASSWORD,
    name: 'Test Persona — Single Site Operator',
    roleCode: 'test_single_site_operator',
    roleName: 'Test — Single-site line operator',
    permissionSource: 'managed',
    permissions: lineOperatorPermissions,
    siteScope: 'single',
    systemRole: false,
  },
  {
    key: 'no_module_access',
    userId: '7f290000-0000-4000-8000-000000000005',
    email: 'persona.no-module-access@monopilot.test',
    password: TEST_PASSWORD,
    name: 'Test Persona — No Module Access',
    roleCode: 'test_no_module_access',
    roleName: 'Test — No module access',
    permissionSource: 'managed',
    permissions: [],
    siteScope: 'unrestricted',
    systemRole: false,
  },
] as const satisfies readonly TestPersona[];

const REQUIRED_COLUMNS = {
  organizations: ['id'],
  roles: [
    'id',
    'org_id',
    'slug',
    'system',
    'code',
    'name',
    'permissions',
    'is_system',
    'display_order',
  ],
  users: [
    'id',
    'org_id',
    'email',
    'name',
    'role_id',
    'language',
    'is_active',
    'deleted_at',
    'updated_at',
  ],
  role_permissions: ['role_id', 'permission'],
  user_roles: ['user_id', 'role_id', 'org_id'],
  sites: ['id', 'org_id', 'site_code', 'name', 'is_default', 'is_active'],
  user_sites: ['user_id', 'site_id', 'org_id', 'assigned_by'],
} as const;

export const PERSONA_PROOF_SQL = `
with persona_users as (
  select u.id, u.email
    from public.users u
   where u.org_id = $1::uuid
     and u.email = any($2::citext[])
),
effective as (
  select pu.id as user_id, permission_set.permission
    from persona_users pu
    join public.user_roles ur
      on ur.user_id = pu.id
     and ur.org_id = $1::uuid
    join public.roles r
      on r.id = ur.role_id
     and r.org_id = ur.org_id
    cross join lateral (
      select rp.permission
        from public.role_permissions rp
       where rp.role_id = r.id
      union
      select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb))
    ) permission_set
)
select pu.id::text as user_id,
       pu.email::text as login,
       string_agg(distinct r.code, ', ' order by r.code) as role,
       count(distinct e.permission)::int as permission_count,
       coalesce(bool_or(e.permission = 'mnt.asset.deactivate'), false) as has_asset_deactivate,
       coalesce(bool_or(e.permission = 'mnt.loto.apply'), false) as can_loto_apply,
       coalesce(bool_or(e.permission = 'mnt.calib.record'), false) as can_calib_record,
       coalesce(
         (
           select array_agg(s.site_code order by s.site_code)
             from public.user_sites us
             join public.sites s
               on s.id = us.site_id
              and s.org_id = us.org_id
            where us.user_id = pu.id
              and us.org_id = $1::uuid
         ),
         array[]::text[]
       ) as assigned_sites,
       coalesce(
         array_agg(distinct e.permission order by e.permission)
           filter (where e.permission is not null),
         array[]::text[]
       ) as effective_permissions
  from persona_users pu
  join public.user_roles ur
    on ur.user_id = pu.id
   and ur.org_id = $1::uuid
  join public.roles r
    on r.id = ur.role_id
   and r.org_id = ur.org_id
  left join effective e on e.user_id = pu.id
 group by pu.id, pu.email
 order by pu.email
`;

type SeedOptions = {
  connectionString: string;
  orgId: string;
  siteId?: string;
};

type ProofRow = {
  user_id: string;
  login: string;
  role: string;
  permission_count: number;
  has_asset_deactivate: boolean;
  can_loto_apply: boolean;
  can_calib_record: boolean;
  assigned_sites: string[];
  effective_permissions: string[];
};

type SeedResult = {
  databaseRole: string;
  triggerNames: string[];
  selectedSite: { id: string; siteCode: string; name: string };
  proof: ProofRow[];
  adminPermissionDrift: {
    enumOnly: string[];
    databaseOnly: string[];
  };
};

type DatabaseRole = {
  current_user: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
};

export function assertDatabaseRoleCanBypassRls(role: DatabaseRole): void {
  if (!role.rolsuper && !role.rolbypassrls) {
    throw new Error(
      `Database role "${role.current_user}" cannot run the test-persona seed: protected tables use FORCE ROW LEVEL SECURITY, so without SUPERUSER or BYPASSRLS the seed would see zero rows and could silently provision no accounts. Connect using a test-only SUPERUSER/BYPASSRLS role.`,
    );
  }
}

export function diffPermissionSets(
  expected: readonly string[],
  actual: readonly string[],
): { missing: string[]; unexpected: string[] } {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    missing: [...expectedSet]
      .filter((permission) => !actualSet.has(permission))
      .sort(),
    unexpected: [...actualSet]
      .filter((permission) => !expectedSet.has(permission))
      .sort(),
  };
}

export function assertExactPermissions(
  login: string,
  expected: readonly string[],
  actual: readonly string[],
): void {
  const difference = diffPermissionSets(expected, actual);
  if (difference.missing.length > 0 || difference.unexpected.length > 0) {
    throw new Error(
      `Effective permission mismatch for ${login}; missing=${JSON.stringify(difference.missing)}; unexpected=${JSON.stringify(difference.unexpected)}`,
    );
  }
}

function assertProofRows(
  proof: readonly ProofRow[],
  selectedSiteCode: string,
): void {
  const byLogin = new Map(proof.map((row) => [row.login, row]));
  for (const persona of TEST_PERSONAS) {
    const row = byLogin.get(persona.email);
    if (!row) {
      throw new Error(`Missing RBAC proof row for ${persona.email}`);
    }
    if (row.role !== persona.roleCode) {
      throw new Error(
        `Effective role mismatch for ${persona.email}; expected=${persona.roleCode}; actual=${row.role}`,
      );
    }
    if (persona.permissionSource === 'managed') {
      assertExactPermissions(
        persona.email,
        persona.permissions,
        row.effective_permissions,
      );
    }
    const expectedSites =
      persona.siteScope === 'single' ? [selectedSiteCode] : [];
    if (JSON.stringify(row.assigned_sites) !== JSON.stringify(expectedSites)) {
      throw new Error(`Effective site scope mismatch for ${persona.email}`);
    }
  }
}

function assertUuid(value: string, variableName: string): void {
  // Kształt UUID-a, BEZ wymuszania nibbli wersji/wariantu z RFC 4122: kanoniczne organizacje
  // tego repo (Apex `...-0000-0000-...000002`, sentinel GDPR `...ee`) są poprawnymi wartościami
  // typu uuid w Postgresie, ale nie mają bitów wersji — wariant RFC odrzucał je wszystkie.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${variableName} must be a UUID`);
  }
}

function describeDatabase(connectionString: string): string {
  const url = new URL(connectionString);
  return `${url.hostname}:${url.port || '5432'}/${url.pathname.replace(/^\//, '')}`;
}

async function assertRequiredSchema(
  client: PoolClient,
): Promise<void> {
  const { rows } = await client.query<{ table_name: string; column_name: string }>(
    `select table_name, column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name = any($1::text[])`,
    [Object.keys(REQUIRED_COLUMNS)],
  );
  const present = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missing = Object.entries(REQUIRED_COLUMNS).flatMap(([table, columns]) =>
    columns
      .filter((column) => !present.has(`${table}.${column}`))
      .map((column) => `${table}.${column}`),
  );
  if (missing.length > 0) {
    throw new Error(
      `Database schema is not ready for the persona seed; missing: ${missing.join(', ')}`,
    );
  }
}

async function assertNoIdentityConflicts(
  client: PoolClient,
  orgId: string,
): Promise<void> {
  // Klucze jako `string`, nie unia literałów: wyszukujemy po wartościach Z BAZY (`row.id`,
  // `row.email`), które są zwykłymi stringami — inaczej `.get()` nie przechodzi typechecku.
  type Persona = (typeof TEST_PERSONAS)[number];
  const byId = new Map<string, Persona>(TEST_PERSONAS.map((persona) => [persona.userId, persona]));
  const byEmail = new Map<string, Persona>(
    TEST_PERSONAS.map((persona) => [persona.email, persona]),
  );
  const { rows } = await client.query<{
    id: string;
    org_id: string;
    email: string;
  }>(
    `select id::text, org_id::text, lower(email::text) as email
       from public.users
      where id = any($1::uuid[])
         or lower(email::text) = any($2::text[])`,
    [
      TEST_PERSONAS.map((persona) => persona.userId),
      TEST_PERSONAS.map((persona) => persona.email),
    ],
  );

  for (const row of rows) {
    const expected = byId.get(row.id) ?? byEmail.get(row.email);
    if (
      !expected
      || row.id !== expected.userId
      || row.email !== expected.email
      || row.org_id !== orgId
    ) {
      throw new Error(
        `Persona identity collision for ${row.email} (${row.id}); refusing to overwrite another user or organization`,
      );
    }
  }
}

export async function seedTestPersonas(options: SeedOptions): Promise<SeedResult> {
  assertUuid(options.orgId, 'TEST_PERSONAS_ORG_ID');
  if (options.siteId) {
    assertUuid(options.siteId, 'TEST_PERSONAS_SITE_ID');
  }

  const pool = new Pool({ connectionString: options.connectionString });
  const client = await pool.connect();
  try {
    const roleResult = await client.query<DatabaseRole>(
      `select current_user,
              pg_role.rolsuper,
              pg_role.rolbypassrls
         from pg_catalog.pg_roles pg_role
        where pg_role.rolname = current_user`,
    );
    const databaseRoleState = roleResult.rows[0];
    if (!databaseRoleState) {
      throw new Error('Cannot resolve current_user in pg_catalog.pg_roles');
    }
    assertDatabaseRoleCanBypassRls(databaseRoleState);
    const databaseRole = databaseRoleState.current_user;

    await assertRequiredSchema(client);

    const triggerResult = await client.query<{ trigger_name: string }>(
      `select format('%I.%I:%I', ns.nspname, cls.relname, trg.tgname) as trigger_name
         from pg_catalog.pg_trigger trg
         join pg_catalog.pg_class cls on cls.oid = trg.tgrelid
         join pg_catalog.pg_namespace ns on ns.oid = cls.relnamespace
        where not trg.tgisinternal
          and ns.nspname = 'public'
          and cls.relname = any($1::text[])
        order by cls.relname, trg.tgname`,
      [['roles', 'role_permissions', 'users', 'user_roles', 'user_sites']],
    );

    await client.query('begin');
    try {
      const orgResult = await client.query<{ id: string }>(
        `select id::text
           from public.organizations
          where id = $1::uuid
          for update`,
        [options.orgId],
      );
      if (orgResult.rowCount !== 1) {
        throw new Error(`Organization ${options.orgId} does not exist`);
      }

      const siteResult = await client.query<{
        id: string;
        site_code: string;
        name: string;
      }>(
        `select id::text, site_code, name
           from public.sites
          where org_id = $1::uuid
            and is_active = true
            and ($2::uuid is null or id = $2::uuid)
          order by is_default desc, lower(site_code), id
          limit 1`,
        [options.orgId, options.siteId ?? null],
      );
      const selectedSite = siteResult.rows[0];
      if (!selectedSite) {
        throw new Error(
          options.siteId
            ? `TEST_PERSONAS_SITE_ID ${options.siteId} is not an active site in organization ${options.orgId}`
            : `Organization ${options.orgId} has no active site; single_site_operator cannot be scoped safely`,
        );
      }

      await assertNoIdentityConflicts(client, options.orgId);

      const roleIds = new Map<PersonaKey, string>();
      for (const [index, persona] of TEST_PERSONAS.entries()) {
        if (persona.permissionSource === 'existing_role') {
          const existingRoleResult = await client.query<{ id: string }>(
            `select id::text
               from public.roles
              where org_id = $1::uuid
                and code = $2`,
            [options.orgId, persona.roleCode],
          );
          const existingRoleId = existingRoleResult.rows[0]?.id;
          if (existingRoleResult.rowCount !== 1 || !existingRoleId) {
            throw new Error(
              `Existing role ${persona.roleCode} was not found exactly once in organization ${options.orgId}`,
            );
          }
          roleIds.set(persona.key, existingRoleId);
          continue;
        }

        const roleResult = await client.query<{ id: string }>(
          `insert into public.roles (
             org_id, slug, system, code, name, permissions, is_system, display_order
           )
           values ($1::uuid, $2, $3, $2, $4, $5::jsonb, $3, $6)
           on conflict (org_id, code) do update
             set slug = excluded.slug,
                 system = excluded.system,
                 name = excluded.name,
                 permissions = excluded.permissions,
                 is_system = excluded.is_system,
                 display_order = excluded.display_order
           returning id::text`,
          [
            options.orgId,
            persona.roleCode,
            persona.systemRole,
            persona.roleName,
            JSON.stringify(persona.permissions),
            900 + index,
          ],
        );
        const roleId = roleResult.rows[0]?.id;
        if (!roleId) {
          throw new Error(`Failed to upsert role ${persona.roleCode}`);
        }
        roleIds.set(persona.key, roleId);

        await client.query(
          'delete from public.role_permissions where role_id = $1::uuid',
          [roleId],
        );
        if (persona.permissions.length > 0) {
          await client.query(
            `insert into public.role_permissions (role_id, permission)
             select $1::uuid, permission
               from unnest($2::text[]) as permission
             on conflict (role_id, permission) do nothing`,
            [roleId, persona.permissions],
          );
        }
      }

      for (const persona of TEST_PERSONAS) {
        const roleId = roleIds.get(persona.key);
        if (!roleId) {
          throw new Error(`Missing role id for ${persona.key}`);
        }
        await client.query(
          `insert into public.users (
             id, org_id, email, name, role_id, language, is_active,
             invite_token, invite_token_expires_at, deleted_at, updated_at
           )
           values (
             $1::uuid, $2::uuid, $3::citext, $4, $5::uuid, 'en', true,
             null, null, null, now()
           )
           on conflict (id) do update
             set org_id = excluded.org_id,
                 email = excluded.email,
                 name = excluded.name,
                 role_id = excluded.role_id,
                 language = excluded.language,
                 is_active = true,
                 invite_token = null,
                 invite_token_expires_at = null,
                 deleted_at = null,
                 updated_at = now()`,
          [persona.userId, options.orgId, persona.email, persona.name, roleId],
        );

        await client.query(
          'delete from public.user_roles where user_id = $1::uuid',
          [persona.userId],
        );
        await client.query(
          `insert into public.user_roles (user_id, role_id, org_id)
           values ($1::uuid, $2::uuid, $3::uuid)`,
          [persona.userId, roleId, options.orgId],
        );
        await client.query(
          'delete from public.user_sites where user_id = $1::uuid',
          [persona.userId],
        );
      }

      const singleSiteOperator = TEST_PERSONAS.find(
        (persona) => persona.key === 'single_site_operator',
      );
      const admin = TEST_PERSONAS.find((persona) => persona.key === 'admin');
      if (!singleSiteOperator || !admin) {
        throw new Error('Persona catalogue is incomplete');
      }
      await client.query(
        `insert into public.user_sites (user_id, site_id, org_id, assigned_by)
         values ($1::uuid, $2::uuid, $3::uuid, $4::uuid)`,
        [
          singleSiteOperator.userId,
          selectedSite.id,
          options.orgId,
          admin.userId,
        ],
      );

      const proofResult = await client.query<ProofRow>(PERSONA_PROOF_SQL, [
        options.orgId,
        TEST_PERSONAS.map((persona) => persona.email),
      ]);
      if (proofResult.rowCount !== TEST_PERSONAS.length) {
        throw new Error(
          `Expected ${TEST_PERSONAS.length} proof rows, got ${proofResult.rowCount ?? 0}`,
        );
      }
      assertProofRows(proofResult.rows, selectedSite.site_code);
      const adminProof = proofResult.rows.find(
        (row) => row.login === 'persona.admin@monopilot.test',
      );
      if (!adminProof) {
        throw new Error('Missing Admin persona permission drift proof');
      }
      const adminDifference = diffPermissionSets(
        ALL_PERMISSIONS,
        adminProof.effective_permissions,
      );

      await client.query('commit');
      return {
        databaseRole,
        triggerNames: triggerResult.rows.map((row) => row.trigger_name),
        selectedSite: {
          id: selectedSite.id,
          siteCode: selectedSite.site_code,
          name: selectedSite.name,
        },
        proof: proofResult.rows,
        adminPermissionDrift: {
          enumOnly: adminDifference.missing,
          databaseOnly: adminDifference.unexpected,
        },
      };
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

type SupabaseAuthConfig = {
  url: string;
  serviceRoleKey: string;
  orgId: string;
};

async function authRequest(
  config: SupabaseAuthConfig,
  path: string,
  init: RequestInit,
): Promise<Response> {
  return fetch(`${config.url.replace(/\/+$/, '')}/auth/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      apikey: config.serviceRoleKey,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

async function authError(response: Response): Promise<string> {
  return (await response.text()).slice(0, 500);
}

export async function provisionSupabaseAuthUsers(
  config: SupabaseAuthConfig,
): Promise<void> {
  for (const persona of TEST_PERSONAS) {
    const existing = await authRequest(
      config,
      `/admin/users/${persona.userId}`,
      { method: 'GET' },
    );
    const attributes = {
      email: persona.email,
      password: persona.password,
      email_confirm: true,
      app_metadata: {
        org_id: config.orgId,
        test_persona: persona.key,
      },
      user_metadata: { name: persona.name },
    };

    if (existing.ok) {
      const payload = (await existing.json()) as {
        email?: string;
        user?: { email?: string };
      };
      const existingEmail = payload.user?.email ?? payload.email;
      if (existingEmail?.toLowerCase() !== persona.email) {
        throw new Error(
          `Supabase Auth id ${persona.userId} belongs to ${existingEmail ?? 'an unknown email'}`,
        );
      }
      const updated = await authRequest(
        config,
        `/admin/users/${persona.userId}`,
        { method: 'PUT', body: JSON.stringify(attributes) },
      );
      if (!updated.ok) {
        throw new Error(
          `Supabase Auth update failed for ${persona.email}: ${await authError(updated)}`,
        );
      }
      console.log(`[AUTH UPDATED] ${persona.email}`);
      continue;
    }

    if (existing.status !== 404) {
      throw new Error(
        `Supabase Auth lookup failed for ${persona.email}: ${await authError(existing)}`,
      );
    }
    const created = await authRequest(config, '/admin/users', {
      method: 'POST',
      body: JSON.stringify({ id: persona.userId, ...attributes }),
    });
    if (!created.ok) {
      throw new Error(
        `Supabase Auth create failed for ${persona.email}: ${await authError(created)}`,
      );
    }
    console.log(`[AUTH CREATED] ${persona.email}`);
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  const orgId = process.env.TEST_PERSONAS_ORG_ID;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }
  if (!orgId) {
    throw new Error('TEST_PERSONAS_ORG_ID is required');
  }
  if (
    process.env.NODE_ENV === 'production'
    || process.env.VERCEL_ENV === 'production'
  ) {
    throw new Error('Refusing to seed test personas in a production runtime');
  }
  if (process.env.TEST_PERSONAS_CONFIRM_TEST_DB !== 'YES') {
    throw new Error(
      'Refusing to connect: set TEST_PERSONAS_CONFIRM_TEST_DB=YES only for an isolated test database',
    );
  }

  console.log(`[DB TARGET] ${describeDatabase(connectionString)}`);
  const result = await seedTestPersonas({
    connectionString,
    orgId,
    siteId: process.env.TEST_PERSONAS_SITE_ID,
  });
  console.log(`[DB SEEDED] role=${result.databaseRole}`);
  console.log(
    `[SITE SCOPE] ${result.selectedSite.siteCode} (${result.selectedSite.id})`,
  );
  console.log(
    `[TRIGGERS REVIEWED] ${result.triggerNames.length > 0 ? result.triggerNames.join(', ') : 'none'}`,
  );
  console.log('[RBAC PROOF]');
  console.log(JSON.stringify(result.proof, null, 2));
  console.warn(
    `[ADMIN PERMISSION DRIFT] enum_only=${JSON.stringify(result.adminPermissionDrift.enumOnly)} database_only=${JSON.stringify(result.adminPermissionDrift.databaseOnly)}`,
  );

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl && !serviceRoleKey) {
    console.warn(
      '[AUTH NOT PROVISIONED] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are absent. DB personas exist, but they cannot log in through Supabase Auth.',
    );
    return;
  }
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      '[AUTH NOT PROVISIONED] Provide both NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; DB personas were seeded, but Auth was not.',
    );
  }

  await provisionSupabaseAuthUsers({
    url: supabaseUrl,
    serviceRoleKey,
    orgId,
  });
  console.log('[AUTH PROVISIONED] All five test personas can authenticate.');
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}

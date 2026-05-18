import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const repoRoot = resolve(__dirname, '../../../..');
const createModulePath = resolve(repoRoot, 'apps/web/actions/orgs/create.ts');
const roleSeedModulePath = resolve(repoRoot, 'packages/rbac/src/role-seed.ts');
const permissionsModulePath = resolve(repoRoot, 'packages/rbac/src/permissions.enum.ts');

const ORG_ID = '11111111-1111-4111-8111-111111111111';

const EXPECTED_SYSTEM_ROLE_CODES = [
  'owner',
  'admin',
  'npd_manager',
  'module_admin',
  'planner',
  'production_lead',
  'quality_lead',
  'warehouse_operator',
  'auditor',
  'viewer',
] as const;

const validInput = {
  slug: 'apex-dairy',
  name: 'Apex Dairy',
  timezone: 'Europe/Warsaw',
  locale: 'pl',
  currency: 'PLN',
  region: 'eu',
  tier: 'L2',
};

type QueryCall = { sql: string; params: unknown[] };
type FakeClient = {
  calls: QueryCall[];
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
  release: () => void;
};

type CreateOrganizationResult =
  | { ok: true; data: { orgId: string; slug: string } }
  | { ok: false; error: string };

type CreateModule = {
  createOrganization: (input: typeof validInput) => Promise<CreateOrganizationResult>;
};

type RoleSeedModule = {
  SYSTEM_ROLE_SEEDS: readonly {
    code: string;
    name: string;
    permissions: readonly string[];
    isSystem: boolean;
  }[];
};

let currentClient: FakeClient;
let failureMode: 'none' | 'duplicate_slug' = 'none';

vi.mock('@monopilot/db/clients', () => ({
  getOwnerConnection: () => ({
    connect: async () => currentClient,
  }),
}));

beforeEach(() => {
  vi.resetModules();
  failureMode = 'none';
  currentClient = makeClient();
});

describe('createOrganization Server Action (T-016 RED)', () => {
  it('inserts the organization, exactly 10 system roles, and tenant_variations in one transaction', async () => {
    const { createOrganization } = await loadCreateModule();

    const result = await createOrganization(validInput);

    expect(result).toEqual({ ok: true, data: { orgId: ORG_ID, slug: validInput.slug } });
    expect(statementIndex('begin')).toBe(0);
    expect(statementIndex('insert into public.organizations')).toBeGreaterThan(statementIndex('begin'));
    expect(statementIndex('insert into public.roles')).toBeGreaterThan(
      statementIndex('insert into public.organizations'),
    );
    expect(statementIndex('insert into public.tenant_variations')).toBeGreaterThan(
      statementIndex('insert into public.roles'),
    );
    expect(statementIndex('commit')).toBeGreaterThan(
      statementIndex('insert into public.tenant_variations'),
    );
    expect(statementIndex('rollback')).toBe(-1);
    expect(extractRoleCodes()).toEqual(EXPECTED_SYSTEM_ROLE_CODES);
  });

  it('maps a duplicate organization slug to the typed SLUG_TAKEN error and rolls back', async () => {
    failureMode = 'duplicate_slug';
    const { createOrganization } = await loadCreateModule();

    const result = await createOrganization(validInput);

    expect(result).toEqual({ ok: false, error: 'SLUG_TAKEN' });
    expect(statementIndex('begin')).toBe(0);
    expect(statementIndex('rollback')).toBeGreaterThan(statementIndex('insert into public.organizations'));
    expect(statementIndex('commit')).toBe(-1);
    expect(statementIndex('insert into public.roles')).toBe(-1);
    expect(statementIndex('insert into public.outbox_events')).toBe(-1);
  });

  it('writes the org.created outbox event transactionally before commit', async () => {
    const { createOrganization } = await loadCreateModule();

    await createOrganization(validInput);

    const outboxIndex = statementIndex('insert into public.outbox_events');
    expect(outboxIndex).toBeGreaterThan(statementIndex('insert into public.tenant_variations'));
    expect(outboxIndex).toBeLessThan(statementIndex('commit'));
    const outboxBlob = callBlob(currentClient.calls[outboxIndex]);
    expect(outboxBlob).toContain('org.created');
    expect(outboxBlob).toContain(ORG_ID);
    expect(outboxBlob).toContain(validInput.slug);
  });

  it('defines the owner system role with the full locked settings.* permission set only from the enum', async () => {
    const { SYSTEM_ROLE_SEEDS } = await loadRoleSeedModule();
    const { ALL_PERMISSIONS } = await loadPermissionsModule();
    const owner = SYSTEM_ROLE_SEEDS.find((role) => role.code === 'owner');
    const expectedSettingsPermissions = ALL_PERMISSIONS.filter((permission) =>
      permission.startsWith('settings.'),
    );

    expect(SYSTEM_ROLE_SEEDS.map((role) => role.code)).toEqual(EXPECTED_SYSTEM_ROLE_CODES);
    expect(SYSTEM_ROLE_SEEDS.every((role) => role.isSystem)).toBe(true);
    expect(owner, 'owner role seed must exist').toBeDefined();
    expect(owner?.permissions).toEqual(expect.arrayContaining(expectedSettingsPermissions));
    expect(owner?.permissions.filter((permission) => permission.startsWith('settings.')).sort()).toEqual(
      [...expectedSettingsPermissions].sort(),
    );
    expect(owner?.permissions.every((permission) => ALL_PERMISSIONS.includes(permission))).toBe(true);
  });
});

async function loadCreateModule(): Promise<CreateModule> {
  expect(
    existsSync(createModulePath),
    'apps/web/actions/orgs/create.ts must exist and export createOrganization(input)',
  ).toBe(true);

  const mod = (await import(createModulePath)) as Partial<CreateModule>;
  if (typeof mod.createOrganization !== 'function') {
    expect.fail('apps/web/actions/orgs/create.ts must export createOrganization(input)');
  }
  return mod as CreateModule;
}

async function loadRoleSeedModule(): Promise<RoleSeedModule> {
  expect(
    existsSync(roleSeedModulePath),
    'packages/rbac/src/role-seed.ts must define 10 system role seeds',
  ).toBe(true);

  const mod = (await import(roleSeedModulePath)) as Partial<RoleSeedModule>;
  if (!Array.isArray(mod.SYSTEM_ROLE_SEEDS)) {
    expect.fail('packages/rbac/src/role-seed.ts must export SYSTEM_ROLE_SEEDS');
  }
  return mod as RoleSeedModule;
}

type PermissionsModule = {
  ALL_PERMISSIONS: readonly string[];
};

async function loadPermissionsModule(): Promise<PermissionsModule> {
  expect(existsSync(permissionsModulePath), 'permissions.enum.ts must exist').toBe(true);
  return (await import(permissionsModulePath)) as PermissionsModule;
}

function makeClient(): FakeClient {
  const calls: QueryCall[] = [];
  return {
    calls,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql: normalizeSql(sql), params });

      if (sqlMatches(sql, 'insert into public.organizations')) {
        if (failureMode === 'duplicate_slug') {
          const duplicate = new Error('duplicate key value violates unique constraint organizations_slug_unique') as Error & {
            code?: string;
            constraint?: string;
          };
          duplicate.code = '23505';
          duplicate.constraint = 'organizations_slug_unique';
          throw duplicate;
        }
        return { rows: [{ id: ORG_ID, slug: validInput.slug }], rowCount: 1 };
      }

      return { rows: [], rowCount: 1 };
    },
    release: vi.fn(),
  };
}

function statementIndex(fragment: string): number {
  return currentClient.calls.findIndex((call) => call.sql.includes(fragment));
}

function extractRoleCodes(): readonly string[] {
  const roleCalls = currentClient.calls.filter((call) => call.sql.includes('insert into public.roles'));
  const blob = roleCalls.map(callBlob).join('\n');
  return EXPECTED_SYSTEM_ROLE_CODES.filter((code) => blob.includes(code));
}

function callBlob(call: QueryCall | undefined): string {
  return `${call?.sql ?? ''}\n${JSON.stringify(call?.params ?? [])}`;
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function sqlMatches(sql: string, fragment: string): boolean {
  return normalizeSql(sql).includes(fragment);
}

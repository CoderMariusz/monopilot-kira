import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TARGET_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OPERATOR_ROLE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OWNER_ROLE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const INVITE_CODE_ROLE_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const { _withOrgContextRunner } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _withOrgContextRunner(action),
  ),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

type QueryCall = { sql: string; params: unknown[] };
type FakeClient = {
  calls: QueryCall[];
  updatedRoleId: string | null;
  outboxPayloads: Record<string, unknown>[];
  auditRows: Record<string, unknown>[];
  lastOwnerViolation: boolean;
  actorRoleCodes: string[];
  actorPermissions: string[];
  rolesById: Record<string, { id: string; code: string; slug: string | null }>;
  rolePermissionsById: Record<string, string[]>;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

function makeClient(options: {
  actorRoleCodes?: string[];
  actorPermissions?: string[];
  rolesById?: FakeClient['rolesById'];
  rolePermissionsById?: FakeClient['rolePermissionsById'];
} = {}): FakeClient {
  const calls: QueryCall[] = [];
  const client: FakeClient = {
    calls,
    updatedRoleId: null,
    outboxPayloads: [],
    auditRows: [],
    lastOwnerViolation: false,
    actorRoleCodes: options.actorRoleCodes ?? [],
    actorPermissions: options.actorPermissions ?? ['settings.roles.assign'],
    rolesById: options.rolesById ?? {
      [OPERATOR_ROLE_ID]: { id: OPERATOR_ROLE_ID, code: 'operator', slug: 'operator' },
    },
    rolePermissionsById: options.rolePermissionsById ?? {
      [OPERATOR_ROLE_ID]: ['settings.roles.assign'],
    },
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (norm.startsWith('select true as ok') && norm.includes('role_permissions') && norm.includes('user_roles')) {
        const requestedPermission = params[2];
        return requestedPermission === 'settings.roles.assign'
          ? { rows: [{ ok: true }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }

      if (norm.includes('from public.roles') && norm.includes('select id, code, slug')) {
        const role = client.rolesById[params[0] as string];
        return role && params[1] === ORG_ID
          ? { rows: [role], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }

      if (norm.includes('r.code = any($3::text[])')) {
        const allowed = new Set(params[2] as readonly string[]);
        const ok = client.actorRoleCodes.some((code) => allowed.has(code));
        return { rows: ok ? [{ ok: true }] : [], rowCount: ok ? 1 : 0 };
      }

      if (norm.startsWith('select distinct perm as permission') && norm.includes('from public.user_roles ur')) {
        const grants = new Set(client.actorPermissions);
        for (const code of client.actorRoleCodes) {
          if (code.includes('.')) grants.add(code);
        }
        return {
          rows: [...grants].map((permission) => ({ permission })),
          rowCount: grants.size,
        };
      }

      if (
        norm.startsWith('select distinct perm as permission')
        && norm.includes('from public.role_permissions rp')
        && norm.includes('app.current_org_id()')
      ) {
        const roleId = params[0] as string;
        const role = client.rolesById[roleId];
        const grants = new Set(client.rolePermissionsById[roleId] ?? []);
        if (role?.code?.includes('.')) grants.add(role.code);
        if (role?.slug?.includes('.')) grants.add(role.slug);
        return {
          rows: [...grants].map((permission) => ({ permission })),
          rowCount: grants.size,
        };
      }

      if (norm.startsWith('with target_role')) {
        const roleFound = params[1] === OPERATOR_ROLE_ID && params[2] === ORG_ID;
        const targetUserFound = params[0] === TARGET_USER_ID && params[2] === ORG_ID;
        if (roleFound && targetUserFound && !client.lastOwnerViolation) {
          client.updatedRoleId = params[1] as string;
        }
        return {
          rows: [{
            role_found: roleFound,
            target_user_found: targetUserFound,
            last_owner_violation: client.lastOwnerViolation,
            updated_user_id: roleFound && targetUserFound && !client.lastOwnerViolation ? TARGET_USER_ID : null,
          }],
          rowCount: 1,
        };
      }

      if (norm.startsWith('insert into public.audit_log')) {
        client.auditRows.push({
          action: params[2],
          resource_type: norm.includes("'users'") ? 'users' : 'unknown',
          resource_id: params[3],
          retention_class: norm.includes("'security'") ? 'security' : 'unknown',
        });
        return { rows: [], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.outbox_events')) {
        client.outboxPayloads.push(JSON.parse(params[3] as string) as Record<string, unknown>);
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient();
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'session-token', client: currentClient }),
  );
});

type AssignRoleModule = typeof import('./assign-role.ts');

async function loadAssignRole(): Promise<AssignRoleModule> {
  const path = `${__dirname}/assign-role.ts`;
  return (await import(path)) as AssignRoleModule;
}

describe('assignRole behavior', () => {
  it('allows settings.roles.assign permission to update the target user role and write audit metadata', async () => {
    const { assignRole } = await loadAssignRole();

    const result = await assignRole({ targetUserId: TARGET_USER_ID, roleId: OPERATOR_ROLE_ID });

    expect(result).toEqual({ ok: true, data: { targetUserId: TARGET_USER_ID, roleId: OPERATOR_ROLE_ID } });
    const permissionCall = currentClient.calls.find((call) => {
      const callNorm = call.sql.replace(/\s+/g, ' ').trim().toLowerCase();
      return callNorm.startsWith('select true as ok') && callNorm.includes('coalesce(r.permissions');
    });
    expect(permissionCall?.params[2]).toBe('settings.roles.assign');
    expect(permissionCall?.sql).toContain("coalesce(r.permissions, '[]'::jsonb) ? $3");
    // Security contract: the direct authorization query must NOT treat r.slug as a
    // permission source (only role_permissions + r.permissions json). The subset
    // computation is a separate query; permissionCall is narrowed to the auth query above.
    expect(permissionCall?.sql).not.toContain('r.slug');
    expect(currentClient.updatedRoleId).toBe(OPERATOR_ROLE_ID);
    expect(currentClient.auditRows[0]).toMatchObject({
      action: 'settings.role.assigned',
      resource_type: 'users',
      resource_id: TARGET_USER_ID,
      retention_class: 'security',
    });
    expect(currentClient.outboxPayloads[0]).toMatchObject({
      org_id: ORG_ID,
      target_user_id: TARGET_USER_ID,
      role_id: OPERATOR_ROLE_ID,
      actor_user_id: ACTOR_USER_ID,
    });
  });

  it('blocks demoting the last owner before mutating user_roles', async () => {
    currentClient.lastOwnerViolation = true;
    const { assignRole } = await loadAssignRole();

    const result = await assignRole({ targetUserId: TARGET_USER_ID, roleId: OPERATOR_ROLE_ID });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(currentClient.updatedRoleId).toBeNull();
    expect(currentClient.auditRows).toHaveLength(0);
    expect(currentClient.outboxPayloads).toHaveLength(0);
  });

  it('rejects assigning a privileged system role when the caller is not a super-role holder', async () => {
    currentClient = makeClient({
      actorRoleCodes: [],
      actorPermissions: ['settings.roles.assign'],
      rolesById: {
        [OWNER_ROLE_ID]: { id: OWNER_ROLE_ID, code: 'owner', slug: 'owner' },
      },
    });
    _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'session-token', client: currentClient }),
    );
    const { assignRole } = await loadAssignRole();

    const result = await assignRole({ targetUserId: TARGET_USER_ID, roleId: OWNER_ROLE_ID });

    expect(result).toEqual({ ok: false, error: 'forbidden_privileged_role' });
    expect(currentClient.updatedRoleId).toBeNull();
    expect(currentClient.auditRows).toHaveLength(0);
    expect(currentClient.outboxPayloads).toHaveLength(0);
  });

  it('rejects grant-subset escalation when the target role holds permissions the caller lacks', async () => {
    currentClient = makeClient({
      actorRoleCodes: [],
      actorPermissions: ['settings.roles.assign'],
      rolesById: {
        [OPERATOR_ROLE_ID]: { id: OPERATOR_ROLE_ID, code: 'operator', slug: 'operator' },
      },
      rolePermissionsById: {
        [OPERATOR_ROLE_ID]: ['settings.roles.assign', 'settings.users.invite'],
      },
    });
    _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'session-token', client: currentClient }),
    );
    const { assignRole } = await loadAssignRole();

    const result = await assignRole({ targetUserId: TARGET_USER_ID, roleId: OPERATOR_ROLE_ID });

    expect(result).toEqual({ ok: false, error: 'forbidden_privileged_role' });
    expect(currentClient.updatedRoleId).toBeNull();
    expect(currentClient.auditRows).toHaveLength(0);
  });

  it('rejects a custom role whose code grants a permission via empty permission stores', async () => {
    currentClient = makeClient({
      actorRoleCodes: [],
      actorPermissions: ['settings.roles.assign'],
      rolesById: {
        [INVITE_CODE_ROLE_ID]: {
          id: INVITE_CODE_ROLE_ID,
          code: 'settings.users.invite',
          slug: 'settings.users.invite',
        },
      },
      rolePermissionsById: {
        [INVITE_CODE_ROLE_ID]: [],
      },
    });
    _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'session-token', client: currentClient }),
    );
    const { assignRole } = await loadAssignRole();

    const result = await assignRole({ targetUserId: TARGET_USER_ID, roleId: INVITE_CODE_ROLE_ID });

    expect(result).toEqual({ ok: false, error: 'forbidden_privileged_role' });
    expect(currentClient.updatedRoleId).toBeNull();
    expect(currentClient.auditRows).toHaveLength(0);
    expect(currentClient.outboxPayloads).toHaveLength(0);
  });
});

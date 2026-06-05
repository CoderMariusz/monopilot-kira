import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TARGET_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OPERATOR_ROLE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

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
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

function makeClient(): FakeClient {
  const calls: QueryCall[] = [];
  const client: FakeClient = {
    calls,
    updatedRoleId: null,
    outboxPayloads: [],
    auditRows: [],
    lastOwnerViolation: false,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (norm.includes('role_permissions') && norm.includes('user_roles')) {
        const requestedPermission = params[2];
        return requestedPermission === 'settings.roles.assign'
          ? { rows: [{ ok: true }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
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
          resource_type: norm.includes("'org_security_policies'") ? 'org_security_policies' : 'unknown',
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
    const permissionCall = currentClient.calls.find((call) => call.sql.includes('role_permissions'));
    expect(permissionCall?.params[2]).toBe('settings.roles.assign');
    expect(permissionCall?.sql).toContain("coalesce(r.permissions, '[]'::jsonb) ? $3");
    expect(permissionCall?.sql).not.toContain('r.slug');
    expect(currentClient.updatedRoleId).toBe(OPERATOR_ROLE_ID);
    expect(currentClient.auditRows[0]).toMatchObject({
      action: 'settings.role.assigned',
      resource_type: 'org_security_policies',
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
});

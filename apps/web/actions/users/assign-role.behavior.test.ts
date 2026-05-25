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

type QueryCall = { sql: string; params: unknown[] };
type FakeClient = {
  calls: QueryCall[];
  updatedRoleId: string | null;
  outboxPayloads: Record<string, unknown>[];
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

function makeClient(): FakeClient {
  const calls: QueryCall[] = [];
  const client: FakeClient = {
    calls,
    updatedRoleId: null,
    outboxPayloads: [],
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (norm.includes('role_permissions') && norm.includes('user_roles')) {
        const requestedPermission = params[2];
        return requestedPermission === 'settings.roles.assign'
          ? { rows: [{ ok: true }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }

      if (norm.startsWith('select') && norm.includes('from public.roles') && norm.includes('where id =')) {
        return params[0] === OPERATOR_ROLE_ID && params[1] === ORG_ID
          ? { rows: [{ id: OPERATOR_ROLE_ID }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }

      if (norm.startsWith('update public.users')) {
        if (params[0] === TARGET_USER_ID && params[2] === ORG_ID) {
          client.updatedRoleId = params[1] as string;
          return { rows: [{ id: TARGET_USER_ID }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (norm.startsWith('delete from public.user_roles')) {
        return { rows: [], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.user_roles')) {
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
    expect(currentClient.calls.some((call) => call.sql.includes('role_permissions') && call.params[2] === 'settings.roles.assign')).toBe(true);
    expect(currentClient.updatedRoleId).toBe(OPERATOR_ROLE_ID);
    expect(currentClient.outboxPayloads[0]).toMatchObject({
      org_id: ORG_ID,
      target_user_id: TARGET_USER_ID,
      role_id: OPERATOR_ROLE_ID,
      actor_user_id: ACTOR_USER_ID,
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TARGET_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const { _withOrgContextRunner } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));

type QueryCall = { sql: string; params: unknown[] };
type FakeClient = {
  calls: QueryCall[];
  deactivated: boolean;
  lastOwnerViolation: boolean;
  grantedDeactivate: boolean;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

function makeClient(): FakeClient {
  const calls: QueryCall[] = [];
  const client: FakeClient = {
    calls,
    deactivated: false,
    lastOwnerViolation: false,
    grantedDeactivate: true,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (norm.includes('from public.user_roles') && norm.includes('permission = any($3::text[])')) {
        return client.grantedDeactivate ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (norm.startsWith('with locked_owner_roles')) {
        return { rows: [{ last_owner_violation: client.lastOwnerViolation }], rowCount: 1 };
      }

      if (norm.startsWith('update public.users') && norm.includes('is_active = false')) {
        if (client.lastOwnerViolation) {
          return { rows: [], rowCount: 0 };
        }
        client.deactivated = true;
        return { rows: [{ id: TARGET_USER_ID }], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.audit_log')) {
        return { rows: [], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.outbox_events')) {
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
    action({ userId: ACTOR_USER_ID, orgId: ORG_ID, client: currentClient }),
  );
});

async function loadDeactivateUser() {
  return import('./deactivate.ts');
}

describe('deactivateUser behavior', () => {
  it('uses canonical hasAnyPermission for settings.users.deactivate', async () => {
    const { deactivateUser } = await loadDeactivateUser();

    const result = await deactivateUser({ targetUserId: TARGET_USER_ID });

    expect(result).toEqual({ ok: true, data: { targetUserId: TARGET_USER_ID, deactivated: true } });
    const permissionCall = currentClient.calls.find((call) => call.sql.includes('permission = any($3::text[])'));
    expect(permissionCall?.params[2]).toEqual(['org.access.admin', 'settings.users.deactivate']);
    expect(currentClient.deactivated).toBe(true);
  });

  it('blocks deactivating the last owner', async () => {
    currentClient.lastOwnerViolation = true;
    const { deactivateUser } = await loadDeactivateUser();

    const result = await deactivateUser({ targetUserId: TARGET_USER_ID });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(currentClient.deactivated).toBe(false);
  });

  it('returns forbidden without deactivate permission', async () => {
    currentClient.grantedDeactivate = false;
    const { deactivateUser } = await loadDeactivateUser();

    const result = await deactivateUser({ targetUserId: TARGET_USER_ID });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(currentClient.deactivated).toBe(false);
  });
});

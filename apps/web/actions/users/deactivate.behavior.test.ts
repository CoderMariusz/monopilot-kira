import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TARGET_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_OWNER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const { _withOrgContextRunner } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));

const { createSupabaseAuthAdmin, updateUserByIdMock } = vi.hoisted(() => ({
  createSupabaseAuthAdmin: vi.fn(),
  updateUserByIdMock: vi.fn(async () => ({ error: null })),
}));

vi.mock('./supabase-admin', () => ({
  createSupabaseAuthAdmin,
}));

type QueryCall = { sql: string; params: unknown[] };

type OwnerGuardState = {
  activeOwnerIds: Set<string>;
};

type FakeClient = {
  calls: QueryCall[];
  grantedDeactivate: boolean;
  ownerGuard: OwnerGuardState;
  failAudit: boolean;
  deactivated: boolean;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

function evaluateLastOwnerViolation(state: OwnerGuardState, targetUserId: string): boolean {
  const targetIsActiveOwner = state.activeOwnerIds.has(targetUserId);
  const otherActiveOwners = [...state.activeOwnerIds].filter((id) => id !== targetUserId);
  return targetIsActiveOwner && otherActiveOwners.length === 0;
}

function makeClient(ownerGuard: OwnerGuardState): FakeClient {
  const calls: QueryCall[] = [];
  const client: FakeClient = {
    calls,
    grantedDeactivate: true,
    ownerGuard,
    failAudit: false,
    deactivated: false,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (norm.includes('from public.user_roles') && norm.includes('permission = any($3::text[])')) {
        return client.grantedDeactivate ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (norm.includes('from public.organizations') && norm.includes('for update')) {
        return { rows: [{ id: ORG_ID }], rowCount: 1 };
      }

      if (norm.includes('with active_owners')) {
        const targetUserId = String(params[0]);
        return {
          rows: [{ last_owner_violation: evaluateLastOwnerViolation(client.ownerGuard, targetUserId) }],
          rowCount: 1,
        };
      }

      if (norm.startsWith('update public.users') && norm.includes('is_active = false')) {
        const targetUserId = String(params[0]);
        if (evaluateLastOwnerViolation(client.ownerGuard, targetUserId)) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [{ id: targetUserId }], rowCount: 1 };
      }

      if (norm.startsWith('select is_active') && norm.includes('from public.users')) {
        return { rows: [{ is_active: true }], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.audit_log')) {
        if (client.failAudit) throw new Error('audit partition missing');
        return { rows: [], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.outbox_events')) {
        client.ownerGuard.activeOwnerIds.delete(String(params[2]));
        client.deactivated = true;
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
  updateUserByIdMock.mockResolvedValue({ error: null });
  createSupabaseAuthAdmin.mockResolvedValue({
    auth: { admin: { updateUserById: updateUserByIdMock } },
  });
  currentClient = makeClient({ activeOwnerIds: new Set([TARGET_USER_ID, OTHER_OWNER_ID]) });
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) => {
    try {
      return await action({ userId: ACTOR_USER_ID, orgId: ORG_ID, client: currentClient });
    } catch (error) {
      throw error;
    }
  });
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
    expect(currentClient.ownerGuard.activeOwnerIds.has(TARGET_USER_ID)).toBe(false);
    expect(currentClient.deactivated).toBe(true);
    const outboxCall = currentClient.calls.find((call) => call.sql.includes('insert into public.outbox_events'));
    expect(outboxCall?.params.at(-1)).toBe(`settings.user.deactivated:${TARGET_USER_ID}`);
  });

  it('returns persistence_failed and leaves the user active when audit_log insert throws', async () => {
    currentClient.failAudit = true;
    const { deactivateUser } = await loadDeactivateUser();

    const result = await deactivateUser({ targetUserId: TARGET_USER_ID });

    expect(result).toEqual({ ok: false, error: 'persistence_failed' });
    expect(currentClient.deactivated).toBe(false);
    expect(currentClient.ownerGuard.activeOwnerIds.has(TARGET_USER_ID)).toBe(true);
  });

  it('blocks deactivating the sole active owner', async () => {
    currentClient.ownerGuard.activeOwnerIds = new Set([TARGET_USER_ID]);
    const { deactivateUser } = await loadDeactivateUser();

    const result = await deactivateUser({ targetUserId: TARGET_USER_ID });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(currentClient.ownerGuard.activeOwnerIds.has(TARGET_USER_ID)).toBe(true);
  });

  it('returns success with authRevokeWarning when Supabase session ban fails after DB deactivation', async () => {
    updateUserByIdMock.mockResolvedValueOnce({ error: { message: 'ban failed' } });
    const { deactivateUser } = await loadDeactivateUser();

    const result = await deactivateUser({ targetUserId: TARGET_USER_ID });

    expect(result).toEqual({
      ok: true,
      data: { targetUserId: TARGET_USER_ID, deactivated: true, authRevokeWarning: 'session_revoke_failed' },
    });
    expect(currentClient.deactivated).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TARGET_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_OWNER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const { _withOrgContextRunner, _revalidateLocalized } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _revalidateLocalized: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));

vi.mock('../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: _revalidateLocalized,
}));

const { createSupabaseAuthAdmin, updateUserByIdMock, getUserByIdMock, liftAuthBanMock } = vi.hoisted(() => ({
  createSupabaseAuthAdmin: vi.fn(),
  updateUserByIdMock: vi.fn(async () => ({ error: null })),
  getUserByIdMock: vi.fn(async () => ({ data: { user: { id: TARGET_USER_ID } }, error: null })),
  liftAuthBanMock: vi.fn(async () => ({ ok: true })),
}));

vi.mock('./supabase-admin', () => ({
  createSupabaseAuthAdmin,
  liftAuthBan: (...args: unknown[]) => liftAuthBanMock(...args),
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
        const updatedAt = '2026-07-12T12:00:00.000Z';
        return { rows: [{ id: targetUserId, updated_at: updatedAt }], rowCount: 1 };
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
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  updateUserByIdMock.mockResolvedValue({ error: null });
  getUserByIdMock.mockResolvedValue({ data: { user: { id: TARGET_USER_ID } }, error: null });
  liftAuthBanMock.mockResolvedValue({ ok: true });
  createSupabaseAuthAdmin.mockResolvedValue({
    auth: {
      admin: {
        updateUserById: updateUserByIdMock,
        getUserById: getUserByIdMock,
      },
    },
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
    expect(outboxCall?.params.at(-1)).toBe(`settings.user.deactivated:${TARGET_USER_ID}:2026-07-12T12:00:00.000Z`);
  });

  it('allows deactivate → reactivate → deactivate without outbox dedup_key collision', async () => {
    const dedupKeys: string[] = [];
    let targetIsActive = true;
    let deactivationCount = 0;

    currentClient.query = async (sql: string, params: unknown[] = []) => {
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (norm.includes('from public.user_roles') && norm.includes('permission = $3') && !norm.includes('permission = any($3::text[])')) {
        const permission = params[2];
        return ['org.access.admin', 'settings.users.deactivate'].includes(permission as string)
          ? { rows: [{ ok: true }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }

      if (norm.includes('permission = any($3::text[])')) {
        return currentClient.grantedDeactivate ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (norm.includes('from public.organizations') && norm.includes('for update')) {
        return { rows: [{ id: ORG_ID, seat_limit: 50 }], rowCount: 1 };
      }

      if (norm.includes('with active_owners')) {
        return { rows: [{ last_owner_violation: false }], rowCount: 1 };
      }

      if (norm.includes('from public.users') && norm.includes('invite_token')) {
        return {
          rows: [{ id: TARGET_USER_ID, is_active: targetIsActive, invite_token: null }],
          rowCount: 1,
        };
      }

      if (norm.includes('active_user_count')) {
        return { rows: [{ active_user_count: 10 }], rowCount: 1 };
      }

      if (norm.includes('set is_active = true')) {
        targetIsActive = true;
        return { rows: [{ id: TARGET_USER_ID }], rowCount: 1 };
      }

      if (norm.includes('set is_active = false')) {
        targetIsActive = false;
        const stamp = `2026-07-12T12:00:0${deactivationCount}.000Z`;
        deactivationCount += 1;
        return { rows: [{ id: TARGET_USER_ID, updated_at: stamp }], rowCount: 1 };
      }

      if (norm.startsWith('select is_active') && norm.includes('from public.users')) {
        return { rows: [{ is_active: targetIsActive }], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.audit_log')) {
        return { rows: [], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.outbox_events')) {
        const dedupKey = params.at(-1);
        if (typeof dedupKey === 'string' && dedupKey.startsWith('settings.user.deactivated:')) {
          dedupKeys.push(dedupKey);
        }
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    };

    const { deactivateUser } = await loadDeactivateUser();
    const { reactivateUser } = await import('./reactivate.ts');

    const first = await deactivateUser({ targetUserId: TARGET_USER_ID });
    expect(first).toEqual({ ok: true, data: { targetUserId: TARGET_USER_ID, deactivated: true } });
    expect(deactivationCount).toBe(1);
    expect(targetIsActive).toBe(false);

    const reactivated = await reactivateUser({ targetUserId: TARGET_USER_ID });
    expect(reactivated).toEqual({ ok: true, data: { targetUserId: TARGET_USER_ID, reactivated: true } });
    expect(targetIsActive).toBe(true);

    const second = await deactivateUser({ targetUserId: TARGET_USER_ID });
    expect(second).toEqual({ ok: true, data: { targetUserId: TARGET_USER_ID, deactivated: true } });

    expect(dedupKeys).toHaveLength(2);
    expect(dedupKeys[0]).not.toBe(dedupKeys[1]);
    expect(dedupKeys[0]).toBe(`settings.user.deactivated:${TARGET_USER_ID}:2026-07-12T12:00:00.000Z`);
    expect(dedupKeys[1]).toBe(`settings.user.deactivated:${TARGET_USER_ID}:2026-07-12T12:00:01.000Z`);
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

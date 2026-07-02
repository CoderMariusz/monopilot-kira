import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TARGET_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const {
  _withOrgContextRunner,
  _revalidateLocalized,
  _listFactors,
  _deleteFactor,
  _deleteSecrets,
  _deleteRecovery,
} = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _revalidateLocalized: vi.fn(),
  _listFactors: vi.fn(),
  _deleteFactor: vi.fn(),
  _deleteSecrets: vi.fn(),
  _deleteRecovery: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));

vi.mock('../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: _revalidateLocalized,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      admin: {
        mfa: {
          listFactors: _listFactors,
          deleteFactor: _deleteFactor,
        },
      },
    },
    from: (table: string) => ({
      delete: () => ({
        eq: (_column: string, userId: string) => {
          if (table === 'mfa_secrets') return _deleteSecrets(userId);
          if (table === 'recovery_codes') return _deleteRecovery(userId);
          return Promise.resolve({ error: null, count: 0 });
        },
      }),
    }),
  })),
}));

type QueryCall = { sql: string; params: unknown[] };
type FakeClient = {
  calls: QueryCall[];
  auditRows: Record<string, unknown>[];
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

function makeClient(): FakeClient {
  const calls: QueryCall[] = [];
  const client: FakeClient = {
    calls,
    auditRows: [],
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (norm.includes('role_permissions') && norm.includes('user_roles')) {
        const permission = params[2];
        return ['org.access.admin', 'settings.users.deactivate'].includes(permission as string)
          ? { rows: [{ ok: true }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }

      if (norm.includes('from public.users') && norm.includes('where id =')) {
        return { rows: [{ id: TARGET_USER_ID }], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.audit_log')) {
        client.auditRows.push({
          action: params[2],
          resource_id: params[3],
          after_state: JSON.parse(params[4] as string),
        });
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
  currentClient = makeClient();
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'session-token', client: currentClient }),
  );
  _listFactors.mockResolvedValue({ data: { factors: [{ id: 'factor-1' }] }, error: null });
  _deleteFactor.mockResolvedValue({ error: null });
  _deleteSecrets.mockResolvedValue({ error: null, count: 1 });
  _deleteRecovery.mockResolvedValue({ error: null, count: 2 });
});

type ResetUserMfaModule = typeof import('./reset-user-mfa.ts');

async function loadResetUserMfa(): Promise<ResetUserMfaModule> {
  return (await import(`${__dirname}/reset-user-mfa.ts`)) as ResetUserMfaModule;
}

describe('resetUserMfa behavior', () => {
  it('requires a reason and org-scoped target user', async () => {
    const { resetUserMfa } = await loadResetUserMfa();

    expect(await resetUserMfa({ targetUserId: TARGET_USER_ID, reason: '  ' })).toEqual({
      ok: false,
      error: 'invalid_input',
    });

    const result = await resetUserMfa({ targetUserId: TARGET_USER_ID, reason: 'Lost device' });
    expect(result.ok).toBe(true);

    const lookup = currentClient.calls.find((call) => call.sql.includes('from public.users'));
    expect(lookup?.params).toEqual([TARGET_USER_ID, ORG_ID]);
  });

  it('clears Supabase auth factors and app MFA tables, then audit-logs the reason', async () => {
    const { resetUserMfa } = await loadResetUserMfa();

    const result = await resetUserMfa({ targetUserId: TARGET_USER_ID, reason: 'Lost authenticator' });

    expect(result).toEqual({
      ok: true,
      data: { targetUserId: TARGET_USER_ID, factorsRemoved: 1, secretsCleared: true },
    });
    expect(_listFactors).toHaveBeenCalledWith({ userId: TARGET_USER_ID });
    expect(_deleteFactor).toHaveBeenCalledWith({ id: 'factor-1', userId: TARGET_USER_ID });
    expect(_deleteSecrets).toHaveBeenCalledWith(TARGET_USER_ID);
    expect(_deleteRecovery).toHaveBeenCalledWith(TARGET_USER_ID);
    expect(currentClient.auditRows[0]).toMatchObject({
      action: 'settings.user.mfa_reset',
      after_state: expect.objectContaining({ reason: 'Lost authenticator', target_user_id: TARGET_USER_ID }),
    });
    expect(_revalidateLocalized).toHaveBeenCalledWith('/settings/users');
  });

  it('returns forbidden when the caller lacks admin/deactivate permissions', async () => {
    currentClient.query = async (sql: string, params: unknown[] = []) => {
      currentClient.calls.push({ sql, params });
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (norm.includes('role_permissions')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    };
    const { resetUserMfa } = await loadResetUserMfa();

    const result = await resetUserMfa({ targetUserId: TARGET_USER_ID, reason: 'Lost device' });
    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(_listFactors).not.toHaveBeenCalled();
  });
});

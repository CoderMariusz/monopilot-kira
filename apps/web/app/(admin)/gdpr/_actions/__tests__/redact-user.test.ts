import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { _withOrgContextRunner } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
}));

// The action imports withOrgContext via `../../../../lib/auth/with-org-context`
// (resolved from the action file). From this test file that same module is one
// level deeper; mock both relative shapes plus the @/ alias to be robust.
vi.mock('../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));
vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));
vi.mock('@/lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));

const actionPath = resolve(__dirname, '../redact-user.ts');
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_USER_ID = '22222222-2222-4222-8222-222222222222';
const TARGET_USER_ID = '33333333-3333-4333-8333-333333333333';
const REQUIRED_PERMISSION = 'gdpr.erasure.execute';

type RedactUser = {
  redactUser: (input: { targetUserId: string }) => Promise<
    | { ok: true; data: { targetUserId: string; counts: Record<string, number> } }
    | { ok: false; error: string }
  >;
};

type QueryCall = { sql: string; params: unknown[] };
type FakeClient = {
  canErase: boolean;
  calls: QueryCall[];
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient({ canErase: true });
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ADMIN_USER_ID, orgId: ORG_ID, sessionToken: 'session-token-stub', client: currentClient }),
  );
});

describe('redactUser Server Action (T-089 AC3)', () => {
  it('admin with gdpr.erasure.execute runs gdpr_redact_user_pii and returns counts', async () => {
    const { redactUser } = await loadAction();

    const result = await redactUser({ targetUserId: TARGET_USER_ID });

    expect(result).toEqual({
      ok: true,
      data: { targetUserId: TARGET_USER_ID, counts: { product: 3, risks: 2 } },
    });
    expect(statementBlob()).toContain(REQUIRED_PERMISSION);
    const erase = callContaining('gdpr_redact_user_pii');
    expect(callBlob(erase)).toContain(TARGET_USER_ID);
  });

  it('non-admin (no permission) is rejected with forbidden and never calls the SQL function', async () => {
    currentClient = makeClient({ canErase: false });
    const { redactUser } = await loadAction();

    const result = await redactUser({ targetUserId: TARGET_USER_ID });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(statementBlob()).toContain(REQUIRED_PERMISSION);
    expect(indexOfCall('gdpr_redact_user_pii')).toBe(-1);
  });

  it('rejects invalid (non-uuid) target user id before touching the data plane', async () => {
    const { redactUser } = await loadAction();

    const result = await redactUser({ targetUserId: 'not-a-uuid' });

    expect(result).toEqual({ ok: false, error: 'invalid_input' });
    expect(currentClient.calls).toHaveLength(0);
  });
});

async function loadAction(): Promise<RedactUser> {
  expect(
    existsSync(actionPath),
    'apps/web/app/(admin)/gdpr/_actions/redact-user.ts must exist and export redactUser(input)',
  ).toBe(true);

  const mod = (await import(actionPath)) as Partial<RedactUser>;
  if (typeof mod.redactUser !== 'function') {
    expect.fail('redact-user.ts must export redactUser(input)');
  }
  return mod as RedactUser;
}

function makeClient({ canErase }: { canErase: boolean }): FakeClient {
  const calls: QueryCall[] = [];
  const client: FakeClient = {
    canErase,
    calls,
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();

      if (
        normalized.includes('user_roles') ||
        normalized.includes('role_permissions') ||
        normalized.includes('from public.roles')
      ) {
        return canErase ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (normalized.includes('gdpr_redact_user_pii')) {
        return { rows: [{ counts: { product: 3, risks: 2 } }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

function indexOfCall(fragment: string): number {
  return currentClient.calls.findIndex((call) => callBlob(call).toLowerCase().includes(fragment.toLowerCase()));
}

function callContaining(fragment: string): QueryCall {
  const index = indexOfCall(fragment);
  expect(index, `Expected SQL call containing ${fragment}`).toBeGreaterThanOrEqual(0);
  return currentClient.calls[index]!;
}

function callBlob(call: QueryCall): string {
  return `${call.sql} ${JSON.stringify(call.params)}`;
}

function statementBlob(): string {
  return currentClient.calls.map(callBlob).join('\n');
}

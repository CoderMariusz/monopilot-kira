/**
 * Behavior tests for SCIM provisioning token CRUD (TASK-000118/T-034).
 *
 * The CRUD Server Actions in apps/web/actions/scim/tokens.ts must:
 *   1. Enforce a fail-closed RBAC guard so an ordinary org member cannot
 *      mint a provisioning bearer token.
 *   2. Surface a real persistence failure when the underlying
 *      `public.scim_tokens` table is missing — never silently report ok=true.
 *   3. Hash with argon2id; never persist plaintext.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { _runWithOrgContext } = vi.hoisted(() => ({
  _runWithOrgContext: vi.fn(),
}));

vi.mock('@monopilot/db/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _runWithOrgContext(action),
  ),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _runWithOrgContext(action),
  ),
}));

vi.mock('argon2', () => ({
  default: { hash: vi.fn(async (value: string) => `$argon2id$v=19$hash::${value.slice(-4)}`) },
  hash: vi.fn(async (value: string) => `$argon2id$v=19$hash::${value.slice(-4)}`),
}));

type ScimTokenRow = {
  id: string;
  org_id: string;
  label: string;
  scim_token_hash: string;
  scim_token_last_four: string;
  created_at?: string;
  revoked_at?: string | null;
};

type FakeClient = {
  calls: Array<{ sql: string; params: readonly unknown[] }>;
  tokenRows: ScimTokenRow[];
  hasManagePermission: boolean;
  scimTokensTableMissing: boolean;
  query: (
    sql: string,
    params?: readonly unknown[],
  ) => Promise<{ rows: unknown[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_USER_ID = '22222222-2222-4222-8222-222222222222';

let currentClient: FakeClient;

function makeClient(options: { hasManagePermission?: boolean; scimTokensTableMissing?: boolean } = {}): FakeClient {
  const client: FakeClient = {
    calls: [],
    tokenRows: [],
    hasManagePermission: options.hasManagePermission ?? true,
    scimTokensTableMissing: options.scimTokensTableMissing ?? false,
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();

      // RBAC permission probe (covers role_permissions / roles.code / roles.slug joins)
      if (normalized.includes('from public.user_roles')) {
        return {
          rows: client.hasManagePermission ? [{ ok: true }] : [],
          rowCount: client.hasManagePermission ? 1 : 0,
        };
      }

      if (normalized.includes('public.scim_tokens')) {
        if (client.scimTokensTableMissing) {
          throw new Error('relation "public.scim_tokens" does not exist');
        }
        if (normalized.startsWith('insert into public.scim_tokens')) {
          const row: ScimTokenRow = {
            id: String(params[0]),
            org_id: String(params[1]),
            label: String(params[2]),
            scim_token_hash: String(params[3]),
            scim_token_last_four: String(params[4]),
            created_at: '2026-05-18T00:00:00Z',
            revoked_at: null,
          };
          client.tokenRows.push(row);
          return { rows: [row], rowCount: 1 };
        }
        if (normalized.startsWith('update public.scim_tokens')) {
          const id = String(params[0]);
          const row = client.tokenRows.find((r) => r.id === id);
          if (!row) return { rows: [], rowCount: 0 };
          row.revoked_at = String(params[2]);
          return { rows: [{ id: row.id, revoked_at: row.revoked_at }], rowCount: 1 };
        }
        if (normalized.startsWith('select') || normalized.startsWith('with')) {
          return {
            rows: client.tokenRows.map((r) => ({
              id: r.id,
              label: r.label,
              scim_token_last_four: r.scim_token_last_four,
              created_at: r.created_at,
              revoked_at: r.revoked_at ?? null,
            })),
            rowCount: client.tokenRows.length,
          };
        }
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  currentClient = makeClient();
  _runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'tkn', client: currentClient }),
  );
});

afterEach(() => {
  vi.resetModules();
});

describe('SCIM token CRUD RBAC and persistence (T-034 hardening)', () => {
  it('createScimToken refuses with FORBIDDEN when the caller lacks SCIM edit permission', async () => {
    currentClient = makeClient({ hasManagePermission: false });
    _runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'tkn', client: currentClient }),
    );

    const { createScimToken } = await import('./tokens.js');

    const result = await createScimToken({ label: 'attacker forgery' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('forbidden');
    }
    expect(currentClient.tokenRows, 'no SCIM token row may persist for unauthorized caller').toHaveLength(0);
  });

  it('listScimTokens refuses with FORBIDDEN for callers without SCIM edit permission', async () => {
    currentClient = makeClient({ hasManagePermission: false });
    _runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'tkn', client: currentClient }),
    );

    const { listScimTokens } = await import('./tokens.js');
    const result = await listScimTokens();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('forbidden');
    }
  });

  it('revokeScimToken refuses with FORBIDDEN for callers without SCIM edit permission', async () => {
    currentClient = makeClient({ hasManagePermission: false });
    _runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'tkn', client: currentClient }),
    );

    const { revokeScimToken } = await import('./tokens.js');
    const result = await revokeScimToken({ tokenId: '99999999-9999-4999-8999-999999999999' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('forbidden');
    }
  });

  it('createScimToken returns persistence_failed when public.scim_tokens table is missing', async () => {
    currentClient = makeClient({ scimTokensTableMissing: true });
    _runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'tkn', client: currentClient }),
    );

    const { createScimToken } = await import('./tokens.js');
    const result = await createScimToken({ label: 'okta' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('persistence_failed');
    }
  });

  it('createScimToken happy path stores argon2id hash and returns plaintext once', async () => {
    const { createScimToken } = await import('./tokens.js');
    const result = await createScimToken({ label: 'okta' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.plaintextToken).toMatch(/^scim_/);
      expect(currentClient.tokenRows).toHaveLength(1);
      expect(currentClient.tokenRows[0]!.scim_token_hash).toMatch(/^\$argon2id\$/);
      // last_four must come from the plaintext, not be inferred elsewhere.
      expect(currentClient.tokenRows[0]!.scim_token_last_four).toBe(result.data.plaintextToken.slice(-4));
    }
  });
});

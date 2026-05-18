import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  _mockVerifyScimBearer,
  _mockWithScimOrgContext,
  _mockOwnerQuery,
  _mockWithOrgContextRunner,
  _mockArgonHash,
  _mockRandomUUID,
} = vi.hoisted(() => ({
  _mockVerifyScimBearer: vi.fn(),
  _mockWithScimOrgContext: vi.fn(),
  _mockOwnerQuery: vi.fn(),
  _mockWithOrgContextRunner: vi.fn(),
  _mockArgonHash: vi.fn(),
  _mockRandomUUID: vi.fn(),
}));

vi.mock('../../../lib/scim/middleware', () => ({
  verifyScimBearer: _mockVerifyScimBearer,
  withScimOrgContext: _mockWithScimOrgContext,
  getScimOwnerPool: () => ({ query: _mockOwnerQuery }),
  scimUnauthorized: () =>
    new Response(
      JSON.stringify({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '401',
        detail: 'Invalid or missing bearer token',
        scimType: 'invalidToken',
      }),
      { status: 401, headers: { 'content-type': 'application/scim+json' } },
    ),
}));

vi.mock('@monopilot/db/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _mockWithOrgContextRunner(action),
  ),
}));

vi.mock('argon2', () => ({
  default: { hash: _mockArgonHash },
  hash: _mockArgonHash,
}));

vi.mock('node:crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto');
  return {
    ...actual,
    randomUUID: _mockRandomUUID,
  };
});

const repoRoot = resolve(__dirname, '../../../../..');
const usersRoutePath = resolve(repoRoot, 'apps/web/app/api/scim/v2/Users/route.ts');
const userRoutePath = resolve(repoRoot, 'apps/web/app/api/scim/v2/Users/[id]/route.ts');
const tokenActionsPath = resolve(repoRoot, 'apps/web/actions/scim/tokens.ts');

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_TOKEN = '33333333-3333-4333-8333-333333333333';
const SCIM_USER_ID = '44444444-4444-4444-8444-444444444444';
const CREATED_USER_ID = '55555555-5555-4555-8555-555555555555';
const CREATED_TOKEN_ID = '66666666-6666-4666-8666-666666666666';

type QueryCall = { sql: string; params: unknown[] };
type FakeUserRow = {
  id: string;
  email: string;
  display_name: string | null;
  external_id: string | null;
  deleted_at: Date | null;
};
type FakeClient = {
  calls: QueryCall[];
  user: FakeUserRow;
  insertedUsers: FakeUserRow[];
  tokenRows: Array<Record<string, unknown>>;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

type UsersRouteModule = { POST: (request: Request) => Promise<Response> };
type UserRouteModule = {
  PATCH: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
};
type TokenActionsModule = {
  createScimToken: (input: { label: string }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }>;
  listScimTokens: () => Promise<{ ok: boolean; data?: Array<Record<string, unknown>>; error?: string }>;
  revokeScimToken?: (input: { tokenId: string }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }>;
};

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient();
  _mockVerifyScimBearer.mockResolvedValue({ orgId: ORG_ID, tenantId: 'tenant-apex', sessionToken: SESSION_TOKEN });
  _mockWithScimOrgContext.mockImplementation(async (_ctx: unknown, action: (client: FakeClient) => Promise<unknown>) =>
    action(currentClient),
  );
  _mockWithOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, sessionToken: SESSION_TOKEN, client: currentClient }),
  );
  _mockOwnerQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  _mockArgonHash.mockResolvedValue('$argon2id$v=19$m=65536,t=3,p=4$hashed-scim-secret');
  _mockRandomUUID
    .mockReturnValueOnce(CREATED_USER_ID)
    .mockReturnValueOnce(CREATED_TOKEN_ID)
    .mockReturnValue('77777777-7777-4777-8777-777777777777');
});

describe('SCIM 2.0 endpoints + token CRUD (TASK-000118/T-034 RED)', () => {
  it('rejects POST /scim/v2/Users before insert when active users already meet the org seat limit', async () => {
    const { POST } = await loadUsersRoute();

    const response = await POST(
      scimJsonRequest('https://app.example.com/api/scim/v2/Users', {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'over.limit@apex.example.com',
        name: { givenName: 'Over', familyName: 'Limit' },
        active: true,
      }),
    );
    const body = await response.json();

    expect(response.status, 'SCIM user create must fail before INSERT when active user count >= organizations.seat_limit').toBe(409);
    expect(body).toMatchObject({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '409',
      scimType: 'tooMany',
    });
    expect(queryBlob()).toMatch(/seat_limit/i);
    expect(queryBlob()).toMatch(/count\s*\(|active/i);
    expect(currentClient.insertedUsers, 'seat-limit rejection must not insert a user').toHaveLength(0);
  });

  it('applies RFC 7644 PATCH replace operations to userName, displayName, and active', async () => {
    const { PATCH } = await loadUserRoute();

    const response = await PATCH(
      scimJsonRequest(`https://app.example.com/api/scim/v2/Users/${SCIM_USER_ID}`, {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          { op: 'replace', path: 'userName', value: 'renamed@example.com' },
          { op: 'replace', path: 'displayName', value: 'Renamed SCIM User' },
          { op: 'replace', path: 'active', value: false },
        ],
      }),
      { params: Promise.resolve({ id: SCIM_USER_ID }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: SCIM_USER_ID,
      userName: 'renamed@example.com',
      displayName: 'Renamed SCIM User',
      active: false,
    });
    expect(queryBlob()).toMatch(/update\s+public\.users/i);
    expect(queryBlob()).toMatch(/email|userName/i);
    expect(queryBlob()).toMatch(/display_name|displayName/i);
  });

  it('applies RFC 7644 PATCH add and remove operations without treating them as no-ops', async () => {
    const { PATCH } = await loadUserRoute();

    const response = await PATCH(
      scimJsonRequest(`https://app.example.com/api/scim/v2/Users/${SCIM_USER_ID}`, {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          { op: 'add', path: 'externalId', value: 'external-added' },
          { op: 'remove', path: 'displayName' },
        ],
      }),
      { params: Promise.resolve({ id: SCIM_USER_ID }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.externalId).toBe('external-added');
    expect(body.displayName, 'remove displayName must clear the SCIM attribute').toBeUndefined();
    expect(queryBlob()).toMatch(/update\s+public\.users/i);
    expect(queryBlob()).toMatch(/external_id|externalId/i);
    expect(queryBlob()).toMatch(/display_name\s*=\s*null|displayName/i);
  });

  it('creates SCIM tokens with plaintext returned once and never exposed by list', async () => {
    const { createScimToken, listScimTokens } = await loadTokenActions();

    const created = await createScimToken({ label: 'Okta SCIM' });
    expect(created.ok).toBe(true);
    const plaintext = String(created.data?.plaintextToken ?? '');
    expect(plaintext, 'createScimToken must return the one-time plaintext token').toMatch(/^scim_/);

    expect(currentClient.tokenRows).toHaveLength(1);
    expect(JSON.stringify(currentClient.tokenRows[0])).not.toContain(plaintext);
    expect(JSON.stringify(currentClient.tokenRows[0])).toContain('argon2id');

    const listed = await listScimTokens();
    expect(listed.ok).toBe(true);
    expect(JSON.stringify(listed.data)).not.toContain(plaintext);
    expect(listed.data?.[0]).not.toHaveProperty('plaintextToken');
    expect(listed.data?.[0]).toMatchObject({ label: 'Okta SCIM', lastFour: plaintext.slice(-4) });
  });
});

async function loadUsersRoute(): Promise<UsersRouteModule> {
  expect(existsSync(usersRoutePath), 'apps/web/app/api/scim/v2/Users/route.ts must exist').toBe(true);
  return (await import(usersRoutePath)) as UsersRouteModule;
}

async function loadUserRoute(): Promise<UserRouteModule> {
  expect(existsSync(userRoutePath), 'apps/web/app/api/scim/v2/Users/[id]/route.ts must exist').toBe(true);
  return (await import(userRoutePath)) as UserRouteModule;
}

async function loadTokenActions(): Promise<TokenActionsModule> {
  expect(existsSync(tokenActionsPath), 'apps/web/actions/scim/tokens.ts must exist for SCIM token CRUD').toBe(true);
  const mod = (await import(tokenActionsPath)) as Partial<TokenActionsModule>;
  expect(typeof mod.createScimToken, 'tokens.ts must export createScimToken(input)').toBe('function');
  expect(typeof mod.listScimTokens, 'tokens.ts must export listScimTokens()').toBe('function');
  return mod as TokenActionsModule;
}

function scimJsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: {
      authorization: 'Bearer scim_test_token_1234567890abcd',
      'content-type': 'application/scim+json',
      'x-request-id': '88888888-8888-4888-8888-888888888888',
    },
    body: JSON.stringify(body),
  });
}

function makeClient(): FakeClient {
  const calls: QueryCall[] = [];
  const tokenRows: Array<Record<string, unknown>> = [];
  const insertedUsers: FakeUserRow[] = [];
  const user: FakeUserRow = {
    id: SCIM_USER_ID,
    email: 'original@example.com',
    display_name: 'Original SCIM User',
    external_id: 'external-original',
    deleted_at: null,
  };

  const client: FakeClient = {
    calls,
    user,
    insertedUsers,
    tokenRows,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
      const blob = `${sql} ${JSON.stringify(params)}`;

      // Settings RBAC probe used by createScimToken / listScimTokens /
      // revokeScimToken. Grant the manage permission for the happy-path test.
      if (normalized.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (normalized.includes('from public.organizations') && normalized.includes('seat_limit')) {
        return { rows: [{ seat_limit: 1 }], rowCount: 1 };
      }
      if (normalized.includes('count') && normalized.includes('public.users')) {
        return { rows: [{ count: '1', active_count: '1' }], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.users')) {
        const row: FakeUserRow = {
          id: String(params[0] ?? CREATED_USER_ID),
          email: String(params[2] ?? 'created@example.com'),
          display_name: String(params[3] ?? 'Created User'),
          external_id: (params[4] as string | null | undefined) ?? null,
          deleted_at: null,
        };
        insertedUsers.push(row);
        return { rows: [row], rowCount: 1 };
      }
      if (normalized.includes('from public.users') && normalized.includes('where id')) {
        return { rows: [user], rowCount: 1 };
      }
      if (normalized.startsWith('update public.users')) {
        if (blob.includes('renamed@example.com')) user.email = 'renamed@example.com';
        if (blob.includes('Renamed SCIM User')) user.display_name = 'Renamed SCIM User';
        if (blob.includes('external-added')) user.external_id = 'external-added';
        if (/display_name\s*=\s*null/i.test(sql) || (normalized.includes('display_name') && normalized.includes('null'))) {
          user.display_name = null;
        }
        if (blob.includes('false') || /deleted_at\s*=\s*now\s*\(/i.test(sql)) user.deleted_at = new Date('2026-05-18T00:00:00Z');
        if (blob.includes('true') || /deleted_at\s*=\s*null/i.test(sql)) user.deleted_at = null;
        return { rows: [user], rowCount: 1 };
      }
      if (normalized.includes('insert') && normalized.includes('scim') && normalized.includes('token')) {
        const plaintextColumns = /plain(text)?_?token/i.test(sql);
        const row = {
          id: CREATED_TOKEN_ID,
          org_id: ORG_ID,
          label: 'Okta SCIM',
          scim_token_hash: '$argon2id$v=19$m=65536,t=3,p=4$hashed-scim-secret',
          scim_token_last_four: 'abcd',
          lastFour: 'abcd',
          ...(plaintextColumns ? { plaintext_token: params.find((param) => String(param).startsWith('scim_')) } : {}),
        };
        tokenRows.push(row);
        return { rows: [row], rowCount: 1 };
      }
      if (normalized.includes('select') && normalized.includes('scim') && normalized.includes('token')) {
        return {
          rows: tokenRows.map((row) => ({
            id: row.id,
            label: row.label,
            scim_token_last_four: row.scim_token_last_four,
            lastFour: row.lastFour,
            created_at: '2026-05-18T00:00:00.000Z',
          })),
          rowCount: tokenRows.length,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  return client;
}

function queryBlob(): string {
  return currentClient.calls.map((call) => `${call.sql} ${JSON.stringify(call.params)}`).join('\n');
}

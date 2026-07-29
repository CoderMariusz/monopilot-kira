import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ORG_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTOR_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PENDING_ID = '11111111-1111-4111-8111-111111111111';
const EXPIRED_ID = '22222222-2222-4222-8222-222222222222';
const ACCEPTED_ID = '33333333-3333-4333-8333-333333333333';
const REVOKED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
const ACTIVE_NATIVE_ID = '99999999-9999-4999-8999-999999999999';
const OTHER_ORG_ID_INVITE = '44444444-4444-4444-8444-444444444444';
const NOW = '2026-05-19T12:00:00.000Z';

const lifecycleActionPath = resolve(__dirname, 'invitations-lifecycle.ts');

const {
  _withOrgContextRunner,
  _mockGenerateLink,
  _operations,
  _revalidateLocalized,
  _mockCreateSupabaseAuthAdmin,
  _mockCreateServerSupabaseClient,
  _getResendConfiguration,
  _sendResendEmail,
} = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _mockGenerateLink: vi.fn(),
  _operations: [] as string[],
  _revalidateLocalized: vi.fn(),
  _mockCreateSupabaseAuthAdmin: vi.fn(),
  _mockCreateServerSupabaseClient: vi.fn(),
  _getResendConfiguration: vi.fn(),
  _sendResendEmail: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _withOrgContextRunner(action),
  ),
}));

vi.mock('../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: _revalidateLocalized,
}));

vi.mock('../email/resend', () => ({
  getResendConfiguration: _getResendConfiguration,
  sendResendEmail: _sendResendEmail,
}));

// `auth.admin.*` needs the SERVICE-ROLE client. The previous version of this
// suite hung generateLink off the request-scoped ANON client
// (createServerSupabaseClient), which made every assertion below pass against a
// client production would answer `not_admin` to. Mock the service-role factory,
// and keep a spy on the anon one so a regression back to it fails loudly.
vi.mock('./supabase-admin', () => ({
  createSupabaseAuthAdmin: _mockCreateSupabaseAuthAdmin.mockImplementation(async () => ({
    auth: {
      admin: {
        generateLink: _mockGenerateLink,
      },
    },
  })),
}));

vi.mock('../../lib/auth/supabase-server', () => ({
  createServerSupabaseClient: _mockCreateServerSupabaseClient.mockImplementation(async () => {
    throw new Error('resendInvitation must not mint invite links through the anon client');
  }),
}));

type InvitationRow = {
  id: string;
  org_id: string;
  email: string;
  role_name: string;
  role_id: string;
  invited_by: string | null;
  invited_by_actor_type: string | null;
  invited_by_name: string | null;
  invited_at: string;
  invite_token: string | null;
  invite_token_expires_at: string | null;
  is_active: boolean;
  accepted_at: string | null;
  /** Test-only: simulates audit_log presence when both token columns are cleared. */
  has_invite_audit?: boolean;
};

type QueryCall = { sql: string; params: unknown[] };
type EmailLogRow = {
  id: string;
  status: string;
  providerMessageId: string | null;
  lastErrorSummary: string | null;
};

type FakeClientOptions = {
  hasPermission: boolean;
  seatLimit: number | null;
  activeUsers: number;
  invitations: InvitationRow[];
};

type FakeClient = {
  calls: QueryCall[];
  updates: QueryCall[];
  outboxEvents: QueryCall[];
  auditLog: QueryCall[];
  emailLog: EmailLogRow[];
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

const baseInvitations: InvitationRow[] = [
  {
    id: PENDING_ID,
    org_id: ORG_ID,
    email: 'pending@example.com',
    role_name: 'QA Manager',
    role_id: '55555555-5555-4555-8555-555555555555',
    invited_by: ACTOR_USER_ID,
    invited_by_actor_type: 'user',
    invited_by_name: 'Owner User',
    invited_at: '2026-05-18T10:00:00.000Z',
    invite_token: 'pending-token',
    invite_token_expires_at: '2026-05-26T10:00:00.000Z',
    is_active: false,
    accepted_at: null,
  },
  {
    id: EXPIRED_ID,
    org_id: ORG_ID,
    email: 'expired@example.com',
    role_name: 'Planner',
    role_id: '66666666-6666-4666-8666-666666666666',
    invited_by: ACTOR_USER_ID,
    invited_by_actor_type: 'user',
    invited_by_name: 'Owner User',
    invited_at: '2026-05-01T10:00:00.000Z',
    invite_token: 'expired-token',
    invite_token_expires_at: '2026-05-08T10:00:00.000Z',
    is_active: false,
    accepted_at: null,
  },
  {
    id: ACCEPTED_ID,
    org_id: ORG_ID,
    email: 'accepted@example.com',
    role_name: 'Warehouse Lead',
    role_id: '77777777-7777-4777-8777-777777777777',
    invited_by: ACTOR_USER_ID,
    invited_by_actor_type: 'user',
    invited_by_name: 'Owner User',
    invited_at: '2026-05-10T10:00:00.000Z',
    invite_token: null,
    invite_token_expires_at: null,
    is_active: true,
    accepted_at: '2026-05-10T12:00:00.000Z',
    has_invite_audit: true,
  },
  {
    id: REVOKED_ID,
    org_id: ORG_ID,
    email: 'revoked@example.com',
    role_name: 'Viewer',
    role_id: '99999999-9999-4999-8999-999999999998',
    invited_by: ACTOR_USER_ID,
    invited_by_actor_type: 'user',
    invited_by_name: 'Owner User',
    invited_at: '2026-05-12T10:00:00.000Z',
    invite_token: null,
    invite_token_expires_at: '2026-05-20T10:00:00.000Z',
    is_active: false,
    accepted_at: null,
  },
  {
    id: ACTIVE_NATIVE_ID,
    org_id: ORG_ID,
    email: 'native@example.com',
    role_name: 'Operator',
    role_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac',
    invited_by: null,
    invited_by_actor_type: null,
    invited_by_name: null,
    invited_at: '2026-04-01T10:00:00.000Z',
    invite_token: null,
    invite_token_expires_at: null,
    is_active: true,
    accepted_at: null,
  },
  {
    id: OTHER_ORG_ID_INVITE,
    org_id: OTHER_ORG_ID,
    email: 'leak@example.com',
    role_name: 'Leaked Role',
    role_id: '88888888-8888-4888-8888-888888888888',
    invited_by: ACTOR_USER_ID,
    invited_by_actor_type: 'user',
    invited_by_name: 'Other Owner',
    invited_at: '2026-05-18T10:00:00.000Z',
    invite_token: 'other-org-token',
    invite_token_expires_at: '2026-05-26T10:00:00.000Z',
    is_active: false,
    accepted_at: null,
  },
];

let currentClient: FakeClient;

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function hasOrgScope(sql: string, params: unknown[]): boolean {
  const norm = normalizeSql(sql);
  return params.includes(ORG_ID) && (norm.includes('org_id') || norm.includes('app.current_org_id'));
}

function getInvitationId(params: unknown[]): string | undefined {
  return [PENDING_ID, EXPIRED_ID, ACCEPTED_ID, REVOKED_ID, ACTIVE_NATIVE_ID, OTHER_ORG_ID_INVITE].find((id) =>
    params.includes(id),
  );
}

function isInvitationLifecycleRow(row: InvitationRow): boolean {
  return (
    row.invite_token !== null ||
    row.invite_token_expires_at !== null ||
    row.has_invite_audit === true
  );
}

function eventType(params: unknown[]): string | undefined {
  return params.find((value) => typeof value === 'string' && value.startsWith('settings.')) as string | undefined;
}

function makeClient(opts: FakeClientOptions): FakeClient {
  const client: FakeClient = {
    calls: [],
    updates: [],
    outboxEvents: [],
    auditLog: [],
    emailLog: [],
    async query(sql: string, params: unknown[] = []) {
      client.calls.push({ sql, params });
      const norm = normalizeSql(sql);

      if (norm.startsWith('select') && norm.includes('user_roles')) {
        _operations.push('query:permission');
        return { rows: opts.hasPermission ? [{ ok: true }] : [], rowCount: opts.hasPermission ? 1 : 0 };
      }

      if (norm.startsWith('select seat_limit')) {
        _operations.push('query:seat_limit');
        return { rows: [{ seat_limit: opts.seatLimit }], rowCount: 1 };
      }

      if (norm.includes('count(*)') && norm.includes('from public.users')) {
        _operations.push('query:active_user_count');
        return { rows: [{ active_user_count: opts.activeUsers }], rowCount: 1 };
      }

      if ((norm.startsWith('select') || norm.startsWith('with')) && norm.includes('from public.users') && getInvitationId(params)) {
        _operations.push('query:invitation_lookup');
        const id = getInvitationId(params);
        const rows = opts.invitations.filter((row) => row.id === id && (!hasOrgScope(sql, params) || row.org_id === ORG_ID));
        return { rows, rowCount: rows.length };
      }

      if ((norm.startsWith('select') || norm.startsWith('with')) && norm.includes('from public.users')) {
        _operations.push('query:list_invitations');
        const rows = hasOrgScope(sql, params)
          ? opts.invitations.filter((row) => row.org_id === ORG_ID && isInvitationLifecycleRow(row))
          : opts.invitations.filter(isInvitationLifecycleRow);
        rows.sort((a, b) => {
          const byCreated = Date.parse(b.invited_at) - Date.parse(a.invited_at);
          if (byCreated !== 0) return byCreated;
          return a.email.localeCompare(b.email);
        });
        return { rows, rowCount: rows.length };
      }

      if (norm.startsWith('update public.users')) {
        _operations.push('query:update_user');
        client.updates.push({ sql, params });
        return { rows: [], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.outbox_events')) {
        _operations.push('query:outbox');
        client.outboxEvents.push({ sql, params });
        return { rows: [], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.audit_log')) {
        _operations.push('query:audit_log');
        client.auditLog.push({ sql, params });
        return { rows: [], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.email_delivery_log')) {
        _operations.push('query:email_log_insert');
        client.emailLog.push({
          id: String(params[0]),
          status: String(params[5]),
          providerMessageId: typeof params[6] === 'string' ? params[6] : null,
          lastErrorSummary: typeof params[7] === 'string' ? params[7] : null,
        });
        return { rows: [{ id: params[0] }], rowCount: 1 };
      }

      if (norm.startsWith('update public.email_delivery_log')) {
        _operations.push('query:email_log_update');
        const row = client.emailLog.find((entry) => entry.id === params[0]);
        if (!row) return { rows: [], rowCount: 0 };
        row.status = String(params[2]);
        row.providerMessageId = typeof params[3] === 'string' ? params[3] : null;
        row.lastErrorSummary = typeof params[4] === 'string' ? params[4] : null;
        return { rows: [{ id: row.id }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

type LifecycleModule = {
  listInvitations: () => Promise<unknown>;
  resendInvitation: (input: { invitationId: string; inviteToken: string }) => Promise<unknown>;
  revokeInvitation: (input: { invitationId: string; inviteToken: string }) => Promise<unknown>;
};

async function loadLifecycle(): Promise<LifecycleModule> {
  expect(
    existsSync(lifecycleActionPath),
    'apps/web/actions/users/invitations-lifecycle.ts must exist and export behavior-backed listInvitations/resendInvitation/revokeInvitation actions for SET-010',
  ).toBe(true);
  const mod = (await import(lifecycleActionPath)) as Record<string, unknown>;
  expect(typeof mod.listInvitations, 'listInvitations export').toBe('function');
  expect(typeof mod.resendInvitation, 'resendInvitation export').toBe('function');
  expect(typeof mod.revokeInvitation, 'revokeInvitation export').toBe('function');
  return mod as LifecycleModule;
}

function okData<T>(result: unknown): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { data: T }).data;
}

function expectError(result: unknown, error: string): void {
  expect(result).toEqual({ ok: false, error });
}

function resetClient(overrides: Partial<FakeClientOptions> = {}): FakeClient {
  currentClient = makeClient({
    hasPermission: true,
    seatLimit: 25,
    activeUsers: 5,
    invitations: baseInvitations,
    ...overrides,
  });
  return currentClient;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  vi.resetModules();
  vi.clearAllMocks();
  _operations.length = 0;
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
  _getResendConfiguration.mockReturnValue({
    ok: true,
    config: {
      apiKey: '[REDACTED_TEST_RESEND_KEY]',
      from: 'Monopilot <no-reply@example.test>',
    },
  });
  _sendResendEmail.mockResolvedValue({ status: 'sent', messageId: 'invite-message-123' });
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'session-token', client: currentClient }),
  );
  let tokenCounter = 0;
  _mockGenerateLink.mockImplementation(async ({ email }: { email: string }) => {
    tokenCounter += 1;
    _operations.push('auth:generateLink');
    return {
      data: { properties: { hashed_token: `new-token-${tokenCounter}` }, user: { email } },
      error: null,
    };
  });
  resetClient();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Pending Invitations lifecycle Server Actions (TASK-000208/T-124 RED)', () => {
  it('lists only invitation-lifecycle rows for the current org with attribution, revoked visibility, and no native active users', async () => {
    const { listInvitations } = await loadLifecycle();

    const data = okData<{ invitations: Array<Record<string, unknown>> }>(await listInvitations());

    expect(data.invitations.map((row) => row.email)).toEqual([
      'pending@example.com',
      'revoked@example.com',
      'accepted@example.com',
      'expired@example.com',
    ]);
    expect(data.invitations).not.toContainEqual(expect.objectContaining({ email: 'leak@example.com' }));
    expect(data.invitations).not.toContainEqual(expect.objectContaining({ email: 'native@example.com' }));
    expect(data.invitations[0]).toMatchObject({
      email: 'pending@example.com',
      role: 'QA Manager',
      invitedBy: 'Owner User',
      invitedByAttribution: 'user',
      invitedAt: '2026-05-18T10:00:00.000Z',
      expiresAt: '2026-05-26T10:00:00.000Z',
      status: 'pending',
      actions: { canResend: true, canRevoke: true },
    });
    expect(data.invitations[1]).toMatchObject({
      email: 'revoked@example.com',
      status: 'revoked',
      actions: { canResend: false, canRevoke: false },
    });
    expect(data.invitations[2]).toMatchObject({
      email: 'accepted@example.com',
      status: 'accepted',
      actions: { canResend: false, canRevoke: false },
    });
    expect(data.invitations[3]).toMatchObject({
      email: 'expired@example.com',
      status: 'expired',
      actions: { canResend: true, canRevoke: false },
    });
  });

  it('marks invitations without a known audit actor as unknown rather than System', async () => {
    resetClient({
      invitations: [
        {
          ...baseInvitations[0]!,
          invited_by: null,
          invited_by_actor_type: null,
          invited_by_name: null,
        },
      ],
    });
    const { listInvitations } = await loadLifecycle();

    const data = okData<{ invitations: Array<Record<string, unknown>> }>(await listInvitations());

    expect(data.invitations[0]).toMatchObject({
      invitedBy: null,
      invitedByAttribution: 'unknown',
    });
  });

  it('returns forbidden without reading invitations when the caller lacks invitation-management permission', async () => {
    resetClient({ hasPermission: false });
    const { listInvitations } = await loadLifecycle();

    expectError(await listInvitations(), 'forbidden');

    expect(_operations).toEqual(['query:permission']);
    expect(currentClient.updates).toHaveLength(0);
    expect(currentClient.outboxEvents).toHaveLength(0);
    expect(currentClient.auditLog).toHaveLength(0);
  });

  it('resends a pending invitation by preflighting seats, minting a fresh invite link, refreshing token/expiry, and auditing/outboxing atomically', async () => {
    const { resendInvitation } = await loadLifecycle();

    const data = okData<Record<string, unknown>>(
      await resendInvitation({ invitationId: PENDING_ID, inviteToken: 'pending-token' }),
    );

    expect(data).toMatchObject({ invitationId: PENDING_ID, email: 'pending@example.com', resendKind: 'pending' });
    expect(new Date(data.expiresAt as string).getTime()).toBeGreaterThan(new Date(NOW).getTime());
    // The link MUST be minted with the service-role client; the anon one answers
    // `not_admin` in production, which made this whole success path unreachable.
    expect(_mockCreateSupabaseAuthAdmin).toHaveBeenCalled();
    expect(_mockCreateServerSupabaseClient).not.toHaveBeenCalled();
    expect(data).toMatchObject({ delivery: 'email', messageId: 'invite-message-123' });
    expect(_sendResendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['pending@example.com'],
        text: expect.stringContaining('/api/auth/invite/accept?token=new-token-1'),
      }),
    );
    expect(_operations.indexOf('query:seat_limit')).toBeGreaterThan(_operations.indexOf('query:invitation_lookup'));
    expect(_operations.indexOf('query:active_user_count')).toBeGreaterThan(_operations.indexOf('query:seat_limit'));
    expect(_operations.indexOf('auth:generateLink')).toBeGreaterThan(_operations.indexOf('query:active_user_count'));
    expect(_mockGenerateLink).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'invite',
        email: 'pending@example.com',
        options: expect.objectContaining({ data: expect.objectContaining({ org_id: ORG_ID }) }),
      }),
    );
    expect(currentClient.updates).toHaveLength(1);
    expect(currentClient.updates[0].params).toContain(PENDING_ID);
    expect(currentClient.updates[0].params).toContain('new-token-1');
    expect(currentClient.outboxEvents.map((call) => eventType(call.params))).toContain('settings.user.invitation_resent');
    expect(currentClient.auditLog).toHaveLength(1);
    expect(currentClient.emailLog).toEqual([
      {
        id: expect.any(String),
        status: 'sent',
        providerMessageId: 'invite-message-123',
        lastErrorSummary: null,
      },
    ]);
  });

  it('resends an expired invitation and reports the expired resend path instead of treating it as immutable', async () => {
    const { resendInvitation } = await loadLifecycle();

    const data = okData<Record<string, unknown>>(
      await resendInvitation({ invitationId: EXPIRED_ID, inviteToken: 'expired-token' }),
    );

    expect(data).toMatchObject({ invitationId: EXPIRED_ID, email: 'expired@example.com', resendKind: 'expired' });
    expect(data.delivery).toBe('email');
    expect(currentClient.updates).toHaveLength(1);
    expect(currentClient.outboxEvents.map((call) => eventType(call.params))).toContain('settings.user.invitation_resent');
    expect(currentClient.auditLog).toHaveLength(1);
  });

  it('fails closed without mutating anything when the service-role credentials are absent', async () => {
    const { resendInvitation } = await loadLifecycle();
    // createSupabaseAuthAdmin throws when SUPABASE_SERVICE_ROLE_KEY is unset.
    // That must surface as invite_failed, never as a silent partial success that
    // rotates the token while the operator is told the invite went out.
    _mockCreateSupabaseAuthAdmin.mockImplementationOnce(async () => {
      throw new Error('privileged user actions require Supabase service-role env');
    });

    expectError(await resendInvitation({ invitationId: PENDING_ID, inviteToken: 'pending-token' }), 'invite_failed');

    expect(currentClient.updates).toHaveLength(0);
    expect(currentClient.outboxEvents).toHaveLength(0);
    expect(currentClient.auditLog).toHaveLength(0);
  });

  it('records failed and never sent when Resend configuration is missing', async () => {
    _getResendConfiguration.mockReturnValueOnce({
      ok: false,
      code: 'PROVIDER_NOT_CONFIGURED',
      reason: 'Missing required email environment variable: RESEND_API_KEY',
    });
    const { resendInvitation } = await loadLifecycle();

    expectError(await resendInvitation({ invitationId: PENDING_ID, inviteToken: 'pending-token' }), 'email_not_configured');

    expect(_sendResendEmail).not.toHaveBeenCalled();
    expect(currentClient.updates).toHaveLength(0);
    expect(currentClient.emailLog).toEqual([
      {
        id: expect.any(String),
        status: 'failed',
        providerMessageId: null,
        lastErrorSummary: expect.stringContaining('RESEND_API_KEY'),
      },
    ]);
    expect(currentClient.emailLog.some((row) => row.status === 'sent')).toBe(false);
  });

  it('changes the queued log to failed, never sent, when Resend rejects the invitation', async () => {
    _sendResendEmail.mockResolvedValueOnce({
      status: 'failed',
      code: 'PROVIDER_SEND_FAILED',
      reason: 'Resend rejected the request',
    });
    const { resendInvitation } = await loadLifecycle();

    expectError(await resendInvitation({ invitationId: PENDING_ID, inviteToken: 'pending-token' }), 'invite_failed');

    expect(currentClient.emailLog).toEqual([
      {
        id: expect.any(String),
        status: 'failed',
        providerMessageId: null,
        lastErrorSummary: 'Resend rejected the request',
      },
    ]);
    expect(currentClient.emailLog.some((row) => row.status === 'sent')).toBe(false);
  });

  it('revokes a pending invitation only, clears the active invite token but keeps expiry for audit listing, and writes audit/outbox records', async () => {
    const { revokeInvitation } = await loadLifecycle();

    const data = okData<Record<string, unknown>>(
      await revokeInvitation({ invitationId: PENDING_ID, inviteToken: 'pending-token' }),
    );

    expect(data).toMatchObject({ invitationId: PENDING_ID, status: 'revoked' });
    expect(_mockGenerateLink).not.toHaveBeenCalled();
    expect(currentClient.updates).toHaveLength(1);
    expect(currentClient.updates[0].params).toContain(PENDING_ID);
    expect(normalizeSql(currentClient.updates[0].sql)).not.toContain('invite_token_expires_at = null');
    expect(currentClient.outboxEvents.map((call) => eventType(call.params))).toContain('settings.user.invitation_revoked');
    expect(currentClient.auditLog).toHaveLength(1);
  });

  it('does not revoke or mutate accepted invitations through the invitation lifecycle', async () => {
    const { revokeInvitation } = await loadLifecycle();

    expectError(await revokeInvitation({ invitationId: ACCEPTED_ID, inviteToken: 'accepted-token' }), 'invalid_state');

    expect(_mockGenerateLink).not.toHaveBeenCalled();
    expect(currentClient.updates).toHaveLength(0);
    expect(currentClient.outboxEvents).toHaveLength(0);
    expect(currentClient.auditLog).toHaveLength(0);
  });

  it('returns typed blockers for seat-limit, stale-token, and cross-org failures without partial mutation', async () => {
    const { resendInvitation, revokeInvitation } = await loadLifecycle();

    resetClient({ seatLimit: 5, activeUsers: 5 });
    expectError(await resendInvitation({ invitationId: PENDING_ID, inviteToken: 'pending-token' }), 'seat_limit_exceeded');
    expect(_mockGenerateLink).not.toHaveBeenCalled();
    expect(currentClient.updates).toHaveLength(0);
    expect(currentClient.outboxEvents).toHaveLength(0);
    expect(currentClient.auditLog).toHaveLength(0);

    resetClient();
    expectError(await revokeInvitation({ invitationId: PENDING_ID, inviteToken: 'stale-token' }), 'stale_token');
    expect(currentClient.updates).toHaveLength(0);
    expect(currentClient.outboxEvents).toHaveLength(0);
    expect(currentClient.auditLog).toHaveLength(0);

    resetClient();
    expectError(await revokeInvitation({ invitationId: OTHER_ORG_ID_INVITE, inviteToken: 'other-org-token' }), 'not_found');
    expect(currentClient.updates).toHaveLength(0);
    expect(currentClient.outboxEvents).toHaveLength(0);
    expect(currentClient.auditLog).toHaveLength(0);
  });

  it('revalidates users and invitations routes after resendInvitation succeeds', async () => {
    const { resendInvitation } = await loadLifecycle();

    const result = await resendInvitation({ invitationId: PENDING_ID, inviteToken: 'pending-token' });

    expect(result).toMatchObject({ ok: true });
    expect(_revalidateLocalized).toHaveBeenCalledWith('/settings/users');
    expect(_revalidateLocalized).toHaveBeenCalledWith('/settings/invitations');
  });

  it('revalidates users and invitations routes after revokeInvitation succeeds', async () => {
    const { revokeInvitation } = await loadLifecycle();

    const result = await revokeInvitation({ invitationId: PENDING_ID, inviteToken: 'pending-token' });

    expect(result).toMatchObject({ ok: true });
    expect(_revalidateLocalized).toHaveBeenCalledWith('/settings/users');
    expect(_revalidateLocalized).toHaveBeenCalledWith('/settings/invitations');
  });
});

describe('invitation audit SQL contract', () => {
  it('joins audit_log.resource_id (text) to users.id via ::text and sorts by occurred_at with resource_type filter', () => {
    const source = readFileSync(lifecycleActionPath, 'utf8');
    const normalized = source.replace(/\s+/g, ' ');

    expect(normalized).toMatch(/al\.resource_id\s*=\s*u\.id::text/i);
    expect(normalized).toMatch(/order by al\.resource_id,\s*al\.occurred_at asc/i);
    // Both writers must be covered: inviteUser (invite.ts) stamps 'users' on the CREATION
    // row while resend/revoke use 'user_invitation'. Pinning a single value made the reader
    // match zero rows, so attribution silently fell through to Unknown — proven on production.
    expect(normalized).toMatch(/al\.resource_type\s+in\s*\(\s*'user_invitation',\s*'users'\s*\)/i);
    expect(normalized).not.toMatch(/al\.created_at/i);
    expect(normalized).not.toMatch(/al\.resource_id\s*=\s*u\.id(?!\s*::text)/i);
  });
});

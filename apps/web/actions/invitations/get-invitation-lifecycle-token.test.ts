import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INVITATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const { _withOrgContextRunner } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));

type QueryCall = { sql: string; params: readonly unknown[] };

type InvitationRow = {
  id: string;
  email: string;
  invite_token: string | null;
  invite_token_expires_at: string | Date | null;
  is_active: boolean | null;
};

type FakeClientOptions = {
  hasInvitePermission: boolean;
  invitation: InvitationRow | null;
};

type FakeClient = {
  calls: QueryCall[];
  auditEvents: Array<{ action: string; resourceId: string; afterState: Record<string, unknown> }>;
  query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

function makeClient(opts: FakeClientOptions): FakeClient {
  const client: FakeClient = {
    calls: [],
    auditEvents: [],
    async query(sql: string, params: readonly unknown[] = []) {
      client.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (normalized.includes('from public.user_roles') && normalized.includes('role_permissions')) {
        return {
          rows: opts.hasInvitePermission ? [{ ok: true }] : [],
          rowCount: opts.hasInvitePermission ? 1 : 0,
        };
      }

      if (normalized.includes('from public.users u') && normalized.includes('app.current_org_id()')) {
        return {
          rows: opts.invitation ? [opts.invitation] : [],
          rowCount: opts.invitation ? 1 : 0,
        };
      }

      if (normalized.startsWith('insert into public.audit_events')) {
        client.auditEvents.push({
          action: params[2] as string,
          resourceId: params[3] as string,
          afterState: JSON.parse(params[4] as string) as Record<string, unknown>,
        });
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

let currentClient: FakeClient;

async function loadAction(): Promise<typeof import('./get-invitation-lifecycle-token')> {
  return import('./get-invitation-lifecycle-token');
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client: currentClient }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getInvitationLifecycleToken', () => {
  it('throws forbidden when caller lacks the lifecycle permission', async () => {
    currentClient = makeClient({
      hasInvitePermission: false,
      invitation: {
        id: INVITATION_ID,
        email: 'pending@example.test',
        invite_token: 'secret-token',
        invite_token_expires_at: '2026-06-08T00:00:00.000Z',
        is_active: false,
      },
    });
    const { getInvitationLifecycleToken } = await loadAction();

    await expect(getInvitationLifecycleToken({ invitationId: INVITATION_ID })).rejects.toThrow('forbidden');
    expect(currentClient.auditEvents).toHaveLength(0);
  });

  it('throws not_found when the invitation is outside app.current_org_id scope', async () => {
    currentClient = makeClient({ hasInvitePermission: true, invitation: null });
    const { getInvitationLifecycleToken } = await loadAction();

    await expect(getInvitationLifecycleToken({ invitationId: INVITATION_ID })).rejects.toThrow('not_found');
    expect(currentClient.calls.some((call) => call.sql.includes('app.current_org_id()'))).toBe(true);
    expect(currentClient.auditEvents).toHaveLength(0);
  });

  it('throws non_pending for accepted, revoked, or expired invitations', async () => {
    currentClient = makeClient({
      hasInvitePermission: true,
      invitation: {
        id: INVITATION_ID,
        email: 'accepted@example.test',
        invite_token: 'secret-token',
        invite_token_expires_at: '2026-06-08T00:00:00.000Z',
        is_active: true,
      },
    });
    const { getInvitationLifecycleToken } = await loadAction();

    await expect(getInvitationLifecycleToken({ invitationId: INVITATION_ID })).rejects.toThrow('non_pending');
    expect(currentClient.auditEvents).toHaveLength(0);
  });

  it('returns the token for a pending current-org invitation and audit-logs access', async () => {
    currentClient = makeClient({
      hasInvitePermission: true,
      invitation: {
        id: INVITATION_ID,
        email: 'pending@example.test',
        invite_token: 'secret-token',
        invite_token_expires_at: '2026-06-08T00:00:00.000Z',
        is_active: false,
      },
    });
    const { getInvitationLifecycleToken } = await loadAction();

    await expect(getInvitationLifecycleToken({ invitationId: INVITATION_ID })).resolves.toEqual({ token: 'secret-token' });
    expect(currentClient.auditEvents).toEqual([
      {
        action: 'settings.user.invitation_lifecycle_token_accessed',
        resourceId: INVITATION_ID,
        afterState: expect.objectContaining({
          invitation_id: INVITATION_ID,
          email: 'pending@example.test',
          expires_at: '2026-06-08T00:00:00.000Z',
        }),
      },
    ]);
  });
});

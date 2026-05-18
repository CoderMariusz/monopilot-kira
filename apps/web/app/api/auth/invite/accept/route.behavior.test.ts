import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryCall = { sql: string; params: unknown[] };

type InviteRow = {
  id: string;
  email: string;
  invite_token: string | null;
  invite_token_expires_at: string | Date | null;
  is_active: boolean;
};

type FakeOwnerConn = {
  calls: QueryCall[];
  invites: InviteRow[];
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

function makeOwnerConn(invites: InviteRow[]): FakeOwnerConn {
  const calls: QueryCall[] = [];
  const conn: FakeOwnerConn = {
    calls,
    invites,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (norm.startsWith('select') && norm.includes('from public.users') && norm.includes('invite_token =')) {
        const token = params[0] as string;
        const row = invites.find((r) => r.invite_token === token);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }

      if (norm.startsWith('update public.users') && norm.includes('invite_token')) {
        const token = params[params.length - 1] as string;
        const row = invites.find((r) => r.invite_token === token);
        if (!row) return { rows: [], rowCount: 0 };
        if (!row.invite_token_expires_at || new Date(row.invite_token_expires_at).getTime() <= Date.now()) {
          return { rows: [], rowCount: 0 };
        }
        row.is_active = true;
        row.invite_token = null;
        row.invite_token_expires_at = null;
        return { rows: [{ id: row.id, email: row.email }], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return conn;
}

let currentConn: FakeOwnerConn;

vi.mock('@monopilot/db/clients', () => ({
  getOwnerConnection: () => currentConn,
}));

beforeEach(() => {
  vi.resetModules();
});

type RouteModule = typeof import('./route.ts');

async function loadRoute(): Promise<RouteModule> {
  const path = `${__dirname}/route.ts`;
  return (await import(path)) as RouteModule;
}

const TOKEN_VALID = 'valid-token-stub';
const TOKEN_EXPIRED = 'expired-token-stub';
const TOKEN_UNKNOWN = 'unknown-token';

function makeValidInvite(): InviteRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'invitee@apex.example.com',
    invite_token: TOKEN_VALID,
    invite_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
    is_active: false,
  };
}

function makeExpiredInvite(): InviteRow {
  return {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'old@apex.example.com',
    invite_token: TOKEN_EXPIRED,
    invite_token_expires_at: new Date(Date.now() - 60_000).toISOString(),
    is_active: false,
  };
}

describe('POST /api/auth/invite/accept (behavior)', () => {
  it('consumes a valid invite once: activates user and clears token', async () => {
    const valid = makeValidInvite();
    currentConn = makeOwnerConn([valid]);
    const route = await loadRoute();

    const res = await route.POST(
      new Request(`https://app.example.com/api/auth/invite/accept?token=${TOKEN_VALID}`, {
        method: 'POST',
      }),
    );
    expect(res.status).toBe(200);

    expect(valid.is_active).toBe(true);
    expect(valid.invite_token).toBeNull();
    expect(valid.invite_token_expires_at).toBeNull();
  });

  it('returns 410 for an expired invite without consuming it', async () => {
    const expired = makeExpiredInvite();
    currentConn = makeOwnerConn([expired]);
    const route = await loadRoute();

    const res = await route.POST(
      new Request(`https://app.example.com/api/auth/invite/accept?token=${TOKEN_EXPIRED}`, {
        method: 'POST',
      }),
    );
    expect(res.status).toBe(410);

    expect(expired.is_active).toBe(false);
    expect(expired.invite_token).toBe(TOKEN_EXPIRED);
  });

  it('rejects reuse of a consumed token (token already cleared)', async () => {
    const valid = makeValidInvite();
    currentConn = makeOwnerConn([valid]);
    const route = await loadRoute();

    const first = await route.POST(
      new Request(`https://app.example.com/api/auth/invite/accept?token=${TOKEN_VALID}`, {
        method: 'POST',
      }),
    );
    expect(first.status).toBe(200);
    expect(valid.invite_token).toBeNull();

    const second = await route.POST(
      new Request(`https://app.example.com/api/auth/invite/accept?token=${TOKEN_VALID}`, {
        method: 'POST',
      }),
    );
    expect([404, 410]).toContain(second.status);
  });

  it('returns 404 when the token is unknown', async () => {
    currentConn = makeOwnerConn([makeValidInvite()]);
    const route = await loadRoute();

    const res = await route.POST(
      new Request(`https://app.example.com/api/auth/invite/accept?token=${TOKEN_UNKNOWN}`, {
        method: 'POST',
      }),
    );
    expect(res.status).toBe(404);
  });
});

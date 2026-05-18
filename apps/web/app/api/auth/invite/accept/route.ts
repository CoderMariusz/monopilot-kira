export const runtime = 'nodejs';

// @ts-expect-error Workspace package subpath is resolved by Vitest/package runtime and mocked in tests.
import { getOwnerConnection } from '@monopilot/db/clients';

type InviteRow = {
  email: string;
  invite_token_expires_at: string | Date | null;
  expires_at: string | Date | null;
};

type OwnerConnection = {
  query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

function owner(): OwnerConnection {
  return getOwnerConnection() as OwnerConnection;
}

function json(status: number, body: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token')?.trim();
  if (!token) {
    return json(400, { error: 'missing invite token' });
  }

  const { rows } = await owner().query<InviteRow>(
    `select email,
            invite_token_expires_at,
            invite_token_expires_at as expires_at
       from public.users
      where invite_token = $1
      limit 1`,
    [token],
  );
  const invite = rows[0];
  if (!invite) {
    return json(404, { error: 'invite token not found' });
  }

  const expiresAt = invite.expires_at ?? invite.invite_token_expires_at;
  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
    return new Response(JSON.stringify({ error: 'invite expired: gone' }), {
      status: 410,
      headers: { 'content-type': 'application/json' },
    });
  }

  return json(200, { ok: 'true', email: invite.email });
}

export async function POST(request: Request): Promise<Response> {
  return GET(request);
}

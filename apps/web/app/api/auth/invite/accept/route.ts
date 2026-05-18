export const runtime = 'nodejs';

import { getOwnerConnection } from '@monopilot/db/clients';

type InviteRow = {
  id: string;
  org_id: string;
  email: string;
  invite_token_expires_at: string | Date | null;
};

type OwnerConnection = {
  query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
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

function gone(body: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status: 410,
    headers: { 'content-type': 'application/json' },
  });
}

async function lookupInvite(token: string): Promise<InviteRow | null> {
  const { rows } = await owner().query<InviteRow>(
    `select id, org_id, email, invite_token_expires_at
       from public.users
      where invite_token = $1
      limit 1`,
    [token],
  );
  return rows[0] ?? null;
}

function isExpired(expiresAt: InviteRow['invite_token_expires_at']): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() <= Date.now();
}

function tokenFromUrl(request: Request): string | null {
  return new URL(request.url).searchParams.get('token')?.trim() || null;
}

export async function GET(request: Request): Promise<Response> {
  const token = tokenFromUrl(request);
  if (!token) return json(400, { error: 'missing invite token' });

  const invite = await lookupInvite(token);
  if (!invite) return json(404, { error: 'invite token not found' });
  if (isExpired(invite.invite_token_expires_at)) return gone({ error: 'invite expired: gone' });

  return json(200, { ok: 'true', email: invite.email });
}

export async function POST(request: Request): Promise<Response> {
  const token = tokenFromUrl(request);
  if (!token) return json(400, { error: 'missing invite token' });

  // Single atomic consume: only an unexpired still-present token can be
  // activated. Concurrent/replayed requests see rowCount=0 and fail closed.
  const consumed = await owner().query<{ id: string; org_id: string; email: string }>(
    `update public.users
        set is_active = true,
            invite_token = null,
            invite_token_expires_at = null,
            updated_at = now()
      where invite_token = $1
        and invite_token_expires_at is not null
        and invite_token_expires_at > now()
     returning id, org_id, email`,
    [token],
  );
  const row = consumed.rows[0];
  if (!row) {
    const stale = await lookupInvite(token);
    if (stale && isExpired(stale.invite_token_expires_at)) return gone({ error: 'invite expired: gone' });
    return json(404, { error: 'invite token not found' });
  }

  await owner().query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values ($1::uuid, $2, 'user', $3::uuid, $4::jsonb, 'settings-invite-accept-v1')`,
    [
      row.org_id,
      'settings.user.accepted',
      row.id,
      JSON.stringify({ org_id: row.org_id, user_id: row.id, email: row.email }),
    ],
  );

  return json(200, { ok: 'true', email: row.email });
}

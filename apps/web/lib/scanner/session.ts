import { createHash, randomUUID } from 'node:crypto';

import type { QueryClient } from './db';

export type ScannerSessionMode = 'personal' | 'kiosk';

export type ScannerSessionRow = {
  id: string;
  org_id: string;
  user_id: string;
  device_id: string | null;
  site_id: string | null;
  line_id: string | null;
  shift: string | null;
  mode: ScannerSessionMode;
  session_token_hash: string;
  expires_at: Date;
  ended_at: Date | null;
  created_at: Date;
  last_seen_at: Date;
};

export type PublicScannerSession = {
  id: string;
  orgId: string;
  userId: string;
  deviceId: string | null;
  siteId: string | null;
  lineId: string | null;
  shift: string | null;
  mode: ScannerSessionMode;
  expiresAt: string;
};

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function hashScannerToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function toPublicScannerSession(row: ScannerSessionRow): PublicScannerSession {
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    deviceId: row.device_id,
    siteId: row.site_id,
    lineId: row.line_id,
    shift: row.shift,
    mode: row.mode,
    expiresAt: row.expires_at.toISOString(),
  };
}

export async function createScannerSession(
  client: QueryClient,
  input: {
    orgId: string;
    userId: string;
    deviceId?: string | null;
    mode?: ScannerSessionMode;
  },
): Promise<{ token: string; sessionId: string; expiresAt: string }> {
  const token = `${randomUUID()}${randomUUID()}`.replaceAll('-', '');
  const tokenHash = hashScannerToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const { rows } = await client.query<{ id: string; expires_at: Date }>(
    `insert into public.scanner_sessions (
       org_id,
       user_id,
       device_id,
       mode,
       session_token_hash,
       expires_at
     )
     values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::timestamptz)
     returning id, expires_at`,
    [
      input.orgId,
      input.userId,
      input.deviceId ?? null,
      input.mode ?? 'personal',
      tokenHash,
      expiresAt.toISOString(),
    ],
  );

  const row = rows[0];
  if (!row) {
    throw new Error('scanner session insert did not return a row');
  }

  return { token, sessionId: row.id, expiresAt: row.expires_at.toISOString() };
}

/**
 * Scanner bearer tokens are not Supabase sessions. Verification deliberately
 * uses the privileged DB client and constrains every lookup by the stored
 * session's org_id/user_id rather than relying on request cookies or
 * app.current_org_id().
 */
export async function verifyScannerSession(
  client: QueryClient,
  token: string,
): Promise<ScannerSessionRow | null> {
  const tokenHash = hashScannerToken(token);
  const { rows } = await client.query<ScannerSessionRow>(
    `update public.scanner_sessions
        set last_seen_at = now()
      where session_token_hash = $1
        and expires_at > now()
        and ended_at is null
      returning id, org_id, user_id, device_id, site_id, line_id, shift, mode,
                session_token_hash, expires_at, ended_at, created_at, last_seen_at`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function findScannerSessionForAudit(
  client: QueryClient,
  token: string,
): Promise<ScannerSessionRow | null> {
  const tokenHash = hashScannerToken(token);
  const { rows } = await client.query<ScannerSessionRow>(
    `select id, org_id, user_id, device_id, site_id, line_id, shift, mode,
            session_token_hash, expires_at, ended_at, created_at, last_seen_at
       from public.scanner_sessions
      where session_token_hash = $1
      limit 1`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createScannerSession, hashScannerToken, verifyScannerSession } from '../session';

type StoredSession = {
  id: string;
  org_id: string;
  user_id: string;
  device_id: string | null;
  site_id: string | null;
  line_id: string | null;
  shift: string | null;
  mode: 'personal' | 'kiosk';
  session_token_hash: string;
  expires_at: Date;
  ended_at: Date | null;
  created_at: Date;
  last_seen_at: Date;
};

function createMockClient() {
  const sessions: StoredSession[] = [];
  return {
    sessions,
    async query<T = unknown>(sql: string, params: readonly unknown[] = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (normalized.startsWith('insert into public.scanner_sessions')) {
        const row: StoredSession = {
          id: 'session-1',
          org_id: String(params[0]),
          user_id: String(params[1]),
          device_id: params[2] === null ? null : String(params[2]),
          site_id: null,
          line_id: null,
          shift: null,
          mode: params[3] as 'personal' | 'kiosk',
          session_token_hash: String(params[4]),
          expires_at: new Date(String(params[5])),
          ended_at: null,
          created_at: new Date('2026-06-10T10:00:00.000Z'),
          last_seen_at: new Date('2026-06-10T10:00:00.000Z'),
        };
        sessions.push(row);
        return { rows: [{ id: row.id, expires_at: row.expires_at }] as T[], rowCount: 1 };
      }

      if (normalized.startsWith('update public.scanner_sessions')) {
        const hash = String(params[0]);
        const row = sessions.find(
          (session) =>
            session.session_token_hash === hash &&
            session.expires_at.getTime() > Date.now() &&
            session.ended_at === null,
        );
        if (!row) return { rows: [] as T[], rowCount: 0 };
        row.last_seen_at = new Date(Date.now());
        return { rows: [row] as T[], rowCount: 1 };
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
}

describe('scanner session helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates an opaque token and stores only its sha256 hash', async () => {
    const client = createMockClient();

    const result = await createScannerSession(client, {
      orgId: '00000000-0000-0000-0000-000000000001',
      userId: '00000000-0000-0000-0000-000000000002',
      deviceId: '00000000-0000-0000-0000-000000000003',
      mode: 'kiosk',
    });

    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(client.sessions[0]?.session_token_hash).toBe(hashScannerToken(result.token));
    expect(client.sessions[0]?.session_token_hash).not.toBe(result.token);
    expect(result.expiresAt).toBe('2026-06-10T22:00:00.000Z');
  });

  it('verifies the token hash and bumps last_seen_at while active', async () => {
    const client = createMockClient();
    const created = await createScannerSession(client, {
      orgId: '00000000-0000-0000-0000-000000000001',
      userId: '00000000-0000-0000-0000-000000000002',
    });

    vi.setSystemTime(new Date('2026-06-10T11:00:00.000Z'));
    const verified = await verifyScannerSession(client, created.token);

    expect(verified?.id).toBe(created.sessionId);
    expect(verified?.last_seen_at.toISOString()).toBe('2026-06-10T11:00:00.000Z');
  });

  it('returns null for expired or ended sessions', async () => {
    const client = createMockClient();
    const created = await createScannerSession(client, {
      orgId: '00000000-0000-0000-0000-000000000001',
      userId: '00000000-0000-0000-0000-000000000002',
    });

    vi.setSystemTime(new Date('2026-06-10T23:00:00.000Z'));
    await expect(verifyScannerSession(client, created.token)).resolves.toBeNull();

    vi.setSystemTime(new Date('2026-06-10T11:00:00.000Z'));
    client.sessions[0]!.ended_at = new Date('2026-06-10T10:30:00.000Z');
    await expect(verifyScannerSession(client, created.token)).resolves.toBeNull();
  });
});

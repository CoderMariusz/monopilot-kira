import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScannerSessionRow } from '../../../../lib/scanner/session';

const fakeClient = { query: vi.fn() };
const requireScannerSessionMock = vi.fn();

const LP_ID = '60000000-0000-4000-8000-000000000001';
const session: ScannerSessionRow = {
  id: '10000000-0000-4000-8000-000000000001',
  org_id: '20000000-0000-4000-8000-000000000001',
  user_id: '30000000-0000-4000-8000-000000000001',
  device_id: '40000000-0000-4000-8000-000000000001',
  site_id: null,
  line_id: null,
  shift: null,
  mode: 'personal',
  session_token_hash: 'hash',
  expires_at: new Date('2030-01-01T00:00:00Z'),
  ended_at: null,
  created_at: new Date('2026-01-01T00:00:00Z'),
  last_seen_at: new Date('2026-01-01T00:00:00Z'),
};

vi.mock('../../../../lib/scanner/guard', () => ({
  requireScannerSession: (...args: unknown[]) => requireScannerSessionMock(...args),
}));

function request(body: Record<string, unknown>): Request {
  return new Request('https://web.test/api/scanner/lock-lp', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

describe('scanner lock-lp route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fakeClient.query.mockReset();
    fakeClient.query.mockResolvedValue({ rows: [{ stolen: false }] });
    requireScannerSessionMock.mockImplementation(async (_request, _body, _operation, fn) =>
      fn({ client: fakeClient, session, token: 'token' }),
    );
  });

  it('returns 403 without warehouse.stock.move', async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      const q = normalize(sql);
      if (q.includes('from public.user_roles') && q.includes('app.current_user_is_platform_admin')) {
        return { rows: [] };
      }
      if (q.includes('insert into public.scanner_audit_log')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const { POST } = await import('./route');

    const response = await POST(request({ lpId: LP_ID, acquire: true }) as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'forbidden' });
    expect(fakeClient.query.mock.calls.some((call) => normalize(String(call[0])).includes('update public.license_plates'))).toBe(false);
  });

  it('acquires the lock when warehouse.stock.move is granted', async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      const q = normalize(sql);
      if (q.includes('from public.user_roles') && q.includes('app.current_user_is_platform_admin')) {
        return { rows: [{ ok: true }] };
      }
      if (q.includes('update public.license_plates lp')) {
        return { rows: [{ stolen: false }] };
      }
      if (q.includes('insert into public.scanner_audit_log')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const { POST } = await import('./route');

    const response = await POST(request({ lpId: LP_ID, acquire: true }) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, locked: true });
  });
});

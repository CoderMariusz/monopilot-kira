import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScannerSessionRow } from '../../../../lib/scanner/session';

const fakeClient = {
  query: vi.fn(),
};

const requireScannerSessionMock = vi.fn();

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
  return new Request('https://web.test/api/scanner/context', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('scanner context route site access', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fakeClient.query.mockReset();
    fakeClient.query.mockResolvedValue({ rows: [] });
    requireScannerSessionMock.mockImplementation(async (_request, _body, _operation, fn) =>
      fn({ client: fakeClient, session, token: 'token' }),
    );
  });

  it('rejects non-uuid siteId with 400 before database casts', async () => {
    const { POST } = await import('./route');

    const response = await POST(request({ siteId: 'not-a-uuid' }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'invalid_site' });
    expect(requireScannerSessionMock).not.toHaveBeenCalled();
  });

  it('rejects an unassigned site with 403 through app.user_can_see_site', async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql === 'begin' || sql === 'commit' || sql === 'rollback') return { rows: [] };
      if (sql.includes('insert into app.session_org_contexts')) return { rows: [] };
      if (sql.includes('select app.set_org_context')) return { rows: [] };
      if (sql.includes('delete from app.session_org_contexts')) return { rows: [] };
      if (sql.includes('app.user_can_see_site(s.site_id)')) return { rows: [{ allowed: false }] };
      if (sql.includes('insert into public.scanner_audit_log')) return { rows: [] };
      return { rows: [] };
    });

    const { POST } = await import('./route');
    const response = await POST(request({ siteId: '50000000-0000-4000-8000-000000000001' }) as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'site_forbidden' });
    const siteGateSql = String(
      fakeClient.query.mock.calls.find((call) => String(call[0]).includes('app.user_can_see_site'))?.[0],
    );
    expect(siteGateSql).toContain('app.user_can_see_site(s.site_id)');
  });
});

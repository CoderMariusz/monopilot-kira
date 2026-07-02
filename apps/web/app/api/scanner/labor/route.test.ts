import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScannerSessionRow } from '../../../../lib/scanner/session';

const mocks = vi.hoisted(() => ({
  fakeClient: {
    query: vi.fn(),
  },
  requireScannerSession: vi.fn(),
  withScannerOrg: vi.fn(),
}));

const ORG_ID = '20000000-0000-4000-8000-000000000001';
const USER_ID = '30000000-0000-4000-8000-000000000001';
const WO_ID = '40000000-0000-4000-8000-000000000001';
const LINE_ID = '50000000-0000-4000-8000-000000000001';
const STARTED_AT = '2026-06-23T08:15:00.000Z';

const session: ScannerSessionRow = {
  id: '10000000-0000-4000-8000-000000000001',
  org_id: ORG_ID,
  user_id: USER_ID,
  device_id: '60000000-0000-4000-8000-000000000001',
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

const fakeClient = mocks.fakeClient;
const requireScannerSessionMock = mocks.requireScannerSession;
const withScannerOrgMock = mocks.withScannerOrg;

vi.mock('../../../../lib/scanner/guard', () => ({
  requireScannerSession: (...args: unknown[]) => requireScannerSessionMock(...args),
}));

vi.mock('../../../../lib/scanner/with-scanner-org', () => ({
  withScannerOrg: (...args: unknown[]) => withScannerOrgMock(...args),
}));

function request(body: Record<string, unknown>): Request {
  return new Request('https://web.test/api/scanner/labor', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest(woId = WO_ID): Request {
  return new Request(`https://web.test/api/scanner/labor?woId=${woId}`, {
    method: 'GET',
    headers: { authorization: 'Bearer token' },
  });
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function woLaborCalls(): Array<[string, readonly unknown[] | undefined]> {
  return fakeClient.query.mock.calls.filter((call) => normalize(String(call[0])).includes('public.wo_labor_log')) as Array<
    [string, readonly unknown[] | undefined]
  >;
}

describe('scanner labor route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fakeClient.query.mockReset();
    fakeClient.query.mockResolvedValue({ rows: [] });
    withScannerOrgMock.mockImplementation(async (...args: unknown[]) => {
      return (args[2] as (ctx: unknown) => Promise<unknown>)({
        client: fakeClient,
        session,
        orgId: session.org_id,
        userId: session.user_id,
      });
    });
    requireScannerSessionMock.mockImplementation(async (_request, _body, _operation, fn) =>
      fn({ client: fakeClient, session, token: 'token' }),
    );
  });

  // F1 fix: both missing WO (null → no row) and invisible WO (allowed=false) must
  // return the identical not-found shape — no existence oracle.
  it('GET returns 404 when the work order does not exist (no row)', async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      const q = normalize(String(sql));
      if (q.includes('from public.work_orders wo') && q.includes('limit 1')) {
        return { rows: [] }; // WO missing
      }
      return { rows: [] };
    });
    const { GET } = await import('./route');

    const response = await GET(getRequest() as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'not_found' });
  });

  it('GET returns 404 (not 403) when the work order exists but is not visible to the user', async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      const q = normalize(String(sql));
      if (q.includes('from public.work_orders wo') && q.includes('limit 1')) {
        return { rows: [{ allowed: false }] }; // WO exists, site hidden
      }
      return { rows: [] };
    });
    const { GET } = await import('./route');

    const response = await GET(getRequest() as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'not_found' });
  });

  it('POST returns 404 (not 403) when the work order exists but is not visible to the user', async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      const q = normalize(String(sql));
      if (q.includes('from public.work_orders wo') && q.includes('limit 1')) {
        return { rows: [{ allowed: false }] }; // WO exists, site hidden
      }
      return { rows: [] };
    });
    const { POST } = await import('./route');

    const response = await POST(request({ action: 'in', woId: WO_ID }) as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'not_found' });
  });

  it('POST returns 404 when the work order does not exist (no row)', async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      const q = normalize(String(sql));
      if (q.includes('from public.work_orders wo') && q.includes('limit 1')) {
        return { rows: [] }; // WO missing
      }
      return { rows: [] };
    });
    const { POST } = await import('./route');

    const response = await POST(request({ action: 'in', woId: WO_ID }) as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'not_found' });
  });

  it('returns 401 without scanner session', async () => {
    requireScannerSessionMock.mockResolvedValueOnce({ guardError: true, status: 401, error: 'missing_token' });
    const { POST } = await import('./route');

    const response = await POST(request({ action: 'in', woId: WO_ID }) as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'unauthorized' });
    expect(withScannerOrgMock).not.toHaveBeenCalled();
    expect(fakeClient.query).not.toHaveBeenCalled();
  });

  it('GET returns clocked_in with since when an open scanner labor row exists for the work order', async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      const q = normalize(String(sql));
      if (q.includes('from public.work_orders wo') && q.includes('limit 1')) {
        return { rows: [{ allowed: true }] };
      }
      if (q.includes('from public.wo_labor_log') && q.includes('ended_at is null')) {
        return { rows: [{ since: new Date(STARTED_AT) }] };
      }
      return { rows: [] };
    });
    const { GET } = await import('./route');

    const response = await GET(getRequest() as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ state: 'clocked_in', since: STARTED_AT });
    expect(requireScannerSessionMock.mock.calls[0][1]).toBeNull();
    expect(requireScannerSessionMock.mock.calls[0][2]).toBe('scanner.labor');

    const calls = woLaborCalls();
    expect(calls).toHaveLength(1);
    const lookup = calls[0];
    const q = normalize(lookup[0]);
    expect(q).toContain('select started_at as since');
    expect(q).toContain('from public.wo_labor_log');
    expect(q).toContain('org_id = app.current_org_id()');
    expect(q).toContain('user_id = $1::uuid');
    expect(q).toContain('wo_id = $2::uuid');
    expect(q).toContain('ended_at is null');
    expect(q).toContain('order by started_at desc');
    expect(q).toContain('limit 1');
    expect(lookup[1]).toEqual([USER_ID, WO_ID]);
  });

  it('GET returns clocked_out when no open scanner labor row exists for the work order', async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      const q = normalize(String(sql));
      if (q.includes('from public.work_orders wo') && q.includes('limit 1')) {
        return { rows: [{ allowed: true }] };
      }
      return { rows: [] };
    });
    const { GET } = await import('./route');

    const response = await GET(getRequest() as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ state: 'clocked_out' });

    const calls = woLaborCalls();
    expect(calls).toHaveLength(1);
    const lookup = calls[0];
    expect(normalize(lookup[0])).toContain('from public.wo_labor_log');
    expect(lookup[1]).toEqual([USER_ID, WO_ID]);
  });

  it("action='in' inserts scanner wo_labor_log row after closing the user's prior open row", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      const q = normalize(String(sql));
      if (q.includes('from public.work_orders wo') && q.includes('limit 1')) {
        return { rows: [{ allowed: true }] };
      }
      return { rows: [] };
    });
    const { POST } = await import('./route');

    const response = await POST(request({ action: 'in', woId: WO_ID, lineId: LINE_ID }) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, state: 'clocked_in' });

    const calls = woLaborCalls();
    expect(calls).toHaveLength(2);

    const close = calls[0];
    expect(normalize(close[0])).toContain('update public.wo_labor_log');
    expect(normalize(close[0])).toContain('set ended_at = pg_catalog.now()');
    expect(normalize(close[0])).toContain('org_id = app.current_org_id()');
    expect(normalize(close[0])).toContain('user_id = $1::uuid');
    expect(normalize(close[0])).toContain('ended_at is null');
    expect(normalize(close[0])).not.toContain('wo_id = $2::uuid');
    expect(close[1]).toEqual([USER_ID]);

    const insert = calls[1];
    expect(normalize(insert[0])).toContain('insert into public.wo_labor_log');
    expect(normalize(insert[0])).toContain('(org_id, wo_id, user_id, line_id, source, started_at, ended_at)');
    expect(normalize(insert[0])).toContain('app.current_org_id()');
    expect(normalize(insert[0])).toContain('pg_catalog.now()');
    expect(insert[1]).toEqual([WO_ID, USER_ID, LINE_ID, 'scanner']);
  });

  it("action='out' closes the user's open log for the work order", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      const q = normalize(String(sql));
      if (q.includes('from public.work_orders wo') && q.includes('limit 1')) {
        return { rows: [{ allowed: true }] };
      }
      return { rows: [] };
    });
    const { POST } = await import('./route');

    const response = await POST(request({ action: 'out', woId: WO_ID }) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, state: 'clocked_out' });

    const calls = woLaborCalls();
    expect(calls).toHaveLength(1);
    const close = calls[0];
    const q = normalize(close[0]);
    expect(q).toContain('update public.wo_labor_log');
    expect(q).toContain('set ended_at = pg_catalog.now()');
    expect(q).toContain('org_id = app.current_org_id()');
    expect(q).toContain('user_id = $1::uuid');
    expect(q).toContain('wo_id = $2::uuid');
    expect(q).toContain('ended_at is null');
    expect(close[1]).toEqual([USER_ID, WO_ID]);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScannerSessionRow } from '../../../../../lib/scanner/session';

const session: ScannerSessionRow = {
  id: '10000000-0000-0000-0000-000000000001',
  org_id: '20000000-0000-0000-0000-000000000001',
  user_id: '30000000-0000-0000-0000-000000000001',
  device_id: '40000000-0000-0000-0000-000000000001',
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

const fakeClient = {
  query: vi.fn(),
};

const withScannerOrgMock = vi.fn(async (...args: unknown[]) => {
  return (args[2] as (ctx: unknown) => Promise<unknown>)({
    client: fakeClient,
    session,
    orgId: session.org_id,
    userId: session.user_id,
  });
});

vi.mock('../../../../../lib/scanner/guard', () => ({
  requireScannerSession: vi.fn(async (_request, _body, _operation, fn) =>
    fn({ client: fakeClient, session, token: 'token' }),
  ),
}));

vi.mock('../../../../../lib/scanner/with-scanner-org', () => ({
  withScannerOrg: (...args: unknown[]) => withScannerOrgMock(...args),
}));

function request(code: string): Request {
  return new Request(`https://web.test/api/warehouse/scanner/location?code=${encodeURIComponent(code)}`, {
    method: 'GET',
    headers: { authorization: 'Bearer token' },
  });
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

describe('warehouse scanner location route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeClient.query.mockReset();
  });

  it('returns the first org-scoped location match with warehouse code', async () => {
    const { GET } = await import('./route');
    fakeClient.query.mockResolvedValue({
      rows: [{
        id: '70000000-0000-4000-8000-000000000001',
        code: 'A-01',
        name: 'Aisle 01',
        warehouse_id: '80000000-0000-4000-8000-000000000001',
        warehouse_code: 'WH-1',
        location_type: 'rack',
      }],
    });

    const response = await GET(request('A-01') as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      location: {
        id: '70000000-0000-4000-8000-000000000001',
        code: 'A-01',
        name: 'Aisle 01',
        warehouseId: '80000000-0000-4000-8000-000000000001',
        warehouseCode: 'WH-1',
        locationType: 'rack',
      },
    });
    expect(withScannerOrgMock).toHaveBeenCalledTimes(1);

    const [sql, params] = fakeClient.query.mock.calls[0] as [string, unknown[]];
    const q = normalize(sql);
    expect(q).toContain('from public.locations loc');
    expect(q).toContain('join public.warehouses w');
    expect(q).toContain('loc.org_id = app.current_org_id()');
    expect(q).toContain('w.org_id = app.current_org_id()');
    expect(q).toContain('loc.code = $1');
    expect(q).toContain('lower(loc.code) = lower($1)');
    expect(q).toContain('loc.id = $2::uuid');
    expect(q).toContain('when loc.code = $1 then 1');
    expect(q).toContain('when lower(loc.code) = lower($1) then 2');
    expect(q).toContain('when $2::uuid is not null and loc.id = $2::uuid then 3');
    expect(params).toEqual(['A-01', null]);
  });

  it('passes uuid input as the id match candidate', async () => {
    const { GET } = await import('./route');
    const id = '70000000-0000-4000-8000-000000000001';
    fakeClient.query.mockResolvedValue({
      rows: [{
        id,
        code: 'A-01',
        name: 'Aisle 01',
        warehouse_id: '80000000-0000-4000-8000-000000000001',
        warehouse_code: 'WH-1',
        location_type: 'rack',
      }],
    });

    const response = await GET(request(id) as never);

    expect(response.status).toBe(200);
    expect(fakeClient.query.mock.calls[0]?.[1]).toEqual([id, id]);
  });

  it('returns location_not_found when no match exists', async () => {
    const { GET } = await import('./route');
    fakeClient.query.mockResolvedValue({ rows: [] });

    const response = await GET(request('MISSING') as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'location_not_found' });
  });
});

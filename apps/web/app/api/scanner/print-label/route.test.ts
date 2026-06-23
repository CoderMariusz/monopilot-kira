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
const SITE_ID = '40000000-0000-4000-8000-000000000001';
const LP_ID = '50000000-0000-4000-8000-000000000001';
const ITEM_ID = '60000000-0000-4000-8000-000000000001';
const JOB_ID = '70000000-0000-4000-8000-000000000001';

const session: ScannerSessionRow = {
  id: '10000000-0000-4000-8000-000000000001',
  org_id: ORG_ID,
  user_id: USER_ID,
  device_id: '80000000-0000-4000-8000-000000000001',
  site_id: SITE_ID,
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

function request(lpId = LP_ID): Request {
  return new Request('https://web.test/api/scanner/print-label', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify({ lpId }),
  });
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function setupQueries(options: { lpFound?: boolean } = {}) {
  const lpFound = options.lpFound ?? true;
  fakeClient.query.mockImplementation(async (sql: string, params?: readonly unknown[]) => {
    const q = normalize(sql);
    if (q === 'begin' || q === 'commit' || q === 'rollback') return { rows: [] };
    if (q.includes('insert into app.session_org_contexts')) return { rows: [] };
    if (q.includes('select app.set_org_context')) return { rows: [] };
    if (q.includes('delete from app.session_org_contexts')) return { rows: [] };
    if (q.includes('from public.user_roles')) return { rows: [{ ok: true }] };
    if (q.includes('from public.license_plates lp')) {
      return {
        rows: lpFound
          ? [{
              entity_id: LP_ID,
              site_id: SITE_ID,
              lp_code: 'LP-0001',
              item_id: ITEM_ID,
              gs1_gtin: '01234567890123',
              batch_lot: 'LOT-A',
              expiry_date: '2026-07-31',
              catch_weight_kg: '12.500000',
            }]
          : [],
      };
    }
    if (q.startsWith('insert into public.print_jobs')) {
      return {
        rows: [{
          id: JOB_ID,
          status: 'sent',
          result_url: String(params?.[8] ?? ''),
        }],
      };
    }
    return { rows: [] };
  });
}

function printJobInsertCall(): [string, readonly unknown[]] | undefined {
  return fakeClient.query.mock.calls.find((call) => normalize(String(call[0])).startsWith('insert into public.print_jobs')) as
    | [string, readonly unknown[]]
    | undefined;
}

describe('scanner print-label route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fakeClient.query.mockReset();
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
    setupQueries();
  });

  it('returns 401 when there is no valid scanner session', async () => {
    requireScannerSessionMock.mockResolvedValueOnce({ guardError: true, status: 401, error: 'invalid_session' });
    const { POST } = await import('./route');

    const response = await POST(request() as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_session' });
    expect(withScannerOrgMock).not.toHaveBeenCalled();
    expect(fakeClient.query).not.toHaveBeenCalled();
  });

  it('returns 200 and inserts a sent print_jobs row for a valid scanner session and LP', async () => {
    const { POST } = await import('./route');

    const response = await POST(request() as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      job: {
        id: JOB_ID,
        status: 'sent',
      },
    });
    expect(body.job.result_url).toMatch(/^data:text\/plain;charset=utf-8,/);

    const permissionCall = fakeClient.query.mock.calls.find((call) => normalize(String(call[0])).includes('from public.user_roles'));
    expect(permissionCall?.[1]).toEqual([
      USER_ID,
      ORG_ID,
      ['settings.org.update', 'warehouse.grn.receive', 'warehouse.stock.move', 'production.output.write'],
    ]);

    const lpCall = fakeClient.query.mock.calls.find((call) => normalize(String(call[0])).includes('from public.license_plates lp'));
    expect(normalize(String(lpCall?.[0]))).toContain('coalesce(lp.lp_code, lp.lp_number) as lp_code');
    expect(normalize(String(lpCall?.[0]))).toContain('i.gs1_gtin');
    expect(normalize(String(lpCall?.[0]))).toContain('coalesce(lp.batch_number, lp.supplier_batch_number) as batch_lot');
    expect(normalize(String(lpCall?.[0]))).toContain('lp.expiry_date::date::text as expiry_date');
    expect(normalize(String(lpCall?.[0]))).toContain('lp.catch_weight_kg::text');
    expect(lpCall?.[1]).toEqual([LP_ID]);

    const insert = printJobInsertCall();
    expect(insert).toBeDefined();
    expect(normalize(insert![0])).toContain('insert into public.print_jobs');
    expect(normalize(insert![0])).toContain('app.current_org_id()');
    expect(insert![1][0]).toBe(SITE_ID);
    expect(insert![1][1]).toBeNull();
    expect(insert![1][2]).toBeNull();
    expect(insert![1][3]).toBe('lp');
    expect(insert![1][4]).toBe(LP_ID);
    expect(insert![1][5]).toBe(1);
    expect(JSON.parse(String(insert![1][6]))).toMatchObject({
      entity_type: 'lp',
      entity_id: LP_ID,
      lp_code: 'LP-0001',
      item_id: ITEM_ID,
      gs1_gtin: '01234567890123',
      lot: 'LOT-A',
      expiry_date: '2026-07-31',
      catch_weight_kg: '12.500000',
    });
    expect(insert![1][7]).toBe('sent');
    expect(String(insert![1][8])).toMatch(/^data:text\/plain;charset=utf-8,/);
    expect(insert![1][9]).toBe(USER_ID);
  });

  it('returns 404 when the LP is missing', async () => {
    setupQueries({ lpFound: false });
    const { POST } = await import('./route');

    const response = await POST(request() as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'LP not found' });
    expect(printJobInsertCall()).toBeUndefined();
  });
});

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

const LP_ID = '50000000-0000-0000-0000-000000000001';
const PRODUCT_ID = '60000000-0000-0000-0000-000000000001';
const INSPECTION_ID = '70000000-0000-0000-0000-000000000001';
const HOLD_ID = '80000000-0000-0000-0000-000000000001';

const fakeClient = {
  query: vi.fn(),
};

let allowPermission = true;

vi.mock('../../../../../lib/scanner/guard', () => ({
  requireScannerSession: vi.fn(async (_request, _body, _operation, fn) =>
    fn({ client: fakeClient, session, token: 'token' }),
  ),
}));

vi.mock('../../../../../lib/scanner/with-scanner-org', () => ({
  withScannerOrg: vi.fn(async (_client, _session, fn) =>
    fn({ client: fakeClient, session, orgId: session.org_id, userId: session.user_id }),
  ),
}));

vi.mock('../../../../../lib/production/shared', () => ({
  hasPermission: vi.fn(async () => allowPermission),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function request(body: Record<string, unknown>): Request {
  return new Request('https://web.test/api/quality/scanner/inspect', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('quality scanner inspect route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allowPermission = true;
    fakeClient.query.mockReset();
    fakeClient.query.mockImplementation(async (sql: string) => {
      const q = normalize(sql);

      if (q.includes('from public.scanner_audit_log') && q.includes('client_op_id')) {
        return { rows: [], rowCount: 0 };
      }
      if (q.startsWith('select id::text, product_id::text')) {
        return { rows: [{ id: LP_ID, product_id: PRODUCT_ID }], rowCount: 1 };
      }
      if (q.startsWith('insert into public.quality_inspections')) {
        return { rows: [{ id: INSPECTION_ID }], rowCount: 1 };
      }
      if (q.startsWith('update public.license_plates')) {
        return { rows: [{ id: LP_ID }], rowCount: 1 };
      }
      if (q.startsWith('insert into public.quality_holds')) {
        return { rows: [{ id: HOLD_ID, hold_number: 'HLD-00000001' }], rowCount: 1 };
      }
      if (q.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('select id::text, quantity::text')) {
        return { rows: [{ id: LP_ID, quantity: '12.000000' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
  });

  it('creates a held LP inspection, updates qa_status, creates a hold, and writes idempotency audit', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      request({
        clientOpId: 'inspect-op-1',
        lpId: LP_ID,
        decision: 'hold',
        note: 'seal broken',
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      inspectionId: INSPECTION_ID,
      qaStatus: 'on_hold',
    });
    expect(fakeClient.query.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining(['begin', 'commit']));
    expect(fakeClient.query.mock.calls.some((call) => normalize(String(call[0])).includes('pg_advisory_xact_lock'))).toBe(true);
    const inspectionInsert = fakeClient.query.mock.calls.find((call) =>
      normalize(String(call[0])).startsWith('insert into public.quality_inspections'),
    );
    expect(inspectionInsert?.[1]).toEqual([LP_ID, PRODUCT_ID, 'on_hold', 'seal broken', session.user_id]);
    const lpUpdate = fakeClient.query.mock.calls.find((call) =>
      normalize(String(call[0])).startsWith('update public.license_plates'),
    );
    expect(lpUpdate?.[1]).toEqual([LP_ID, 'on_hold', session.user_id, ['consumed', 'merged', 'shipped', 'returned']]);
    expect(fakeClient.query.mock.calls.some((call) => normalize(String(call[0])).startsWith('insert into public.quality_holds'))).toBe(true);
    // The scanner fast-path hold MUST emit the canonical quality.hold.created event.
    const outboxInsert = fakeClient.query.mock.calls.find((call) =>
      normalize(String(call[0])).startsWith('insert into public.outbox_events'),
    );
    expect(outboxInsert).toBeTruthy();
    expect(normalize(String(outboxInsert?.[0]))).toContain("'quality.hold.created'");
    expect(outboxInsert?.[1]?.[0]).toBe(HOLD_ID);
    const outboxPayload = JSON.parse(String(outboxInsert?.[1]?.[1] ?? '{}'));
    expect(outboxPayload).toMatchObject({
      holdId: HOLD_ID,
      holdNumber: 'HLD-00000001',
      referenceType: 'lp',
      referenceId: LP_ID,
      lpIds: [LP_ID],
      source: 'scanner_inspection',
    });
    const auditInsert = fakeClient.query.mock.calls.find((call) =>
      normalize(String(call[0])).startsWith('insert into public.scanner_audit_log') &&
      JSON.stringify(call[1] ?? []).includes('inspect-op-1'),
    );
    expect(auditInsert).toBeTruthy();
  });

  it('returns replay without creating another inspection', async () => {
    const { POST } = await import('./route');
    fakeClient.query.mockImplementation(async (sql: string) => {
      const q = normalize(sql);
      if (q.includes('from public.scanner_audit_log') && q.includes('client_op_id')) {
        return { rows: [{ inspection_id: INSPECTION_ID, qa_status: 'released' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const response = await POST(
      request({
        clientOpId: 'inspect-replay',
        lpId: LP_ID,
        decision: 'pass',
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      inspectionId: INSPECTION_ID,
      qaStatus: 'released',
      replay: true,
    });
    expect(fakeClient.query.mock.calls.some((call) => normalize(String(call[0])).startsWith('insert into public.quality_inspections'))).toBe(false);
  });

  it('returns forbidden when the scanner user lacks quality.inspection.execute', async () => {
    const { POST } = await import('./route');
    allowPermission = false;

    const response = await POST(
      request({
        clientOpId: 'inspect-forbidden',
        lpId: LP_ID,
        decision: 'pass',
      }) as never,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'forbidden' });
    expect(fakeClient.query.mock.calls.some((call) => normalize(String(call[0])).startsWith('insert into public.quality_inspections'))).toBe(false);
  });

  it('returns lp_not_found without committing mutations', async () => {
    const { POST } = await import('./route');
    fakeClient.query.mockImplementation(async (sql: string) => {
      const q = normalize(sql);
      if (q.includes('from public.scanner_audit_log') && q.includes('client_op_id')) {
        return { rows: [], rowCount: 0 };
      }
      if (q.startsWith('select id::text, product_id::text')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    const response = await POST(
      request({
        clientOpId: 'inspect-missing-lp',
        lpId: LP_ID,
        decision: 'fail',
      }) as never,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'lp_not_found' });
    expect(fakeClient.query.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining(['rollback']));
    expect(fakeClient.query.mock.calls.some((call) => normalize(String(call[0])).startsWith('insert into public.quality_inspections'))).toBe(false);
  });
});

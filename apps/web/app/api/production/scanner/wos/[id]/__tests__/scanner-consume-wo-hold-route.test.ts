import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScannerSessionRow } from '../../../../../../../lib/scanner/session';

const session: ScannerSessionRow = {
  id: '10000000-0000-0000-0000-000000000001',
  org_id: '20000000-0000-0000-0000-000000000001',
  user_id: '30000000-0000-0000-0000-000000000001',
  device_id: '40000000-0000-0000-0000-000000000001',
  site_id: null,
  line_id: '50000000-0000-0000-0000-000000000001',
  shift: 'A',
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

vi.mock('../../../../../../../lib/scanner/guard', () => ({
  requireScannerSession: vi.fn(async (_request, _body, _operation, fn) =>
    fn({ client: fakeClient, session, token: 'token' }),
  ),
}));

vi.mock('../../../../../../../lib/scanner/txn-org-context', () => ({
  registerTxnOrgContext: vi.fn(async () => 'txn-org-token'),
  cleanupTxnOrgContext: vi.fn(async () => undefined),
}));

function request(body: Record<string, unknown>): Request {
  return new Request('https://web.test/api/production/scanner/wos/60000000-0000-0000-0000-000000000001/consume', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const context = { params: { id: '60000000-0000-0000-0000-000000000001' } };

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

beforeEach(() => {
  fakeClient.query.mockReset();
  fakeClient.query.mockImplementation(async (sql: string, params: readonly unknown[] = []) => {
    const n = normalize(sql);

    if (n === 'begin' || n === 'commit' || n === 'rollback') return { rows: [] };
    if (n.includes('from public.user_roles')) return { rows: [{ ok: true }], rowCount: 1 };
    if (n.includes('from public.v_active_holds') && n.includes("reference_type = 'wo'")) {
      return {
        rows: [{ hold_id: 'hold-wo-1', reference_type: 'wo', reference_id: context.params.id }],
        rowCount: 1,
      };
    }
    if (n.startsWith('insert into public.outbox_events')) return { rows: [], rowCount: 1 };
    if (n.startsWith('insert into public.scanner_audit_log')) return { rows: [], rowCount: 1 };

    throw new Error(`unexpected query after WO hold gate: ${n}; params=${JSON.stringify(params)}`);
  });
});

describe('scanner WO consume route — WO quality hold gate', () => {
  it('returns the blocked scanner envelope and does not mutate stock', async () => {
    const { POST } = await import('../consume/route');

    const response = await POST(
      request({
        clientOpId: 'op-held-wo',
        materialId: '70000000-0000-0000-0000-000000000001',
        qty: '1.000',
        lpId: '90000000-0000-0000-0000-000000000001',
      }) as never,
      context,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'quality_hold_active' });
    expect(fakeClient.query.mock.calls.some((call) => normalize(String(call[0])).startsWith('update public.license_plates'))).toBe(false);
    expect(fakeClient.query.mock.calls.some((call) => normalize(String(call[0])).startsWith('update public.wo_materials'))).toBe(false);
    expect(fakeClient.query.mock.calls.some((call) => normalize(String(call[0])).startsWith('insert into public.wo_material_consumption'))).toBe(false);

    const outboxCall = fakeClient.query.mock.calls.find((call) =>
      normalize(String(call[0])).startsWith('insert into public.outbox_events'),
    );
    expect(outboxCall).toBeDefined();
    expect((outboxCall?.[1] as unknown[])?.[0]).toBe('production.consume.blocked');
    expect(fakeClient.query.mock.calls.some((call) => String(call[0]) === 'commit')).toBe(true);
  });
});

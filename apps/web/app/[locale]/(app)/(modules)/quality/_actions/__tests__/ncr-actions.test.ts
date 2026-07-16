import { beforeEach, describe, expect, it, vi } from 'vitest';

import { maxSqlPlaceholderIndex } from '../../../../../../../lib/shared/sql-placeholders';
import { closeNcr, createNcr, getNcrDetail, listNcrs, updateNcrInvestigation } from '../ncr-actions';
import { getActiveSiteId } from '../../../../../../../lib/site/site-context';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const NCR_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const HOLD_ID = '55555555-5555-4555-8555-555555555555';

const CCP_ID = '66666666-6666-4666-8666-666666666666';
const SITE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let client: QueryClient;
let permissions: Set<string>;
let currentSeverity: 'critical' | 'major' | 'minor' = 'critical';
let currentStatus: 'open' | 'closed' | 'cancelled' = 'open';
// reference of the row returned by the getNcrDetail header select.
let detailReference: { type: string | null; id: string | null } = { type: 'lp', id: 'ref-uuid' };
let listTotal = 1;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));
vi.mock('../../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: vi.fn(async () => SITE_ID),
}));

vi.mock('@monopilot/e-sign', () => ({
  // wave F4: hold/NCR actions detect policy errors via instanceof — the mock must export the class
  ESignPolicyError: class ESignPolicyError extends Error {
    code: string;
    constructor(code: string, message?: string) {
      super(message ?? code);
      this.code = code;
    }
  },

  signEvent: vi.fn(async () => ({
    signatureId: '88888888-8888-4888-8888-888888888888',
    signerUserId: USER_ID,
    intent: 'qa.ncr.close',
    subjectHash: 'b'.repeat(64),
    signedAt: '2026-06-11T12:00:00.000Z',
    auditEventId: 44,
    nonce: 'nonce-ncr',
  })),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function expectSqlArity(sql: string, params: readonly unknown[] | undefined) {
  expect(params).toHaveLength(maxSqlPlaceholderIndex(String(sql)));
}

function makeListRow(index: number) {
  return {
    id: `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`,
    ncr_number: `NCR-${String(index).padStart(8, '0')}`,
    ncr_type: 'quality',
    severity: 'major',
    status: 'open',
    title: `Issue ${index}`,
    product_id: PRODUCT_ID,
    product_code: 'FG-PIE',
    product_name: 'Steak Pie',
    linked_hold_id: HOLD_ID,
    linked_hold_number: 'HLD-00001000',
    response_due_at: '2026-06-13T10:00:00.000Z',
    created_at: '2026-06-11T10:00:00.000Z',
    root_cause_category: null,
    closed_at: null,
  };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        const permission = String(params[2]);
        const allowed = permissions.has(permission);
        return { rows: allowed ? [{ ok: true }] : [], rowCount: allowed ? 1 : 0 };
      }

      if (q.includes('select count(*)::int as total') && q.includes('from public.ncr_reports n')) {
        expectSqlArity(sql, params);
        return { rows: [{ total: listTotal }], rowCount: 1 };
      }

      if (q.startsWith('select n.id::text') && q.includes('limit $5::int offset $6::int') && !q.includes('n.site_id =')) {
        expectSqlArity(sql, params);
        const limit = Number(params[4] ?? 50);
        const offset = Number(params[5] ?? 0);
        const allRows = Array.from({ length: listTotal }, (_, index) => makeListRow(index + 1));
        const rows = allRows.slice(offset, offset + limit);
        return { rows, rowCount: rows.length };
      }

      if (q.startsWith('select n.id::text') && q.includes('n.site_id = $5::uuid')) {
        expectSqlArity(sql, params);
        const limit = Number(params[5] ?? 50);
        const offset = Number(params[6] ?? 0);
        const allRows = Array.from({ length: listTotal }, (_, index) => makeListRow(index + 1));
        const rows = allRows.slice(offset, offset + limit);
        return { rows, rowCount: rows.length };
      }

      if (q.startsWith('select n.id::text')) {
        return {
          rows: [
            {
              id: NCR_ID,
              ncr_number: 'NCR-00001000',
              ncr_type: 'quality',
              severity: 'major',
              status: 'open',
              title: 'Seal failure',
              description: 'Top seal failed inspection',
              reference_type: detailReference.type,
              reference_id: detailReference.id,
              product_id: PRODUCT_ID,
              product_code: 'FG-PIE',
              product_name: 'Steak Pie',
              affected_qty_kg: '12.500',
              detected_by: USER_ID,
              detected_at: '2026-06-11T10:00:00.000Z',
              root_cause: null,
              root_cause_category: null,
              immediate_action: null,
              capa_record_id: null,
              closed_by: null,
              closed_at: null,
              closure_signature_hash: null,
              linked_hold_id: HOLD_ID,
              linked_hold_number: 'HLD-00001000',
              response_due_at: '2026-06-13T10:00:00.000Z',
              created_at: '2026-06-11T10:00:00.000Z',
            },
          ],
          rowCount: 1,
        };
      }

      if (q.includes('from public.haccp_ccps c')) {
        return {
          rows: [
            {
              ccp_id: CCP_ID,
              ccp_code: 'CCP-COOK',
              ccp_name: 'Cook temperature',
              critical_limit_min: '70.0000',
              critical_limit_max: '75.0000',
              unit: 'C',
              measured_value: '69.5000',
              measured_at: '2026-06-11T11:00:00.000Z',
              recorded_by_name: 'QA Inspector',
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('insert into public.ncr_reports')) {
        return { rows: [{ id: NCR_ID, ncr_number: 'NCR-00001001', status: 'open' }], rowCount: 1 };
      }

      if (q.startsWith('update public.ncr_reports') && q.includes('root_cause')) {
        return {
          rows: [
            {
              id: NCR_ID,
              status: 'investigating',
              root_cause: params[1],
              root_cause_category: params[2],
              immediate_action: params[3],
              capa_record_id: params[4],
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('select id::text, ncr_number, severity')) {
        return {
          rows:
            currentStatus === 'open'
              ? [
                  {
                    id: NCR_ID,
                    ncr_number: 'NCR-00001001',
                    severity: currentSeverity,
                    status: currentStatus,
                    closed_at: null,
                  },
                ]
              : [
                  {
                    id: NCR_ID,
                    ncr_number: 'NCR-00001001',
                    severity: currentSeverity,
                    status: currentStatus,
                    closed_at: '2026-06-11T11:00:00.000Z',
                  },
                ],
          rowCount: 1,
        };
      }

      if (q.startsWith('update public.ncr_reports') && q.includes("set status = 'closed'")) {
        return { rows: [{ closed_at: '2026-06-11T12:00:00.000Z' }], rowCount: 1 };
      }

      if (q.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('quality NCR server actions', () => {
  beforeEach(() => {
    permissions = new Set(['quality.dashboard.view', 'quality.ncr.create', 'quality.ncr.close_critical']);
    currentSeverity = 'critical';
    currentStatus = 'open';
    detailReference = { type: 'lp', id: 'ref-uuid' };
    listTotal = 1;
    client = makeClient();
    vi.mocked(getActiveSiteId).mockResolvedValue(SITE_ID);
    vi.clearAllMocks();
  });

  it('listNcrs adds the active site_id bind to the list read', async () => {
    const result = await listNcrs({ status: 'open', severity: 'major', ncrType: 'quality', search: 'Seal', limit: 25 });
    expect(result.ok).toBe(true);

    const listQuery = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('n.site_id = $5::uuid') && normalize(String(sql)).includes('limit $6::int'),
    );
    expect(listQuery).toBeTruthy();
    expect(normalize(String(listQuery?.[0]))).toContain('from public.ncr_reports n');
    expect(listQuery?.[1]).toEqual(['open', 'major', 'quality', 'Seal', SITE_ID, 25, 0]);
    if (result.ok) {
      expect(result.data.items[0]).toEqual(expect.objectContaining({ ncrNumber: 'NCR-00000001' }));
      expect(result.data).toMatchObject({ total: 1, page: 1, limit: 25, hasMore: false });
    }
  });

  it('page 2 offset returns the second page of rows when total exceeds limit', async () => {
    listTotal = 120;

    const result = await listNcrs({ page: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data).toMatchObject({
      total: 120,
      page: 2,
      limit: 50,
      offset: 50,
      hasMore: true,
    });
    expect(result.data.items[0]).toEqual(expect.objectContaining({ ncrNumber: 'NCR-00000051' }));
    const listQuery = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('limit $6::int') && normalize(String(sql)).includes('offset $7::int'),
    );
    expect(listQuery?.[1]).toEqual([null, null, null, null, SITE_ID, 50, 50]);
  });

  it('listNcrs returns all org rows when all-sites is active (no site bind)', async () => {
    vi.mocked(getActiveSiteId).mockResolvedValueOnce(null);

    const result = await listNcrs();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.items[0]).toEqual(expect.objectContaining({ ncrNumber: 'NCR-00000001' }));
    const listQuery = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('from public.ncr_reports n') && normalize(String(sql)).includes('limit $5::int'),
    );
    expect(listQuery).toBeTruthy();
    expect(normalize(String(listQuery?.[0]))).not.toContain('n.site_id =');
    expect(listQuery?.[1]).toEqual([null, null, null, null, 50, 0]);
  });

  it('enforces forbidden gates', async () => {
    permissions.clear();

    await expect(listNcrs()).resolves.toEqual({ ok: false, reason: 'forbidden' });
    await expect(createNcr({ ncrType: 'quality', severity: 'minor' })).resolves.toEqual({ ok: false, reason: 'forbidden' });
  });

  it('creates an NCR without writing generated ncr_number and emits the opened event', async () => {
    const result = await createNcr({
      ncrType: 'quality',
      severity: 'major',
      title: 'Seal failure',
      description: 'Top seal failed inspection',
      productId: PRODUCT_ID,
      affectedQtyKg: '12.500',
      linkedHoldId: HOLD_ID,
    });

    expect(result).toEqual({ ok: true, data: { id: NCR_ID, ncrNumber: 'NCR-00001001', status: 'open' } });
    const insert = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('insert into public.ncr_reports'));
    const insertedColumns = normalize(String(insert?.[0])).split(') values')[0];
    expect(insertedColumns).not.toContain('ncr_number');
    expect(insert?.[1]?.[8]).toBe('12.500');
    const outbox = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('insert into public.outbox_events'));
    expect(outbox?.[1]?.[0]).toBe('quality.ncr.opened');
  });

  it('updates real investigation columns and stores corrective action in ext_jsonb', async () => {
    const result = await updateNcrInvestigation({
      ncrId: NCR_ID,
      rootCause: 'Seal jaw misalignment',
      rootCauseCategory: 'equipment',
      immediateAction: 'Stop line',
      correctiveAction: 'Recalibrate jaw',
    });

    expect(result.ok).toBe(true);
    const update = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).includes('jsonb_set'));
    expect(update?.[1]?.[7]).toBe('Recalibrate jaw');
    const outbox = vi.mocked(client.query).mock.calls.find(([, params]) => params?.[0] === 'quality.ncr.updated');
    expect(outbox).toBeTruthy();
  });

  it('getNcrDetail surfaces CCP-breach context for a ccp_deviation NCR (code/limits/measured value/reader)', async () => {
    detailReference = { type: 'ccp_deviation', id: CCP_ID };

    const result = await getNcrDetail(NCR_ID);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.data) throw new Error('expected detail');
    expect(result.data.ccpBreach).toEqual({
      ccpId: CCP_ID,
      ccpCode: 'CCP-COOK',
      ccpName: 'Cook temperature',
      criticalLimitMin: '70.0000',
      criticalLimitMax: '75.0000',
      unit: 'C',
      measuredValue: '69.5000',
      measuredAt: '2026-06-11T11:00:00.000Z',
      recordedBy: 'QA Inspector',
    });
    // The CCP fetch links the breach via the monitoring-log breach_ncr_id = this NCR.
    const ccpFetch = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('from public.haccp_ccps c'),
    );
    expect(ccpFetch).toBeTruthy();
    expect(normalize(String(ccpFetch?.[0]))).toContain('l.breach_ncr_id = $2::uuid');
    expect(ccpFetch?.[1]).toEqual([CCP_ID, NCR_ID]);
  });

  it('getNcrDetail does NOT fetch CCP context for a non-ccp_deviation NCR', async () => {
    detailReference = { type: 'lp', id: 'ref-uuid' };

    const result = await getNcrDetail(NCR_ID);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.data) throw new Error('expected detail');
    expect(result.data.ccpBreach).toBeNull();
    const ccpFetch = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('from public.haccp_ccps c'),
    );
    expect(ccpFetch).toBeUndefined();
  });

  it('createNcr binds the active site_id ($11::uuid) in the ncr_reports INSERT', async () => {
    const result = await createNcr({ ncrType: 'quality', severity: 'minor' });
    expect(result.ok).toBe(true);

    const insertCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('insert into public.ncr_reports'),
    );
    expect(insertCall).toBeTruthy();
    const sql = normalize(String(insertCall?.[0]));
    expect(sql).toContain('site_id');
    expect(sql).toContain('$11::uuid');
    // The 11th bind (index 10) must be the resolved site id.
    expect(insertCall?.[1]?.[10]).toBe(SITE_ID);
  });

  it('createNcr binds null for site_id when no active site is resolved', async () => {
    vi.mocked(getActiveSiteId).mockResolvedValueOnce(null);

    const result = await createNcr({ ncrType: 'quality', severity: 'minor' });
    expect(result.ok).toBe(true);

    const insertCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('insert into public.ncr_reports'),
    );
    expect(insertCall?.[1]?.[10]).toBeNull();
  });

  it('requires e-signature for every NCR close and stores a real receipt hash', async () => {
    const { signEvent } = await import('@monopilot/e-sign');

    await expect(closeNcr({ ncrId: NCR_ID, resolution: 'Resolved' })).resolves.toEqual({
      ok: false,
      reason: 'error',
      message: expect.stringContaining('signature'),
    });
    expect(signEvent).not.toHaveBeenCalled();

    const critical = await closeNcr({ ncrId: NCR_ID, resolution: 'Resolved', signature: { password: 'pw' } });
    expect(critical).toEqual({
      ok: true,
      data: {
        id: NCR_ID,
        ncrNumber: 'NCR-00001001',
        status: 'closed',
        closedAt: '2026-06-11T12:00:00.000Z',
        signatureHash: 'b'.repeat(64),
      },
    });
    expect(signEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'qa.ncr.close',
        pin: 'pw',
        subject: expect.objectContaining({ ncrId: NCR_ID, severity: 'critical' }),
      }),
      expect.any(Object),
    );
    const signedUpdate = vi.mocked(client.query).mock.calls.find(
      ([sql, params]) => normalize(String(sql)).includes("set status = 'closed'") && params?.[2] === 'b'.repeat(64),
    );
    expect(signedUpdate).toBeTruthy();

    vi.clearAllMocks();
    permissions = new Set(['quality.ncr.create']);
    currentSeverity = 'major';
    await expect(closeNcr({ ncrId: NCR_ID, resolution: 'Resolved' })).resolves.toEqual({
      ok: false,
      reason: 'error',
      message: expect.stringContaining('signature'),
    });
    expect(signEvent).not.toHaveBeenCalled();

    const major = await closeNcr({ ncrId: NCR_ID, resolution: 'Resolved', signature: { password: 'pw' } });
    expect(major.ok).toBe(true);
    expect(signEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'qa.ncr.close',
        subject: expect.objectContaining({ severity: 'major' }),
      }),
      expect.any(Object),
    );
    const majorUpdate = vi.mocked(client.query).mock.calls.find(
      ([sql, params]) => normalize(String(sql)).includes("set status = 'closed'") && params?.[2] === 'b'.repeat(64),
    );
    expect(majorUpdate).toBeTruthy();

    vi.clearAllMocks();
    currentSeverity = 'minor';
    const minor = await closeNcr({ ncrId: NCR_ID, resolution: 'Resolved', signature: { password: 'pw' } });
    expect(minor.ok).toBe(true);
    expect(signEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'qa.ncr.close',
        subject: expect.objectContaining({ severity: 'minor' }),
      }),
      expect.any(Object),
    );
  });

  it('rejects close when signEvent returns no subjectHash', async () => {
    const { signEvent } = await import('@monopilot/e-sign');
    vi.mocked(signEvent).mockResolvedValueOnce({
      signatureId: '88888888-8888-4888-8888-888888888888',
      signerUserId: USER_ID,
      intent: 'qa.ncr.close',
      subjectHash: '',
      signedAt: '2026-06-11T12:00:00.000Z',
      auditEventId: 44,
      nonce: 'nonce-ncr',
    });

    await expect(
      closeNcr({ ncrId: NCR_ID, resolution: 'Resolved', signature: { password: 'pw' } }),
    ).resolves.toEqual({
      ok: false,
      reason: 'error',
      message: 'NCR close e-signature did not produce a receipt hash',
    });
  });
});

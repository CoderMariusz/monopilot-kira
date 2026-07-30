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
const INSPECTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SUPPLIER_ID = '88888888-8888-4888-8888-888888888888';
const BATCH_OUTPUT_ID = '99999999-9999-4999-8999-999999999999';
const CONFLICT_PRODUCT_ID = '77777777-7777-4777-8777-777777777777';

const CCP_ID = '66666666-6666-4666-8666-666666666666';
const SITE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SECOND_ROLE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const eSignState = vi.hoisted(() => ({
  requiredSignatures: 1,
  currentUserId: '22222222-2222-4222-8222-222222222222',
  storedSignature: null as null | {
    signature_id: string;
    signer_user_id: string;
    signer_display_name: string;
    subject_hash: string;
    created_at: string;
  },
}));

let client: QueryClient;
let permissions: Set<string>;
let currentSeverity: 'critical' | 'major' | 'minor' = 'critical';
let currentStatus: 'open' | 'reopened' | 'closed' | 'cancelled' = 'open';
// V-QA-NCR-005 — root cause as stored on the NCR being closed.
let currentRootCause: string | null = 'Sieve gap allowed a fragment through.';
let historicalClosure = false;
// reference of the row returned by the getNcrDetail header select.
let detailReference: { type: string | null; id: string | null } = { type: 'lp', id: 'ref-uuid' };
let listTotal = 1;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: eSignState.currentUserId, orgId: ORG_ID, client }),
  ),
}));
vi.mock('../../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: vi.fn(async () => SITE_ID),
}));
vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({ revalidateLocalized: vi.fn() }));
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

vi.mock('@monopilot/e-sign', () => {
  class ESignPolicyError extends Error {
    code: string;
    constructor(code: string, message?: string) {
      super(message ?? code);
      this.code = code;
    }
  }

  return {
  // wave F4: hold/NCR actions detect policy errors via instanceof — the mock must export the class
    ESignPolicyError,
    ESignSoDError: class ESignSoDError extends Error {},
    hashESignSubject: vi.fn(() => 'b'.repeat(64)),
    readSignoffPolicy: vi.fn(async () => ({
      signoffType: 'qa.ncr.close',
      requiredSignatures: eSignState.requiredSignatures,
      firstSignerRoleId: null,
      secondSignerRoleId: eSignState.requiredSignatures === 2 ? SECOND_ROLE_ID : null,
      allowSameUser: false,
    })),

    signEvent: vi.fn(async (input: { signerUserId: string }, options?: { policyMode?: string }) => {
      if (eSignState.requiredSignatures === 2 && (options?.policyMode ?? 'single') === 'single') {
        throw new ESignPolicyError('second_signature_required');
      }
      return {
        signatureId: '88888888-8888-4888-8888-888888888888',
        signerUserId: input.signerUserId,
        intent: 'qa.ncr.close',
        subjectHash: 'b'.repeat(64),
        signedAt: '2026-06-11T12:00:00.000Z',
        auditEventId: 44,
        nonce: 'nonce-ncr',
      };
    }),
  };
});

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

      if (q.includes('from public.e_sign_log es')) {
        return {
          rows: eSignState.storedSignature ? [eSignState.storedSignature] : [],
          rowCount: eSignState.storedSignature ? 1 : 0,
        };
      }

      if (q.includes('from public.users') && q.includes('as display_name')) {
        return { rows: [{ display_name: 'Quality Lead Anna' }], rowCount: 1 };
      }

      if (q.includes('from public.roles')) {
        return { rows: [{ display_name: 'Production Manager' }], rowCount: 1 };
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

      if (q.includes('select true as ok') && q.includes('from public.license_plates lp')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }

      if (q.includes('select lp.product_id::text as product_id')) {
        return { rows: [{ product_id: PRODUCT_ID }], rowCount: 1 };
      }

      if (q.startsWith('select id::text') && q.includes('from public.items')) {
        return { rows: [{ id: PRODUCT_ID }], rowCount: 1 };
      }

      if (q.startsWith('select id::text') && q.includes('from public.quality_holds')) {
        return { rows: [{ id: HOLD_ID }], rowCount: 1 };
      }

      if (q.includes('select id::text, status, root_cause') && q.includes('from public.ncr_reports')) {
        return {
          rows: [
            {
              id: NCR_ID,
              status: 'open',
              root_cause: null,
              root_cause_category: null,
              immediate_action: null,
            },
          ],
          rowCount: 1,
        };
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
            currentStatus === 'open' || currentStatus === 'reopened'
              ? [
                  {
                    id: NCR_ID,
                    ncr_number: 'NCR-00001001',
                    severity: currentSeverity,
                    status: currentStatus,
                    closed_at: null,
                    root_cause: currentRootCause,
                    closure_signature_hash:
                      eSignState.storedSignature?.subject_hash
                      ?? (historicalClosure ? 'c'.repeat(64) : null),
                    ext_jsonb: eSignState.storedSignature
                      ? { closure: { pending: true, resolution: 'Resolved' } }
                      : historicalClosure
                        ? { closure: { pending: false, resolution: 'Previously closed' } }
                        : {},
                  },
                ]
              : [
                  {
                    id: NCR_ID,
                    ncr_number: 'NCR-00001001',
                    severity: currentSeverity,
                    status: currentStatus,
                    closed_at: '2026-06-11T11:00:00.000Z',
                    root_cause: currentRootCause,
                    closure_signature_hash: null,
                    ext_jsonb: {},
                  },
                ],
          rowCount: 1,
        };
      }

      if (q.startsWith('update public.ncr_reports') && q.includes("set status = 'closed'")) {
        return { rows: [{ closed_at: '2026-06-11T12:00:00.000Z' }], rowCount: 1 };
      }

      if (q.startsWith('update public.ncr_reports') && q.includes('closure_signature_hash')) {
        return { rows: [{ status: currentStatus }], rowCount: 1 };
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
    currentRootCause = 'Sieve gap allowed a fragment through.';
    historicalClosure = false;
    detailReference = { type: 'lp', id: 'ref-uuid' };
    listTotal = 1;
    eSignState.requiredSignatures = 1;
    eSignState.currentUserId = USER_ID;
    eSignState.storedSignature = null;
    client = makeClient();
    vi.mocked(getActiveSiteId).mockResolvedValue(SITE_ID);
    vi.mocked(revalidateLocalized).mockClear();
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

  it('auto-fills product_id from the inspection source when the client omits productId', async () => {
    const result = await createNcr({
      ncrType: 'quality',
      severity: 'major',
      title: 'Seal failure',
      description: 'Top seal failed inspection',
      referenceType: 'inspection',
      referenceId: INSPECTION_ID,
      affectedQtyKg: '12.500',
      linkedHoldId: HOLD_ID,
    });

    expect(result).toEqual({ ok: true, data: { id: NCR_ID, ncrNumber: 'NCR-00001001', status: 'open' } });
    const insert = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('insert into public.ncr_reports'),
    );
    expect(insert?.[1]?.[4]).toBe('inspection');
    expect(insert?.[1]?.[5]).toBe(INSPECTION_ID);
    expect(insert?.[1]?.[6]).toBe(PRODUCT_ID);
    expect(insert?.[1]?.[8]).toBe('12.500');
    expect(insert?.[1]?.[9]).toBe(HOLD_ID);
  });

  it('rejects create when the linked reference is not found in the org', async () => {
    const originalQuery = client.query;
    client.query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
      if (q.includes('select true as ok') && q.includes('from public.license_plates lp')) {
        return { rows: [], rowCount: 0 };
      }
      return originalQuery(sql, params);
    }) as QueryClient['query'];

    await expect(
      createNcr({
        ncrType: 'quality',
        severity: 'major',
        referenceType: 'inspection',
        referenceId: INSPECTION_ID,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'error',
      message: 'ncr_reference_not_found',
    });
  });

  it('rejects create when productId conflicts with the inspection source product', async () => {
    await expect(
      createNcr({
        ncrType: 'quality',
        severity: 'major',
        referenceType: 'inspection',
        referenceId: INSPECTION_ID,
        productId: CONFLICT_PRODUCT_ID,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'error',
      message: 'ncr_product_reference_mismatch',
    });
  });

  it('validates supplier and batch references against org-scoped rows', async () => {
    await createNcr({
      ncrType: 'supplier',
      severity: 'major',
      referenceType: 'supplier',
      referenceId: SUPPLIER_ID,
    });
    const supplierValidate = vi.mocked(client.query).mock.calls.find(
      ([sql, params]) =>
        normalize(String(sql)).includes('select true as ok') && params?.[0] === 'supplier',
    );
    expect(supplierValidate).toBeTruthy();
    expect(normalize(String(supplierValidate?.[0]))).toContain('from public.suppliers s');

    await createNcr({
      ncrType: 'quality',
      severity: 'major',
      referenceType: 'batch',
      referenceId: BATCH_OUTPUT_ID,
    });
    const batchValidate = vi.mocked(client.query).mock.calls.find(
      ([sql, params]) => normalize(String(sql)).includes('select true as ok') && params?.[0] === 'batch',
    );
    expect(batchValidate).toBeTruthy();
    expect(normalize(String(batchValidate?.[0]))).toContain('from public.wo_outputs woo');
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
    const audit = vi.mocked(client.query).mock.calls.find(
      ([sql, params]) =>
        normalize(String(sql)).startsWith('insert into public.audit_events') && params?.[1] === 'quality.ncr.updated',
    );
    expect(audit?.[1]?.[2]).toBe('ncr_report');
    expect(audit?.[1]?.[3]).toBe(NCR_ID);
    expect(JSON.parse(String(audit?.[1]?.[5])).status).toBe('investigating');
    expect(vi.mocked(revalidateLocalized)).toHaveBeenCalledWith('/quality/ncrs');
    expect(vi.mocked(revalidateLocalized)).toHaveBeenCalledWith(`/quality/ncrs/${NCR_ID}`);
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

  it('V-QA-NCR-005: refuses to close without a root cause, and closes once one is recorded', async () => {
    const { signEvent } = await import('@monopilot/e-sign');
    currentRootCause = '   ';

    await expect(
      closeNcr({ ncrId: NCR_ID, resolution: 'Resolved', signature: { password: 'pw' } }),
    ).resolves.toEqual({ ok: false, reason: 'error', message: 'root_cause_required' });
    // Fail-closed: no signature consumed and no write attempted.
    expect(signEvent).not.toHaveBeenCalled();
    expect(
      vi.mocked(client.query).mock.calls.some(([sql]) => normalize(String(sql)).includes("set status = 'closed'")),
    ).toBe(false);

    // Same NCR, root cause recorded → the close still goes through unchanged.
    currentRootCause = 'Sieve gap allowed a fragment through.';
    const closed = await closeNcr({ ncrId: NCR_ID, resolution: 'Resolved', signature: { password: 'pw' } });
    expect(closed.ok).toBe(true);
    expect(signEvent).toHaveBeenCalledTimes(1);
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

  it('keeps the NCR open after the first signature when policy requires two', async () => {
    eSignState.requiredSignatures = 2;

    const result = await closeNcr({
      ncrId: NCR_ID,
      resolution: 'Resolved',
      signature: { password: 'pw' },
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        id: NCR_ID,
        status: 'pending_second_signature',
      },
    });
    expect(
      vi.mocked(client.query).mock.calls.some(([sql]) =>
        normalize(String(sql)).includes("set status = 'closed'"),
      ),
    ).toBe(false);
  });

  it('closes a reopened NCR without mistaking its historical signature for a pending slot', async () => {
    currentStatus = 'reopened';
    historicalClosure = true;

    const result = await closeNcr({
      ncrId: NCR_ID,
      resolution: 'Resolved after reopening',
      signature: { password: 'pw' },
    });

    expect(result).toMatchObject({
      ok: true,
      data: { id: NCR_ID, status: 'closed' },
    });
    const { signEvent } = await import('@monopilot/e-sign');
    expect(signEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.objectContaining({ resolution: 'Resolved after reopening' }),
      }),
      expect.objectContaining({ policyMode: 'single' }),
    );
  });

  it('rejects the first signer in the second slot and closes for a different signer', async () => {
    eSignState.requiredSignatures = 2;
    eSignState.storedSignature = {
      signature_id: '77777777-7777-4777-8777-777777777777',
      signer_user_id: USER_ID,
      signer_display_name: 'Quality Lead Anna',
      subject_hash: 'b'.repeat(64),
      created_at: '2026-07-30T10:00:00.000Z',
    };

    const sameSigner = await closeNcr({
      ncrId: NCR_ID,
      resolution: 'Resolved',
      signature: { password: 'same-secret' },
    });
    expect(sameSigner).toEqual({
      ok: false,
      reason: 'error',
      message: 'Second signature must be provided by a different user',
    });
    const { signEvent } = await import('@monopilot/e-sign');
    expect(signEvent).not.toHaveBeenCalled();

    vi.clearAllMocks();
    eSignState.currentUserId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const otherSigner = await closeNcr({
      ncrId: NCR_ID,
      resolution: 'Resolved',
      signature: { password: 'other-secret' },
    });
    expect(otherSigner).toMatchObject({
      ok: true,
      data: { id: NCR_ID, status: 'closed' },
    });
    expect(signEvent).toHaveBeenCalledWith(
      expect.objectContaining({ signerUserId: eSignState.currentUserId }),
      expect.objectContaining({ policyMode: 'dual-secondary' }),
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

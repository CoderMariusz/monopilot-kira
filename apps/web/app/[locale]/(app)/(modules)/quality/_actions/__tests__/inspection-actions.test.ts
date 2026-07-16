/**
 * K3b — inspection-actions: holdId deep-link resolution + reference/assignee picker
 * reads. Mirrors lookup-actions.test.ts conventions: a fake QueryClient routed by
 * SQL substring, withOrgContext mocked to inject {userId, orgId, client}, and the
 * permission probe toggled per-test. Decimal qty is asserted as a string (never a
 * JS number). next/cache is mocked so createInspection's revalidatePath is inert.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signEvent } from '@monopilot/e-sign';

import {
  createInspection,
  getInspectionDetail,
  listInspections,
  searchInspectionLps,
  resolveInspectionGrn,
  resolveInspectionWoOutput,
  searchInspectionAssignees,
  submitInspectionDecision,
} from '../inspection-actions';
import { getActiveSiteId, resolveWriteSiteId } from '../../../../../../../lib/site/site-context';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const INSP_ID = '33333333-3333-4333-8333-333333333333';
const LP_ID = '44444444-4444-4444-8444-444444444444';
const HOLD_ID = '88888888-8888-4888-8888-888888888888';
const WOO_ID = '77777777-7777-4777-8777-777777777777';
const GRN_ID = '99999999-9999-4999-8999-999999999999';
const ASSIGNEE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SITE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';

let client: QueryClient;
let allowPermission = true;
let holdRows: 'one' | 'none' = 'one';
let grnRows: 'one' | 'none' = 'one';
let wooRows: 'one' | 'none' = 'one';
// status returned by submitInspectionDecision's FOR UPDATE select.
let inspectionStatus = 'in_progress';
let inspectionReferenceType: 'lp' | 'grn' | 'wo_output' = 'lp';
let inspectionReferenceId = LP_ID;
let inspectionParameters: unknown[] = [{ name: 'visual', actual: 'ok', pass: true }];
let activeHold = false;
// S2 idempotency: when true the quality_holds existence-lookup mock returns an
// EXISTING hold, exercising the early-return short-circuit in
// createInspectionHoldIfMissing (inspection-actions.ts).
let existingInspectionHoldReason: string | null = null;
let listTotal = 1;
let specResolveRows: Array<Record<string, string>> = [];

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({ revalidateLocalized: vi.fn() }));
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';
vi.mock('@monopilot/e-sign', () => ({ signEvent: vi.fn(async () => ({ subjectHash: 'hash' })) }));
vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));
vi.mock('../../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: vi.fn(async () => SITE_ID),
  resolveWriteSiteId: vi.fn(async () => ({ ok: true, siteId: SITE_ID })),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

const DETAIL_ROW = {
  id: INSP_ID,
  inspection_number: 'INSP-00000001',
  reference_type: 'lp',
  reference_id: LP_ID,
  reference_display: 'LP-4820',
  product_id: PRODUCT_ID,
  product_code: 'RM-1001',
  product_name: 'Beef trim',
  status: 'on_hold',
  assigned_to: null,
  assigned_email: null,
  assigned_name: null,
  due_date: null,
  created_at: '2026-04-21T10:00:00.000Z',
  parameters: [],
  result_notes: null,
  decided_by: USER_ID,
  decided_email: 'qa@co',
  decided_name: 'QA Lead',
  decided_at: '2026-04-22T09:00:00.000Z',
  signature_hash: 'hash',
  created_by: USER_ID,
  created_email: 'qa@co',
  created_name: 'QA Lead',
  updated_at: '2026-04-22T09:00:00.000Z',
  hold_id: HOLD_ID,
};

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
      if (q.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }
      // submitInspectionDecision: FOR UPDATE select of the current inspection.
      if (q.startsWith('select id::text, inspection_number')) {
        return {
          rows: [
            {
              id: INSP_ID,
              inspection_number: 'INSP-00000001',
              reference_type: inspectionReferenceType,
              reference_id: inspectionReferenceId,
              status: inspectionStatus,
              parameters: inspectionParameters,
            },
          ],
          rowCount: 1,
        };
      }
      // submitInspectionDecision: final status update (returning row).
      if (q.startsWith('update public.quality_inspections') && q.includes('set status = $2')) {
        return {
          rows: [{ id: INSP_ID, inspection_number: 'INSP-00000001', status: params[1] }],
          rowCount: 1,
        };
      }
      if (q.includes('from public.v_active_holds')) {
        return {
          rows: activeHold ? [{ hold_number: 'HLD-0001', priority: 'critical' }] : [],
          rowCount: activeHold ? 1 : 0,
        };
      }
      if (q.startsWith('select qa_status') && q.includes('from public.license_plates')) {
        return { rows: [{ qa_status: 'on_hold' }], rowCount: 1 };
      }
      if (q.startsWith('update public.license_plates') && q.includes('returning id::text, lp_number, status, qa_status')) {
        return {
          rows: [{ id: LP_ID, lp_number: 'LP-4820', status: 'available', qa_status: 'released' }],
          rowCount: 1,
        };
      }
      // applyLpDecisionSideEffects: LP qa_status update (returning id).
      if (q.startsWith('update public.license_plates')) {
        return { rows: [{ id: LP_ID }], rowCount: 1 };
      }
      // createLpHold: hold insert (returning id + hold_number), LP qty select, hold-items insert.
      if (q.startsWith('insert into public.quality_holds')) {
        return { rows: [{ id: HOLD_ID, hold_number: 'HLD-00000001' }], rowCount: 1 };
      }
      if (q.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }
      if (q.includes('from public.quality_holds') && q.includes('reference_type = $1')) {
        const reasonText = String(params[3] ?? '');
        if (existingInspectionHoldReason && existingInspectionHoldReason === reasonText) {
          return { rows: [{ id: HOLD_ID }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
      if (q.startsWith('select id::text, status, qa_status, quantity::text')) {
        return { rows: [{ id: LP_ID, status: 'available', qa_status: 'pending', quantity: '12.500' }], rowCount: 1 };
      }
      if (q.startsWith('insert into public.quality_hold_items')) {
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('select lp_id::text') && q.includes('from public.grn_items')) {
        return { rows: [{ id: LP_ID }], rowCount: 1 };
      }
      if (q.startsWith('select lp_id::text') && q.includes('from public.wo_outputs')) {
        return { rows: [{ lp_id: LP_ID }], rowCount: 1 };
      }
      if (q.startsWith('select id::text, qa_status, lp_id::text') && q.includes('from public.wo_outputs')) {
        return { rows: [{ id: WOO_ID, qa_status: 'PENDING', lp_id: LP_ID }], rowCount: 1 };
      }
      if (q.startsWith('update public.wo_outputs') && q.includes('set qa_status = $2')) {
        return { rows: [{ id: WOO_ID, qa_status: params[1], lp_id: LP_ID }], rowCount: 1 };
      }
      if (q.startsWith('select id::text, lp_number, status, qa_status')) {
        return {
          rows: [{ id: LP_ID, lp_number: 'LP-4820', status: 'received', qa_status: 'pending' }],
          rowCount: 1,
        };
      }
      if (q.startsWith('select id::text, status, qa_status') && q.includes('from public.license_plates')) {
        return {
          rows: [{ id: LP_ID, status: 'received', qa_status: 'pending' }],
          rowCount: 1,
        };
      }
      if (q.startsWith('update public.license_plates') && q.includes('returning status')) {
        return { rows: [{ status: 'available' }], rowCount: 1 };
      }
      if (q.startsWith('insert into public.lp_state_history')) {
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('insert into public.quality_inspections')) {
        return {
          rows: [{ id: INSP_ID, inspection_number: 'INSP-00000001', reference_type: 'lp', reference_id: LP_ID, status: 'pending' }],
          rowCount: 1,
        };
      }
      if (q.startsWith('select count(*)::int as total') && q.includes('from public.quality_inspections qi')) {
        if (params[1] === 'page2only') return { rows: [{ total: 1 }], rowCount: 1 };
        return { rows: [{ total: listTotal }], rowCount: 1 };
      }
      if (q.includes('from public.quality_inspections qi') && q.includes('limit $3::int offset $4::int')) {
        const offset = Number(params[3] ?? 0);
        const index = offset + 1;
        if (params[1] === 'page2only') {
          return {
            rows: [{ ...DETAIL_ROW, inspection_number: 'INSP-PAGE2-MATCH' }],
            rowCount: 1,
          };
        }
        if (index > listTotal) return { rows: [], rowCount: 0 };
        return {
          rows: [
            {
              ...DETAIL_ROW,
              inspection_number: `INSP-${String(index).padStart(8, '0')}`,
            },
          ],
        };
      }
      if (q.includes('from public.quality_inspections qi') && q.includes('limit $4::int offset $5::int')) {
        const offset = Number(params[4] ?? 0);
        const index = offset + 1;
        if (params[1] === 'page2only') {
          return {
            rows: [{ ...DETAIL_ROW, inspection_number: 'INSP-PAGE2-MATCH' }],
            rowCount: 1,
          };
        }
        if (index > listTotal) return { rows: [], rowCount: 0 };
        return {
          rows: [
            {
              ...DETAIL_ROW,
              inspection_number: `INSP-${String(index).padStart(8, '0')}`,
            },
          ],
        };
      }
      if (q.includes('from public.quality_inspections qi') && q.includes('qi.id = $1::uuid')) {
        return { rows: [{ ...DETAIL_ROW, hold_id: holdRows === 'one' ? HOLD_ID : null }] };
      }
      if (q.includes('from public.quality_specifications qs')) {
        return { rows: specResolveRows };
      }
      if (q.includes('from public.license_plates lp')) {
        return {
          rows: [
            { id: LP_ID, lp_number: 'LP-4820', item_code: 'RM-1001', quantity: '12.500', uom: 'kg', status: 'available' },
          ],
        };
      }
      if (q.includes('from public.grns')) {
        return { rows: grnRows === 'one' ? [{ id: GRN_ID, grn_number: 'GRN-000001' }] : [] };
      }
      if (q.includes('from public.wo_outputs woo')) {
        return { rows: wooRows === 'one' ? [{ id: WOO_ID, batch_number: 'BATCH-1', wo_number: 'WO-1' }] : [] };
      }
      if (q.includes('from public.users u')) {
        return { rows: [{ id: ASSIGNEE_ID, name: 'QA Inspector', email: 'qa.inspector@co' }] };
      }
      return { rows: [] };
    }),
  };
}

beforeEach(() => {
  allowPermission = true;
  holdRows = 'one';
  grnRows = 'one';
  wooRows = 'one';
  inspectionStatus = 'in_progress';
  inspectionReferenceType = 'lp';
  inspectionReferenceId = LP_ID;
  inspectionParameters = [{ name: 'visual', actual: 'ok', pass: true }];
  activeHold = false;
  existingInspectionHoldReason = null;
  listTotal = 1;
  specResolveRows = [];
  client = makeClient();
  vi.mocked(getActiveSiteId).mockResolvedValue(SITE_ID);
  vi.mocked(signEvent).mockClear();
});

describe('listInspections — active site scope', () => {
  it('adds the active site_id bind to the list read', async () => {
    const res = await listInspections({ status: 'pending', search: 'LP-4', limit: 25 });
    expect(res.ok).toBe(true);

    const listQuery = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('qi.site_id = $3::uuid') && normalize(String(sql)).includes('limit $4::int'),
    );
    expect(listQuery).toBeTruthy();
    expect(normalize(String(listQuery?.[0]))).toContain('from public.quality_inspections qi');
    expect(listQuery?.[1]).toEqual(['pending', 'LP-4', SITE_ID, 25, 0]);
    if (res.ok) {
      expect(res.data.items[0]).toEqual(expect.objectContaining({ inspectionNumber: 'INSP-00000001' }));
      expect(res.data).toMatchObject({ total: 1, page: 1, limit: 25, hasMore: false });
    }
  });

  it('page 2 offset returns the second page of rows when total exceeds limit', async () => {
    listTotal = 120;

    const result = await listInspections({ page: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data).toMatchObject({
      total: 120,
      page: 2,
      limit: 50,
      offset: 50,
      hasMore: true,
    });
    expect(result.data.items[0]).toEqual(expect.objectContaining({ inspectionNumber: 'INSP-00000051' }));
    const listQuery = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('limit $4::int offset $5::int'),
    );
    expect(listQuery?.[1]).toEqual([null, null, SITE_ID, 50, 50]);
  });

  it('search filter finds a row that would only appear on page 2 when unfiltered', async () => {
    listTotal = 120;

    const result = await listInspections({ search: 'page2only', page: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.total).toBe(1);
    expect(result.data.items[0]).toEqual(expect.objectContaining({ inspectionNumber: 'INSP-PAGE2-MATCH' }));
    const countQuery = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('select count(*)'),
    );
    expect(countQuery?.[1]).toEqual([null, 'page2only', SITE_ID]);
  });

  it('listInspections omits site filter when all-sites is active', async () => {
    vi.mocked(getActiveSiteId).mockResolvedValueOnce(null);

    const res = await listInspections();

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.data.items[0]).toEqual(expect.objectContaining({ inspectionNumber: 'INSP-00000001' }));
    const listQuery = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('from public.quality_inspections qi') && normalize(String(sql)).includes('limit $3::int'),
    );
    expect(listQuery).toBeTruthy();
    expect(normalize(String(listQuery?.[0]))).not.toContain('qi.site_id =');
    expect(listQuery?.[1]).toEqual([null, null, 50, 0]);
  });
});

describe('getInspectionDetail — holdId deep link', () => {
  it('returns the active holdId resolved for the inspection LP', async () => {
    const res = await getInspectionDetail(INSP_ID);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data?.holdId).toBe(HOLD_ID);
  });

  it('returns holdId=null when no active hold exists for the LP', async () => {
    holdRows = 'none';
    const res = await getInspectionDetail(INSP_ID);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data?.holdId).toBeNull();
  });

  it('the detail query joins quality_holds for the LP', async () => {
    await getInspectionDetail(INSP_ID);
    const calls = (client.query as ReturnType<typeof vi.fn>).mock.calls.map((c) => normalize(c[0]));
    expect(calls.some((q) => q.includes('from public.quality_holds qh'))).toBe(true);
  });

  it('the active-hold lateral join uses the canonical filter: active statuses AND released_at is null (review fix F6)', async () => {
    await getInspectionDetail(INSP_ID);
    const calls = (client.query as ReturnType<typeof vi.fn>).mock.calls.map((c) => normalize(c[0]));
    const detailQuery = calls.find((q) => q.includes('from public.quality_holds qh'));
    expect(detailQuery).toBeTruthy();
    expect(detailQuery).toContain("qh.hold_status in ('open', 'investigating', 'escalated', 'quarantined')");
    expect(detailQuery).toContain('qh.released_at is null');
  });

  it('is forbidden without quality.inspection.execute', async () => {
    allowPermission = false;
    const res = await getInspectionDetail(INSP_ID);
    expect(res).toEqual({ ok: false, reason: 'forbidden' });
  });
});

describe('getInspectionDetail — parameter template resolution (S15)', () => {
  it('resolves editable parameters from the active incoming spec when stored parameters are empty', async () => {
    specResolveRows = [
      {
        spec_id: 'spec-1',
        parameter_name: 'Visual',
        target_value: null,
        min_value: null,
        max_value: null,
        unit: null,
      },
    ];
    const res = await getInspectionDetail(INSP_ID);
    expect(res.ok).toBe(true);
    if (!res.ok || !res.data) throw new Error('expected detail');
    expect(res.data.parameterResolution).toBe('resolved');
    expect(res.data.parameters).toEqual([{ name: 'Visual', actual: '', pass: false }]);
  });

  it('returns missing_template when the product has no active incoming spec', async () => {
    specResolveRows = [];
    const res = await getInspectionDetail(INSP_ID);
    expect(res.ok).toBe(true);
    if (!res.ok || !res.data) throw new Error('expected detail');
    expect(res.data.parameterResolution).toBe('missing_template');
    expect(res.data.parameters).toEqual([]);
  });
});

describe('searchInspectionLps', () => {
  it('returns the org-scoped LP list (decimal qty as string)', async () => {
    const res = await searchInspectionLps({ query: 'LP-4', limit: 10 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data[0]).toEqual({ id: LP_ID, lpNumber: 'LP-4820', itemCode: 'RM-1001', qty: '12.500', uom: 'kg', status: 'available' });
    }
  });

  it('is forbidden without permission', async () => {
    allowPermission = false;
    const res = await searchInspectionLps({ query: 'LP' });
    expect(res).toEqual({ ok: false, reason: 'forbidden' });
  });
});

describe('resolveInspectionGrn', () => {
  it('resolves a GRN number to its uuid', async () => {
    const res = await resolveInspectionGrn({ grnNumber: 'GRN-000001' });
    expect(res).toEqual({ ok: true, data: { id: GRN_ID, display: 'GRN-000001' } });
  });

  it('returns null for an unknown GRN number', async () => {
    grnRows = 'none';
    const res = await resolveInspectionGrn({ grnNumber: 'GRN-NOPE' });
    expect(res).toEqual({ ok: true, data: null });
  });
});

describe('resolveInspectionWoOutput', () => {
  it('resolves a WO output batch number to its uuid with a WO/batch display', async () => {
    const res = await resolveInspectionWoOutput({ batchNumber: 'BATCH-1' });
    expect(res).toEqual({ ok: true, data: { id: WOO_ID, display: 'WO-1 / BATCH-1' } });
  });

  it('returns null for an unknown batch number', async () => {
    wooRows = 'none';
    const res = await resolveInspectionWoOutput({ batchNumber: 'NOPE' });
    expect(res).toEqual({ ok: true, data: null });
  });
});

describe('submitInspectionDecision (review fix F8 — base decision flow)', () => {
  const baseInput = {
    inspectionId: INSP_ID,
    signature: { password: 'pin-1234' },
    note: 'checked',
  };

  function calls(): string[] {
    return (client.query as ReturnType<typeof vi.fn>).mock.calls.map((c) => normalize(c[0]));
  }
  function findCall(fragment: string) {
    return (client.query as ReturnType<typeof vi.fn>).mock.calls.find((c) => normalize(c[0]).includes(fragment));
  }

  it('(a) signs the decision via signEvent with intent qa.inspection.submit', async () => {
    const res = await submitInspectionDecision({ ...baseInput, decision: 'pass' });
    expect(res.ok).toBe(true);
    expect(vi.mocked(signEvent)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(signEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'qa.inspection.submit',
        signerUserId: USER_ID,
        pin: 'pin-1234',
        subject: expect.objectContaining({ inspectionId: INSP_ID, decision: 'pass' }),
      }),
      expect.objectContaining({ client }),
    );
  });

  it('keeps LP qa_status held when decision=pass but another active LP hold exists', async () => {
    activeHold = true;

    const res = await submitInspectionDecision({ ...baseInput, decision: 'pass' });

    expect(res).toMatchObject({ ok: true, data: { status: 'passed', qaStatus: 'on_hold' } });
    expect(calls().some((q) => q.includes('from public.v_active_holds'))).toBe(true);
    expect(calls().some((q) => q.startsWith('update public.license_plates'))).toBe(false);
  });

  it('proceeds with decision=pass when no active LP hold exists', async () => {
    activeHold = false;

    const res = await submitInspectionDecision({ ...baseInput, decision: 'pass' });

    expect(res.ok).toBe(true);
    const lpUpdate = findCall('update public.license_plates');
    expect(lpUpdate).toBeTruthy();
    expect(lpUpdate?.[1]).toEqual([LP_ID, 'released', USER_ID, ['consumed', 'merged', 'shipped', 'returned']]);
  });

  it('(b) decision=fail issues the LP qa_status=rejected update', async () => {
    const res = await submitInspectionDecision({ ...baseInput, decision: 'fail' });
    expect(res.ok).toBe(true);
    const lpUpdate = findCall('update public.license_plates');
    expect(lpUpdate).toBeTruthy();
    expect(lpUpdate?.[1]).toEqual([LP_ID, 'rejected', USER_ID, ['consumed', 'merged', 'shipped', 'returned']]);
    // fail does NOT open a hold
    expect(calls().some((q) => q.includes('insert into public.quality_holds'))).toBe(false);
  });

  it('(c) decision=hold inserts quality_holds + quality_hold_items for the LP', async () => {
    const res = await submitInspectionDecision({ ...baseInput, decision: 'hold' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.qaStatus).toBe('on_hold');
    const holdInsert = findCall('insert into public.quality_holds');
    expect(holdInsert).toBeTruthy();
    expect(holdInsert?.[0]).toContain('site_id');
    expect(holdInsert?.[1]?.[3]).toBe(`Inspection ${INSP_ID}: checked`);
    const itemInsert = findCall('insert into public.quality_hold_items');
    expect(itemInsert).toBeTruthy();
    // decimal qty stays a string end-to-end
    expect(itemInsert?.[1]).toEqual([HOLD_ID, LP_ID, '12.500']);
    // and emits the canonical quality.hold.created outbox event for the inline hold.
    const outbox = findCall('insert into public.outbox_events');
    expect(outbox).toBeTruthy();
    expect(outbox?.[1]?.[0]).toBe('quality.hold.created');
    expect(outbox?.[1]?.[1]).toBe(HOLD_ID);
  });

  it('(d) re-submitting an already-final inspection is rejected without signing or mutating', async () => {
    inspectionStatus = 'failed';
    const res = await submitInspectionDecision({ ...baseInput, decision: 'pass' });
    expect(res).toMatchObject({ ok: false, reason: 'error', message: 'quality inspection decision is already final' });
    expect(vi.mocked(signEvent)).not.toHaveBeenCalled();
    expect(calls().some((q) => q.startsWith('update public.quality_inspections'))).toBe(false);
    expect(calls().some((q) => q.startsWith('update public.license_plates'))).toBe(false);
  });

  it('(e) is forbidden without quality.inspection.execute', async () => {
    allowPermission = false;
    const res = await submitInspectionDecision({ ...baseInput, decision: 'pass' });
    expect(res).toEqual({ ok: false, reason: 'forbidden' });
    expect(vi.mocked(signEvent)).not.toHaveBeenCalled();
  });

  it('blocks pass from pending when no test parameters have been recorded', async () => {
    inspectionStatus = 'pending';
    inspectionParameters = [];

    const res = await submitInspectionDecision({ ...baseInput, decision: 'pass' });

    expect(res).toEqual({ ok: false, reason: 'error', message: 'inspection_parameters_required' });
    expect(vi.mocked(signEvent)).not.toHaveBeenCalled();
    expect(calls().some((q) => q.startsWith('update public.quality_inspections'))).toBe(false);
  });

  it('decision=fail for a GRN places received LPs on a shared quality hold', async () => {
    inspectionReferenceType = 'grn';
    inspectionReferenceId = GRN_ID;

    const res = await submitInspectionDecision({ ...baseInput, decision: 'fail' });

    expect(res).toMatchObject({ ok: true, data: { status: 'failed', qaStatus: 'on_hold' } });
    const lpLookup = findCall('from public.grn_items');
    expect(lpLookup?.[1]).toEqual([GRN_ID]);
    const holdInsert = findCall('insert into public.quality_holds');
    expect(holdInsert?.[1]?.[3]).toBe(`Inspection ${INSP_ID}: checked`);
    const lpUpdate = findCall('update public.license_plates');
    expect(lpUpdate?.[1]).toEqual([[LP_ID], USER_ID, ['consumed', 'merged', 'shipped', 'returned']]);
  });

  it('decision=pass for a WO output transitions wo_outputs QA and releases the LP atomically', async () => {
    inspectionReferenceType = 'wo_output';
    inspectionReferenceId = WOO_ID;

    const res = await submitInspectionDecision({ ...baseInput, decision: 'pass' });

    expect(res).toMatchObject({ ok: true, data: { status: 'passed', qaStatus: 'released' } });
    const outputTransition = findCall('update public.wo_outputs');
    expect(outputTransition?.[1]).toEqual([WOO_ID, 'PASSED']);
    const lpTransition = vi.mocked(client.query).mock.calls.find(([sql, params]) => {
      const q = normalize(String(sql));
      return q.startsWith('update public.license_plates') && params?.[1] === 'released';
    });
    expect(lpTransition?.[1]).toEqual([LP_ID, 'released', USER_ID]);
    expect(calls().some((q) => q.startsWith('insert into public.lp_state_history'))).toBe(true);
  });
});

describe('searchInspectionAssignees', () => {
  it('returns the org-scoped user list (uuid the create schema requires)', async () => {
    const res = await searchInspectionAssignees({ query: 'QA' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data[0]).toEqual({ id: ASSIGNEE_ID, name: 'QA Inspector', email: 'qa.inspector@co' });
  });

  it('is forbidden without permission', async () => {
    allowPermission = false;
    const res = await searchInspectionAssignees({ query: 'QA' });
    expect(res).toEqual({ ok: false, reason: 'forbidden' });
  });
});

describe('createInspection — site_id on INSERT', () => {
  it('binds the active site_id ($8::uuid) in the quality_inspections INSERT', async () => {
    const res = await createInspection({ referenceType: 'lp', referenceId: LP_ID });
    expect(res.ok).toBe(true);

    const insertCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('insert into public.quality_inspections'),
    );
    expect(insertCall).toBeTruthy();
    const sql = normalize(String(insertCall?.[0]));
    expect(sql).toContain('site_id');
    expect(sql).toContain('$8::uuid');
    // The 8th bind (index 7) must be the resolved site id.
    expect(insertCall?.[1]?.[7]).toBe(SITE_ID);
    expect(vi.mocked(revalidateLocalized)).toHaveBeenCalledWith('/quality/inspections');
    expect(vi.mocked(revalidateLocalized)).toHaveBeenCalledWith(`/quality/inspections/${INSP_ID}`);
  });

  it('F10: refuses to create with no_active_site instead of writing a null-site inspection', async () => {
    vi.mocked(getActiveSiteId).mockResolvedValueOnce(null);
    vi.mocked(resolveWriteSiteId).mockResolvedValueOnce({ ok: false, reason: 'no_active_site' });

    const res = await createInspection({ referenceType: 'lp', referenceId: LP_ID });

    expect(res).toEqual({ ok: false, reason: 'error', message: 'no_active_site' });
    const insertCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('insert into public.quality_inspections'),
    );
    expect(insertCall).toBeUndefined();
  });

  it('F10: surfaces ambiguous_site when >1 active site and none chosen/default', async () => {
    vi.mocked(getActiveSiteId).mockResolvedValueOnce(null);
    vi.mocked(resolveWriteSiteId).mockResolvedValueOnce({ ok: false, reason: 'ambiguous_site' });

    const res = await createInspection({ referenceType: 'lp', referenceId: LP_ID });

    expect(res).toEqual({ ok: false, reason: 'error', message: 'ambiguous_site' });
  });

  it('falls back to resolveWriteSiteId when neither the reference nor active site resolves', async () => {
    vi.mocked(getActiveSiteId).mockResolvedValueOnce(null);
    vi.mocked(resolveWriteSiteId).mockResolvedValueOnce({ ok: true, siteId: SITE_ID });

    const res = await createInspection({ referenceType: 'lp', referenceId: LP_ID });
    expect(res.ok).toBe(true);

    const insertCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('insert into public.quality_inspections'),
    );
    expect(insertCall?.[1]?.[7]).toBe(SITE_ID);
    expect(resolveWriteSiteId).toHaveBeenCalled();
  });
});

// ── S2: createInspectionHoldIfMissing idempotency ────────────────────────────

describe('createInspectionHoldIfMissing — hold existence short-circuit', () => {
  it('S2a decision=hold: when an active hold already exists for the same inspection event, no new INSERT happens', async () => {
    existingInspectionHoldReason = `Inspection ${INSP_ID}: inspection hold`;

    const res = await submitInspectionDecision({
      inspectionId: INSP_ID,
      decision: 'hold',
      signature: { password: 'pin-1234' },
    });

    expect(res.ok).toBe(true);
    expect(res).toMatchObject({ ok: true });

    const holdInserts = vi
      .mocked(client.query)
      .mock.calls.filter(([sql]) => normalize(String(sql)).startsWith('insert into public.quality_holds'));
    expect(holdInserts).toHaveLength(0);
  });

  it('Wave 9 Bug 4: an unrelated active hold on the same LP does not suppress a new inspection hold', async () => {
    existingInspectionHoldReason = 'Unrelated allergen investigation hold';

    const res = await submitInspectionDecision({
      inspectionId: INSP_ID,
      decision: 'hold',
      signature: { password: 'pin-1234' },
    });

    expect(res.ok).toBe(true);
    const holdInserts = vi
      .mocked(client.query)
      .mock.calls.filter(([sql]) => normalize(String(sql)).startsWith('insert into public.quality_holds'));
    expect(holdInserts.length).toBeGreaterThan(0);
    expect(holdInserts[0]?.[1]?.[3]).toBe(`Inspection ${INSP_ID}: inspection hold`);
  });

  it('S2b decision=fail for GRN: when a GRN hold already exists for the same inspection event, no new INSERT happens', async () => {
    inspectionReferenceType = 'grn';
    inspectionReferenceId = GRN_ID;
    existingInspectionHoldReason = `Inspection ${INSP_ID}: failed GRN inspection`;

    const res = await submitInspectionDecision({
      inspectionId: INSP_ID,
      decision: 'fail',
      signature: { password: 'pin-1234' },
    });

    expect(res.ok).toBe(true);

    const holdInserts = vi
      .mocked(client.query)
      .mock.calls.filter(([sql]) => normalize(String(sql)).startsWith('insert into public.quality_holds'));
    expect(holdInserts).toHaveLength(0);
  });
});

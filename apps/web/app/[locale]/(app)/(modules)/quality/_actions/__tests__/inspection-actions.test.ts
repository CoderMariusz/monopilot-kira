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
import { getActiveSiteId } from '../../../../../../../lib/site/site-context';

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

let client: QueryClient;
let allowPermission = true;
let holdRows: 'one' | 'none' = 'one';
let grnRows: 'one' | 'none' = 'one';
let wooRows: 'one' | 'none' = 'one';
// status returned by submitInspectionDecision's FOR UPDATE select.
let inspectionStatus = 'in_progress';
let activeHold = false;

vi.mock('../../lib/i18n/revalidate-localized', () => ({ revalidatePath: vi.fn() }));
vi.mock('@monopilot/e-sign', () => ({ signEvent: vi.fn(async () => ({ subjectHash: 'hash' })) }));
vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));
vi.mock('../../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: vi.fn(async () => SITE_ID),
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
  product_id: null,
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
    query: vi.fn(async (sql: string) => {
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
              reference_type: 'lp',
              reference_id: LP_ID,
              status: inspectionStatus,
            },
          ],
          rowCount: 1,
        };
      }
      // submitInspectionDecision: final status update (returning row).
      if (q.startsWith('update public.quality_inspections') && q.includes('set status = $2')) {
        return {
          rows: [{ id: INSP_ID, inspection_number: 'INSP-00000001', status: 'passed' }],
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
      if (q.startsWith('select id::text, quantity::text')) {
        return { rows: [{ id: LP_ID, quantity: '12.500' }], rowCount: 1 };
      }
      if (q.startsWith('insert into public.quality_hold_items')) {
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('insert into public.quality_inspections')) {
        return {
          rows: [{ id: INSP_ID, inspection_number: 'INSP-00000001', reference_type: 'lp', reference_id: LP_ID, status: 'pending' }],
          rowCount: 1,
        };
      }
      if (q.includes('from public.quality_inspections qi') && q.includes('qi.site_id = $4::uuid')) {
        return { rows: [{ ...DETAIL_ROW, hold_id: null }] };
      }
      if (q.includes('from public.quality_inspections qi')) {
        // The detail row carries hold_id from the lateral join; null when no active hold.
        return { rows: [{ ...DETAIL_ROW, hold_id: holdRows === 'one' ? HOLD_ID : null }] };
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
  activeHold = false;
  client = makeClient();
  vi.mocked(getActiveSiteId).mockResolvedValue(SITE_ID);
  vi.mocked(signEvent).mockClear();
});

describe('listInspections — active site scope', () => {
  it('adds the active site_id bind to the list read', async () => {
    const res = await listInspections({ status: 'pending', search: 'LP-4', limit: 25 });
    expect(res.ok).toBe(true);

    const listQuery = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('qi.site_id = $4::uuid'),
    );
    expect(listQuery).toBeTruthy();
    expect(normalize(String(listQuery?.[0]))).toContain('from public.quality_inspections qi');
    expect(listQuery?.[1]).toEqual(['pending', 'LP-4', 25, SITE_ID]);
  });

  it('returns noActiveSite without running the main DB query when no site is active', async () => {
    vi.mocked(getActiveSiteId).mockResolvedValueOnce(null);

    const res = await listInspections();

    expect(res).toEqual({ ok: true, data: [], noActiveSite: true });
    expect(client.query).not.toHaveBeenCalled();
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
    expect(holdInsert?.[1]).toEqual([LP_ID, 'checked', USER_ID, SITE_ID]);
    const itemInsert = findCall('insert into public.quality_hold_items');
    expect(itemInsert).toBeTruthy();
    // decimal qty stays a string end-to-end
    expect(itemInsert?.[1]).toEqual([HOLD_ID, LP_ID, '12.500', 'checked']);
    // and emits the canonical quality.hold.created outbox event for the inline hold.
    const outbox = findCall('insert into public.outbox_events');
    expect(outbox).toBeTruthy();
    expect(normalize(String(outbox?.[0]))).toContain("'quality.hold.created'");
    expect(outbox?.[1]?.[0]).toBe(HOLD_ID);
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
  });

  it('binds null for site_id when no active site is resolved', async () => {
    vi.mocked(getActiveSiteId).mockResolvedValueOnce(null);

    const res = await createInspection({ referenceType: 'lp', referenceId: LP_ID });
    expect(res.ok).toBe(true);

    const insertCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('insert into public.quality_inspections'),
    );
    expect(insertCall?.[1]?.[7]).toBeNull();
  });
});

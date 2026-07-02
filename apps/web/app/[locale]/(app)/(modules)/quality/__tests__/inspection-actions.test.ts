import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createInspection,
  listInspections,
  recordInspectionResult,
  submitInspectionDecision,
} from '../_actions/inspection-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const INSPECTION_ID = '33333333-3333-4333-8333-333333333333';
const LP_ID = '44444444-4444-4444-8444-444444444444';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
const ASSIGNED_ID = '66666666-6666-4666-8666-666666666666';
const HOLD_ID = '77777777-7777-4777-8777-777777777777';
const SITE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let client: QueryClient;
let allowPermission = true;
let currentReferenceType: 'lp' | 'grn' | 'wo_output' = 'lp';

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

// listInspections + createInspection now resolve the active site and scope the
// read / INSERT to it (qi.site_id = $4 / $8::uuid). Mock the resolver so the
// site-scoped path is exercised instead of the noActiveSite short-circuit.
vi.mock('../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: vi.fn(async () => SITE_ID),
  resolveWriteSiteId: vi.fn(async () => ({ ok: true, siteId: SITE_ID })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async () => ({
    signatureId: '88888888-8888-4888-8888-888888888888',
    signerUserId: USER_ID,
    intent: 'qa.inspection.submit',
    subjectHash: 'b'.repeat(64),
    signedAt: '2026-06-11T12:00:00.000Z',
    auditEventId: 43,
    nonce: 'nonce-2',
  })),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }

      if (q.startsWith('select qi.id::text') && q.includes('from public.quality_inspections qi')) {
        return {
          rows: [
            {
              id: INSPECTION_ID,
              inspection_number: 'INSP-00000001',
              reference_type: 'lp',
              reference_id: LP_ID,
              reference_display: 'LP-0001',
              product_id: PRODUCT_ID,
              product_code: 'FG-001',
              product_name: 'Finished good',
              status: 'pending',
              assigned_to: ASSIGNED_ID,
              assigned_email: 'qa@example.test',
              assigned_name: 'QA User',
              due_date: '2026-06-12',
              created_at: '2026-06-11T10:00:00.000Z',
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('insert into public.quality_inspections')) {
        return {
          rows: [
            {
              id: INSPECTION_ID,
              inspection_number: 'INSP-00000001',
              reference_type: params[0],
              reference_id: params[1],
              status: 'pending',
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('update public.quality_inspections') && q.includes("set status = 'in_progress'")) {
        return {
          rows: [
            {
              id: INSPECTION_ID,
              status: 'in_progress',
              parameters: JSON.parse(String(params[1])),
              result_notes: params[2],
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('select id::text, inspection_number')) {
        return {
          rows: [
            {
              id: INSPECTION_ID,
              inspection_number: 'INSP-00000001',
              reference_type: currentReferenceType,
              reference_id: LP_ID,
              status: 'in_progress',
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('update public.quality_inspections') && q.includes('decided_by')) {
        return {
          rows: [
            {
              id: INSPECTION_ID,
              inspection_number: 'INSP-00000001',
              status: params[1],
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('update public.license_plates')) {
        return { rows: [{ id: LP_ID }], rowCount: 1 };
      }

      // createInspectionHoldIfMissing: existence check — no active hold, so
      // proceed to insert.
      if (q.includes('from public.quality_holds') && q.includes('reference_type = $1')) {
        return { rows: [], rowCount: 0 };
      }

      if (q.startsWith('insert into public.quality_holds')) {
        return { rows: [{ id: HOLD_ID, hold_number: 'HLD-00000001' }], rowCount: 1 };
      }

      // createHoldCore: LP data fetch for quality_hold_items (selects status +
      // qa_status alongside id and quantity).
      if (q.startsWith('select id::text, status, qa_status, quantity::text')) {
        return { rows: [{ id: LP_ID, status: 'available', qa_status: 'pending', quantity: '10.000000' }], rowCount: 1 };
      }

      if (q.startsWith('insert into public.quality_hold_items')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('select id::text, quantity::text')) {
        return { rows: [{ id: LP_ID, quantity: '10.000000' }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('quality inspection server actions', () => {
  beforeEach(() => {
    allowPermission = true;
    currentReferenceType = 'lp';
    client = makeClient();
    vi.clearAllMocks();
  });

  it('lists inspections with reference, product, and assignee data', async () => {
    const result = await listInspections({ status: 'pending', search: 'LP-0001', limit: 25 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        inspectionNumber: 'INSP-00000001',
        referenceDisplay: 'LP-0001',
        productCode: 'FG-001',
        assignedTo: { id: ASSIGNED_ID, email: 'qa@example.test', name: 'QA User' },
      }),
    );
    const listCall = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('select qi.id::text'));
    expect(listCall?.[1]).toEqual(['pending', 'LP-0001', 25, SITE_ID]);
  });

  it('enforces assignment permission when creating inspections', async () => {
    allowPermission = false;

    await expect(
      createInspection({
        referenceType: 'lp',
        referenceId: LP_ID,
        productId: PRODUCT_ID,
      }),
    ).resolves.toEqual({ ok: false, reason: 'forbidden' });
  });

  it('creates inspections with INSP document numbering and assignment fields', async () => {
    const result = await createInspection({
      referenceType: 'lp',
      referenceId: LP_ID,
      productId: PRODUCT_ID,
      assignedTo: ASSIGNED_ID,
      dueDate: '2026-06-12',
      notes: 'incoming QA',
    });

    expect(result).toEqual({
      ok: true,
      data: {
        id: INSPECTION_ID,
        inspectionNumber: 'INSP-00000001',
        referenceType: 'lp',
        referenceId: LP_ID,
        status: 'pending',
      },
    });
    const insertCall = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('insert into public.quality_inspections'));
    expect(String(insertCall?.[0])).toContain('public.next_quality_inspection_number(app.current_org_id())');
    // site_id is bound as the 8th param ($8::uuid) — the active site resolved above.
    expect(insertCall?.[1]).toEqual(['lp', LP_ID, PRODUCT_ID, ASSIGNED_ID, '2026-06-12', 'incoming QA', USER_ID, SITE_ID]);
  });

  it('records parameter results and marks the inspection in progress', async () => {
    const parameters = [{ name: 'Temperature', expected: '< 5C', actual: '3C', pass: true }];
    const result = await recordInspectionResult({
      inspectionId: INSPECTION_ID,
      parameters,
      notes: 'within spec',
    });

    expect(result).toEqual({
      ok: true,
      data: {
        id: INSPECTION_ID,
        status: 'in_progress',
        parameters,
        notes: 'within spec',
      },
    });
    const updateCall = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).includes("set status = 'in_progress'"));
    expect(updateCall?.[1]).toEqual([INSPECTION_ID, JSON.stringify(parameters), 'within spec']);
  });

  it('submits hold decisions with e-signature, LP on_hold status, and quality hold rows', async () => {
    const result = await submitInspectionDecision({
      inspectionId: INSPECTION_ID,
      decision: 'hold',
      signature: { password: '1234' },
      note: 'label mismatch',
    });

    expect(result).toEqual({
      ok: true,
      data: {
        id: INSPECTION_ID,
        inspectionNumber: 'INSP-00000001',
        status: 'on_hold',
        qaStatus: 'on_hold',
        signatureHash: 'b'.repeat(64),
      },
    });

    const lpUpdate = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('update public.license_plates'));
    expect(lpUpdate?.[1]).toEqual([LP_ID, 'on_hold', USER_ID, ['consumed', 'merged', 'shipped', 'returned']]);
    expect(vi.mocked(client.query).mock.calls.some(([sql]) => normalize(String(sql)).startsWith('insert into public.quality_holds'))).toBe(true);
    expect(vi.mocked(client.query).mock.calls.some(([sql]) => normalize(String(sql)).startsWith('insert into public.quality_hold_items'))).toBe(true);

    // The inline inspection-hold MUST emit the canonical quality.hold.created event
    // (same shape as hold-actions.ts::createHold) so consumers/audit see it.
    // writeOutbox binds params as [eventType, aggregateId, payloadJson].
    const outbox = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('insert into public.outbox_events'),
    );
    expect(outbox).toBeTruthy();
    expect(outbox?.[1]?.[0]).toBe('quality.hold.created');
    expect(outbox?.[1]?.[1]).toBe(HOLD_ID);
    const payload = JSON.parse(String(outbox?.[1]?.[2] ?? '{}'));
    expect(payload).toMatchObject({
      holdId: HOLD_ID,
      holdNumber: 'HLD-00000001',
      referenceType: 'lp',
      referenceId: LP_ID,
      lpIds: [LP_ID],
    });
  });
});

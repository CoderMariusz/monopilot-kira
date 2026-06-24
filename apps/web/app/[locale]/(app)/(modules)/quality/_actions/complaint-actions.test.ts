import { beforeEach, describe, expect, it, vi } from 'vitest';

import { signEvent } from '@monopilot/e-sign';
import {
  convertComplaintToNcr,
  createCapaAction,
  createComplaint,
  resolveCapaAction,
} from './complaint-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const COMPLAINT_ID = '33333333-3333-4333-8333-333333333333';
const CUSTOMER_ID = '44444444-4444-4444-8444-444444444444';
const LP_ID = '55555555-5555-4555-8555-555555555555';
const PRODUCT_ID = '66666666-6666-4666-8666-666666666666';
const NCR_ID = '77777777-7777-4777-8777-777777777777';
const CAPA_ID = '88888888-8888-4888-8888-888888888888';
const ESIGN_REF = 'a'.repeat(64);

let client: QueryClient;
let permissions: Set<string>;

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async () => ({
    signatureId: '99999999-9999-4999-8999-999999999999',
    signerUserId: USER_ID,
    intent: 'qa.capa.close',
    subjectHash: ESIGN_REF,
    signedAt: '2026-06-23T12:00:00.000Z',
    auditEventId: 50,
    nonce: 'nonce-capa',
  })),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function complaintDbRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: COMPLAINT_ID,
    complaint_number: 'CMP-0001',
    customer_id: CUSTOMER_ID,
    customer_code: 'ACME',
    customer_name: 'ACME Foods',
    customer_display: 'ACME - ACME Foods',
    lp_id: LP_ID,
    lp_code: 'LP-0001',
    batch_ref: 'BATCH-1',
    batch_display: 'BATCH-1',
    description: 'Customer reported damaged seal',
    severity: 'high',
    status: 'open',
    ncr_id: null,
    opened_by: USER_ID,
    opened_at: '2026-06-23T10:00:00.000Z',
    closed_at: null,
    created_at: '2026-06-23T10:00:00.000Z',
    updated_at: '2026-06-23T10:00:00.000Z',
    ...overrides,
  };
}

function capaDbRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CAPA_ID,
    source_type: 'complaint',
    source_id: COMPLAINT_ID,
    action_type: 'corrective',
    description: 'Retrain packing operators',
    owner_user_id: USER_ID,
    due_date: '2026-06-30',
    status: 'open',
    closed_by: null,
    closed_at: null,
    esign_ref: null,
    created_at: '2026-06-23T10:00:00.000Z',
    updated_at: '2026-06-23T10:00:00.000Z',
    ...overrides,
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

      if (q.startsWith('with inserted as ( insert into public.complaints')) {
        return {
          rows: [
            complaintDbRow({
              customer_id: params[0],
              lp_id: params[1],
              batch_ref: params[2],
              description: params[3],
              severity: params[4],
              status: 'open',
              opened_by: params[5],
            }),
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('select comp.id::text') && q.includes('from public.complaints comp') && q.includes('for update')) {
        return {
          rows: [
            {
              id: COMPLAINT_ID,
              complaint_number: 'CMP-0001',
              description: 'Customer reported damaged seal',
              severity: 'high',
              status: 'open',
              ncr_id: null,
              batch_ref: 'BATCH-1',
              lp_code: 'LP-0001',
              product_id: PRODUCT_ID,
            },
          ],
          rowCount: 1,
        };
      }

      // No pre-existing orphan NCR for this complaint (the no-recovery path).
      if (q.startsWith('select id::text') && q.includes('from public.ncr_reports')) {
        return { rows: [], rowCount: 0 };
      }

      // convertComplaintToNcr now inserts the NCR inline on the SAME txn client
      // (the old nested createNcr/withOrgContext is gone).
      if (q.startsWith('insert into public.ncr_reports')) {
        return {
          rows: [{ id: NCR_ID, ncr_number: 'NCR-00001001', status: 'open' }],
          rowCount: 1,
        };
      }

      if (q.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.complaints')) {
        return { rows: [{ id: COMPLAINT_ID, ncr_id: params[1] }], rowCount: 1 };
      }

      if (q.startsWith('insert into public.capa_actions')) {
        return {
          rows: [
            capaDbRow({
              source_type: params[0],
              source_id: params[1],
              action_type: params[2],
              description: params[3],
              owner_user_id: params[4],
              due_date: params[5],
              status: 'open',
            }),
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('select id::text, source_type') && q.includes('from public.capa_actions') && q.includes('for update')) {
        return {
          rows: [
            {
              id: CAPA_ID,
              source_type: 'complaint',
              source_id: COMPLAINT_ID,
              action_type: 'corrective',
              description: 'Retrain packing operators',
              status: 'open',
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('update public.capa_actions') && q.includes("set status = 'closed'")) {
        return {
          rows: [
            capaDbRow({
              status: 'closed',
              closed_by: params[1],
              closed_at: '2026-06-23T12:00:00.000Z',
              esign_ref: params[2],
            }),
          ],
          rowCount: 1,
        };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('quality complaint and CAPA actions', () => {
  beforeEach(() => {
    permissions = new Set(['quality.dashboard.view', 'quality.ncr.create']);
    client = makeClient();
    vi.clearAllMocks();
    vi.mocked(signEvent).mockResolvedValue({
      signatureId: '99999999-9999-4999-8999-999999999999',
      signerUserId: USER_ID,
      intent: 'qa.capa.close',
      subjectHash: ESIGN_REF,
      signedAt: '2026-06-23T12:00:00.000Z',
      auditEventId: 50,
      nonce: 'nonce-capa',
    });
  });

  it('createComplaint inserts a row with status open', async () => {
    const result = await createComplaint({
      customerId: CUSTOMER_ID,
      lpId: LP_ID,
      batchRef: 'BATCH-1',
      description: 'Customer reported damaged seal',
      severity: 'high',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected complaint creation');
    expect(result.data.status).toBe('open');
    const insert = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('with inserted as ( insert into public.complaints'),
    );
    expect(insert).toBeTruthy();
    expect(insert?.[1]).toEqual([
      CUSTOMER_ID,
      LP_ID,
      'BATCH-1',
      'Customer reported damaged seal',
      'high',
      USER_ID,
    ]);
    expect(normalize(String(insert?.[0]))).toContain("'open'");
  });

  it('convertComplaintToNcr creates the NCR atomically and links the converted complaint', async () => {
    const result = await convertComplaintToNcr(COMPLAINT_ID);

    expect(result).toEqual({ ok: true, data: { complaintId: COMPLAINT_ID, ncrId: NCR_ID } });
    // NCR insert now runs inline on the same transactional client; assert the
    // insert params + that the opened-outbox event fired in the same txn.
    const ncrInsert = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('insert into public.ncr_reports'),
    );
    expect(ncrInsert).toBeTruthy();
    expect(ncrInsert?.[1]).toEqual([
      'major',
      'Customer complaint CMP-0001',
      'Customer reported damaged seal\n\nLP: LP-0001\n\nBatch: BATCH-1',
      COMPLAINT_ID,
      PRODUCT_ID,
      USER_ID,
    ]);
    const outbox = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('insert into public.outbox_events'),
    );
    expect(outbox).toBeTruthy();
    const update = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('update public.complaints'));
    expect(update?.[1]).toEqual([COMPLAINT_ID, NCR_ID]);
    expect(normalize(String(update?.[0]))).toContain("status = 'converted'");
    expect(normalize(String(update?.[0]))).toContain('ncr_id = $2::uuid');
  });

  it('createCapaAction inserts an open capa_actions row', async () => {
    const result = await createCapaAction({
      sourceType: 'complaint',
      sourceId: COMPLAINT_ID,
      actionType: 'corrective',
      description: 'Retrain packing operators',
      ownerUserId: USER_ID,
      dueDate: '2026-06-30',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected CAPA action creation');
    expect(result.data.status).toBe('open');
    const insert = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('insert into public.capa_actions'),
    );
    expect(insert?.[1]).toEqual([
      'complaint',
      COMPLAINT_ID,
      'corrective',
      'Retrain packing operators',
      USER_ID,
      '2026-06-30',
    ]);
    expect(normalize(String(insert?.[0]))).toContain("'open'");
  });

  it('resolveCapaAction signs, closes the action, and rejects missing or invalid signatures', async () => {
    const closed = await resolveCapaAction(CAPA_ID, { signature: { password: 'pw' } });

    expect(closed.ok).toBe(true);
    if (!closed.ok) throw new Error('expected CAPA action closure');
    expect(signEvent).toHaveBeenCalledWith(
      {
        signerUserId: USER_ID,
        pin: 'pw',
        intent: 'qa.capa.close',
        subject: {
          capaActionId: CAPA_ID,
          sourceType: 'complaint',
          sourceId: COMPLAINT_ID,
          actionType: 'corrective',
        },
        reason: 'CAPA action closure',
      },
      { client },
    );
    expect(closed.data.status).toBe('closed');
    expect(closed.data.closedBy).toBe(USER_ID);
    expect(closed.data.esignRef).toBe(ESIGN_REF);
    const update = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('update public.capa_actions'),
    );
    expect(update?.[1]).toEqual([CAPA_ID, USER_ID, ESIGN_REF]);
    expect(normalize(String(update?.[0]))).toContain("status = 'closed'");

    vi.clearAllMocks();
    const missing = await resolveCapaAction(CAPA_ID, { signature: { password: '' } });
    expect(missing).toEqual({ ok: false, error: 'esign_failed' });
    expect(signEvent).not.toHaveBeenCalled();

    vi.mocked(signEvent).mockRejectedValueOnce(new Error('bad pin'));
    const invalid = await resolveCapaAction(CAPA_ID, { signature: { password: 'bad' } });
    expect(invalid).toEqual({ ok: false, error: 'esign_failed' });
  });
});

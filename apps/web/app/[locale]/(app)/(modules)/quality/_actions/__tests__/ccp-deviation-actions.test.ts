import { signEvent } from '@monopilot/e-sign';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { listCcpDeviations, resolveCcpDeviation } from '../ccp-deviation-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CCP_ID = '33333333-3333-4333-8333-333333333333';
const LOG_ID = '44444444-4444-4444-8444-444444444444';
const HOLD_ID = '55555555-5555-4555-8555-555555555555';
const DEVIATION_ID = '77777777-7777-4777-8777-777777777777';

let client: QueryClient;
let permissions: Set<string>;
let deviationStatus: 'open' | 'resolved' = 'open';
let lastResolvedDisposition: string | null = null;

vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async (input: { intent: string }) => ({
    signatureId: '88888888-8888-4888-8888-888888888888',
    signerUserId: USER_ID,
    intent: input.intent,
    subjectHash: 'd'.repeat(64),
    signedAt: '2026-06-23T10:00:00.000Z',
    auditEventId: 306,
    nonce: 'nonce-ccp-deviation',
  })),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
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

      if (q.includes('from public.ccp_deviations d') && q.includes('for update')) {
        if (deviationStatus === 'resolved') {
          return {
            rows: [
              {
                id: DEVIATION_ID,
                status: 'resolved',
                ccp_id: CCP_ID,
                ccp_code: 'CCP-COOK',
                monitoring_log_id: LOG_ID,
                measured_value: '69.9999',
                hold_id: HOLD_ID,
              },
            ],
            rowCount: 1,
          };
        }
        return {
          rows: [
            {
              id: DEVIATION_ID,
              status: 'open',
              ccp_id: CCP_ID,
              ccp_code: 'CCP-COOK',
              monitoring_log_id: LOG_ID,
              measured_value: '69.9999',
              hold_id: HOLD_ID,
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('update public.ccp_deviations') && q.includes("set status = 'resolved'")) {
        deviationStatus = 'resolved';
        lastResolvedDisposition = String(params[2] ?? null);
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('select d.id::text') && q.includes('from public.ccp_deviations d')) {
        return {
          rows: [
            {
              id: DEVIATION_ID,
              status: deviationStatus,
              ccp_id: CCP_ID,
              ccp_code: 'CCP-COOK',
              ccp_name: 'Cook temperature',
              monitoring_log_id: LOG_ID,
              measured_value: '69.9999',
              uom: 'C',
              action_taken: params[1] === undefined ? null : 'Corrective action recorded',
              disposition: deviationStatus === 'resolved' ? lastResolvedDisposition : null,
              hold_id: HOLD_ID,
              hold_number: 'HLD-00001000',
              hold_reference_type: 'lp',
              hold_reference_display: 'LP-0001 / FG-COOK',
              hold_status: 'open',
              opened_at: '2026-06-23T09:00:00.000Z',
              opened_by_display: 'QA Lead',
              closed_at: deviationStatus === 'resolved' ? '2026-06-23T10:00:00.000Z' : null,
              closed_by_display: deviationStatus === 'resolved' ? 'QA Lead' : null,
              esign_ref: deviationStatus === 'resolved' ? '88888888-8888-4888-8888-888888888888' : null,
            },
          ],
          rowCount: 1,
        };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('resolveCcpDeviation', () => {
  beforeEach(() => {
    client = makeClient();
    permissions = new Set(['quality.ccp.deviation_override']);
    deviationStatus = 'open';
    lastResolvedDisposition = null;
    vi.clearAllMocks();
  });

  it('transitions open → resolved with e-sign and canonical disposition', async () => {
    const result = await resolveCcpDeviation(DEVIATION_ID, {
      actionTaken: 'Recooked batch to target temperature',
      disposition: 'corrected',
      signature: { password: 'pin-1234' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe('resolved');
      expect(result.data.disposition).toBe('corrected');
    }
    expect(withOrgContext).toHaveBeenCalledTimes(1);
    expect(signEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'qa.haccp.ccp.deviation',
        subject: expect.objectContaining({ disposition: 'corrected' }),
      }),
      { client },
    );

    const calls = vi.mocked(client.query).mock.calls;
    const deviationUpdate = calls.find(
      ([sql]) => normalize(String(sql)).startsWith('update public.ccp_deviations') && normalize(String(sql)).includes("set status = 'resolved'"),
    );
    expect(deviationUpdate?.[1]).toEqual([
      DEVIATION_ID,
      'Recooked batch to target temperature',
      'corrected',
      USER_ID,
      '88888888-8888-4888-8888-888888888888',
    ]);

    const holdUpdate = calls.find(
      ([sql]) =>
        normalize(String(sql)).startsWith('update public.quality_holds') ||
        normalize(String(sql)).startsWith('insert into public.quality_holds'),
    );
    expect(holdUpdate).toBeUndefined();
  });

  it('rejects double-resolve on an already resolved deviation', async () => {
    deviationStatus = 'resolved';

    const result = await resolveCcpDeviation(DEVIATION_ID, {
      actionTaken: 'Second attempt',
      disposition: 'disposed',
      signature: { password: 'pin-1234' },
    });

    expect(result).toEqual({
      ok: false,
      reason: 'error',
      message: 'CCP deviation is already resolved',
    });
    expect(signEvent).not.toHaveBeenCalled();
  });

  it('returns forbidden without quality.ccp.deviation_override', async () => {
    permissions = new Set(['quality.dashboard.view']);

    const result = await resolveCcpDeviation(DEVIATION_ID, {
      actionTaken: 'Attempt without permission',
      disposition: 'corrected',
      signature: { password: 'pin-1234' },
    });

    expect(result).toEqual({ ok: false, reason: 'forbidden' });
    expect(signEvent).not.toHaveBeenCalled();
  });

  it('does not mutate linked holds when resolving', async () => {
    const result = await resolveCcpDeviation(DEVIATION_ID, {
      actionTaken: 'Product remains on hold pending investigation',
      disposition: 'product_held',
      signature: { password: 'pin-1234' },
    });

    expect(result.ok).toBe(true);
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((q) => q.startsWith('update public.quality_holds'))).toBe(false);
    expect(calls.some((q) => q.startsWith('update public.license_plates'))).toBe(false);
    expect(signEvent).toHaveBeenCalledTimes(1);
    expect(signEvent).not.toHaveBeenCalledWith(expect.objectContaining({ intent: 'qa.hold.release' }), expect.anything());
  });
});

describe('listCcpDeviations RBAC', () => {
  beforeEach(() => {
    client = makeClient();
    permissions = new Set(['quality.dashboard.view']);
    deviationStatus = 'open';
    vi.clearAllMocks();
  });

  it('allows read with dashboard.view', async () => {
    const result = await listCcpDeviations();
    expect(result.ok).toBe(true);
  });

  it('forbids read without dashboard.view or deviation_override', async () => {
    permissions = new Set();
    const result = await listCcpDeviations();
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });
});

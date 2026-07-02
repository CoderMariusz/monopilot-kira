import { signEvent } from '@monopilot/e-sign';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { resolveCcpDeviation } from '../ccp-deviation-actions';

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
const LP_ID = '66666666-6666-4666-8666-666666666666';
const DEVIATION_ID = '77777777-7777-4777-8777-777777777777';

let client: QueryClient;

vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async (input: { intent: string }) => ({
    signatureId: input.intent === 'qa.hold.release' ? '99999999-9999-4999-8999-999999999999' : '88888888-8888-4888-8888-888888888888',
    signerUserId: USER_ID,
    intent: input.intent,
    subjectHash: input.intent === 'qa.hold.release' ? 'h'.repeat(64) : 'd'.repeat(64),
    signedAt: '2026-06-23T10:00:00.000Z',
    auditEventId: input.intent === 'qa.hold.release' ? 307 : 306,
    nonce: input.intent === 'qa.hold.release' ? 'nonce-hold-release' : 'nonce-ccp-deviation',
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
        return { rows: [{ ok: true }], rowCount: 1 };
      }

      if (q.includes('from public.ccp_deviations d') && q.includes('for update')) {
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
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('select id::text, hold_number')) {
        return {
          rows: [
            {
              id: HOLD_ID,
              hold_number: 'HLD-00001000',
              reference_type: 'lp',
              reference_id: LP_ID,
              hold_status: 'open',
              released_at: null,
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('select id::text, hold_status, released_at')) {
        return { rows: [{ id: HOLD_ID, hold_status: 'open', released_at: null }], rowCount: 1 };
      }

      if (q.startsWith('update public.quality_holds')) {
        return q.includes('returning released_at')
          ? { rows: [{ released_at: '2026-06-23T10:01:00.000Z' }], rowCount: 1 }
          : { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.quality_hold_items')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('select lp.id::text') && q.includes('from public.quality_hold_items qhi')) {
        return {
          rows: [{ id: LP_ID, status: 'blocked', qa_status: 'on_hold', site_id: null, wo_id: null, grn_id: null }],
          rowCount: 1,
        };
      }

      if (q.startsWith('update public.license_plates')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('insert into public.lp_state_history')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('select d.id::text') && q.includes('from public.ccp_deviations d')) {
        return {
          rows: [
            {
              id: DEVIATION_ID,
              status: 'resolved',
              ccp_id: CCP_ID,
              ccp_code: 'CCP-COOK',
              ccp_name: 'Cook temperature',
              monitoring_log_id: LOG_ID,
              measured_value: '69.9999',
              uom: 'C',
              action_taken: params[1] ?? 'Corrective action recorded',
              disposition: 'stored disposition',
              hold_id: HOLD_ID,
              hold_number: 'HLD-00001000',
              hold_reference_type: 'lp',
              hold_reference_display: 'LP-0001 / FG-COOK',
              hold_status: 'open',
              opened_at: '2026-06-23T09:00:00.000Z',
              opened_by_display: 'QA Lead',
              closed_at: '2026-06-23T10:00:00.000Z',
              closed_by_display: 'QA Lead',
              esign_ref: '88888888-8888-4888-8888-888888888888',
            },
          ],
          rowCount: 1,
        };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('resolveCcpDeviation hold disposition handling', () => {
  beforeEach(() => {
    client = makeClient();
    vi.clearAllMocks();
  });

  it('keeps the auto-created hold active for a non-release disposition', async () => {
    const result = await resolveCcpDeviation(DEVIATION_ID, {
      actionTaken: 'Batch rejected after CCP failure',
      disposition: 'scrap',
      signature: { password: 'pin-1234' },
    });

    expect(result.ok).toBe(true);
    expect(withOrgContext).toHaveBeenCalledTimes(1);

    const calls = vi.mocked(client.query).mock.calls;
    const holdRelease = calls.find(([sql]) => normalize(String(sql)).startsWith('update public.quality_holds') && normalize(String(sql)).includes("set hold_status = 'released'"));
    expect(holdRelease).toBeUndefined();

    const holdQuarantine = calls.find(([sql]) => normalize(String(sql)).startsWith('update public.quality_holds') && normalize(String(sql)).includes("set hold_status = 'quarantined'"));
    expect(holdQuarantine?.[1]).toEqual([HOLD_ID, 'scrap', 'CCP deviation resolved: scrap']);

    const lpUpdate = calls.find(([sql]) => normalize(String(sql)).startsWith('update public.license_plates'));
    expect(lpUpdate?.[1]).toEqual([[LP_ID], 'rejected', 'quarantine', USER_ID, ['consumed', 'merged', 'shipped', 'returned']]);
  });

  it('releases a genuine release disposition on the same transaction client', async () => {
    const result = await resolveCcpDeviation(DEVIATION_ID, {
      actionTaken: 'QA reviewed records and released product',
      disposition: 'Released after QA review',
      signature: { password: 'pin-1234' },
    });

    expect(result.ok).toBe(true);
    expect(withOrgContext).toHaveBeenCalledTimes(1);

    const calls = vi.mocked(client.query).mock.calls;
    const deviationUpdateIndex = calls.findIndex(([sql]) => normalize(String(sql)).startsWith('update public.ccp_deviations') && normalize(String(sql)).includes("set status = 'resolved'"));
    const holdReleaseIndex = calls.findIndex(([sql]) => normalize(String(sql)).startsWith('update public.quality_holds') && normalize(String(sql)).includes("set hold_status = 'released'"));
    expect(deviationUpdateIndex).toBeGreaterThanOrEqual(0);
    expect(holdReleaseIndex).toBeGreaterThan(deviationUpdateIndex);
    expect(calls[holdReleaseIndex]?.[1]).toEqual([HOLD_ID, USER_ID, 'release_as_is', 'CCP deviation resolved', 'h'.repeat(64)]);

    expect(signEvent).toHaveBeenCalledWith(expect.objectContaining({ intent: 'qa.haccp.ccp.deviation' }), { client });
    expect(signEvent).toHaveBeenCalledWith(expect.objectContaining({ intent: 'qa.hold.release' }), { client });
  });
});

import { signEvent } from '@monopilot/e-sign';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const DEVIATION_ID = '44444444-4444-4444-8444-444444444444';
const LOG_ID = '55555555-5555-4555-8555-555555555555';

let client: QueryClient;
let status: 'open' | 'resolved';
let disposition: 'corrected' | 'product_held' | 'disposed' | null;

vi.mock('@monopilot/e-sign', () => {
  class ESignPolicyError extends Error {
    code: string;
    constructor(code: string, message?: string) {
      super(message ?? code);
      this.code = code;
    }
  }

  return {
    ESignPolicyError,
    ESignSoDError: class ESignSoDError extends Error {},
    hashESignSubject: vi.fn(() => 'd'.repeat(64)),
    readSignoffPolicy: vi.fn(async () => ({
      signoffType: 'qa.haccp.ccp.deviation',
      requiredSignatures: 1,
      firstSignerRoleId: null,
      secondSignerRoleId: null,
      allowSameUser: false,
    })),
    signEvent: vi.fn(async () => ({
      signatureId: '66666666-6666-4666-8666-666666666666',
      signerUserId: USER_ID,
      intent: 'qa.haccp.ccp.deviation',
      subjectHash: 'd'.repeat(64),
      signedAt: '2026-07-30T10:00:00.000Z',
      auditEventId: 306,
      nonce: 'ccp-contract',
    })),
  };
});

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: {
    userId: string;
    orgId: string;
    client: QueryClient;
  }) => Promise<unknown>) => action({ userId: USER_ID, orgId: ORG_ID, client })),
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
          rows: [{
            id: DEVIATION_ID,
            status,
            ccp_id: CCP_ID,
            ccp_code: 'CCP-COOK',
            monitoring_log_id: LOG_ID,
            measured_value: '69.9999',
            hold_id: null,
          }],
          rowCount: 1,
        };
      }

      if (q.startsWith('update public.ccp_deviations') && q.includes("set status = 'resolved'")) {
        status = 'resolved';
        disposition = params[2] as typeof disposition;
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('select d.id::text') && q.includes('from public.ccp_deviations d')) {
        return {
          rows: [{
            id: DEVIATION_ID,
            status,
            ccp_id: CCP_ID,
            ccp_code: 'CCP-COOK',
            ccp_name: 'Cook temperature',
            monitoring_log_id: LOG_ID,
            measured_value: '69.9999',
            uom: 'C',
            action_taken: status === 'resolved' ? 'Corrective action recorded' : null,
            disposition,
            hold_id: null,
            hold_number: null,
            hold_reference_type: null,
            hold_reference_display: null,
            hold_status: null,
            opened_at: '2026-07-30T09:00:00.000Z',
            opened_by_display: 'QA Lead',
            closed_at: status === 'resolved' ? '2026-07-30T10:00:00.000Z' : null,
            closed_by_display: status === 'resolved' ? 'QA Lead' : null,
            esign_ref: status === 'resolved' ? '66666666-6666-4666-8666-666666666666' : null,
          }],
          rowCount: 1,
        };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('CCP deviation P0 catalog contract', () => {
  beforeEach(() => {
    status = 'open';
    disposition = null;
    client = makeClient();
    vi.clearAllMocks();
  });

  it.each(['corrected', 'product_held', 'disposed'] as const)(
    '[SFQ-124] persists signed disposition %s',
    async (expectedDisposition) => {
      const result = await resolveCcpDeviation(DEVIATION_ID, {
        actionTaken: 'Corrective action recorded',
        disposition: expectedDisposition,
        signature: { password: 'pin-1234' },
      });

      expect(result).toMatchObject({
        ok: true,
        data: { status: 'resolved', disposition: expectedDisposition },
      });
      expect(signEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          intent: 'qa.haccp.ccp.deviation',
          subject: expect.objectContaining({ disposition: expectedDisposition }),
        }),
        expect.objectContaining({ client }),
      );
    },
  );

  it('[SFQ-124] rejects a second resolution before e-sign', async () => {
    status = 'resolved';

    const result = await resolveCcpDeviation(DEVIATION_ID, {
      actionTaken: 'Duplicate resolution',
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
});

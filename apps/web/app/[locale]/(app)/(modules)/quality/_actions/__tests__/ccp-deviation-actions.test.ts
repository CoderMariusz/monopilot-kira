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
const SECOND_ROLE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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
let deviationStatus: 'open' | 'resolved' = 'open';
let lastResolvedDisposition: string | null = null;

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
      requiredSignatures: eSignState.requiredSignatures,
      firstSignerRoleId: null,
      secondSignerRoleId: eSignState.requiredSignatures === 2 ? SECOND_ROLE_ID : null,
      allowSameUser: false,
    })),
    signEvent: vi.fn(async (input: { intent: string; signerUserId: string }, options?: { policyMode?: string }) => {
      if (eSignState.requiredSignatures === 2 && (options?.policyMode ?? 'single') === 'single') {
        throw new ESignPolicyError('second_signature_required');
      }
      return {
        signatureId: '88888888-8888-4888-8888-888888888888',
        signerUserId: input.signerUserId,
        intent: input.intent,
        subjectHash: 'd'.repeat(64),
        signedAt: '2026-06-23T10:00:00.000Z',
        auditEventId: 306,
        nonce: 'nonce-ccp-deviation',
      };
    }),
  };
});

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: eSignState.currentUserId, orgId: ORG_ID, client }),
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
                opened_by: USER_ID,
                action_taken: eSignState.storedSignature ? 'Recooked batch to target temperature' : null,
                disposition: eSignState.storedSignature ? 'corrected' : null,
                esign_ref: eSignState.storedSignature?.signature_id ?? null,
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
              opened_by: USER_ID,
              action_taken: eSignState.storedSignature ? 'Recooked batch to target temperature' : null,
              disposition: eSignState.storedSignature ? 'corrected' : null,
              esign_ref: eSignState.storedSignature?.signature_id ?? null,
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

      if (q.startsWith('update public.ccp_deviations') && q.includes('and esign_ref is null')) {
        return { rows: [{ id: DEVIATION_ID }], rowCount: 1 };
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
    eSignState.requiredSignatures = 1;
    eSignState.currentUserId = USER_ID;
    eSignState.storedSignature = null;
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
      expect.objectContaining({ client }),
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

  it('keeps the deviation open after the first signature when policy requires two', async () => {
    eSignState.requiredSignatures = 2;

    const result = await resolveCcpDeviation(DEVIATION_ID, {
      actionTaken: 'Recooked batch to target temperature',
      disposition: 'corrected',
      signature: { password: 'pin-1234' },
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        id: DEVIATION_ID,
        status: 'open',
        pendingSignoff: {
          state: 'pending_second_signature',
        },
      },
    });
    expect(deviationStatus).toBe('open');
  });

  it('rejects the first signer in the second slot and resolves for a different signer', async () => {
    eSignState.requiredSignatures = 2;
    eSignState.storedSignature = {
      signature_id: '99999999-9999-4999-8999-999999999999',
      signer_user_id: USER_ID,
      signer_display_name: 'Quality Lead Anna',
      subject_hash: 'd'.repeat(64),
      created_at: '2026-07-30T10:00:00.000Z',
    };
    const input = {
      actionTaken: 'Recooked batch to target temperature',
      disposition: 'corrected' as const,
      signature: { password: 'secret' },
    };

    const sameSigner = await resolveCcpDeviation(DEVIATION_ID, input);
    expect(sameSigner).toEqual({
      ok: false,
      reason: 'error',
      message: 'Second signature must be provided by a different user',
    });
    expect(signEvent).not.toHaveBeenCalled();

    vi.clearAllMocks();
    eSignState.currentUserId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const otherSigner = await resolveCcpDeviation(DEVIATION_ID, input);
    expect(otherSigner).toMatchObject({
      ok: true,
      data: { id: DEVIATION_ID, status: 'resolved' },
    });
    expect(signEvent).toHaveBeenCalledWith(
      expect.objectContaining({ signerUserId: eSignState.currentUserId }),
      expect.objectContaining({ policyMode: 'dual-secondary' }),
    );
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

import { signEvent } from '@monopilot/e-sign';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { closeNcr, updateNcrInvestigation } from '../ncr-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const NCR_ID = '33333333-3333-4333-8333-333333333333';

let client: QueryClient;
let permissions: Set<string>;
let severity: 'critical' | 'major' | 'minor';
let status: 'open' | 'closed' | 'cancelled';

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: {
    userId: string;
    orgId: string;
    client: QueryClient;
  }) => Promise<unknown>) => action({ userId: USER_ID, orgId: ORG_ID, client })),
}));

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

vi.mock('@monopilot/e-sign', () => ({
  ESignPolicyError: class ESignPolicyError extends Error {
    code: string;
    constructor(code: string, message?: string) {
      super(message ?? code);
      this.code = code;
    }
  },
  ESignSoDError: class ESignSoDError extends Error {},
  hashESignSubject: vi.fn(() => 'b'.repeat(64)),
  readSignoffPolicy: vi.fn(async () => ({
    signoffType: 'qa.ncr.close',
    requiredSignatures: 1,
    firstSignerRoleId: null,
    secondSignerRoleId: null,
    allowSameUser: false,
  })),
  signEvent: vi.fn(async () => ({
    signatureId: '44444444-4444-4444-8444-444444444444',
    signerUserId: USER_ID,
    intent: 'qa.ncr.close',
    subjectHash: 'b'.repeat(64),
    signedAt: '2026-07-30T10:00:00.000Z',
    auditEventId: 44,
    nonce: 'ncr-contract',
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
        const allowed = permissions.has(String(params[2]));
        return { rows: allowed ? [{ ok: true }] : [], rowCount: allowed ? 1 : 0 };
      }

      if (q.includes('select id::text, status, root_cause') && q.includes('from public.ncr_reports')) {
        const terminalIsFiltered = q.includes("status not in ('closed', 'cancelled')");
        const visible = !terminalIsFiltered || status === 'open';
        return {
          rows: visible
            ? [{
                id: NCR_ID,
                status,
                root_cause: null,
                root_cause_category: null,
                immediate_action: null,
              }]
            : [],
          rowCount: visible ? 1 : 0,
        };
      }

      if (q.startsWith('update public.ncr_reports') && q.includes('root_cause')) {
        return {
          rows: [{
            id: NCR_ID,
            status: 'investigating',
            root_cause: params[1],
            root_cause_category: params[2],
            immediate_action: params[3],
            capa_record_id: params[4],
          }],
          rowCount: 1,
        };
      }

      if (q.startsWith('select id::text, ncr_number, severity')) {
        return {
          rows: [{
            id: NCR_ID,
            ncr_number: 'NCR-00001001',
            severity,
            status,
            closed_at: status === 'closed' ? '2026-07-30T10:00:00.000Z' : null,
            // V-QA-NCR-005 — closeNcr refuses without a recorded root cause.
            root_cause: 'Seal jaw misalignment',
          }],
          rowCount: 1,
        };
      }

      if (q.startsWith('update public.ncr_reports') && q.includes("set status = 'closed'")) {
        status = 'closed';
        return { rows: [{ closed_at: '2026-07-30T10:00:00.000Z' }], rowCount: 1 };
      }

      return { rows: [], rowCount: 1 };
    }),
  };
}

describe('NCR P0 catalog contracts', () => {
  beforeEach(() => {
    permissions = new Set(['quality.ncr.create', 'quality.ncr.close_critical']);
    severity = 'critical';
    status = 'open';
    client = makeClient();
    vi.clearAllMocks();
  });

  it('[SFQ-103] accepts an open investigation and rejects a closed NCR without mutation', async () => {
    const open = await updateNcrInvestigation({
      ncrId: NCR_ID,
      rootCause: 'Seal jaw misalignment',
    });
    expect(open).toMatchObject({ ok: true, data: { status: 'investigating' } });

    status = 'closed';
    const terminal = await updateNcrInvestigation({
      ncrId: NCR_ID,
      rootCause: 'Must remain immutable',
    });
    expect(terminal).toEqual({
      ok: false,
      reason: 'error',
      message: 'NCR not found or already terminal',
    });
    expect(
      vi.mocked(client.query).mock.calls.filter(([sql]) =>
        normalize(String(sql)).startsWith('update public.ncr_reports') &&
        normalize(String(sql)).includes('root_cause'),
      ),
    ).toHaveLength(1);
  });

  it('[SFQ-104] closes once with e-sign and rejects the second close', async () => {
    const first = await closeNcr({
      ncrId: NCR_ID,
      resolution: 'Root cause removed',
      signature: { password: 'pw' },
    });
    const second = await closeNcr({
      ncrId: NCR_ID,
      resolution: 'Duplicate close',
      signature: { password: 'pw' },
    });

    expect(first).toMatchObject({ ok: true, data: { status: 'closed' } });
    expect(second).toEqual({
      ok: false,
      reason: 'error',
      message: 'NCR is already terminal',
    });
    expect(signEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'qa.ncr.close',
        subject: expect.objectContaining({
          ncrId: NCR_ID,
          resolution: 'Root cause removed',
        }),
      }),
      expect.objectContaining({ client }),
    );
    expect(signEvent).toHaveBeenCalledTimes(1);
  });

  it('[SFQ-105] splits base and critical close permissions in both directions', async () => {
    permissions = new Set(['quality.ncr.create']);

    await expect(
      closeNcr({ ncrId: NCR_ID, resolution: 'Critical close', signature: { password: 'pw' } }),
    ).resolves.toEqual({ ok: false, reason: 'forbidden' });
    expect(signEvent).not.toHaveBeenCalled();

    severity = 'minor';
    await expect(
      closeNcr({ ncrId: NCR_ID, resolution: 'Minor close', signature: { password: 'pw' } }),
    ).resolves.toMatchObject({ ok: true, data: { status: 'closed' } });

    status = 'open';
    severity = 'critical';
    permissions = new Set(['quality.ncr.close_critical']);
    await expect(
      closeNcr({ ncrId: NCR_ID, resolution: 'Authorized critical close', signature: { password: 'pw' } }),
    ).resolves.toMatchObject({ ok: true, data: { status: 'closed' } });
  });
});

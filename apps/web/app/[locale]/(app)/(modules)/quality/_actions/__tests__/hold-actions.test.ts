import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createHold, listHolds, releaseHold } from '../hold-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const HOLD_ID = '33333333-3333-4333-8333-333333333333';
const LP_ID = '44444444-4444-4444-8444-444444444444';
const TERMINAL_LP_ID = '55555555-5555-4555-8555-555555555555';
const WO_ID = '66666666-6666-4666-8666-666666666666';
const REASON_ID = '77777777-7777-4777-8777-777777777777';

let client: QueryClient;
let allowPermission = true;
let holdAlreadyReleased = false;
let holdReferenceType: 'lp' | 'wo' = 'lp';

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async () => ({
    signatureId: '88888888-8888-4888-8888-888888888888',
    signerUserId: USER_ID,
    intent: 'qa.hold.release',
    subjectHash: 'a'.repeat(64),
    signedAt: '2026-06-11T12:00:00.000Z',
    auditEventId: 42,
    nonce: 'nonce-1',
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

      if (q.includes("from public.reference_tables rt") && q.includes("default_hold_duration_days")) {
        return { rows: [{ duration_days: 3 }], rowCount: 1 };
      }

      if (q.startsWith('insert into public.quality_holds')) {
        return {
          rows: [
            {
              id: HOLD_ID,
              hold_number: 'HLD-00001000',
              reference_type: params[0],
              reference_id: params[1],
              hold_status: 'open',
            },
          ],
          rowCount: 1,
        };
      }

      if (q.includes('from public.license_plates') && q.includes('quantity::text')) {
        return {
          rows: [
            { id: LP_ID, status: 'available', qa_status: 'released', quantity: '12.345000' },
            { id: TERMINAL_LP_ID, status: 'shipped', qa_status: 'released', quantity: '6.000000' },
          ],
          rowCount: 2,
        };
      }

      if (q.startsWith('select id::text, hold_number')) {
        return {
          rows: [
            {
              id: HOLD_ID,
              hold_number: 'HLD-00001000',
              reference_type: holdReferenceType,
              reference_id: holdReferenceType === 'wo' ? WO_ID : LP_ID,
              hold_status: holdAlreadyReleased ? 'released' : 'open',
              released_at: holdAlreadyReleased ? '2026-06-11T11:00:00.000Z' : null,
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('update public.quality_holds')) {
        return { rows: [{ released_at: '2026-06-11T12:00:00.000Z' }], rowCount: 1 };
      }

      if (q.includes('from public.quality_hold_items qhi') && q.includes('join public.license_plates lp')) {
        return {
          rows: [
            { id: LP_ID, status: 'available', qa_status: 'on_hold', site_id: null, wo_id: null, grn_id: null },
            { id: TERMINAL_LP_ID, status: 'shipped', qa_status: 'on_hold', site_id: null, wo_id: null, grn_id: null },
          ],
          rowCount: 2,
        };
      }

      if (q.startsWith('select h.id::text')) {
        return {
          rows: [
            {
              id: HOLD_ID,
              hold_number: 'HLD-00001000',
              reference_type: 'lp',
              reference_id: LP_ID,
              reference_display: 'LP-001 / RM-BEEF-80',
              reason_code_id: REASON_ID,
              reason_label: 'Foreign object risk',
              reason_free_text: null,
              priority: 'critical',
              hold_status: 'open',
              item_count: 2,
              created_at: '2026-06-11T10:00:00.000Z',
              estimated_release_at: '2026-06-14',
              released_at: null,
            },
          ],
          rowCount: 1,
        };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('quality hold server actions', () => {
  beforeEach(() => {
    allowPermission = true;
    holdAlreadyReleased = false;
    holdReferenceType = 'lp';
    client = makeClient();
    vi.clearAllMocks();
  });

  it('enforces RBAC gates with forbidden results', async () => {
    allowPermission = false;

    await expect(listHolds()).resolves.toEqual({ ok: false, reason: 'forbidden' });
    await expect(
      createHold({
        referenceType: 'lp',
        referenceId: LP_ID,
        reasonCodeId: REASON_ID,
        priority: 'critical',
      }),
    ).resolves.toEqual({ ok: false, reason: 'forbidden' });
    await expect(
      releaseHold({
        holdId: HOLD_ID,
        disposition: 'release',
        reasonText: 'clear',
        signature: { password: 'pw' },
      }),
    ).resolves.toEqual({ ok: false, reason: 'forbidden' });
  });

  it('creates an LP hold, writes held item quantities, flips active LP qa_status, and skips terminal LPs', async () => {
    const result = await createHold({
      referenceType: 'lp',
      referenceId: LP_ID,
      reasonCodeId: REASON_ID,
      priority: 'critical',
      lpIds: [TERMINAL_LP_ID],
    });

    expect(result).toEqual({
      ok: true,
      data: {
        id: HOLD_ID,
        holdNumber: 'HLD-00001000',
        referenceType: 'lp',
        referenceId: LP_ID,
        status: 'open',
        heldLpIds: [LP_ID, TERMINAL_LP_ID],
      },
    });

    const calls = vi.mocked(client.query).mock.calls;
    expect(calls.some(([sql]) => normalize(String(sql)).startsWith('insert into public.quality_hold_items'))).toBe(true);
    const lpUpdate = calls.find(([sql]) => normalize(String(sql)).startsWith('update public.license_plates'));
    expect(lpUpdate?.[1]).toEqual([[LP_ID], USER_ID, ['consumed', 'merged', 'shipped', 'returned']]);
    const outbox = calls.find(([sql]) => normalize(String(sql)).startsWith('insert into public.outbox_events'));
    expect(outbox?.[1]?.[0]).toBe('quality.hold.created');
  });

  it('releases a hold, e-signs, restores LP qa_status, writes release history, and refuses double release', async () => {
    const result = await releaseHold({
      holdId: HOLD_ID,
      disposition: 'release',
      reasonText: 'inspection passed',
      signature: { password: 'pw' },
    });

    expect(result).toEqual({
      ok: true,
      data: {
        id: HOLD_ID,
        holdNumber: 'HLD-00001000',
        status: 'released',
        disposition: 'release',
        releasedAt: '2026-06-11T12:00:00.000Z',
        signatureHash: 'a'.repeat(64),
      },
    });

    const calls = vi.mocked(client.query).mock.calls;
    expect(calls.some(([sql]) => normalize(String(sql)).startsWith('update public.quality_hold_items'))).toBe(true);
    const lpUpdate = calls.find(
      ([sql, params]) => normalize(String(sql)).startsWith('update public.license_plates') && params?.[1] === 'released',
    );
    expect(lpUpdate?.[1]).toEqual([[LP_ID, TERMINAL_LP_ID], 'released', USER_ID, ['consumed', 'merged', 'shipped', 'returned'], true]);
    const historyCalls = calls.filter(([sql]) => normalize(String(sql)).startsWith('insert into public.lp_state_history'));
    expect(historyCalls).toHaveLength(1);
    const outbox = calls.find(([sql, params]) => normalize(String(sql)).startsWith('insert into public.outbox_events') && params?.[0] === 'quality.hold.released');
    expect(outbox).toBeTruthy();

    holdAlreadyReleased = true;
    const second = await releaseHold({
      holdId: HOLD_ID,
      disposition: 'release',
      reasonText: 'again',
      signature: { password: 'pw' },
    });
    expect(second).toEqual({ ok: false, reason: 'error', message: 'quality hold is already released' });
  });

  it('maps LP reference display, reason labels, and item counts for list reads', async () => {
    const result = await listHolds({ status: 'active', search: 'LP-001', limit: 25 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        holdNumber: 'HLD-00001000',
        referenceDisplay: 'LP-001 / RM-BEEF-80',
        reasonLabel: 'Foreign object risk',
        itemCount: 2,
      }),
    );
    const listCall = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('select h.id::text'));
    expect(listCall?.[1]).toEqual(['active', null, 'LP-001', 25, ['open', 'investigating', 'escalated', 'quarantined']]);
  });
});

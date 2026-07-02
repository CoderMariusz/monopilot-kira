import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signEvent } from '@monopilot/e-sign';

import { createHold, getHoldDetail, listHolds, releaseHold, releaseHoldFromWarehouseLpUnblock } from '../hold-actions';

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
let permissionOverrides: Record<string, boolean> = {};
let holdAlreadyReleased = false;
let holdReferenceType: 'lp' | 'wo' = 'lp';
let otherActiveHoldLpIds: string[] = [];

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: vi.fn(async () => null),
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
        const permission = String(params[2]);
        const permitted = permission in permissionOverrides ? permissionOverrides[permission] : allowPermission;
        return { rows: permitted ? [{ ok: true }] : [], rowCount: permitted ? 1 : 0 };
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
              // emulate RETURNING coalesce(reference_text, reference_id::text)
              reference_id: params[8] ?? params[1],
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

      if (q.startsWith('select id::text, status, qa_status') && q.includes('from public.license_plates')) {
        return { rows: [{ id: LP_ID, status: 'blocked', qa_status: 'on_hold' }], rowCount: 1 };
      }

      if (
        q.startsWith('select id::text') &&
        q.includes('from public.quality_holds') &&
        q.includes("reference_type = 'lp'") &&
        q.includes('reference_id = $1::uuid')
      ) {
        return { rows: [{ id: HOLD_ID }], rowCount: 1 };
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

      if (q.startsWith('select lp.id::text') && q.includes('from public.quality_hold_items qhi') && q.includes('join public.license_plates lp')) {
        return {
          rows: [
            { id: LP_ID, status: 'available', qa_status: 'on_hold', site_id: null, wo_id: null, grn_id: null },
            { id: TERMINAL_LP_ID, status: 'shipped', qa_status: 'on_hold', site_id: null, wo_id: null, grn_id: null },
          ],
          rowCount: 2,
        };
      }

      if (q.includes('from public.v_active_holds')) {
        const lpId = String(params[0] ?? '');
        const blocked = otherActiveHoldLpIds.includes(lpId);
        return {
          rows: blocked ? [{ hold_number: 'HLD-OTHER', priority: 'critical' }] : [],
          rowCount: blocked ? 1 : 0,
        };
      }

      if (q.startsWith('select h.id::text') && q.includes('h.disposition')) {
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
              hold_status: 'released',
              item_count: 2,
              created_at: '2026-06-11T10:00:00.000Z',
              estimated_release_at: '2026-06-14',
              released_at: '2026-06-11T12:00:00.000Z',
              disposition: 'release_as_is',
              release_notes: 'inspection passed',
              release_signature_hash: 'a'.repeat(64),
              released_by: 'QA Releaser',
            },
          ],
          rowCount: 1,
        };
      }

      if (q.includes('from public.quality_hold_items qhi') && q.includes('left join public.license_plates lp')) {
        return { rows: [], rowCount: 0 };
      }

      if (q.includes('from public.ncr_reports')) {
        return { rows: [], rowCount: 0 };
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
    permissionOverrides = {};
    holdAlreadyReleased = false;
    holdReferenceType = 'lp';
    otherActiveHoldLpIds = [];
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

  it('creates a batch hold with reference_text instead of requiring a UUID reference', async () => {
    const result = await createHold({
      referenceType: 'batch',
      referenceId: 'BATCH-2026-07-02',
      reasonText: 'retain sample failed',
      priority: 'high',
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        referenceType: 'batch',
        referenceId: 'BATCH-2026-07-02',
      },
    });
    const insert = vi
      .mocked(client.query)
      .mock.calls.find(([sql]) => normalize(String(sql)).startsWith('insert into public.quality_holds'));
    expect(normalize(String(insert?.[0]))).toContain('reference_text');
    // pg types one $n from its first cast, so uuid/text must be SEPARATE params
    expect(normalize(String(insert?.[0]))).not.toContain('case when');
    expect(insert?.[1]?.[0]).toBe('batch');
    expect(insert?.[1]?.[1]).toBeNull();
    expect(insert?.[1]?.[8]).toBe('BATCH-2026-07-02');
  });

  it('releases a hold, e-signs, restores LP qa_status, writes release history, and refuses double release', async () => {
    const result = await releaseHold({
      holdId: HOLD_ID,
      disposition: 'release',
      reasonText: 'inspection passed',
      signature: { password: 'Account-Password-1!' },
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
    expect(signEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        signerUserId: USER_ID,
        pin: 'Account-Password-1!',
        intent: 'qa.hold.release',
      }),
      expect.objectContaining({ client }),
    );

    holdAlreadyReleased = true;
    const second = await releaseHold({
      holdId: HOLD_ID,
      disposition: 'release',
      reasonText: 'again',
      signature: { password: 'pw' },
    });
    expect(second).toEqual({ ok: false, reason: 'error', message: 'quality hold is already released' });
  });

  it("keeps an LP on hold instead of restoring released when another active LP hold remains", async () => {
    otherActiveHoldLpIds = [LP_ID];

    const result = await releaseHold({
      holdId: HOLD_ID,
      disposition: 'release',
      reasonText: 'inspection passed',
      signature: { password: 'Account-Password-1!' },
    });

    expect(result.ok).toBe(true);
    const activeHoldRead = vi
      .mocked(client.query)
      .mock.calls.find(([sql]) => normalize(String(sql)).includes('from public.v_active_holds'));
    expect(activeHoldRead?.[1]).toEqual([LP_ID]);

    const releaseUpdate = vi
      .mocked(client.query)
      .mock.calls.find(([sql, params]) => normalize(String(sql)).startsWith('update public.license_plates') && params?.[1] === 'released');
    expect(releaseUpdate?.[1]?.[0]).toEqual([TERMINAL_LP_ID]);

    const history = vi
      .mocked(client.query)
      .mock.calls.find(([sql]) => normalize(String(sql)).startsWith('insert into public.lp_state_history'));
    expect(JSON.parse(history?.[1]?.[9] as string)).toEqual(
      expect.objectContaining({
        qaStatusFrom: 'on_hold',
        qaStatusTo: 'on_hold',
      }),
    );
  });

  it("restores released when no other active LP holds remain", async () => {
    otherActiveHoldLpIds = [];

    const result = await releaseHold({
      holdId: HOLD_ID,
      disposition: 'release',
      reasonText: 'inspection passed',
      signature: { password: 'Account-Password-1!' },
    });

    expect(result.ok).toBe(true);
    const releaseUpdate = vi
      .mocked(client.query)
      .mock.calls.find(([sql, params]) => normalize(String(sql)).startsWith('update public.license_plates') && params?.[1] === 'released');
    expect(releaseUpdate?.[1]?.[0]).toEqual([LP_ID, TERMINAL_LP_ID]);
  });

  it('refuses warehouse LP unblock release without quality hold release permission', async () => {
    permissionOverrides = { 'quality.hold.release': false, 'warehouse.lp.block': true };

    const result = await releaseHoldFromWarehouseLpUnblock({
      lpId: LP_ID,
      reasonText: 'inspection passed',
      signature: { password: 'Account-Password-1!' },
    });

    expect(result).toEqual({ ok: false, reason: 'forbidden' });
    expect(signEvent).not.toHaveBeenCalled();
    expect(vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).includes('from public.user_roles'))?.[1]?.[2]).toBe(
      'quality.hold.release',
    );
  });

  it('requires real e-sign for warehouse LP unblock release and stores the signEvent hash', async () => {
    vi.mocked(signEvent).mockRejectedValueOnce(new Error('bad pin'));

    const refused = await releaseHoldFromWarehouseLpUnblock({
      lpId: LP_ID,
      reasonText: 'inspection passed',
      signature: { password: 'bad-pin' },
    });

    expect(refused).toEqual({ ok: false, reason: 'error', message: 'bad pin' });
    expect(vi.mocked(client.query).mock.calls.some(([sql]) => normalize(String(sql)).startsWith('update public.quality_holds'))).toBe(false);

    vi.clearAllMocks();
    vi.mocked(signEvent).mockResolvedValueOnce({
      signatureId: '99999999-9999-4999-8999-999999999999',
      signerUserId: USER_ID,
      intent: 'qa.hold.release',
      subjectHash: 'b'.repeat(64),
      signedAt: '2026-06-11T12:00:00.000Z',
      auditEventId: 43,
      nonce: 'nonce-2',
    });

    const released = await releaseHoldFromWarehouseLpUnblock({
      lpId: LP_ID,
      reasonText: 'inspection passed',
      signature: { password: 'Account-Password-1!' },
    });

    expect(released.ok).toBe(true);
    if (!released.ok) throw new Error(released.message ?? released.reason);
    expect(released.data.signatureHash).toBe('b'.repeat(64));
    expect(signEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        signerUserId: USER_ID,
        pin: 'Account-Password-1!',
        intent: 'qa.hold.release',
        subject: { holdId: HOLD_ID, disposition: 'release' },
        reason: 'inspection passed',
      }),
      expect.objectContaining({ client }),
    );
    const releaseUpdate = vi
      .mocked(client.query)
      .mock.calls.find(([sql]) => normalize(String(sql)).startsWith('update public.quality_holds'));
    expect(releaseUpdate?.[1]?.[4]).toBe('b'.repeat(64));
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

  it('resolves released_by to a display name for hold detail reads without changing stored release notes', async () => {
    const result = await getHoldDetail(HOLD_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data).toEqual(
      expect.objectContaining({
        releasedBy: 'QA Releaser',
        releaseNotes: 'inspection passed',
        releaseSignatureHash: 'a'.repeat(64),
      }),
    );

    const detailCall = vi.mocked(client.query).mock.calls.find(
      ([sql]) => normalize(String(sql)).startsWith('select h.id::text') && normalize(String(sql)).includes('h.disposition'),
    );
    expect(normalize(String(detailCall?.[0]))).toContain('left join public.users releaser');
    expect(normalize(String(detailCall?.[0]))).toContain('coalesce(releaser.display_name, releaser.name, releaser.email::text, h.released_by::text) as released_by');
  });
});

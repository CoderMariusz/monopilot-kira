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
const HOLD_B_ID = '99999999-9999-4999-8999-999999999999';
const REASON_ID = '77777777-7777-4777-8777-777777777777';

let client: QueryClient;
let allowPermission = true;
let permissionOverrides: Record<string, boolean> = {};
let holdAlreadyReleased = false;
let holdReferenceType: 'lp' | 'wo' = 'lp';
let otherActiveHoldLpIds: string[] = [];
let otherActiveWoHold = false;
let overlappingWoHoldIds: string[] = [];
let releasedWoHoldIds = new Set<string>();
let woHoldReleaseMutex: Promise<void> = Promise.resolve();
let woHoldReleaseUnlock: (() => void) | null = null;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) => {
    try {
      return await action({ userId: USER_ID, orgId: ORG_ID, client });
    } finally {
      woHoldReleaseUnlock?.();
      woHoldReleaseUnlock = null;
    }
  }),
}));

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({ revalidateLocalized: vi.fn() }));
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

vi.mock('../../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: vi.fn(async () => null),
}));

vi.mock('@monopilot/e-sign', () => ({
  // wave F4: hold/NCR actions detect policy errors via instanceof — the mock must export the class
  ESignPolicyError: class ESignPolicyError extends Error {
    code: string;
    constructor(code: string, message?: string) {
      super(message ?? code);
      this.code = code;
    }
  },

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

      if (q.includes('from public.wo_outputs') && q.includes('qa_status')) {
        return {
          rows: [
            { id: 'out-1', qa_status: 'PASSED' },
            { id: 'out-2', qa_status: 'PENDING' },
          ],
          rowCount: 2,
        };
      }

      if (q.startsWith('update public.quality_holds') && q.includes('wo_output_qa_snapshots')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.wo_outputs') && q.includes("qa_status = 'on_hold'")) {
        return { rows: [], rowCount: 2 };
      }

      if (q.startsWith('select ext_jsonb') && q.includes('wo_output_qa_snapshots')) {
        return {
          rows: [{ snapshots: { 'out-1': 'PASSED', 'out-2': 'PENDING' } }],
          rowCount: 1,
        };
      }

      if (q.startsWith('update public.wo_outputs') && q.includes('and wo_id = $4::uuid')) {
        return { rows: [], rowCount: 1 };
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
        const holdId = String(params[0] ?? HOLD_ID);
        const alreadyReleased = holdAlreadyReleased || releasedWoHoldIds.has(holdId);
        return {
          rows: [
            {
              id: holdId,
              hold_number: holdId === HOLD_ID ? 'HLD-00001000' : 'HLD-00001001',
              reference_type: holdReferenceType,
              reference_id: holdReferenceType === 'wo' ? WO_ID : LP_ID,
              hold_status: alreadyReleased ? 'released' : 'open',
              released_at: alreadyReleased ? '2026-06-11T11:00:00.000Z' : null,
            },
          ],
          rowCount: 1,
        };
      }

      if (q.includes('pg_advisory_xact_lock') && q.includes('wo-hold-release')) {
        const previous = woHoldReleaseMutex;
        let release!: () => void;
        woHoldReleaseMutex = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        woHoldReleaseUnlock = release;
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.quality_holds')) {
        const holdId = String(params[0] ?? HOLD_ID);
        if (q.includes("hold_status = 'released'")) {
          releasedWoHoldIds.add(holdId);
        }
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

      if (q.includes('from public.v_active_holds') && q.includes("reference_type = 'wo'")) {
        if (q.includes('hold_id <>')) {
          const releasingHoldId = String(params[1] ?? '');
          const peerHoldIds =
            overlappingWoHoldIds.length > 0
              ? overlappingWoHoldIds
              : otherActiveWoHold
                ? [HOLD_B_ID]
                : [];
          const stillOpen = peerHoldIds.filter(
            (holdId) => holdId !== releasingHoldId && !releasedWoHoldIds.has(holdId),
          );
          return {
            rows: stillOpen.length > 0 ? [{ hold_id: stillOpen[0] }] : [],
            rowCount: stillOpen.length > 0 ? 1 : 0,
          };
        }
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
    otherActiveWoHold = false;
    overlappingWoHoldIds = [];
    releasedWoHoldIds = new Set();
    woHoldReleaseMutex = Promise.resolve();
    woHoldReleaseUnlock = null;
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
    expect(vi.mocked(revalidateLocalized)).toHaveBeenCalledWith('/quality/holds');
    expect(vi.mocked(revalidateLocalized)).toHaveBeenCalledWith(`/quality/holds/${HOLD_ID}`);
  });

  it('snapshots WO output qa_status on hold create and restores PASSED on release', async () => {
    holdReferenceType = 'wo';

    const created = await createHold({
      referenceType: 'wo',
      referenceId: WO_ID,
      reasonText: 'line stop',
      priority: 'high',
    });
    expect(created.ok).toBe(true);

    const snapshotUpdate = vi
      .mocked(client.query)
      .mock.calls.find(([sql]) => normalize(String(sql)).includes('wo_output_qa_snapshots'));
    expect(snapshotUpdate).toBeDefined();

    const released = await releaseHold({
      holdId: HOLD_ID,
      disposition: 'release',
      reasonText: 'cleared',
      signature: { password: 'pw' },
    });
    expect(released.ok).toBe(true);

    const restorePassed = vi
      .mocked(client.query)
      .mock.calls.find(
        ([sql, params]) =>
          normalize(String(sql)).startsWith('update public.wo_outputs') &&
          params?.[0] === 'out-1' &&
          params?.[2] === 'PASSED',
      );
    expect(restorePassed).toBeDefined();
  });

  it('keeps WO outputs ON_HOLD when another open WO hold remains after release', async () => {
    holdReferenceType = 'wo';
    otherActiveWoHold = true;

    const created = await createHold({
      referenceType: 'wo',
      referenceId: WO_ID,
      reasonText: 'line stop',
      priority: 'high',
    });
    expect(created.ok).toBe(true);

    const released = await releaseHold({
      holdId: HOLD_ID,
      disposition: 'release',
      reasonText: 'cleared',
      signature: { password: 'pw' },
    });
    expect(released.ok).toBe(true);

    const otherHoldCheck = vi
      .mocked(client.query)
      .mock.calls.find(
        ([sql]) =>
          normalize(String(sql)).includes('from public.v_active_holds') &&
          normalize(String(sql)).includes("reference_type = 'wo'") &&
          normalize(String(sql)).includes('hold_id <>'),
      );
    expect(otherHoldCheck?.[1]).toEqual([WO_ID, HOLD_ID]);

    const restorePassed = vi
      .mocked(client.query)
      .mock.calls.find(
        ([sql, params]) =>
          normalize(String(sql)).startsWith('update public.wo_outputs') &&
          params?.[0] === 'out-1' &&
          params?.[2] === 'PASSED',
      );
    expect(restorePassed).toBeUndefined();

    const blanketPending = vi
      .mocked(client.query)
      .mock.calls.find(
        ([sql, params]) =>
          normalize(String(sql)).startsWith('update public.wo_outputs') &&
          params?.[0] === WO_ID &&
          params?.[1] === USER_ID &&
          normalize(String(sql)).includes("qa_status = 'pending'"),
      );
    expect(blanketPending).toBeUndefined();
  });

  it('restores WO outputs after concurrent release of the last two overlapping holds', async () => {
    holdReferenceType = 'wo';
    overlappingWoHoldIds = [HOLD_ID, HOLD_B_ID];

    const [first, second] = await Promise.all([
      releaseHold({
        holdId: HOLD_ID,
        disposition: 'release',
        reasonText: 'cleared A',
        signature: { password: 'pw' },
      }),
      releaseHold({
        holdId: HOLD_B_ID,
        disposition: 'release',
        reasonText: 'cleared B',
        signature: { password: 'pw' },
      }),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const advisoryLocks = vi
      .mocked(client.query)
      .mock.calls.filter(([sql]) => normalize(String(sql)).includes('wo-hold-release'));
    expect(advisoryLocks.length).toBeGreaterThanOrEqual(2);

    const restorePassed = vi
      .mocked(client.query)
      .mock.calls.find(
        ([sql, params]) =>
          normalize(String(sql)).startsWith('update public.wo_outputs') &&
          params?.[0] === 'out-1' &&
          params?.[2] === 'PASSED',
      );
    expect(restorePassed).toBeDefined();
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

  it('maps LP reference display, reason labels, and item counts for list reads; SQL includes reference_text for batch holds', async () => {
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
    // Structural: SQL must include h.reference_text in the coalesce so that batch
    // holds (reference_id = NULL, reference_text = batch code) display the code.
    expect(normalize(String(listCall?.[0]))).toContain('h.reference_text');
    // Search filter must also match reference_text so batch holds are searchable.
    expect(normalize(String(listCall?.[0]))).toContain('h.reference_text ilike');
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
    // Structural: detail SQL must also include reference_text so batch hold detail
    // shows the batch code in the reference field.
    expect(normalize(String(detailCall?.[0]))).toContain('h.reference_text');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyDirectAdjustment } from '../direct-adjust-actions';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WAREHOUSE_ID = '33333333-3333-4333-8333-333333333333';
const LOCATION_ID = '44444444-4444-4444-8444-444444444444';
const ITEM_ID = '55555555-5555-4555-8555-555555555555';
const LP_ID = '66666666-6666-4666-8666-666666666666';
const CLIENT_OP_ID = '77777777-7777-4777-8777-777777777777';
const SUPERVISOR_ID = '99999999-9999-4999-8999-999999999999';

type Captured = { sql: string; params: readonly unknown[] };

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

let client: QueryClient;
let calls: Captured[];

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async () => ({ signatureId: '88888888-8888-4888-8888-888888888888' })),
}));

// BLOCKER-1 fix: the module under test imports verifyPin with EIGHT `../` from
// the _actions dir; this test lives one level deeper (__tests__), so the mock
// specifier must be NINE `../` to resolve to the same module the action loads.
// (mirror the with-org-context mock above, which uses the test-dir depth.)
const verifyPin = vi.fn(async () => true as true | false | 'locked');
vi.mock('../../../../../../../../../packages/auth/src/verify-pin.js', () => ({
  verifyPin: (...args: unknown[]) => verifyPin(...(args as [])),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Find the first captured query whose normalized SQL contains every fragment. */
function findCall(...fragments: string[]): Captured | undefined {
  return calls.find((c) => {
    const n = normalize(c.sql);
    return fragments.every((f) => n.includes(f.toLowerCase()));
  });
}

function input(overrides: Partial<Parameters<typeof applyDirectAdjustment>[0]> = {}): Parameters<typeof applyDirectAdjustment>[0] {
  return {
    warehouseId: WAREHOUSE_ID,
    locationId: LOCATION_ID,
    itemId: ITEM_ID,
    direction: 'increase',
    quantity: '1',
    uom: 'kg',
    reasonCode: 'found_stock',
    signature: { password: '123456' },
    clientOpId: CLIENT_OP_ID,
    ...overrides,
  };
}

type Behavior = {
  /** Pre-existing replay row (idempotent hit). */
  replayRow?: { adjustment_id: string | null; lp_id: string } | null;
  /** Rows returned by the decrease LP selection. */
  decreaseLps?: Array<{ id: string; site_id: string | null; status: string; quantity: string; reserved_qty: string; uom: string }>;
  /** Whether the initiator/supervisor hold the stock-adjust permission. */
  hasPermission?: boolean;
  /** Whether the supervisor has a PIN enrolled. */
  supervisorEnrolled?: boolean;
};

function makeClient(behavior: Behavior = {}): QueryClient {
  const {
    replayRow = null,
    decreaseLps = [{ id: LP_ID, site_id: null, status: 'available', quantity: '5', reserved_qty: '0', uom: 'kg' }],
    hasPermission = true,
    supervisorEnrolled = true,
  } = behavior;

  // `from public.user_roles` is queried both for the initiator and supervisor
  // permission checks; flip the answer per call count so we can deny one.
  return {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      calls.push({ sql, params: params ?? [] });
      const n = normalize(sql);

      if (n.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 0 };
      if (n.includes('from public.user_roles')) {
        return hasPermission ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (n.includes('from public.stock_moves sm')) {
        return replayRow ? { rows: [replayRow], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (n.includes('from public.user_pins')) {
        return supervisorEnrolled ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (n.startsWith('select lp.id::text') && n.includes('from public.license_plates lp')) {
        return { rows: decreaseLps, rowCount: decreaseLps.length };
      }
      if (n.startsWith('select coalesce') && n.includes('site_id')) {
        return { rows: [{ site_id: null }], rowCount: 1 };
      }
      if (n.startsWith('insert into public.license_plates')) {
        return { rows: [{ id: LP_ID }], rowCount: 1 };
      }
      if (n.startsWith('update public.license_plates')) {
        // decrease reduce — return post-reduction quantity/status
        return { rows: [{ quantity: '4', status: 'available' }], rowCount: 1 };
      }
      if (n.startsWith('insert into public.stock_adjustments')) {
        return { rows: [{ id: 'adj-0001' }], rowCount: 1 };
      }
      if (n.startsWith('insert into public.stock_moves')) return { rows: [], rowCount: 1 };
      if (n.startsWith('insert into public.lp_state_history')) return { rows: [], rowCount: 1 };

      throw new Error(`unexpected query: ${n}`);
    }),
  };
}

function decreaseInput(overrides: Partial<Parameters<typeof applyDirectAdjustment>[0]> = {}) {
  return input({
    direction: 'decrease',
    supervisorUserId: SUPERVISOR_ID,
    supervisorPin: '654321',
    ...overrides,
  });
}

beforeEach(() => {
  calls = [];
  verifyPin.mockReset();
  verifyPin.mockResolvedValue(true);
  client = makeClient();
});

describe('applyDirectAdjustment — guards', () => {
  it("rejects increase with lpId as 'use_count_session'", async () => {
    const result = await applyDirectAdjustment(input({ lpId: LP_ID }));
    expect(result).toEqual({ ok: false, error: { code: 'use_count_session', message: 'use_count_session' } });
  });

  it("rejects decrease without supervisorUserId/pin as 'supervisor_pin_required'", async () => {
    const result = await applyDirectAdjustment(input({ direction: 'decrease' }));
    expect(result).toEqual({ ok: false, error: { code: 'supervisor_pin_required', message: 'supervisor_pin_required' } });
  });

  it("rejects lp-specific decrease when unreserved quantity is insufficient as 'insufficient_unreserved'", async () => {
    client = makeClient({
      decreaseLps: [{ id: LP_ID, site_id: null, status: 'available', quantity: '5', reserved_qty: '5', uom: 'kg' }],
    });
    const result = await applyDirectAdjustment(decreaseInput({ lpId: LP_ID }));
    expect(result).toEqual({ ok: false, error: { code: 'insufficient_unreserved', message: 'insufficient_unreserved' } });
  });
});

describe('applyDirectAdjustment — write paths', () => {
  it('(a) successful increase mints an LP with qa_status=pending and origin=adjustment', async () => {
    const result = await applyDirectAdjustment(input({ direction: 'increase', quantity: '3' }));
    expect(result.ok).toBe(true);

    const mint = findCall('insert into public.license_plates', "'pending'");
    expect(mint).toBeDefined();
    const mintSql = normalize(mint!.sql);
    expect(mintSql).toContain("'available', 'pending'");
    expect(mintSql).toContain("'adjustment'");

    // increase records no supervisor in the move ext
    const move = findCall('insert into public.stock_moves');
    expect(move).toBeDefined();
    const extParam = move!.params.find((p) => typeof p === 'string' && p.includes('stock_adjustment_id')) as string;
    expect(extParam).not.toContain('supervisor_approved_by');
  });

  it('(b) successful decrease writes a NEGATIVE move quantity and selects FEFO-ordered legs', async () => {
    const result = await applyDirectAdjustment(decreaseInput({ quantity: '2' }));
    expect(result.ok).toBe(true);

    // FEFO leg: selection orders by expiry asc then lp_number and scopes the warehouse
    const select = findCall('from public.license_plates lp', 'order by lp.expiry_date asc');
    expect(select).toBeDefined();
    expect(normalize(select!.sql)).toContain('lp.warehouse_id = $4::uuid');

    // negative-signed move quantity for a decrease
    const move = findCall('insert into public.stock_moves');
    expect(move).toBeDefined();
    const qtyParam = move!.params.find((p) => typeof p === 'string' && p.startsWith('-')) as string;
    expect(qtyParam).toBeDefined();
    expect(qtyParam.startsWith('-')).toBe(true);

    // supervisor recorded on the move ext
    const extParam = move!.params.find((p) => typeof p === 'string' && p.includes('stock_adjustment_id')) as string;
    expect(extParam).toContain('supervisor_approved_by');
    expect(extParam).toContain(SUPERVISOR_ID);
  });

  it('(c) duplicate clientOpId replay short-circuits — no second write', async () => {
    client = makeClient({ replayRow: { adjustment_id: 'adj-existing', lp_id: LP_ID } });
    const result = await applyDirectAdjustment(input({ direction: 'increase' }));
    expect(result).toEqual({ ok: true, data: { adjustmentId: 'adj-existing', lpId: LP_ID } });

    // advisory lock taken BEFORE the replay read (BLOCKER-4)
    expect(findCall('pg_advisory_xact_lock')).toBeDefined();
    // and absolutely no mint / adjustment / move write on replay
    expect(findCall('insert into public.license_plates')).toBeUndefined();
    expect(findCall('insert into public.stock_adjustments')).toBeUndefined();
    expect(findCall('insert into public.stock_moves')).toBeUndefined();
  });

  it('(d) e-sign failure rejects without writing', async () => {
    const { signEvent } = await import('@monopilot/e-sign');
    (signEvent as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('esign_boom'));
    const result = await applyDirectAdjustment(input({ direction: 'increase' }));
    expect(result.ok).toBe(false);
    expect(findCall('insert into public.license_plates')).toBeUndefined();
    expect(findCall('insert into public.stock_adjustments')).toBeUndefined();
  });

  it('(e) RBAC denial rejects as forbidden', async () => {
    client = makeClient({ hasPermission: false });
    const result = await applyDirectAdjustment(input({ direction: 'increase' }));
    expect(result).toEqual({ ok: false, error: { code: 'forbidden', message: 'forbidden' } });
    expect(findCall('insert into public.license_plates')).toBeUndefined();
  });

  it('(f) supervisor self-approval (SoD) is rejected', async () => {
    const result = await applyDirectAdjustment(decreaseInput({ supervisorUserId: USER_ID }));
    expect(result).toEqual({ ok: false, error: { code: 'supervisor_self_approval', message: 'supervisor_self_approval' } });
    // verifyPin must NOT have been consulted for a self-approval
    expect(verifyPin).not.toHaveBeenCalled();
    expect(findCall('update public.license_plates')).toBeUndefined();
  });

  it('(g) supervisor wrong PIN is rejected and verified against the SUPERVISOR id', async () => {
    verifyPin.mockResolvedValue(false);
    const result = await applyDirectAdjustment(decreaseInput());
    expect(result).toEqual({ ok: false, error: { code: 'supervisor_pin_invalid', message: 'supervisor_pin_invalid' } });

    // PIN was verified against the DISTINCT supervisor, never the initiator
    expect(verifyPin).toHaveBeenCalledWith(SUPERVISOR_ID, '654321', expect.objectContaining({ client }));
    expect(verifyPin).not.toHaveBeenCalledWith(USER_ID, expect.anything(), expect.anything());
    // no stock mutation on a failed supervisor PIN
    expect(findCall('update public.license_plates')).toBeUndefined();
  });
});

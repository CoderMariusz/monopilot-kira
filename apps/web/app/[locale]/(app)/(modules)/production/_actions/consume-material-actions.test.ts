import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listConsumableLps, recordDesktopConsumption } from './consume-material-actions';
import type { QueryClient } from '../../../../../../lib/production/shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const MATERIAL_ID = '44444444-4444-4444-8444-444444444444';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
const LP_ID = '66666666-6666-4666-8666-666666666666';
const CONSUMPTION_ID = '77777777-7777-4777-8777-777777777777';

type State = {
  granted: Set<string>;
  materialExists: boolean;
  lpDecrementSucceeds: boolean;
  /** Quantity string returned by the LP UPDATE …RETURNING quantity::text.
   *  Postgres NUMERIC(x,6) returns e.g. '0.000000' not '0' — the regression
   *  pinned by F1: toMicro(qty) <= 0n must be used, not === '0'. */
  lpRemainingQty: string;
  replayExists: boolean;
  overLimit: boolean;
  overWarn: boolean;
  lpStatus: string;
  lpQaStatus: string;
  lpExpired: boolean;
  lpLockedByOther: boolean;
  lpHeld: boolean;
  woExecutionStatus: 'planned' | 'in_progress' | 'paused' | 'completed' | 'closed' | 'cancelled' | null;
};

let state: State;
let client: QueryClient;
let queries: Array<{ sql: string; params: readonly unknown[] }>;

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../lib/warehouse/lp-create', () => ({
  makeStockMoveNumber: vi.fn((transactionId: string) => `SM-${transactionId.replaceAll('-', '').slice(0, 20)}`),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queries.push({ sql, params });
      const n = normalize(sql);

      if (n.includes('from public.user_roles')) {
        const permission = String(params[2] ?? '');
        const ok = state.granted.has(permission);
        return { rows: ok ? [{ ok: true }] : [], rowCount: ok ? 1 : 0 };
      }
      if (n.startsWith('select pg_advisory_xact_lock')) {
        return { rows: [{}], rowCount: 1 };
      }
      // idempotent replay probe
      if (n.includes('from public.wo_material_consumption c')) {
        return state.replayExists
          ? { rows: [{ material_id: MATERIAL_ID, consumed_qty: '12.500', uom: 'kg', lp_id: LP_ID }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (n.includes('from public.wo_executions')) {
        return state.woExecutionStatus === null
          ? { rows: [], rowCount: 0 }
          : { rows: [{ status: state.woExecutionStatus }], rowCount: 1 };
      }
      if (n.includes('from public.license_plates lp') && n.includes('quantity - $4::numeric >= lp.reserved_qty')) {
        return state.lpDecrementSucceeds
          ? {
              rows: [{
                id: LP_ID,
                status: state.lpStatus,
                site_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                location_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              }],
              rowCount: 1,
            }
          : { rows: [], rowCount: 0 };
      }
      if (n.includes('from public.license_plates lp')) {
        return {
          rows: [{
            id: LP_ID,
            status: state.lpStatus,
            qa_status: state.lpQaStatus,
            expired: state.lpExpired,
            locked_by: state.lpLockedByOther ? '99999999-9999-4999-8999-999999999999' : null,
            lock_is_active_for_other_user: state.lpLockedByOther,
          }],
          rowCount: 1,
        };
      }
      if (n.includes('from public.v_active_holds')) {
        return state.lpHeld
          ? { rows: [{ hold_id: 'hold-1', reference_type: 'lp', reference_id: LP_ID }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      // over-consumption gate (locked read of required/consumed + tenant threshold)
      if (n.includes('for update of wm')) {
        return state.materialExists
          ? {
              rows: [
                {
                  id: MATERIAL_ID,
                  product_id: PRODUCT_ID,
                  material_name: 'Lean beef 80/20',
                  required_qty: '120.000',
                  consumed_qty: '2.500',
                  uom: 'kg',
                  threshold_pct: '0',
                  warn_pct: state.overWarn ? '5' : '0',
                  over_limit: state.overLimit,
                  over_warn: state.overWarn,
                  over_pct: state.overLimit || state.overWarn ? '10.0000000000000000' : null,
                },
              ],
              rowCount: 1,
            }
          : { rows: [], rowCount: 0 };
      }
      if (n.startsWith('update public.wo_materials')) {
        return state.materialExists
          ? {
              rows: [
                {
                  id: MATERIAL_ID,
                  product_id: PRODUCT_ID,
                  material_name: 'Lean beef 80/20',
                  consumed_qty: '5.000',
                  uom: 'kg',
                },
              ],
              rowCount: 1,
            }
          : { rows: [], rowCount: 0 };
      }
      if (n.startsWith('update public.license_plates')) {
        return state.lpDecrementSucceeds
          ? { rows: [{ id: LP_ID, quantity: state.lpRemainingQty }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (n.startsWith('insert into public.stock_moves')) {
        return { rows: [], rowCount: 1 };
      }
      if (n.startsWith('insert into public.lp_state_history')) {
        return { rows: [], rowCount: 1 };
      }
      if (n.includes('as violates')) {
        return { rows: [{ violates: false }], rowCount: 1 };
      }
      if (n.startsWith('insert into public.wo_material_consumption')) {
        return { rows: [{ id: CONSUMPTION_ID }], rowCount: 1 };
      }
      // production.consume.blocked outbox emit (T-064 hold rejection path)
      if (n.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }
      // listConsumableLps material lookup
      if (n.startsWith('select product_id::text as product_id, uom from public.wo_materials')) {
        return state.materialExists
          ? { rows: [{ product_id: PRODUCT_ID, uom: 'kg' }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (n.includes('from public.v_inventory_available')) {
        return {
          rows: [
            { lp_id: LP_ID, lp_number: 'LP-001', available_qty: '10.000', uom: 'kg', expiry_date: '2026-07-01' },
          ],
          rowCount: 1,
        };
      }
      throw new Error(`unexpected query: ${n}`);
    }),
  };
}

beforeEach(() => {
  state = {
    granted: new Set(['production.consumption.write']),
    materialExists: true,
    lpDecrementSucceeds: true,
    // Postgres NUMERIC(x,6) returns '0.000000' on a full-consume, NOT '0'.
    // Default to the real pg format to catch the F1 regression.
    lpRemainingQty: '0.000000',
    replayExists: false,
    overLimit: false,
    overWarn: false,
    lpStatus: 'available',
    lpQaStatus: 'released',
    lpExpired: false,
    lpLockedByOther: false,
    lpHeld: false,
    woExecutionStatus: 'in_progress',
  };
  queries = [];
  client = makeClient();
});

const VALID_INPUT = {
  woId: WO_ID,
  materialId: MATERIAL_ID,
  qty: '2.500',
  lpId: LP_ID,
  clientOpId: 'op-abc-123',
};

describe('recordDesktopConsumption — RBAC gate', () => {
  it('refuses without production.consumption.write', async () => {
    state.granted = new Set();
    const result = await recordDesktopConsumption(VALID_INPUT);
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
    // No stock mutation must have been attempted.
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.wo_materials'))).toBe(false);
  });
});

describe('recordDesktopConsumption — conditional UPDATE', () => {
  it('bumps consumed_qty and decrements the LP on the happy path', async () => {
    const result = await recordDesktopConsumption(VALID_INPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.replay).toBe(false);
      expect(result.data.uom).toBe('kg');
      expect(result.data.lpId).toBe(LP_ID);
    }
    const update = queries.find((q) => normalize(q.sql).startsWith('update public.wo_materials'));
    expect(update?.params).toEqual([ORG_ID, WO_ID, MATERIAL_ID, '2.500']);
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_material_consumption'))).toBe(true);
  });

  it('writes stock_moves and lp_state_history when an LP is fully consumed (pg returns "0.000000")', async () => {
    // F1 regression: pg NUMERIC(x,6) returns '0.000000', not '0'.
    // The old === '0' check silently skipped lp_state_history on a full consume.
    state.lpRemainingQty = '0.000000';
    const result = await recordDesktopConsumption(VALID_INPUT);
    expect(result.ok).toBe(true);

    const stockMove = queries.find((q) => normalize(q.sql).startsWith('insert into public.stock_moves'));
    expect(stockMove).toBeDefined();
    expect(normalize(stockMove!.sql)).toContain("'consume_to_wo'");
    expect(stockMove!.params).toEqual(expect.arrayContaining([LP_ID, '2.500', 'kg', WO_ID, MATERIAL_ID]));

    const history = queries.find((q) => normalize(q.sql).startsWith('insert into public.lp_state_history'));
    expect(history).toBeDefined();
    expect(history!.params).toEqual(expect.arrayContaining([LP_ID, 'available', 'consumed', WO_ID]));
  });

  it('also writes lp_state_history when pg returns the bare "0" form', async () => {
    state.lpRemainingQty = '0';
    const result = await recordDesktopConsumption(VALID_INPUT);
    expect(result.ok).toBe(true);
    const history = queries.find((q) => normalize(q.sql).startsWith('insert into public.lp_state_history'));
    expect(history).toBeDefined();
    expect(history!.params).toEqual(expect.arrayContaining([LP_ID, 'available', 'consumed', WO_ID]));
  });

  it('emits warehouse.material.consumed with the consumption aggregate on the happy path', async () => {
    const result = await recordDesktopConsumption(VALID_INPUT);
    expect(result.ok).toBe(true);

    const outbox = queries.find(
      (q) =>
        normalize(q.sql).startsWith('insert into public.outbox_events') &&
        q.params[0] === 'warehouse.material.consumed',
    );
    expect(outbox).toBeDefined();
    expect(outbox?.params[1]).toBe('wo_material_consumption');
    expect(outbox?.params[2]).toBe(CONSUMPTION_ID);
    expect(JSON.parse(String(outbox?.params[3]))).toMatchObject({
      wo_id: WO_ID,
      lp_id: LP_ID,
      item_id: PRODUCT_ID,
      qty: '2.500',
      uom: 'kg',
      org_id: ORG_ID,
      actor: USER_ID,
    });
  });

  it('returns invalid_material when the WHERE matches no row', async () => {
    state.materialExists = false;
    const result = await recordDesktopConsumption(VALID_INPUT);
    expect(result).toEqual({ ok: false, reason: 'invalid_material' });
    // No ledger row written when the material update found nothing.
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_material_consumption'))).toBe(false);
  });

  it('rejects a non-positive / non-decimal qty before touching the DB', async () => {
    for (const qty of ['0', '0.0', '-1', 'abc', '']) {
      const result = await recordDesktopConsumption({ ...VALID_INPUT, qty });
      expect(result).toEqual({ ok: false, reason: 'invalid_qty' });
    }
  });
});

describe('recordDesktopConsumption — over-consumption gate', () => {
  it('returns wo_not_consumable before over-consume or stock mutation when the WO is cancelled', async () => {
    state.woExecutionStatus = 'cancelled';
    const result = await recordDesktopConsumption(VALID_INPUT);
    expect(result).toEqual({ ok: false, reason: 'wo_not_consumable', message: 'WO is cancelled.' });
    expect(queries.some((q) => normalize(q.sql).includes('for update of wm'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.wo_materials'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_material_consumption'))).toBe(false);
  });

  it('allows an in-progress WO through the lifecycle gate and records consumption', async () => {
    state.woExecutionStatus = 'in_progress';
    const result = await recordDesktopConsumption(VALID_INPUT);
    expect(result.ok).toBe(true);
    expect(queries.some((q) => normalize(q.sql).includes('from public.wo_executions'))).toBe(true);
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.wo_materials'))).toBe(true);
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_material_consumption'))).toBe(true);
  });

  it('returns overconsume_blocked (no mutation) when consumed+qty exceeds required × (1+threshold)', async () => {
    state.overLimit = true;
    const result = await recordDesktopConsumption(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('overconsume_blocked');
      expect(String(result.message ?? '')).toContain('threshold');
    }
    // The gate fires BEFORE any stock mutation or ledger write.
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.wo_materials'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_material_consumption'))).toBe(false);
  });

  it('WARN band (over warn_pct, ≤ threshold_pct): proceeds with ok:true + warning field and flags the ledger ext', async () => {
    state.overWarn = true; // over_limit stays false → warn tier only
    const result = await recordDesktopConsumption(VALID_INPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.replay).toBe(false);
      expect(result.data.warning).toEqual({ overconsumed: true, overPct: 10, warnPct: 5 });
    }
    // The write went through (stock mutation + ledger row both present) …
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.wo_materials'))).toBe(true);
    const ledger = queries.find((q) => normalize(q.sql).startsWith('insert into public.wo_material_consumption'));
    expect(ledger).toBeDefined();
    // … and the event is logged: ext_jsonb carries warned:true + overPct.
    const ext = ledger!.params.find((p) => typeof p === 'string' && (p as string).includes('clientOpId')) as string;
    expect(JSON.parse(ext)).toMatchObject({ warned: true, overPct: 10 });
  });

  it('reads BOTH tier flags in the same locked gate statement', async () => {
    await recordDesktopConsumption(VALID_INPUT);
    const gate = queries.find((q) => normalize(q.sql).includes('for update of wm'));
    expect(gate).toBeDefined();
    expect(gate!.sql).toContain('overconsume_threshold_pct');
    expect(gate!.sql).toContain('overconsume_warn_pct');
  });
});

describe('recordDesktopConsumption — LP underflow refusal', () => {
  it('returns lp_unavailable when the reserved-qty-safe LP update matches no row', async () => {
    state.lpDecrementSucceeds = false;
    const result = await recordDesktopConsumption(VALID_INPUT);
    expect(result).toEqual({ ok: false, reason: 'lp_unavailable' });
    // CHK-1 regression: lp_unavailable is a pre-mutation gate, so the WO line
    // is never incremented and no orphaned consumption ledger row is attempted.
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.wo_materials'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_material_consumption'))).toBe(false);
  });

  it('rejects held LPs with the canonical quality_hold_active and emits production.consume.blocked', async () => {
    state.lpHeld = true;
    const result = await recordDesktopConsumption(VALID_INPUT);
    expect(result).toEqual({ ok: false, reason: 'quality_hold_active' });
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.wo_materials'))).toBe(false);
    // T-064 contract: the rejection emits production.consume.blocked (outbox).
    const outbox = queries.find((q) => normalize(q.sql).startsWith('insert into public.outbox_events'));
    expect(outbox).toBeDefined();
    expect(outbox!.params[0]).toBe('production.consume.blocked');
  });

  it('rejects pending-QA LPs before material mutation', async () => {
    state.lpQaStatus = 'pending';
    const result = await recordDesktopConsumption(VALID_INPUT);
    expect(result).toEqual({ ok: false, reason: 'lp_not_released' });
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.wo_materials'))).toBe(false);
  });

  it('rejects expired LPs before material mutation', async () => {
    state.lpExpired = true;
    const result = await recordDesktopConsumption(VALID_INPUT);
    expect(result).toEqual({ ok: false, reason: 'lp_expired' });
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.wo_materials'))).toBe(false);
  });

  it('rejects LPs locked by another user within the 5-minute window before material mutation', async () => {
    state.lpLockedByOther = true;
    const result = await recordDesktopConsumption(VALID_INPUT);
    expect(result).toEqual({ ok: false, reason: 'lp_locked' });
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.wo_materials'))).toBe(false);
  });
});

describe('recordDesktopConsumption — idempotent replay', () => {
  it('returns replay:true without re-decrementing when the txn id already exists', async () => {
    state.replayExists = true;
    const result = await recordDesktopConsumption(VALID_INPUT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.replay).toBe(true);
    // No new stock mutation on replay.
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.wo_materials'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
  });

  it('takes an advisory xact lock before the replay probe', async () => {
    await recordDesktopConsumption(VALID_INPUT);
    const lockIdx = queries.findIndex((q) => normalize(q.sql).startsWith('select pg_advisory_xact_lock'));
    const probeIdx = queries.findIndex((q) => normalize(q.sql).includes('from public.wo_material_consumption c'));
    expect(lockIdx).toBeGreaterThanOrEqual(0);
    expect(probeIdx).toBeGreaterThan(lockIdx);
  });
});

describe('recordDesktopConsumption — no-LP path', () => {
  it('rejects no-LP manual consumption without reasonCode', async () => {
    const result = await recordDesktopConsumption({ ...VALID_INPUT, lpId: null });
    expect(result).toEqual({ ok: false, reason: 'reason_required' });
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.wo_materials'))).toBe(false);
  });

  it('skips the LP update and logs reasonCode in ext_jsonb when lpId is omitted with a reason', async () => {
    const result = await recordDesktopConsumption({ ...VALID_INPUT, lpId: null, reasonCode: 'silo-draw' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.lpId).toBeNull();
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
    const ledger = queries.find((q) => normalize(q.sql).startsWith('insert into public.wo_material_consumption'));
    expect(ledger).toBeDefined();
    const ext = ledger!.params.find((p) => typeof p === 'string' && (p as string).includes('reasonCode')) as string;
    expect(JSON.parse(ext)).toMatchObject({ reasonCode: 'silo-draw' });
  });
});

describe('listConsumableLps', () => {
  it('returns FEFO-ordered candidates from v_inventory_available', async () => {
    const result = await listConsumableLps({ woId: WO_ID, materialId: MATERIAL_ID });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.lps).toEqual([
        { lpId: LP_ID, lpNumber: 'LP-001', qty: '10.000', uom: 'kg', expiry: '2026-07-01' },
      ]);
    }
  });

  it('refuses without permission', async () => {
    state.granted = new Set();
    const result = await listConsumableLps({ woId: WO_ID, materialId: MATERIAL_ID });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('returns invalid_material for an unknown component', async () => {
    state.materialExists = false;
    const result = await listConsumableLps({ woId: WO_ID, materialId: MATERIAL_ID });
    expect(result).toEqual({ ok: false, reason: 'invalid_material' });
  });
});

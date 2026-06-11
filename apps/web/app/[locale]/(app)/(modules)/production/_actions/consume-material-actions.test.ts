import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listConsumableLps, recordDesktopConsumption } from './consume-material-actions';
import type { QueryClient } from '../../../../../../lib/production/shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const MATERIAL_ID = '44444444-4444-4444-8444-444444444444';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
const LP_ID = '66666666-6666-4666-8666-666666666666';

type State = {
  granted: Set<string>;
  materialExists: boolean;
  lpDecrementSucceeds: boolean;
  replayExists: boolean;
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
          ? { rows: [{ id: LP_ID, quantity: '7.500' }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (n.includes('as violates')) {
        return { rows: [{ violates: false }], rowCount: 1 };
      }
      if (n.startsWith('insert into public.wo_material_consumption')) {
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
  state = { granted: new Set(['production.consumption.write']), materialExists: true, lpDecrementSucceeds: true, replayExists: false };
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

describe('recordDesktopConsumption — LP underflow refusal', () => {
  it('returns lp_unavailable when the reserved-qty-safe LP update matches no row', async () => {
    state.lpDecrementSucceeds = false;
    const result = await recordDesktopConsumption(VALID_INPUT);
    expect(result).toEqual({ ok: false, reason: 'lp_unavailable' });
    // The whole txn rolls back — no ledger row commits.
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_material_consumption'))).toBe(false);
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
  it('skips the LP update entirely when lpId is omitted', async () => {
    const result = await recordDesktopConsumption({ ...VALID_INPUT, lpId: null });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.lpId).toBeNull();
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { signEvent } from '@monopilot/e-sign';

import type { QueryClient } from '../../../../../../lib/production/shared';
import { queryGenealogy } from '../../../../../../lib/warehouse/genealogy';
import { reverseConsumption, voidWasteEntry, voidWoOutput } from './corrections-actions';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async () => ({
    signatureId: '99999999-9999-4999-8999-999999999999',
    signerUserId: USER_ID,
    intent: 'production.output.void',
    subjectHash: 'hash',
    signedAt: '2026-06-12T00:00:00.000Z',
    auditEventId: 123,
    nonce: 'nonce',
  })),
}));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WASTE_ID = '33333333-3333-4333-8333-333333333333';
const WO_ID = '44444444-4444-4444-8444-444444444444';
const CATEGORY_ID = '55555555-5555-4555-8555-555555555555';
const CORRECTION_ID = '66666666-6666-4666-8666-666666666666';
const OUTPUT_ID = '77777777-7777-4777-8777-777777777777';
const LP_ID = '88888888-8888-4888-8888-888888888888';
const PARENT_LP_ID = '99999999-9999-4999-8999-999999999999';
const CONSUMPTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPONENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NO_LP_ID = '00000000-0000-0000-0000-000000000000';

type State = {
  wasteExists: boolean;
  alreadyCorrected: boolean;
  outputExists: boolean;
  outputAlreadyCorrected: boolean;
  consumptionExists: boolean;
  consumptionAlreadyCorrected: boolean;
  consumptionNoLp: boolean;
  lpExists: boolean;
  lpStatus: string;
  lpQaStatus: string;
  lpReservedQty: string;
  lpConsumedOrChild: boolean;
  genealogyChildLinks: Set<string>;
  materialDecrementOk: boolean;
  woStatus: string;
  granted: Set<string>;
  /** Simulates losing a concurrent-void race: the pre-check sees no correction
   *  (the other tx's row is not visible in our snapshot) but the counter INSERT
   *  hits the mig-296 unique partial index → SQLSTATE 23505. */
  wasteInsertConflict: boolean;
  outputInsertConflict: boolean;
  consumptionInsertConflict: boolean;
};

let state: State;
let client: QueryClient;
let queries: Array<{ sql: string; params: readonly unknown[] }>;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function genealogyRow(id: string, direction: 'self' | 'descendant', depth: number) {
  return {
    lp_id: id,
    lp_number: id === PARENT_LP_ID ? 'LP-PARENT' : 'LP-VOIDED-OUTPUT',
    item_code: null,
    quantity: '1.000000',
    uom: 'kg',
    status: id === LP_ID ? state.lpStatus : 'available',
    created_at: '2026-06-12T08:00:00.000Z',
    depth,
    direction,
    parent_lp_id: null,
  };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queries.push({ sql, params });
      const n = normalize(sql);

      if (n.includes('from public.wo_waste_log wl')) {
        return state.wasteExists
          ? {
              rows: [{
                id: WASTE_ID,
                transaction_id: '77777777-7777-4777-8777-777777777777',
                wo_id: WO_ID,
                category_id: CATEGORY_ID,
                qty_kg: '2.500',
                reason_code: 'trim',
                reason_notes: 'line trim',
                operator_id: USER_ID,
                shift_id: 'A',
                recorded_at: '2026-06-12T08:00:00.000Z',
                wo_status: state.woStatus,
              }],
              rowCount: 1,
            }
          : { rows: [], rowCount: 0 };
      }

      if (n.includes('from public.user_roles')) {
        const permission = String(params[2] ?? '');
        const ok = state.granted.has(permission);
        return { rows: ok ? [{ ok: true }] : [], rowCount: ok ? 1 : 0 };
      }

      if (n.includes('from public.wo_outputs o') && n.includes('for update of o')) {
        return state.outputExists
          ? {
              rows: [{
                id: OUTPUT_ID,
                transaction_id: '99999999-9999-4999-8999-999999999999',
                site_id: null,
                wo_id: WO_ID,
                output_type: 'primary',
                product_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                lp_id: LP_ID,
                batch_number: 'BATCH-1',
                qty_kg: '12.345',
                uom: 'kg',
                qa_status: 'PENDING',
                expiry_date: '2026-12-31',
                catch_weight_details: null,
                allergen_profile_snapshot: null,
                registered_by: USER_ID,
                registered_at: '2026-06-12T08:00:00.000Z',
                wo_status: state.woStatus,
              }],
              rowCount: 1,
            }
          : { rows: [], rowCount: 0 };
      }

      if (n.includes('from public.wo_outputs') && n.includes('correction_of_id = $1::uuid')) {
        return state.outputAlreadyCorrected ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (n.includes('from public.wo_material_consumption c') && n.includes('for update of c')) {
        return state.consumptionExists
          ? {
              rows: [{
                id: CONSUMPTION_ID,
                transaction_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                site_id: null,
                wo_id: WO_ID,
                component_id: COMPONENT_ID,
                lp_id: state.consumptionNoLp ? NO_LP_ID : LP_ID,
                qty_consumed: '4.250',
                uom: 'kg',
                operator_id: USER_ID,
                fefo_adherence_flag: true,
                fefo_deviation_reason: null,
                over_consumption_flag: false,
                over_consumption_approved_by: null,
                over_consumption_approved_at: null,
                over_consumption_reason_code: null,
                ext_jsonb: { source: 'desktop' },
                consumed_at: '2026-06-12T08:00:00.000Z',
                wo_status: state.woStatus,
              }],
              rowCount: 1,
            }
          : { rows: [], rowCount: 0 };
      }

      if (n.includes('from public.wo_material_consumption') && n.includes('correction_of_id = $1::uuid')) {
        return state.consumptionAlreadyCorrected ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (n.includes('from public.license_plates') && n.includes('for update')) {
        return state.lpExists
          ? {
              rows: [{
                id: LP_ID,
                site_id: null,
                status: state.lpStatus,
                qa_status: state.lpQaStatus,
                quantity: '12.345',
                reserved_qty: state.lpReservedQty,
              }],
              rowCount: 1,
            }
          : { rows: [], rowCount: 0 };
      }

      if (n.includes('exists') && n.includes('from public.wo_material_consumption') && n.includes('parent_lp_id')) {
        return { rows: [{ ok: state.lpConsumedOrChild }], rowCount: 1 };
      }

      if (n.startsWith('delete from public.lp_genealogy')) {
        state.genealogyChildLinks.delete(String(params[0]));
        return { rows: [], rowCount: 1 };
      }

      if (n.includes('with recursive') && n.includes('from public.lp_genealogy lg')) {
        const seedLpId = String(params[0]);
        const rows = seedLpId === PARENT_LP_ID
          ? [
              genealogyRow(PARENT_LP_ID, 'self', 0),
              ...(state.genealogyChildLinks.has(LP_ID) ? [genealogyRow(LP_ID, 'descendant', 1)] : []),
            ]
          : [];
        return { rows, rowCount: rows.length };
      }

      if (n.includes('from public.wo_waste_log') && n.includes('correction_of_id = $1::uuid')) {
        return state.alreadyCorrected ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (n.startsWith('insert into public.wo_waste_log')) {
        if (state.wasteInsertConflict) {
          throw Object.assign(
            new Error('duplicate key value violates unique constraint "uq_wo_waste_log_one_correction"'),
            { code: '23505' },
          );
        }
        return { rows: [{ id: CORRECTION_ID }], rowCount: 1 };
      }

      if (n.startsWith('insert into public.wo_outputs')) {
        if (state.outputInsertConflict) {
          throw Object.assign(
            new Error('duplicate key value violates unique constraint "uq_wo_outputs_one_correction"'),
            { code: '23505' },
          );
        }
        return { rows: [{ id: CORRECTION_ID }], rowCount: 1 };
      }

      if (n.startsWith('insert into public.wo_material_consumption')) {
        if (state.consumptionInsertConflict) {
          throw Object.assign(
            new Error('duplicate key value violates unique constraint "uq_wo_material_consumption_one_correction"'),
            { code: '23505' },
          );
        }
        return { rows: [{ id: CORRECTION_ID }], rowCount: 1 };
      }

      // F1/F3 — pre-write FOR UPDATE lock + SQL-side decrement validation.
      if (n.includes('from public.wo_materials') && n.includes('for update')) {
        return {
          rows: [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', can_decrement: state.materialDecrementOk }],
          rowCount: 1,
        };
      }

      if (n.startsWith('update public.wo_materials')) {
        return state.materialDecrementOk ? { rows: [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (n.startsWith('update public.license_plates')) {
        return { rows: [], rowCount: 1 };
      }

      if (n.startsWith('insert into public.lp_state_history')) {
        return { rows: [], rowCount: 1 };
      }

      if (n.startsWith('insert into public.audit_events')) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`unexpected query: ${n}`);
    }),
  };
}

beforeEach(() => {
  state = {
    wasteExists: true,
    alreadyCorrected: false,
    outputExists: true,
    outputAlreadyCorrected: false,
    consumptionExists: true,
    consumptionAlreadyCorrected: false,
    consumptionNoLp: false,
    lpExists: true,
    lpStatus: 'received',
    lpQaStatus: 'pending',
    lpReservedQty: '0.000000',
    lpConsumedOrChild: false,
    genealogyChildLinks: new Set(),
    materialDecrementOk: true,
    woStatus: 'completed',
    granted: new Set(['production.waste.correct', 'production.output.correct', 'production.consumption.correct']),
    wasteInsertConflict: false,
    outputInsertConflict: false,
    consumptionInsertConflict: false,
  };
  queries = [];
  client = makeClient();
  vi.mocked(signEvent).mockClear();
  vi.mocked(signEvent).mockResolvedValue({
    signatureId: '99999999-9999-4999-8999-999999999999',
    signerUserId: USER_ID,
    intent: 'production.output.void',
    subjectHash: 'hash',
    signedAt: '2026-06-12T00:00:00.000Z',
    auditEventId: 123,
    nonce: 'nonce',
  });
});

describe('reverseConsumption', () => {
  it('inserts a negative consumption counter-entry, decrements material consumption, restores a QA-released consumed LP to available, and writes history/audit', async () => {
    state.lpStatus = 'consumed';
    state.lpQaStatus = 'released';
    vi.mocked(signEvent).mockResolvedValueOnce({
      signatureId: '99999999-9999-4999-8999-999999999999',
      signerUserId: USER_ID,
      intent: 'production.consumption.reverse',
      subjectHash: 'hash',
      signedAt: '2026-06-12T00:00:00.000Z',
      auditEventId: 123,
      nonce: 'nonce',
    });

    const result = await reverseConsumption({
      consumptionId: CONSUMPTION_ID,
      reasonCode: 'entry_error',
      note: 'wrong LP',
      signature: { password: '123456' },
    });

    expect(result).toEqual({ ok: true });

    const insert = queries.find((q) => normalize(q.sql).startsWith('insert into public.wo_material_consumption'));
    expect(insert).toBeDefined();
    expect(insert?.sql).toContain('app.current_org_id()');
    expect(insert?.params).toContain(CONSUMPTION_ID);
    expect(insert?.params).toContain('-4.250');
    expect(insert?.params).toContain(COMPONENT_ID);
    expect(insert?.params).toContain(LP_ID);

    // F3 — the wo_materials row is locked + validated BEFORE the counter insert.
    const materialLock = queries.find(
      (q) => normalize(q.sql).includes('from public.wo_materials') && normalize(q.sql).includes('for update'),
    );
    expect(materialLock).toBeDefined();
    expect(materialLock?.params).toEqual([WO_ID, COMPONENT_ID, '4.250']);
    expect(queries.indexOf(materialLock!)).toBeLessThan(queries.indexOf(insert!));

    const materialUpdate = queries.find((q) => normalize(q.sql).startsWith('update public.wo_materials'));
    expect(materialUpdate?.params).toEqual([WO_ID, COMPONENT_ID, '4.250']);
    expect(normalize(materialUpdate!.sql)).toContain('consumed_qty - $3::numeric >= 0');

    const lpUpdate = queries.find((q) => normalize(q.sql).startsWith('update public.license_plates'));
    expect(normalize(lpUpdate!.sql)).toContain("quantity = quantity + $2::numeric");
    expect(normalize(lpUpdate!.sql)).toContain('status = $4');
    expect(lpUpdate?.params).toEqual([LP_ID, '4.250', USER_ID, 'available']);

    const history = queries.find((q) => normalize(q.sql).startsWith('insert into public.lp_state_history'));
    expect(history).toBeDefined();
    expect(history?.params).toContain('consumed');
    expect(history?.params).toContain('available');
    expect(history?.params).toContain('wrong LP');

    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.audit_events'))).toBe(true);
    expect(signEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        signerUserId: USER_ID,
        pin: '123456',
        intent: 'production.consumption.reverse',
        reason: 'entry_error',
        subject: expect.objectContaining({
          correction_permission: 'production.consumption.correct',
          consumption_id: CONSUMPTION_ID,
          component_id: COMPONENT_ID,
          lp_id: LP_ID,
          qty_consumed: '4.250',
        }),
      }),
      expect.objectContaining({ client }),
    );
  });

  it('restores a consumed LP whose QA is NOT released to received (non-pickable), preserving qa_status, with history reflecting the actual to_state', async () => {
    state.lpStatus = 'consumed';
    state.lpQaStatus = 'pending';

    const result = await reverseConsumption({
      consumptionId: CONSUMPTION_ID,
      reasonCode: 'entry_error',
      note: 'QA hold pallet',
      signature: { password: '123456' },
    });

    expect(result).toEqual({ ok: true });

    const lpUpdate = queries.find((q) => normalize(q.sql).startsWith('update public.license_plates'));
    expect(lpUpdate?.params).toEqual([LP_ID, '4.250', USER_ID, 'received']);
    // qa_status is preserved as-is — the restore never touches it.
    expect(normalize(lpUpdate!.sql)).not.toContain('qa_status');

    const history = queries.find((q) => normalize(q.sql).startsWith('insert into public.lp_state_history'));
    expect(history?.params).toContain('consumed');
    expect(history?.params).toContain('received');
    expect(history?.params).not.toContain('available');
  });

  it('supports no-LP consumption reversal as ledger-only after material decrement', async () => {
    state.consumptionNoLp = true;

    const result = await reverseConsumption({
      consumptionId: CONSUMPTION_ID,
      reasonCode: 'wrong_quantity',
      signature: { password: '123456' },
    });

    expect(result).toEqual({ ok: true });
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_material_consumption'))).toBe(true);
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.wo_materials'))).toBe(true);
    expect(queries.some((q) => normalize(q.sql).includes('from public.license_plates') && normalize(q.sql).includes('for update'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.lp_state_history'))).toBe(false);
  });

  it('refuses shipped, merged, or destroyed LPs as not restorable', async () => {
    state.lpStatus = 'shipped';

    const result = await reverseConsumption({
      consumptionId: CONSUMPTION_ID,
      reasonCode: 'wrong_batch',
      signature: { password: '123456' },
    });

    expect(result).toEqual({ ok: false, error: 'lp_not_restorable' });
    // F1 — the restorability gate fires BEFORE any write: no counter insert, no
    // material decrement, no LP update, no audit (withOrgContext commits on return).
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_material_consumption'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.wo_materials'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.audit_events'))).toBe(false);
    expect(signEvent).not.toHaveBeenCalled();
  });

  it('refuses a double consumption correction and maps a 23505 race to already_corrected', async () => {
    state.consumptionAlreadyCorrected = true;

    const precheck = await reverseConsumption({
      consumptionId: CONSUMPTION_ID,
      reasonCode: 'wrong_product',
      signature: { password: '123456' },
    });

    expect(precheck).toEqual({ ok: false, error: 'already_corrected' });
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_material_consumption'))).toBe(false);

    state.consumptionAlreadyCorrected = false;
    state.consumptionInsertConflict = true;

    const race = await reverseConsumption({
      consumptionId: CONSUMPTION_ID,
      reasonCode: 'wrong_product',
      signature: { password: '123456' },
    });

    expect(race).toEqual({ ok: false, error: 'already_corrected' });
    expect(queries.filter((q) => normalize(q.sql).startsWith('insert into public.wo_material_consumption'))).toHaveLength(1);
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.wo_materials'))).toBe(false);
  });

  it('refuses instead of clamping when material consumed_qty would go negative', async () => {
    state.materialDecrementOk = false;

    const result = await reverseConsumption({
      consumptionId: CONSUMPTION_ID,
      reasonCode: 'other',
      signature: { password: '123456' },
    });

    expect(result).toEqual({ ok: false, error: 'inconsistent_ledger' });
    // F1 — the ledger gate fires BEFORE any write: the counter insert and the
    // decrement itself must never have run when ok:false is returned.
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_material_consumption'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.wo_materials'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.audit_events'))).toBe(false);
    expect(signEvent).not.toHaveBeenCalled();
  });

  it('forbids closed-WO consumption reversal without the closed-WO tier permission', async () => {
    state.woStatus = 'closed';

    const result = await reverseConsumption({
      consumptionId: CONSUMPTION_ID,
      reasonCode: 'entry_error',
      signature: { password: '123456' },
    });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_material_consumption'))).toBe(false);
  });

  it('allows closed-WO consumption reversal with the closed-WO tier permission', async () => {
    state.woStatus = 'closed';
    state.granted.add('production.corrections.closed_wo');

    const result = await reverseConsumption({
      consumptionId: CONSUMPTION_ID,
      reasonCode: 'entry_error',
      signature: { password: '123456' },
    });

    expect(result).toEqual({ ok: true });
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_material_consumption'))).toBe(true);
  });

  it('returns esign_failed for a wrong password and leaves state untouched', async () => {
    vi.mocked(signEvent).mockRejectedValueOnce(new Error('bad pin'));

    const result = await reverseConsumption({
      consumptionId: CONSUMPTION_ID,
      reasonCode: 'entry_error',
      signature: { password: 'wrong' },
    });

    expect(result).toEqual({ ok: false, error: 'esign_failed' });
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_material_consumption'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.wo_materials'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
  });
});

describe('voidWasteEntry', () => {
  it('inserts a negative waste counter-entry and audit row on the happy path', async () => {
    const result = await voidWasteEntry({ wasteId: WASTE_ID, reasonCode: 'entry_error', note: 'wrong entry' });

    expect(result).toEqual({ ok: true });
    const insert = queries.find((q) => normalize(q.sql).startsWith('insert into public.wo_waste_log'));
    expect(insert).toBeDefined();
    expect(insert?.sql).toContain('app.current_org_id()');
    expect(insert?.params).toContain(WASTE_ID);
    expect(insert?.params).toContain('-2.500');
    expect(insert?.params).toContain('entry_error');
    expect(insert?.params).toContain('wrong entry');
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.audit_events'))).toBe(true);
  });

  it('refuses a double correction', async () => {
    state.alreadyCorrected = true;

    const result = await voidWasteEntry({ wasteId: WASTE_ID, reasonCode: 'wrong_quantity' });

    expect(result).toEqual({ ok: false, error: 'already_corrected' });
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_waste_log'))).toBe(false);
  });

  it('forbids closed-WO correction without the supervisor-tier permission', async () => {
    state.woStatus = 'closed';

    const result = await voidWasteEntry({ wasteId: WASTE_ID, reasonCode: 'wrong_batch' });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_waste_log'))).toBe(false);
  });

  it('allows closed-WO correction when the supervisor-tier permission is present', async () => {
    state.woStatus = 'closed';
    state.granted.add('production.corrections.closed_wo');

    const result = await voidWasteEntry({ wasteId: WASTE_ID, reasonCode: 'wrong_product' });

    expect(result).toEqual({ ok: true });
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_waste_log'))).toBe(true);
  });

  it('locks the original waste row with FOR UPDATE (concurrent voids serialize)', async () => {
    await voidWasteEntry({ wasteId: WASTE_ID, reasonCode: 'entry_error' });

    const read = queries.find((q) => normalize(q.sql).includes('from public.wo_waste_log wl'));
    expect(read).toBeDefined();
    expect(normalize(read!.sql)).toContain('for update of wl');
  });

  it('concurrent-void race: first insert wins, the loser maps 23505 to already_corrected', async () => {
    // First void — no concurrent writer; the counter insert succeeds.
    const first = await voidWasteEntry({ wasteId: WASTE_ID, reasonCode: 'entry_error' });
    expect(first).toEqual({ ok: true });

    // Second void — the pre-check still sees no correction (the winner's row is
    // not visible in this snapshot), but the mig-296 unique partial index
    // rejects the counter INSERT with 23505.
    state.wasteInsertConflict = true;
    const second = await voidWasteEntry({ wasteId: WASTE_ID, reasonCode: 'entry_error' });
    expect(second).toEqual({ ok: false, error: 'already_corrected' });

    const inserts = queries.filter((q) => normalize(q.sql).startsWith('insert into public.wo_waste_log'));
    expect(inserts).toHaveLength(2);
    // The loser writes no audit row for a failed correction.
    const audits = queries.filter((q) => normalize(q.sql).startsWith('insert into public.audit_events'));
    expect(audits).toHaveLength(1);
  });

  it('uses app.current_org_id() filters so another org cannot void the row', async () => {
    state.wasteExists = false;

    const result = await voidWasteEntry({ wasteId: WASTE_ID, reasonCode: 'other' });

    expect(result).toEqual({ ok: false, error: 'not_found' });
    const read = queries.find((q) => normalize(q.sql).includes('from public.wo_waste_log wl'));
    expect(read?.sql).toContain('wl.org_id = app.current_org_id()');
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_waste_log'))).toBe(false);
  });
});

describe('voidWoOutput', () => {
  it('inserts a negative output counter-entry, voids the LP, writes history/audit, and e-signs the intent', async () => {
    const result = await voidWoOutput({
      outputId: OUTPUT_ID,
      reasonCode: 'entry_error',
      note: 'operator duplicate',
      signature: { password: '123456' },
    });

    expect(result).toEqual({ ok: true });

    const insert = queries.find((q) => normalize(q.sql).startsWith('insert into public.wo_outputs'));
    expect(insert).toBeDefined();
    expect(insert?.sql).toContain('app.current_org_id()');
    expect(insert?.params).toContain(OUTPUT_ID);
    expect(insert?.params).toContain('-12.345');
    expect(insert?.params).toContain('primary');
    expect(insert?.params).toContain('BATCH-1-VOID-77777777');

    const lpUpdate = queries.find((q) => normalize(q.sql).startsWith('update public.license_plates'));
    expect(lpUpdate?.params).toEqual([LP_ID, 'destroyed', USER_ID]);

    const history = queries.find((q) => normalize(q.sql).startsWith('insert into public.lp_state_history'));
    expect(history).toBeDefined();
    expect(history?.params).toContain('received');
    expect(history?.params).toContain('destroyed');
    expect(history?.params).toContain('operator duplicate');

    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.audit_events'))).toBe(true);
    expect(signEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        signerUserId: USER_ID,
        pin: '123456',
        intent: 'production.output.void',
        reason: 'entry_error',
        subject: expect.objectContaining({
          correction_permission: 'production.output.correct',
          output_id: OUTPUT_ID,
          lp_id: LP_ID,
          qty_kg: '12.345',
        }),
      }),
      expect.objectContaining({ client }),
    );
  });

  it('unlinks the voided output LP from lp_genealogy so the genealogy reader no longer returns it as a child', async () => {
    state.genealogyChildLinks.add(LP_ID);
    const before = await queryGenealogy(client, PARENT_LP_ID);
    expect(before.map((node) => node.lpId)).toContain(LP_ID);

    queries = [];
    const result = await voidWoOutput({
      outputId: OUTPUT_ID,
      reasonCode: 'entry_error',
      note: 'operator duplicate',
      signature: { password: '123456' },
    });

    expect(result).toEqual({ ok: true });

    const lpUpdate = queries.find((q) => normalize(q.sql).startsWith('update public.license_plates'));
    const genealogyDelete = queries.find((q) => normalize(q.sql).startsWith('delete from public.lp_genealogy'));
    const audit = queries.find((q) => normalize(q.sql).startsWith('insert into public.audit_events'));

    expect(genealogyDelete).toBeDefined();
    expect(genealogyDelete?.params).toEqual([LP_ID]);
    expect(normalize(genealogyDelete!.sql)).toContain('org_id = app.current_org_id()');
    expect(queries.indexOf(genealogyDelete!)).toBeGreaterThan(queries.indexOf(lpUpdate!));
    expect(queries.indexOf(genealogyDelete!)).toBeLessThan(queries.indexOf(audit!));

    const after = await queryGenealogy(client, PARENT_LP_ID);
    expect(after.map((node) => node.lpId)).not.toContain(LP_ID);
  });

  it('refuses a released LP as not voidable', async () => {
    state.lpQaStatus = 'released';

    const result = await voidWoOutput({ outputId: OUTPUT_ID, reasonCode: 'wrong_quantity', signature: { password: '123456' } });

    expect(result).toEqual({ ok: false, error: 'lp_not_voidable' });
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_outputs'))).toBe(false);
    expect(signEvent).not.toHaveBeenCalled();
  });

  it('refuses a reserved LP as not voidable', async () => {
    state.lpReservedQty = '1.000000';

    const result = await voidWoOutput({ outputId: OUTPUT_ID, reasonCode: 'wrong_quantity', signature: { password: '123456' } });

    expect(result).toEqual({ ok: false, error: 'lp_not_voidable' });
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
  });

  it('refuses an LP with consumption or genealogy children as not voidable', async () => {
    state.lpConsumedOrChild = true;

    const result = await voidWoOutput({ outputId: OUTPUT_ID, reasonCode: 'wrong_batch', signature: { password: '123456' } });

    expect(result).toEqual({ ok: false, error: 'lp_not_voidable' });
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_outputs'))).toBe(false);
  });

  it('refuses a double output correction', async () => {
    state.outputAlreadyCorrected = true;

    const result = await voidWoOutput({ outputId: OUTPUT_ID, reasonCode: 'wrong_product', signature: { password: '123456' } });

    expect(result).toEqual({ ok: false, error: 'already_corrected' });
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_outputs'))).toBe(false);
  });

  it('concurrent-void race: losing output insert maps 23505 to already_corrected', async () => {
    const first = await voidWoOutput({ outputId: OUTPUT_ID, reasonCode: 'entry_error', signature: { password: '123456' } });
    expect(first).toEqual({ ok: true });

    state.outputInsertConflict = true;
    const second = await voidWoOutput({ outputId: OUTPUT_ID, reasonCode: 'entry_error', signature: { password: '123456' } });
    expect(second).toEqual({ ok: false, error: 'already_corrected' });

    // The loser must not void the LP or write history/audit.
    const lpUpdates = queries.filter((q) => normalize(q.sql).startsWith('update public.license_plates'));
    expect(lpUpdates).toHaveLength(1);
    const histories = queries.filter((q) => normalize(q.sql).startsWith('insert into public.lp_state_history'));
    expect(histories).toHaveLength(1);
    const audits = queries.filter((q) => normalize(q.sql).startsWith('insert into public.audit_events'));
    expect(audits).toHaveLength(1);
  });

  it('forbids closed-WO output correction without the closed-WO tier permission', async () => {
    state.woStatus = 'closed';

    const result = await voidWoOutput({ outputId: OUTPUT_ID, reasonCode: 'other', signature: { password: '123456' } });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_outputs'))).toBe(false);
  });

  it('returns esign_failed for a wrong password and leaves state untouched', async () => {
    vi.mocked(signEvent).mockRejectedValueOnce(new Error('bad pin'));

    const result = await voidWoOutput({ outputId: OUTPUT_ID, reasonCode: 'entry_error', signature: { password: 'wrong' } });

    expect(result).toEqual({ ok: false, error: 'esign_failed' });
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_outputs'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
  });
});

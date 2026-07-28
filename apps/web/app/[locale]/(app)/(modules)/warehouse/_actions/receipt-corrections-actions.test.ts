import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QueryClient } from './shared';
import { cancelGrnLine, updateLpMetadata } from './receipt-corrections-actions';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

const { getActiveSiteIdMock } = vi.hoisted(() => ({ getActiveSiteIdMock: vi.fn() }));

vi.mock('../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: getActiveSiteIdMock,
}));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const GRN_ITEM_ID = '33333333-3333-4333-8333-333333333333';
const GRN_ID = '44444444-4444-4444-8444-444444444444';
const LP_ID = '55555555-5555-4555-8555-555555555555';
const PO_ID = '66666666-6666-4666-8666-666666666666';
const SITE_ID = '88888888-8888-4888-8888-888888888888';
const OTHER_SITE_ID = '99999999-9999-4999-8999-999999999999';

type State = {
  granted: boolean;
  grnExists: boolean;
  grnStatus: string;
  cancelledAt: string | null;
  lpExists: boolean;
  lpStatus: string;
  lpQaStatus: string;
  lpQuantity: string;
  lpReservedQty: string;
  lpBatchNumber: string | null;
  lpExpiryDate: string | null;
  lpBestBeforeDate: string | null;
  lpConsumptionRows: string[];
  lpHasChild: boolean;
  grnSiteId: string | null;
  lpSiteId: string | null;
  grnExtJsonb: unknown;
  poCurrency: string | null;
  rollupTotalReceived: string;
  rollupIsReceived: boolean;
};

let state: State;
let client: QueryClient;
let queries: Array<{ sql: string; params: readonly unknown[] }>;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queries.push({ sql, params });
      const n = normalize(sql);

      if (n.includes('from public.user_roles')) {
        return { rows: state.granted ? [{ ok: true }] : [], rowCount: state.granted ? 1 : 0 };
      }

      if (n.includes('from public.grn_items gi') && n.includes('for update of gi')) {
        return {
          rows: state.grnExists
            ? [{
                id: GRN_ITEM_ID,
                grn_id: GRN_ID,
                grn_status: state.grnStatus,
                grn_site_id: state.grnSiteId,
                po_id: PO_ID,
                item_id: '77777777-7777-4777-8777-777777777777',
                lp_id: LP_ID,
                received_qty: '10.000000',
                uom: 'kg',
                unit_price: '4.20',
                cancelled_at: state.cancelledAt,
                qa_status_initial: 'pending',
                ext_jsonb: state.grnExtJsonb,
                po_currency: state.poCurrency,
              }]
            : [],
          rowCount: state.grnExists ? 1 : 0,
        };
      }

      if (n.includes('from public.license_plates lp') && n.includes('for update')) {
        return {
          rows: state.lpExists
            ? [{
                id: LP_ID,
                lp_status: state.lpStatus,
                lp_qa_status: state.lpQaStatus,
                lp_quantity: state.lpQuantity,
                lp_reserved_qty: state.lpReservedQty,
                lp_batch_number: state.lpBatchNumber,
                lp_expiry_date: state.lpExpiryDate,
                lp_best_before_date: state.lpBestBeforeDate,
                lp_location_id: '99999999-9999-4999-8999-999999999999',
                lp_site_id: state.lpSiteId,
              }]
            : [],
          rowCount: state.lpExists ? 1 : 0,
        };
      }

      if (n.startsWith('select id::text, status, site_id::text')) {
        return {
          rows: state.lpExists
            ? [{
                id: LP_ID,
                status: state.lpStatus,
                site_id: state.lpSiteId,
                batch_number: state.lpBatchNumber,
                expiry_date: state.lpExpiryDate,
                best_before_date: state.lpBestBeforeDate,
              }]
            : [],
          rowCount: state.lpExists ? 1 : 0,
        };
      }

      if (n.startsWith('select id::text, status, batch_number')) {
        return {
          rows: state.lpExists
            ? [{
                id: LP_ID,
                status: state.lpStatus,
                batch_number: state.lpBatchNumber,
                expiry_date: state.lpExpiryDate,
                best_before_date: state.lpBestBeforeDate,
              }]
            : [],
          rowCount: state.lpExists ? 1 : 0,
        };
      }

      if (n.includes('from public.license_plates child') && n.includes('wo_material_consumption')) {
        const netConsumed = state.lpConsumptionRows.reduce((sum, qty) => sum + Number(qty), 0);
        return { rows: [{ blocked: state.lpHasChild || netConsumed > 0 }], rowCount: 1 };
      }

      if (n.startsWith('update public.license_plates')) {
        return { rows: [], rowCount: 1 };
      }

      if (n.startsWith('update public.grn_items')) {
        return { rows: [], rowCount: 1 };
      }

      if (n.includes('from public.items i') && n.includes('as qty_kg')) {
        return { rows: [{ qty_kg: String(params[0] ?? '0'), resolved: true }], rowCount: 1 };
      }

      if (n.startsWith('select ($1::numeric * coalesce($2::numeric, 0))::text as value')) {
        return { rows: [{ value: String(Number(params[0] ?? 0) * Number(params[1] ?? 0)) }], rowCount: 1 };
      }

      if (n.includes('insert into public.item_wac_state')) {
        return { rows: [{ totalQtyKg: '0', totalValue: '0', clamped: false }], rowCount: 1 };
      }

      if (n.includes('bool_and')) {
        return {
          rows: [{ is_received: state.rollupIsReceived, total_received: state.rollupTotalReceived }],
          rowCount: 1,
        };
      }

      if (n.startsWith('update public.purchase_orders')) {
        return { rows: [], rowCount: 1 };
      }

      if (n.startsWith('insert into public.stock_moves')) {
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
    granted: true,
    grnExists: true,
    grnStatus: 'draft',
    cancelledAt: null,
    lpExists: true,
    lpStatus: 'received',
    lpQaStatus: 'pending',
    lpQuantity: '10.000000',
    lpReservedQty: '0.000000',
    lpBatchNumber: 'B-OLD',
    lpExpiryDate: '2026-08-01T00:00:00.000Z',
    lpBestBeforeDate: '2026-09-15T00:00:00.000Z',
    lpConsumptionRows: [],
    lpHasChild: false,
    grnSiteId: SITE_ID,
    lpSiteId: SITE_ID,
    grnExtJsonb: null,
    poCurrency: 'GBP',
    rollupTotalReceived: '0',
    rollupIsReceived: false,
  };
  queries = [];
  client = makeClient();
  getActiveSiteIdMock.mockReset();
  getActiveSiteIdMock.mockResolvedValue(SITE_ID);
});

describe('receipt corrections actions', () => {
  it('cancelGrnLine rejects completed GRNs before any mutation (C052)', async () => {
    state.grnStatus = 'completed';

    const result = await cancelGrnLine({ grnItemId: GRN_ITEM_ID, reasonCode: 'entry_error' });
    expect(result).toEqual({ ok: false, error: 'grn_completed' });
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.grn_items'))).toBe(false);
  });

  it('cancelGrnLine rolls PO back to partially_received when other receipts remain', async () => {
    state.rollupTotalReceived = '5.000000';
    state.rollupIsReceived = false;

    const result = await cancelGrnLine({ grnItemId: GRN_ITEM_ID, reasonCode: 'entry_error' });
    expect(result).toEqual({ ok: true });

    const poRollup = queries.find((q) => normalize(q.sql).startsWith('update public.purchase_orders'));
    expect(poRollup!.params).toEqual([PO_ID, 'partially_received', USER_ID]);
  });

  it('cancelGrnLine returns the LP and zeroes it, flags the GRN line, and aggregate consumers exclude cancelled lines', async () => {
    const result = await cancelGrnLine({ grnItemId: GRN_ITEM_ID, reasonCode: 'entry_error', note: 'Wrong receipt' });
    expect(result).toEqual({ ok: true });

    const lpUpdate = queries.find((q) => normalize(q.sql).startsWith('update public.license_plates'));
    expect(normalize(lpUpdate!.sql)).toContain("status = 'returned'");
    expect(normalize(lpUpdate!.sql)).toContain('quantity = 0');

    const grnUpdate = queries.find((q) => normalize(q.sql).startsWith('update public.grn_items'));
    expect(normalize(grnUpdate!.sql)).toContain('cancelled_at = now()');
    expect(grnUpdate!.params).toEqual([GRN_ITEM_ID, USER_ID, 'entry_error', 'Wrong receipt']);

    const poRollup = queries.find((q) => normalize(q.sql).startsWith('update public.purchase_orders'));
    expect(normalize(poRollup!.sql)).toContain("status in ('confirmed', 'partially_received', 'received')");
    expect(poRollup!.params).toEqual([PO_ID, 'confirmed', USER_ID]);

    const history = queries.find((q) => normalize(q.sql).startsWith('insert into public.lp_state_history'));
    expect(history!.params).toEqual(expect.arrayContaining([LP_ID, 'received', 'returned', 'receipt_cancelled']));

    const stockMove = queries.find((q) => normalize(q.sql).startsWith('insert into public.stock_moves'));
    expect(stockMove).toBeDefined();
    expect(normalize(stockMove!.sql)).toContain("'return'");
    expect(stockMove!.params).toEqual(expect.arrayContaining([LP_ID, '10.000000', 'kg', GRN_ID]));

    // wave F3: the receive core was extracted to receive-po-line-core.ts — the
    // cancelled-line filters are split between the scanner wrapper and the core.
    const receivePo = readFileSync(join(process.cwd(), 'lib/warehouse/scanner/receive-po.ts'), 'utf8');
    const receiveCore = readFileSync(join(process.cwd(), 'lib/warehouse/receive-po-line-core.ts'), 'utf8');
    expect(((receivePo + receiveCore).match(/cancelled_at is null/g) ?? []).length).toBeGreaterThanOrEqual(4);
    const poActions = readFileSync(
      join(process.cwd(), 'app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/actions.ts'),
      'utf8',
    );
    expect(poActions).toContain('gi.cancelled_at is null');
    const mrp = readFileSync(join(process.cwd(), 'app/[locale]/(app)/(modules)/planning/_actions/mrp.ts'), 'utf8');
    expect(mrp).toContain('gi.cancelled_at is null');
  });

  it('cancelGrnLine reverses WAC using the originally-booked snapshot contribution', async () => {
    state.grnExtJsonb = {
      wac_qty_kg: '9.500000',
      wac_value: '39.900000',
      wac_currency_code: 'EUR',
    };

    const result = await cancelGrnLine({ grnItemId: GRN_ITEM_ID, reasonCode: 'entry_error' });
    expect(result).toEqual({ ok: true });

    const wacWrite = queries.find((q) => normalize(q.sql).includes('insert into public.item_wac_state'));
    expect(wacWrite?.params).toEqual([
      ORG_ID,
      '77777777-7777-4777-8777-777777777777',
      '-9.500000',
      '-39.900000',
      USER_ID,
      SITE_ID,
      'GBP',
    ]);
    expect(queries.some((q) => normalize(q.sql).includes('from public.items i') && normalize(q.sql).includes('as qty_kg'))).toBe(false);
  });

  it('cancelGrnLine falls back to recomputed WAC reversal when no snapshot exists', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    state.poCurrency = 'EUR';

    const result = await cancelGrnLine({ grnItemId: GRN_ITEM_ID, reasonCode: 'entry_error' });
    expect(result).toEqual({ ok: true });

    const wacWrite = queries.find((q) => normalize(q.sql).includes('insert into public.item_wac_state'));
    expect(wacWrite?.params).toEqual([
      ORG_ID,
      '77777777-7777-4777-8777-777777777777',
      '-10.000000',
      '-42',
      USER_ID,
      SITE_ID,
      'GBP',
    ]);
    expect(console.warn).toHaveBeenCalledWith('[wac] reversal_fallback', { grnItemId: GRN_ITEM_ID });
  });

  it.each([
    ['consumed', { lpConsumptionRows: ['10.000000'] }],
    ['child', { lpHasChild: true }],
    ['reserved', { lpReservedQty: '1.000000' }],
    ['qty-changed', { lpQuantity: '9.000000' }],
  ])('cancelGrnLine refuses lp_not_cancellable when LP is %s', async (_name, patch) => {
    state = { ...state, ...patch };
    const result = await cancelGrnLine({ grnItemId: GRN_ITEM_ID, reasonCode: 'wrong_quantity' });
    expect(result).toEqual({ ok: false, error: 'lp_not_cancellable' });
    if (_name === 'consumed' || _name === 'child') {
      const usageQuery = queries.find((q) => normalize(q.sql).includes('from public.wo_material_consumption'));
      expect(normalize(usageQuery!.sql)).toContain('coalesce(sum(wmc.qty_consumed), 0)');
      expect(normalize(usageQuery!.sql)).not.toContain('wmc.correction_of_id is null');
    }
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.grn_items'))).toBe(false);
  });

  it('cancelGrnLine allows an LP whose consumption has been fully reversed to net zero', async () => {
    state.lpConsumptionRows = ['10.000000', '-10.000000'];

    const result = await cancelGrnLine({ grnItemId: GRN_ITEM_ID, reasonCode: 'wrong_quantity', note: 'net zero' });

    expect(result).toEqual({ ok: true });

    const usageQuery = queries.find((q) => normalize(q.sql).includes('from public.wo_material_consumption'));
    expect(usageQuery).toBeDefined();
    expect(normalize(usageQuery!.sql)).toContain('coalesce(sum(wmc.qty_consumed), 0)');
    expect(normalize(usageQuery!.sql)).not.toContain('wmc.correction_of_id is null');
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.grn_items'))).toBe(true);
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(true);
  });

  it('cancelGrnLine refuses a double cancel', async () => {
    state.cancelledAt = '2026-06-12T00:00:00.000Z';
    const result = await cancelGrnLine({ grnItemId: GRN_ITEM_ID, reasonCode: 'entry_error' });
    expect(result).toEqual({ ok: false, error: 'already_cancelled' });
  });

  it('updateLpMetadata edits expiry_date without changing best_before_date', async () => {
    const result = await updateLpMetadata({
      lpId: LP_ID,
      expiryDate: '2026-12-31T00:00:00.000Z',
      batchNumber: 'B-NEW',
      reasonCode: 'wrong_batch',
      note: 'Supplier label correction',
    });
    expect(result).toEqual({ ok: true });

    const update = queries.find((q) => normalize(q.sql).startsWith('update public.license_plates'));
    expect(normalize(update!.sql)).toContain('expiry_date = $2::timestamptz');
    expect(normalize(update!.sql)).not.toContain('best_before_date');
    expect(normalize(update!.sql)).toContain('batch_number = coalesce($3, batch_number)');
    expect(update!.params).toEqual([LP_ID, '2026-12-31T00:00:00.000Z', 'B-NEW', USER_ID]);

    const history = queries.find((q) => normalize(q.sql).startsWith('insert into public.lp_state_history'));
    const historyExt = JSON.parse(history!.params[7] as string);
    expect(historyExt).toMatchObject({
      expiry_date_from: state.lpExpiryDate,
      expiry_date_to: '2026-12-31T00:00:00.000Z',
      best_before_date_from: state.lpBestBeforeDate,
      best_before_date_to: state.lpBestBeforeDate,
    });

    const audit = queries.find((q) => normalize(q.sql).startsWith('insert into public.audit_events'));
    const afterState = JSON.parse(audit!.params[5] as string);
    expect(afterState).toMatchObject({
      expiry_date: '2026-12-31T00:00:00.000Z',
      best_before_date: state.lpBestBeforeDate,
      batch_number: 'B-NEW',
    });
  });

  it('updateLpMetadata clears expiry_date when expiryDate is null', async () => {
    const result = await updateLpMetadata({
      lpId: LP_ID,
      expiryDate: null,
      reasonCode: 'wrong_batch',
      note: 'Supplier label removed expiry',
    });
    expect(result).toEqual({ ok: true });

    const update = queries.find((q) => normalize(q.sql).startsWith('update public.license_plates'));
    expect(normalize(update!.sql)).toContain('expiry_date = $2::timestamptz');
    expect(normalize(update!.sql)).not.toContain('coalesce($2::timestamptz, expiry_date)');
    expect(normalize(update!.sql)).not.toContain('best_before_date');
    expect(update!.params).toEqual([LP_ID, null, USER_ID]);

    const history = queries.find((q) => normalize(q.sql).startsWith('insert into public.lp_state_history'));
    const historyExt = JSON.parse(history!.params[7] as string);
    expect(historyExt).toMatchObject({
      expiry_date_from: state.lpExpiryDate,
      expiry_date_to: null,
      best_before_date_to: state.lpBestBeforeDate,
    });

    const audit = queries.find((q) => normalize(q.sql).startsWith('insert into public.audit_events'));
    const afterState = JSON.parse(audit!.params[5] as string);
    expect(afterState).toMatchObject({
      expiry_date: null,
      best_before_date: state.lpBestBeforeDate,
      batch_number: state.lpBatchNumber,
    });
  });

  it('updateLpMetadata preserves expiry_date when expiryDate is omitted', async () => {
    const result = await updateLpMetadata({
      lpId: LP_ID,
      batchNumber: 'B-NEW',
      reasonCode: 'wrong_batch',
    });
    expect(result).toEqual({ ok: true });

    const update = queries.find((q) => normalize(q.sql).startsWith('update public.license_plates'));
    expect(normalize(update!.sql)).not.toContain('expiry_date');
    expect(normalize(update!.sql)).not.toContain('best_before_date');
    expect(normalize(update!.sql)).toContain('batch_number = coalesce($2, batch_number)');
    expect(update!.params).toEqual([LP_ID, 'B-NEW', USER_ID]);

    const history = queries.find((q) => normalize(q.sql).startsWith('insert into public.lp_state_history'));
    const historyExt = JSON.parse(history!.params[7] as string);
    expect(historyExt).toMatchObject({
      expiry_date_from: state.lpExpiryDate,
      expiry_date_to: state.lpExpiryDate,
      best_before_date_to: state.lpBestBeforeDate,
    });

    const audit = queries.find((q) => normalize(q.sql).startsWith('insert into public.audit_events'));
    const afterState = JSON.parse(audit!.params[5] as string);
    expect(afterState).toMatchObject({
      expiry_date: state.lpExpiryDate,
      best_before_date: state.lpBestBeforeDate,
      batch_number: 'B-NEW',
    });
  });

  it('updateLpMetadata refuses consumed LPs', async () => {
    state.lpStatus = 'consumed';
    const result = await updateLpMetadata({ lpId: LP_ID, expiryDate: '2026-12-31T00:00:00.000Z', reasonCode: 'wrong_batch' });
    expect(result).toEqual({ ok: false, error: 'lp_not_editable' });
  });

  it('updateLpMetadata refuses returned LPs (cancelled-receipt evidence is frozen — R3 F5)', async () => {
    state.lpStatus = 'returned';
    const result = await updateLpMetadata({ lpId: LP_ID, expiryDate: '2026-12-31T00:00:00.000Z', reasonCode: 'wrong_batch' });
    expect(result).toEqual({ ok: false, error: 'lp_not_editable' });
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
  });

  it('keeps cross-org isolation through app.current_org_id predicates and returns not_found for invisible rows', async () => {
    state.grnExists = false;
    const result = await cancelGrnLine({ grnItemId: GRN_ITEM_ID, reasonCode: 'entry_error' });
    expect(result).toEqual({ ok: false, error: 'not_found' });

    const dataQueries = queries.filter((q) => !normalize(q.sql).includes('from public.user_roles'));
    expect(dataQueries.length).toBeGreaterThan(0);
    expect(dataQueries.every((q) => normalize(q.sql).includes('app.current_org_id()'))).toBe(true);
  });

  it('R08-09 — cancelGrnLine rejects a GRN line from another site before any mutation', async () => {
    state.grnSiteId = OTHER_SITE_ID;

    const result = await cancelGrnLine({ grnItemId: GRN_ITEM_ID, reasonCode: 'entry_error' });

    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.grn_items'))).toBe(false);
    expect(getActiveSiteIdMock).toHaveBeenCalledWith({ client });
  });

  it('R08-09 — cancelGrnLine rejects an LP from another site before any mutation', async () => {
    state.lpSiteId = OTHER_SITE_ID;

    const result = await cancelGrnLine({ grnItemId: GRN_ITEM_ID, reasonCode: 'entry_error' });

    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
  });

  it('R08-09 — updateLpMetadata rejects an LP from another site before any mutation', async () => {
    state.lpSiteId = OTHER_SITE_ID;

    const result = await updateLpMetadata({
      lpId: LP_ID,
      expiryDate: '2026-12-31T00:00:00.000Z',
      reasonCode: 'wrong_batch',
    });

    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
  });

  it('R07-04 — the GRN line lock never names the nullable side of an outer join', async () => {
    const result = await cancelGrnLine({ grnItemId: GRN_ITEM_ID, reasonCode: 'entry_error' });
    expect(result).toEqual({ ok: true });

    const loader = queries.find((q) => normalize(q.sql).includes('for update of gi, g'));
    expect(loader).toBeDefined();
    // Postgres 0A000 — a locked alias may not sit on the nullable side of an
    // outer join, so `g` (locked) must be INNER joined. This assertion pins the
    // shipped SQL; the rule itself is proven against a real database in
    // packages/db/__tests__/grn-line-for-update-outer-join.test.ts, because a
    // query mock passes either way — which is how the defect reached production.
    expect(normalize(loader!.sql)).toContain('join public.grns g');
    expect(normalize(loader!.sql)).not.toContain('left join public.grns');
    // Unlocked joins may still be outer — they are not in `for update of`.
    expect(normalize(loader!.sql)).toContain('left join public.purchase_order_lines pol');
  });

  it('R07-04 — a failing cache revalidation cannot undo a committed cancellation', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(revalidatePath).mockImplementationOnce(() => {
      throw new Error('revalidatePath called outside a request scope');
    });

    const result = await cancelGrnLine({ grnItemId: GRN_ITEM_ID, reasonCode: 'entry_error' });

    // Pre-fix, revalidateLocalized ran INSIDE withOrgContext after all seven
    // mutations: this throw unwound the transaction and the operator got
    // `persistence_failed` with the receipt still live and the LP still valid.
    expect(result).toEqual({ ok: true });
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.grn_items'))).toBe(true);
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(true);
  });

  it('R07-04 — updateLpMetadata survives a failing revalidation too', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(revalidatePath).mockImplementationOnce(() => {
      throw new Error('revalidatePath called outside a request scope');
    });

    const result = await updateLpMetadata({
      lpId: LP_ID,
      expiryDate: '2026-12-31T00:00:00.000Z',
      reasonCode: 'wrong_batch',
    });

    expect(result).toEqual({ ok: true });
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(true);
  });
});

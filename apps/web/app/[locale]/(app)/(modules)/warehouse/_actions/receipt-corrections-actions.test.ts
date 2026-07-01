import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const GRN_ITEM_ID = '33333333-3333-4333-8333-333333333333';
const GRN_ID = '44444444-4444-4444-8444-444444444444';
const LP_ID = '55555555-5555-4555-8555-555555555555';
const PO_ID = '66666666-6666-4666-8666-666666666666';

type State = {
  granted: boolean;
  grnExists: boolean;
  cancelledAt: string | null;
  lpExists: boolean;
  lpStatus: string;
  lpQaStatus: string;
  lpQuantity: string;
  lpReservedQty: string;
  lpBatchNumber: string | null;
  lpExpiryDate: string | null;
  lpBestBeforeDate: string | null;
  blockedByUsage: boolean;
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
                po_id: PO_ID,
                lp_id: LP_ID,
                received_qty: '10.000000',
                cancelled_at: state.cancelledAt,
                qa_status_initial: 'pending',
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
        return { rows: [{ blocked: state.blockedByUsage }], rowCount: 1 };
      }

      if (n.startsWith('update public.license_plates')) {
        return { rows: [], rowCount: 1 };
      }

      if (n.startsWith('update public.grn_items')) {
        return { rows: [], rowCount: 1 };
      }

      if (n.includes('bool_and')) {
        return { rows: [{ is_received: false }], rowCount: 1 };
      }

      if (n.startsWith('update public.purchase_orders')) {
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
    cancelledAt: null,
    lpExists: true,
    lpStatus: 'received',
    lpQaStatus: 'pending',
    lpQuantity: '10.000000',
    lpReservedQty: '0.000000',
    lpBatchNumber: 'B-OLD',
    lpExpiryDate: '2026-08-01T00:00:00.000Z',
    lpBestBeforeDate: '2026-09-15T00:00:00.000Z',
    blockedByUsage: false,
  };
  queries = [];
  client = makeClient();
});

describe('receipt corrections actions', () => {
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
    expect(poRollup!.params).toEqual([PO_ID, 'partially_received', USER_ID]);

    const history = queries.find((q) => normalize(q.sql).startsWith('insert into public.lp_state_history'));
    expect(history!.params).toEqual(expect.arrayContaining([LP_ID, 'received', 'returned', 'receipt_cancelled']));

    const receivePo = readFileSync(join(process.cwd(), 'lib/warehouse/scanner/receive-po.ts'), 'utf8');
    expect((receivePo.match(/cancelled_at is null/g) ?? []).length).toBeGreaterThanOrEqual(4);
    const poActions = readFileSync(
      join(process.cwd(), 'app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/actions.ts'),
      'utf8',
    );
    expect(poActions).toContain('gi.cancelled_at is null');
    const mrp = readFileSync(join(process.cwd(), 'app/[locale]/(app)/(modules)/planning/_actions/mrp.ts'), 'utf8');
    expect(mrp).toContain('gi.cancelled_at is null');
  });

  it.each([
    ['consumed-child', { blockedByUsage: true }],
    ['reserved', { lpReservedQty: '1.000000' }],
    ['qty-changed', { lpQuantity: '9.000000' }],
  ])('cancelGrnLine refuses lp_not_cancellable when LP is %s', async (_name, patch) => {
    state = { ...state, ...patch };
    const result = await cancelGrnLine({ grnItemId: GRN_ITEM_ID, reasonCode: 'wrong_quantity' });
    expect(result).toEqual({ ok: false, error: 'lp_not_cancellable' });
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.grn_items'))).toBe(false);
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
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const OUTPUT_ID = '33333333-3333-4333-8333-333333333333';
const WO_ID = '44444444-4444-4444-8444-444444444444';
const ITEM_ID = '55555555-5555-4555-8555-555555555555';
const LP_ID = '66666666-6666-4666-8666-666666666666';
const CORRECTION_ID = '77777777-7777-4777-8777-777777777777';

const state = vi.hoisted(() => ({
  client: null as { query: ReturnType<typeof vi.fn> } | null,
  alreadyCorrected: false,
  corrections: [] as Array<{ correctionOfId: string | null; qtyKg: string }>,
  wac: { totalQtyKg: '100', totalValue: '500', avgCost: '5' },
}));

vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async () => ({
    signatureId: '88888888-8888-4888-8888-888888888888',
    signerUserId: USER_ID,
    intent: 'production.output.void',
    subjectHash: 'hash',
    signedAt: '2026-07-30T12:00:00.000Z',
    auditEventId: 1,
    nonce: 'nonce',
  })),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (
    action: (ctx: { userId: string; orgId: string; client: unknown }) => Promise<unknown>,
  ) => {
    if (!state.client) throw new Error('missing contract client');
    return action({ userId: USER_ID, orgId: ORG_ID, client: state.client });
  }),
}));

vi.mock('../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

vi.mock('../../lib/production/lp-downstream-guard', () => ({
  hasLpConsumptionOrChildren: vi.fn(async () => false),
}));

vi.mock('../../lib/production/sync-work-order-output-quantities', () => ({
  syncWorkOrderOutputQuantities: vi.fn(async () => undefined),
}));

import { voidWoOutput } from '../../app/[locale]/(app)/(modules)/production/_actions/corrections-actions';

const originalOutput = {
  id: OUTPUT_ID,
  transaction_id: '99999999-9999-4999-8999-999999999999',
  site_id: null,
  wo_id: WO_ID,
  output_type: 'primary',
  product_id: ITEM_ID,
  lp_id: LP_ID,
  batch_number: 'BATCH-1',
  qty_kg: '10',
  uom: 'kg',
  qa_status: 'PENDING',
  expiry_date: null,
  catch_weight_details: null,
  allergen_profile_snapshot: null,
  cost_per_kg: '5',
  ext_jsonb: { wac_qty_kg: '10', wac_value: '50' },
  registered_by: USER_ID,
  registered_at: '2026-07-30T10:00:00.000Z',
  wo_status: 'completed',
};

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Maps an INSERT's column list onto its `$n` parameters.
 *
 * The two `wo_outputs` inserts this action emits (storno counter-entry built by
 * insertCounterEntry, replacement row built by insertReplacementOutput) have
 * DIFFERENT column orders, so reading a fixed param index — or sniffing for a
 * literal value — only ever describes one of them.
 */
function insertParamsByColumn(sql: string, params: readonly unknown[]): Record<string, unknown> {
  const match = /^insert into \S+ \(\s*([^)]+?)\s*\) values \(\s*(.+?)\s*\) returning /.exec(sql);
  if (!match) throw new Error(`unparsable insert: ${sql}`);
  const columns = match[1].split(',').map((column) => column.trim());
  const values = match[2].split(',').map((value) => value.trim());
  const byColumn: Record<string, unknown> = {};
  columns.forEach((column, index) => {
    const placeholder = /^\$(\d+)/.exec(values[index] ?? '');
    if (placeholder) byColumn[column] = params[Number(placeholder[1]) - 1];
  });
  return byColumn;
}

function makeClient() {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const text = normalize(sql);
      if (text.includes('from public.wo_outputs o') && text.includes('for update of o')) {
        return { rows: [{ ...originalOutput }], rowCount: 1 };
      }
      if (text.includes('from public.wo_outputs') && text.includes('correction_of_id = $1::uuid')) {
        return { rows: state.alreadyCorrected ? [{ ok: true }] : [], rowCount: state.alreadyCorrected ? 1 : 0 };
      }
      if (text.includes('from public.license_plates') && text.includes('for update')) {
        return {
          rows: [{
            id: LP_ID,
            site_id: null,
            location_id: null,
            status: 'received',
            qa_status: 'pending',
            quantity: '10',
            reserved_qty: '0',
          }],
          rowCount: 1,
        };
      }
      if (text.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (text.startsWith('insert into public.wo_outputs')) {
        const byColumn = insertParamsByColumn(text, params);
        state.corrections.push({
          correctionOfId: (byColumn.correction_of_id ?? null) as string | null,
          qtyKg: String(byColumn.qty_kg),
        });
        return { rows: [{ id: CORRECTION_ID }], rowCount: 1 };
      }
      if (text.includes('insert into public.item_wac_state')) {
        state.wac.totalQtyKg = String(Number(state.wac.totalQtyKg) + Number(params[2]));
        state.wac.totalValue = String(Number(state.wac.totalValue) + Number(params[3]));
        state.wac.avgCost = String(Number(state.wac.totalValue) / Number(state.wac.totalQtyKg));
        return {
          rows: [{
            totalQtyKg: state.wac.totalQtyKg,
            totalValue: state.wac.totalValue,
            availableQtyKg: '100',
            availableValue: '500',
            rawQtyKg: state.wac.totalQtyKg,
            rawValue: state.wac.totalValue,
            clamped: false,
          }],
          rowCount: 1,
        };
      }
      if (
        text.startsWith('insert into public.stock_moves') ||
        text.startsWith('update public.license_plates') ||
        text.startsWith('delete from public.lp_genealogy') ||
        text.startsWith('insert into public.lp_state_history') ||
        text.startsWith('insert into public.audit_events')
      ) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`unexpected query: ${text}`);
    }),
  };
}

beforeEach(() => {
  state.alreadyCorrected = false;
  state.corrections = [];
  state.wac = { totalQtyKg: '100', totalValue: '500', avgCost: '5' };
  state.client = makeClient();
});

describe('XC-041 append-only ledger correction contract', () => {
  it('keeps the original, appends storno plus replacement, and recalculates WAC', async () => {
    const originalBefore = structuredClone(originalOutput);

    const result = await voidWoOutput({
      outputId: OUTPUT_ID,
      reasonCode: 'wrong_quantity',
      signature: { password: 'valid-password' },
      replacement: { qtyKg: '8' },
    } as Parameters<typeof voidWoOutput>[0] & { replacement: { qtyKg: string } });

    expect(result).toEqual({ ok: true });
    expect(originalOutput).toEqual(originalBefore);
    expect.soft(state.corrections).toEqual([
      { correctionOfId: OUTPUT_ID, qtyKg: '-10' },
      { correctionOfId: null, qtyKg: '8' },
    ]);
    const netOutputQty = state.corrections.reduce(
      (sum, entry) => sum + BigInt(entry.qtyKg),
      BigInt(originalOutput.qty_kg),
    );
    expect.soft(netOutputQty).toBe(8n);
    expect.soft(state.wac).toEqual({ totalQtyKg: '98', totalValue: '490', avgCost: '5' });
  });

  it('rejects a second correction without appending or changing WAC', async () => {
    state.alreadyCorrected = true;

    const result = await voidWoOutput({
      outputId: OUTPUT_ID,
      reasonCode: 'wrong_quantity',
      signature: { password: 'valid-password' },
    });

    expect(result).toEqual({ ok: false, error: 'already_corrected' });
    expect(state.corrections).toEqual([]);
    expect(state.wac).toEqual({ totalQtyKg: '100', totalValue: '500', avgCost: '5' });
  });
});

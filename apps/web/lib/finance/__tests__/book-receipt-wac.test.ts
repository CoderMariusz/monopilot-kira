import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bookReceiptWacAfterGrnItem,
  BookReceiptWacError,
  describeUnvaluablePoLines,
  findUnvaluablePricedPoLines,
  preflightReceiptWacResolvability,
} from '../book-receipt-wac';
import { microToDecimal, toMicro } from '../../shared/decimal';
import { computeWacReversalDelta, isZeroDecimalString, WAC_VALUATION_CURRENCY_CODE } from '../upsert-wac';

const ORG_ID = '00000000-0000-4000-8000-00000000000a';
const USER_ID = '00000000-0000-4000-8000-0000000000aa';
const PO_ID = '00000000-0000-4000-8000-0000000000a1';
const LINE_ID = '00000000-0000-4000-8000-0000000000b1';
const ITEM_ID = '00000000-0000-4000-8000-0000000000c1';
const GRN_ITEM_ID = '00000000-0000-4000-8000-0000000000f1';
const SITE_ID = '00000000-0000-4000-8000-0000000000e2';

describe('bookReceiptWacAfterGrnItem', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('books GBP receipts into the org base-currency WAC pool', async () => {
    const client = new BookReceiptWacMockClient({ poCurrency: 'GBP' });

    await bookReceiptWacAfterGrnItem(
      client,
      { orgId: ORG_ID, userId: USER_ID, siteId: SITE_ID },
      {
        grnItemId: GRN_ITEM_ID,
        itemId: ITEM_ID,
        qty: '10',
        uom: 'kg',
        poLineId: LINE_ID,
      },
    );

    const currencyLookup = client.calls.find((call) =>
      normalize(call.sql).includes('from public.currencies where code = $1'),
    );
    expect(currencyLookup?.params).toEqual(['GBP']);

    const grnUpdate = client.calls.find(
      (call) => normalize(call.sql).startsWith('update public.grn_items') && normalize(call.sql).includes('ext_jsonb'),
    );
    expect(JSON.parse(String(grnUpdate?.params?.[2]))).toMatchObject({
      wac_currency_code: WAC_VALUATION_CURRENCY_CODE,
    });
    expect(client.upsertCalls).toHaveLength(1);
    expect(client.upsertCalls[0]).toMatchObject({
      currencyCode: WAC_VALUATION_CURRENCY_CODE,
      deltaQtyKg: '10',
      deltaValue: '42',
    });
  });

  it('rejects non-base PO currency with unsupported_currency (no FX conversion)', async () => {
    const client = new BookReceiptWacMockClient({ poCurrency: 'EUR' });

    await expect(
      bookReceiptWacAfterGrnItem(
        client,
        { orgId: ORG_ID, userId: USER_ID, siteId: SITE_ID },
        {
          grnItemId: GRN_ITEM_ID,
          itemId: ITEM_ID,
          qty: '10',
          uom: 'kg',
          poLineId: LINE_ID,
        },
      ),
    ).rejects.toMatchObject({
      code: 'unsupported_currency',
      currencyCode: 'EUR',
    } satisfies Partial<BookReceiptWacError>);

    expect(client.upsertCalls).toHaveLength(0);
  });

  it('throws unknown_currency when the PO currency is missing or invalid', async () => {
    const client = new BookReceiptWacMockClient({ poCurrency: '' });

    await expect(
      bookReceiptWacAfterGrnItem(
        client,
        { orgId: ORG_ID, userId: USER_ID, siteId: SITE_ID },
        {
          grnItemId: GRN_ITEM_ID,
          itemId: ITEM_ID,
          qty: '5',
          uom: 'kg',
          poLineId: LINE_ID,
        },
      ),
    ).rejects.toMatchObject({
      code: 'unknown_currency',
    } satisfies Partial<BookReceiptWacError>);

    expect(client.upsertCalls).toHaveLength(0);
  });

  it('throws a typed error when the PO currency is not seeded in currencies', async () => {
    const client = new BookReceiptWacMockClient({ poCurrency: 'ZZZ', seedCurrency: false });

    await expect(
      bookReceiptWacAfterGrnItem(
        client,
        { orgId: ORG_ID, userId: USER_ID, siteId: SITE_ID },
        {
          grnItemId: GRN_ITEM_ID,
          itemId: ITEM_ID,
          qty: '5',
          uom: 'kg',
          poLineId: LINE_ID,
        },
      ),
    ).rejects.toMatchObject({
      code: 'unknown_currency',
      currencyCode: 'ZZZ',
    } satisfies Partial<BookReceiptWacError>);

    expect(client.upsertCalls).toHaveLength(0);
  });

  it('rejects receipt when WAC UoM cannot be resolved to kg', async () => {
    const client = new BookReceiptWacMockClient({ poCurrency: 'GBP', wacResolved: false });

    await expect(
      bookReceiptWacAfterGrnItem(
        client,
        { orgId: ORG_ID, userId: USER_ID, siteId: SITE_ID },
        {
          grnItemId: GRN_ITEM_ID,
          itemId: ITEM_ID,
          qty: '5',
          uom: 'each',
          poLineId: LINE_ID,
        },
      ),
    ).rejects.toMatchObject({
      code: 'unresolved_uom',
      uom: 'each',
      qty: '5',
    } satisfies Partial<BookReceiptWacError>);

    expect(client.upsertCalls).toHaveLength(0);
    expect(
      client.calls.some(
        (call) => normalize(call.sql).startsWith('update public.grn_items') && normalize(call.sql).includes('ext_jsonb'),
      ),
    ).toBe(false);
  });

  it('preflight rejects unresolvable UoM before any receipt writes', async () => {
    const client = new BookReceiptWacMockClient({ poCurrency: 'GBP', wacResolved: false });

    await expect(
      preflightReceiptWacResolvability(
        client,
        { orgId: ORG_ID, userId: USER_ID, siteId: SITE_ID },
        {
          itemId: ITEM_ID,
          qty: '5',
          uom: 'each',
          poLineId: LINE_ID,
        },
      ),
    ).rejects.toMatchObject({
      code: 'unresolved_uom',
      uom: 'each',
      qty: '5',
    } satisfies Partial<BookReceiptWacError>);

    expect(client.upsertCalls).toHaveLength(0);
    expect(
      client.calls.some(
        (call) => normalize(call.sql).startsWith('update public.grn_items') && normalize(call.sql).includes('ext_jsonb'),
      ),
    ).toBe(false);
  });

  /**
   * R07-03: a priced line in `g` used to fail here with unresolved_uom. The UoM code
   * must reach the resolver untouched (only piece codes are rewritten to `each`).
   *
   * REWRITTEN — the previous version of this test was named as a gram receipt but its
   * mock echoed the quantity back unchanged, so it booked 100.125 KILOGRAMS into the
   * pool: a thousandfold overstatement, and the exact opposite of what the fix does.
   * It asserted only that the string 'g' reached the resolver and that one upsert
   * happened, so it would have gone green while proving the inverse. The pool delta
   * is now asserted directly.
   */
  it('books a gram receipt as KILOGRAMS — 100.125 g enters the pool as 0.100125 kg', async () => {
    const client = new BookReceiptWacMockClient({ poCurrency: 'GBP', unitPrice: '0.0199' });

    await bookReceiptWacAfterGrnItem(
      client,
      { orgId: ORG_ID, userId: USER_ID, siteId: SITE_ID },
      { grnItemId: GRN_ITEM_ID, itemId: ITEM_ID, qty: '100.125', uom: 'g', poLineId: LINE_ID },
    );

    const resolverCall = client.calls.find(
      (call) => normalize(call.sql).includes('from public.items i') && normalize(call.sql).includes('as qty_kg'),
    );
    expect(resolverCall?.params?.[1]).toBe('g');
    expect(client.upsertCalls).toHaveLength(1);

    // The assertion the old test was missing entirely.
    expect(client.upsertCalls[0]?.deltaQtyKg).toBe('0.100125');
    expect(client.upsertCalls[0]?.deltaQtyKg).not.toBe('100.125');
    // Only the QUANTITY converts. Value stays qty × unit_price in the line's own UoM
    // (£0.0199 per GRAM ≈ £1.99), so converting it too would understate it 1000×.
    expect(Number(client.upsertCalls[0]?.deltaValue)).toBeCloseTo(1.9925, 4);

    // The reversal snapshot records what the POOL TOOK — 0.100125 kg quantizes to
    // 0.100 against numeric(14,3), and snapshotting the requested 0.100125 would let
    // cancellation subtract fractionally more than was ever added.
    const grnUpdate = client.calls.find(
      (call) => normalize(call.sql).startsWith('update public.grn_items') && normalize(call.sql).includes('ext_jsonb'),
    );
    expect(JSON.parse(String(grnUpdate?.params?.[2]))).toMatchObject({ wac_qty_kg: '0.1' });
  });

  // The function has always documented "No-op when the PO line has no unit price", but the
  // only guard was `if (!line) return` — and unit_price is NOT NULL DEFAULT 0, so a free
  // line was blocked too. A free line books qty × 0 = 0 value: blocking protected nothing.
  it('preflight lets a free line through even when its UoM cannot be converted', async () => {
    const client = new BookReceiptWacMockClient({ poCurrency: 'GBP', unitPrice: '0.0000', wacResolved: false });

    await expect(
      preflightReceiptWacResolvability(
        client,
        { orgId: ORG_ID, userId: USER_ID, siteId: SITE_ID },
        { itemId: ITEM_ID, qty: '5', uom: 'pcs', poLineId: LINE_ID },
      ),
    ).resolves.toBeUndefined();
  });

  it('marks a free unconvertible receipt wac_excluded instead of booking or blocking it', async () => {
    const client = new BookReceiptWacMockClient({ poCurrency: 'GBP', unitPrice: '0.0000', wacResolved: false });

    await bookReceiptWacAfterGrnItem(
      client,
      { orgId: ORG_ID, userId: USER_ID, siteId: SITE_ID },
      { grnItemId: GRN_ITEM_ID, itemId: ITEM_ID, qty: '5', uom: 'pcs', poLineId: LINE_ID },
    );

    const grnUpdate = client.calls.find(
      (call) => normalize(call.sql).startsWith('update public.grn_items') && normalize(call.sql).includes('ext_jsonb'),
    );
    // The marker alone was not enough: cancellation only takes its snapshot branch
    // when wac_qty_kg/wac_value are present, and otherwise RE-DERIVES the contribution
    // from today's item master. The explicit zero is what makes the reversal a no-op.
    expect(JSON.parse(String(grnUpdate?.params?.[2]))).toEqual({
      wac_excluded: 'unresolved_uom',
      wac_qty_kg: '0',
      wac_value: '0',
    });
    expect(client.upsertCalls).toHaveLength(0);
  });

  // Anti-regression: a free line whose UoM *is* convertible still books qty at zero value,
  // so free goods keep diluting avg_cost exactly as they do today.
  it('still books a free line when the UoM converts to kg', async () => {
    const client = new BookReceiptWacMockClient({ poCurrency: 'GBP', unitPrice: '0.0000' });

    await bookReceiptWacAfterGrnItem(
      client,
      { orgId: ORG_ID, userId: USER_ID, siteId: SITE_ID },
      { grnItemId: GRN_ITEM_ID, itemId: ITEM_ID, qty: '10', uom: 'kg', poLineId: LINE_ID },
    );

    expect(client.upsertCalls).toEqual([
      { currencyCode: WAC_VALUATION_CURRENCY_CODE, deltaQtyKg: '10', deltaValue: '0' },
    ]);
  });
});

/**
 * A receipt that contributed NOTHING to the pool must reverse to nothing.
 *
 * Cancellation reads grn_items.ext_jsonb: with a snapshot it negates the snapshot,
 * without one it falls back to re-resolving qty→kg against the CURRENT item master
 * and multiplying by unit_price. For a receipt excluded at booking time, that
 * fallback subtracts a contribution the pool never received — and it gets *more*
 * likely over time, because the fallback starts succeeding as soon as someone fills
 * in the conversion factor that was missing on the day of the receipt.
 */
describe('reversing a receipt that never entered the pool', () => {
  it('subtracts nothing, even when the master data would now resolve the UoM', () => {
    const reversal = computeWacReversalDelta({
      extJsonb: { wac_excluded: 'unresolved_uom', wac_qty_kg: '0', wac_value: '0' },
      // What the fallback would re-derive today: 5 pcs × 0.5 kg, £30 of value that
      // was never booked because `pcs` had no net_qty_per_each at receipt time.
      fallbackQtyKg: '2.5',
      fallbackValue: '30.0000',
    });

    expect(reversal.source).toBe('snapshot');
    expect(isZeroDecimalString(reversal.deltaQtyKg)).toBe(true);
    expect(isZeroDecimalString(reversal.deltaValue)).toBe(true);
  });

  it('still reverses a receipt that DID enter the pool, at the booked amounts', () => {
    const reversal = computeWacReversalDelta({
      extJsonb: { wac_qty_kg: '0.100125', wac_value: '1.9925' },
      fallbackQtyKg: '999',
      fallbackValue: '999',
    });

    expect(reversal).toEqual({ deltaQtyKg: '-0.100125', deltaValue: '-1.9925', source: 'snapshot' });
  });
});

describe('findUnvaluablePricedPoLines (PO-confirm gate)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('rejects a priced pcs line with no net weight per each and names the missing field', async () => {
    const client = new PoLineGateMockClient([
      { item_id: ITEM_ID, line_no: 2, item_code: 'PKG-001', qty: '77.5', uom: 'pcs', net_qty_per_each: null },
    ]);

    const blocked = await findUnvaluablePricedPoLines(client, ORG_ID, PO_ID);

    expect(blocked).toEqual([
      { lineNo: 2, itemCode: 'PKG-001', uom: 'pcs', missingField: 'net_qty_per_each' },
    ]);
    expect(describeUnvaluablePoLines(blocked)).toBe(
      'line 2 (PKG-001): UoM "pcs" needs items.net_qty_per_each to convert to kg',
    );
  });

  it('names each_per_box when only the box factor is missing', async () => {
    const client = new PoLineGateMockClient([
      { item_id: ITEM_ID, line_no: 1, item_code: 'BOX-001', qty: '4', uom: 'box', net_qty_per_each: '0.400000' },
    ]);

    expect(await findUnvaluablePricedPoLines(client, ORG_ID, PO_ID)).toEqual([
      { lineNo: 1, itemCode: 'BOX-001', uom: 'box', missingField: 'each_per_box' },
    ]);
  });

  it('reports a UoM with no kg conversion at all separately from a missing pack factor', async () => {
    const client = new PoLineGateMockClient([
      { item_id: ITEM_ID, line_no: 3, item_code: 'ROPE-001', qty: '20', uom: 'm', net_qty_per_each: null },
    ]);

    const blocked = await findUnvaluablePricedPoLines(client, ORG_ID, PO_ID);

    expect(blocked[0]?.missingField).toBe('kg_conversion');
    expect(describeUnvaluablePoLines(blocked)).toBe(
      'line 3 (ROPE-001): UoM "m" has no conversion to kg for costing',
    );
  });

  // Anti-regression: the gate runs the receipt resolver, so it can only reject what the
  // receipt would have rejected. Everything production orders today must pass.
  it('passes kg and g lines, and never queries lines that carry no price', async () => {
    const client = new PoLineGateMockClient([
      { item_id: ITEM_ID, line_no: 1, item_code: 'BUT-001', qty: '789.125', uom: 'g', net_qty_per_each: null },
      { item_id: ITEM_ID, line_no: 2, item_code: 'RM-001', qty: '10', uom: 'kg', net_qty_per_each: null },
    ]);

    expect(await findUnvaluablePricedPoLines(client, ORG_ID, PO_ID)).toEqual([]);
    expect(normalize(client.calls[0]?.sql ?? '')).toContain('pol.unit_price > 0');
  });
});

type MockCall = { sql: string; params?: readonly unknown[] };

type GateLineRow = {
  item_id: string;
  line_no: number;
  item_code: string | null;
  qty: string;
  uom: string;
  net_qty_per_each: string | null;
};

/** Answers the priced-line scan, then fakes only the resolver branches exercised here. */
class PoLineGateMockClient {
  calls: MockCall[] = [];

  constructor(private readonly lines: GateLineRow[]) {}

  async query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }> {
    this.calls.push({ sql, params });
    const normalized = normalize(sql);

    if (normalized.includes('from public.purchase_order_lines pol')) {
      return { rows: this.lines as T[] };
    }
    if (normalized.includes('from public.items i') && normalized.includes('as qty_kg')) {
      const uom = String(params?.[1] ?? '').toLowerCase();
      const resolved = uom === 'kg' || uom === 'g';
      return { rows: [{ qty_kg: resolved ? String(params?.[0] ?? '0') : '0', resolved }] as T[] };
    }
    return { rows: [] };
  }
}

class BookReceiptWacMockClient {
  calls: MockCall[] = [];
  upsertCalls: Array<{
    currencyCode?: string;
    deltaQtyKg: string;
    deltaValue: string;
  }> = [];

  constructor(
    private readonly options: {
      poCurrency: string;
      unitPrice?: string;
      seedCurrency?: boolean;
      wacResolved?: boolean;
    },
  ) {}

  async query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }> {
    this.calls.push({ sql, params });
    const normalized = normalize(sql);

    if (normalized.startsWith('select pol.item_id::text, pol.unit_price::text as unit_price')) {
      return {
        rows: [
          {
            item_id: ITEM_ID,
            unit_price: this.options.unitPrice ?? '4.20',
            currency: this.options.poCurrency,
          },
        ] as T[],
      };
    }
    if (normalized.includes('from public.currencies where code = $1')) {
      const code = String(params?.[0] ?? '');
      if (this.options.seedCurrency === false) {
        return { rows: [] };
      }
      if (['EUR', 'GBP', 'USD'].includes(code)) {
        return { rows: [{ id: `currency-${code}` }] as T[] };
      }
      return { rows: [] };
    }
    if (normalized.includes('from public.items i') && normalized.includes('as qty_kg')) {
      if (this.options.wacResolved === false) {
        return { rows: [{ qty_kg: '0', resolved: false }] as T[] };
      }
      const qty = String(params?.[0] ?? '0');
      const uom = String(params?.[1] ?? '').toLowerCase();
      // Stand in for Postgres on the ONE branch under test — and only while the
      // query actually declares it. If the g→kg conversion is ever dropped from
      // the SQL, this mock stops converting too and the gram test FAILS, instead
      // of quietly echoing the raw number back and "passing".
      const declaresGramConversion = normalized.includes("= 'g' then round($1::numeric / 1000, 6)");
      if (uom === 'g' && declaresGramConversion) {
        return { rows: [{ qty_kg: gramsToKgText(qty), resolved: true }] as T[] };
      }
      return { rows: [{ qty_kg: qty, resolved: true }] as T[] };
    }
    if (normalized.startsWith('select ($1::numeric * coalesce($2::numeric, 0))::text as value')) {
      const left = Number(params?.[0] ?? 0);
      const right = Number(params?.[1] ?? 0);
      return { rows: [{ value: String(left * right) }] as T[] };
    }
    if (normalized.includes('insert into public.item_wac_state')) {
      this.upsertCalls.push({
        currencyCode: String(params?.[6] ?? 'GBP'),
        deltaQtyKg: String(params?.[2] ?? '0'),
        deltaValue: String(params?.[3] ?? '0'),
      });
      // Quantize exactly like the columns do — total_qty_kg is numeric(14,3) and
      // total_value numeric(18,4). Returning the deltas unrounded would let this
      // mock report a contribution the real pool never stores.
      return {
        rows: [
          {
            totalQtyKg: quantize(String(params?.[2] ?? '0'), 3),
            totalValue: quantize(String(params?.[3] ?? '0'), 4),
            availableQtyKg: '0',
            availableValue: '0',
            clamped: false,
          },
        ] as T[],
      };
    }
    if (normalized.startsWith('update public.grn_items') && normalized.includes('ext_jsonb')) {
      return { rows: [], rowCount: 1 };
    }

    return { rows: [] };
  }
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Exact ÷1000 rounded to 6 dp — what `round($1::numeric / 1000, 6)` does, without float. */
function gramsToKgText(qty: string): string {
  const micro = toMicro(qty);
  return microToDecimal((micro + 500n) / 1000n);
}

/** Round a decimal string to `dp` places, half away from zero — a numeric(_,dp) store. */
function quantize(value: string, dp: number): string {
  const step = 10n ** BigInt(6 - dp);
  const micro = toMicro(value);
  const negative = micro < 0n;
  const abs = negative ? -micro : micro;
  const rounded = ((abs + step / 2n) / step) * step;
  return microToDecimal(negative ? -rounded : rounded);
}

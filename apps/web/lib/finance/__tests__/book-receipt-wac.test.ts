import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bookReceiptWacAfterGrnItem,
  BookReceiptWacError,
  preflightReceiptWacResolvability,
} from '../book-receipt-wac';

const ORG_ID = '00000000-0000-4000-8000-00000000000a';
const USER_ID = '00000000-0000-4000-8000-0000000000aa';
const LINE_ID = '00000000-0000-4000-8000-0000000000b1';
const ITEM_ID = '00000000-0000-4000-8000-0000000000c1';
const GRN_ITEM_ID = '00000000-0000-4000-8000-0000000000f1';
const SITE_ID = '00000000-0000-4000-8000-0000000000e2';

describe('bookReceiptWacAfterGrnItem', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('books EUR receipts into the EUR currency bucket (not NULL, not GBP)', async () => {
    const client = new BookReceiptWacMockClient({ poCurrency: 'EUR' });

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
    expect(currencyLookup?.params).toEqual(['EUR']);

    const grnUpdate = client.calls.find(
      (call) => normalize(call.sql).startsWith('update public.grn_items') && normalize(call.sql).includes('ext_jsonb'),
    );
    expect(JSON.parse(String(grnUpdate?.params?.[2]))).toMatchObject({
      wac_currency_code: 'EUR',
    });
    expect(client.upsertCalls).toHaveLength(1);
    expect(client.upsertCalls[0]).toMatchObject({
      currencyCode: 'EUR',
      deltaQtyKg: '10',
      deltaValue: '42',
    });
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
});

type MockCall = { sql: string; params?: readonly unknown[] };

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
      return { rows: [{ qty_kg: String(params?.[0] ?? '0'), resolved: true }] as T[] };
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
      return { rows: [{ totalQtyKg: String(params?.[2] ?? '0'), totalValue: String(params?.[3] ?? '0'), clamped: false }] as T[] };
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

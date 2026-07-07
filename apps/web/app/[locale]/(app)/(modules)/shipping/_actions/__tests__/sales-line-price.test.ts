import { describe, expect, it } from 'vitest';

import {
  fetchActiveCustomerItemPrices,
  resolveSalesLinePrice,
  SO_LINE_PRICE_CURRENCY,
} from '../sales-line-price';

const ITEM = { id: 'item-1', list_price_gbp: 10 };

type PriceRow = {
  item_id: string;
  unit_price: string;
  currency: string;
  effective_from: string;
  effective_to: string | null;
};

function makeFilteringClient(rows: PriceRow[]) {
  return {
    query: async (_sql: string, params?: readonly unknown[]) => {
      const [, , asOfDate, currency] = params ?? [];
      const asOf = String(asOfDate);
      const targetCurrency = String(currency);
      const active = rows.filter(
        (row) =>
          row.currency === targetCurrency &&
          row.effective_from <= asOf &&
          (row.effective_to == null || row.effective_to >= asOf),
      );
      const latestByItem = new Map<string, PriceRow>();
      for (const row of [...active].sort((a, b) => b.effective_from.localeCompare(a.effective_from))) {
        if (!latestByItem.has(row.item_id)) latestByItem.set(row.item_id, row);
      }
      return {
        rows: [...latestByItem.values()].map((row) => ({
          item_id: row.item_id,
          unit_price: row.unit_price,
          currency: row.currency,
        })),
        rowCount: latestByItem.size,
      };
    },
  };
}

describe('resolveSalesLinePrice', () => {
  it('uses active GBP customer price over list price', () => {
    expect(
      resolveSalesLinePrice(ITEM, {
        customerId: 'cust-1',
        customerPrice: { unit_price: 8.5, currency: 'GBP' },
      }),
    ).toBe(8.5);
  });

  it('falls back to list price when customer price is absent', () => {
    expect(resolveSalesLinePrice(ITEM, { customerId: 'cust-1' })).toBe(10);
    expect(resolveSalesLinePrice(ITEM, { customerId: 'cust-1', customerPrice: null })).toBe(10);
  });

  it('ignores non-GBP customer price and falls back to list price', () => {
    expect(
      resolveSalesLinePrice(ITEM, {
        customerId: 'cust-1',
        customerPrice: { unit_price: 5, currency: 'EUR' },
      }),
    ).toBe(10);
  });

  it('returns 0 when list price is null and no customer price', () => {
    expect(resolveSalesLinePrice({ id: 'item-1', list_price_gbp: null })).toBe(0);
  });

  it('defaults target currency to GBP', () => {
    expect(SO_LINE_PRICE_CURRENCY).toBe('GBP');
  });
});

describe('fetchActiveCustomerItemPrices', () => {
  it('maps rows returned by the active-window query', async () => {
    const client = {
      query: async () => ({
        rows: [{ item_id: 'item-1', unit_price: '6.75', currency: 'GBP' }],
        rowCount: 1,
      }),
    };

    const prices = await fetchActiveCustomerItemPrices(client, 'cust-1', ['item-1'], '2026-07-07');

    expect(prices.get('item-1')).toEqual({ unit_price: 6.75, currency: 'GBP' });
  });

  it('returns an empty map when itemIds is empty', async () => {
    const client = { query: async () => ({ rows: [], rowCount: 0 }) };
    const prices = await fetchActiveCustomerItemPrices(client, 'cust-1', [], '2026-07-07');
    expect(prices.size).toBe(0);
  });

  it('filters by target currency in SQL before DISTINCT ON', async () => {
    let capturedSql = '';
    let capturedParams: readonly unknown[] = [];
    const client = {
      query: async (sql: string, params?: readonly unknown[]) => {
        capturedSql = sql;
        capturedParams = params ?? [];
        return {
          rows: [{ item_id: 'item-1', unit_price: '8.00', currency: 'GBP' }],
          rowCount: 1,
        };
      },
    };

    await fetchActiveCustomerItemPrices(client, 'cust-1', ['item-1'], '2026-07-07', 'GBP');

    expect(capturedSql).toMatch(/cip\.currency\s*=\s*\$4/i);
    expect(capturedParams).toEqual(['cust-1', ['item-1'], '2026-07-07', 'GBP']);
  });

  it('mixed currency: active GBP wins over newer EUR when SO is GBP in July', async () => {
    const client = makeFilteringClient([
      {
        item_id: 'item-1',
        unit_price: '8.00',
        currency: 'GBP',
        effective_from: '2026-01-01',
        effective_to: null,
      },
      {
        item_id: 'item-1',
        unit_price: '5.00',
        currency: 'EUR',
        effective_from: '2026-06-01',
        effective_to: null,
      },
    ]);

    const prices = await fetchActiveCustomerItemPrices(client, 'cust-1', ['item-1'], '2026-07-07', 'GBP');
    expect(prices.get('item-1')).toEqual({ unit_price: 8, currency: 'GBP' });

    expect(
      resolveSalesLinePrice(ITEM, {
        customerId: 'cust-1',
        customerPrice: prices.get('item-1') ?? null,
      }),
    ).toBe(8);
  });

  it('excludes expired customer prices and falls back to list price', async () => {
    const client = makeFilteringClient([
      {
        item_id: 'item-1',
        unit_price: '4.00',
        currency: 'GBP',
        effective_from: '2026-01-01',
        effective_to: '2026-06-30',
      },
    ]);

    const prices = await fetchActiveCustomerItemPrices(client, 'cust-1', ['item-1'], '2026-07-07', 'GBP');
    expect(prices.size).toBe(0);

    expect(
      resolveSalesLinePrice(ITEM, {
        customerId: 'cust-1',
        customerPrice: prices.get('item-1') ?? null,
      }),
    ).toBe(10);
  });
});

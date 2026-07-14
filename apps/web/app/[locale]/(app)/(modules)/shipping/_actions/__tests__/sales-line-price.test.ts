import { describe, expect, it } from 'vitest';

import {
  computeSoLineTotalGbp,
  fetchActiveCustomerItemPrices,
  normalizePriceString,
  normalizeSoUnitPriceGbp,
  resolveSalesLinePrice,
  resolveSalesLinePriceDetailed,
  SO_LINE_PRICE_CURRENCY,
} from '../sales-line-price';

const ITEM = { id: 'item-1', list_price_gbp: '10.0000' };

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

describe('normalizePriceString', () => {
  it('preserves high-precision decimal text without float conversion', () => {
    expect(normalizePriceString('12.3456789')).toBe('12.3456789');
    expect(normalizePriceString('123456789012.1234')).toBe('123456789012.1234');
  });
});

describe('normalizeSoUnitPriceGbp', () => {
  it('rounds resolved list prices to the persisted 4dp scale', () => {
    expect(normalizeSoUnitPriceGbp('12.3456789')).toBe('12.3457');
    expect(normalizeSoUnitPriceGbp('1.005')).toBe('1.0050');
  });
});

describe('computeSoLineTotalGbp', () => {
  it('matches Postgres line_total_gbp for fractional unit prices without JS float math', () => {
    expect(computeSoLineTotalGbp('1', '1.0050')).toBe('1.0050');
    expect(computeSoLineTotalGbp('10', '7.2500')).toBe('72.5000');
  });
});

describe('resolveSalesLinePrice', () => {
  it('uses active GBP customer price over list price', () => {
    expect(
      resolveSalesLinePrice(ITEM, {
        customerPrice: { unit_price: '8.5000', currency: 'GBP' },
      }),
    ).toBe('8.5000');
  });

  it('falls back to list price when customer price is absent', () => {
    expect(resolveSalesLinePrice(ITEM, {})).toBe('10.0000');
    expect(resolveSalesLinePrice(ITEM, { customerPrice: null })).toBe('10.0000');
  });

  it('surfaces non-GBP customer price as a hint while defaulting to list price', () => {
    expect(
      resolveSalesLinePriceDetailed(ITEM, {
        customerPriceAny: { unit_price: '5.0000', currency: 'EUR' },
      }),
    ).toEqual({
      unitPriceGbp: '10.0000',
      foreignCustomerPrice: { unit_price: '5.0000', currency: 'EUR' },
    });
    expect(
      resolveSalesLinePrice(ITEM, {
        customerPrice: { unit_price: '5.0000', currency: 'EUR' },
      }),
    ).toBe('10.0000');
  });

  it('returns 0 when list price is null and no customer price', () => {
    expect(resolveSalesLinePrice({ id: 'item-1', list_price_gbp: null })).toBe('0');
  });

  it('defaults target currency to GBP', () => {
    expect(SO_LINE_PRICE_CURRENCY).toBe('GBP');
  });

  it('preserves contract decimal precision from list_price_gbp text', () => {
    expect(resolveSalesLinePrice({ id: 'item-1', list_price_gbp: '99.9999' })).toBe('99.9999');
  });

  it('normalizes >4dp list prices to the persisted scale', () => {
    expect(resolveSalesLinePrice({ id: 'item-1', list_price_gbp: '12.3456789' })).toBe('12.3457');
  });
});

describe('fetchActiveCustomerItemPrices', () => {
  it('maps rows returned by the active-window query', async () => {
    const client = {
      query: async () => ({
        rows: [{ item_id: 'item-1', unit_price: '6.7500', currency: 'GBP' }],
        rowCount: 1,
      }),
    };

    const prices = await fetchActiveCustomerItemPrices(client, 'cust-1', ['item-1'], '2026-07-07');

    expect(prices.get('item-1')).toEqual({ unit_price: '6.7500', currency: 'GBP' });
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
          rows: [{ item_id: 'item-1', unit_price: '8.0000', currency: 'GBP' }],
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
        unit_price: '8.0000',
        currency: 'GBP',
        effective_from: '2026-01-01',
        effective_to: null,
      },
      {
        item_id: 'item-1',
        unit_price: '5.0000',
        currency: 'EUR',
        effective_from: '2026-06-01',
        effective_to: null,
      },
    ]);

    const prices = await fetchActiveCustomerItemPrices(client, 'cust-1', ['item-1'], '2026-07-07', 'GBP');
    expect(prices.get('item-1')).toEqual({ unit_price: '8.0000', currency: 'GBP' });

    expect(
      resolveSalesLinePrice(ITEM, {
        customerPrice: prices.get('item-1') ?? null,
      }),
    ).toBe('8.0000');
  });

  it('excludes expired customer prices and falls back to list price', async () => {
    const client = makeFilteringClient([
      {
        item_id: 'item-1',
        unit_price: '4.0000',
        currency: 'GBP',
        effective_from: '2026-01-01',
        effective_to: '2026-06-30',
      },
    ]);

    const prices = await fetchActiveCustomerItemPrices(client, 'cust-1', ['item-1'], '2026-07-07', 'GBP');
    expect(prices.size).toBe(0);

    expect(
      resolveSalesLinePrice(ITEM, {
        customerPrice: prices.get('item-1') ?? null,
      }),
    ).toBe('10.0000');
  });
});

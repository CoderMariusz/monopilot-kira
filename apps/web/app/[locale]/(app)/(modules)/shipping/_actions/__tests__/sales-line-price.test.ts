import { describe, expect, it } from 'vitest';

import {
  fetchActiveCustomerItemPrices,
  resolveSalesLinePrice,
  SO_LINE_PRICE_CURRENCY,
} from '../sales-line-price';

const ITEM = { id: 'item-1', list_price_gbp: 10 };

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

  it('falls back to list price when customer price is expired (lookup returns nothing)', () => {
    expect(resolveSalesLinePrice(ITEM, { customerId: 'cust-1' })).toBe(10);
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
});

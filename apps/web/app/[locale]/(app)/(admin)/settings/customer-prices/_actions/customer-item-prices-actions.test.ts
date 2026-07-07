import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(),
}));

vi.mock('../../../../../../../lib/auth/has-permission', () => ({
  hasPermission: vi.fn(),
}));

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import {
  createCustomerItemPrice,
  deactivateCustomerItemPrice,
  listCustomerItemPrices,
  updateCustomerItemPrice,
} from './customer-item-prices-actions';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CUSTOMER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ITEM_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PRICE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

type QueryHandler = (sql: string, params?: readonly unknown[]) => { rows: Record<string, unknown>[]; rowCount?: number };

function mockOrgContext(queryHandler: QueryHandler) {
  vi.mocked(withOrgContext).mockImplementation(async (fn) =>
    fn({
      userId: USER_ID,
      orgId: ORG_ID,
      client: {
        query: vi.fn(async (sql: string, params?: readonly unknown[]) => queryHandler(sql, params)),
      },
    }),
  );
}

describe('customer-item-prices actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasPermission).mockResolvedValue(true);
  });

  it('listCustomerItemPrices returns forbidden without settings.org.read', async () => {
    vi.mocked(hasPermission).mockResolvedValue(false);
    mockOrgContext(() => ({ rows: [] }));
    const result = await listCustomerItemPrices();
    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });

  it('createCustomerItemPrice inserts an org-scoped row', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    mockOrgContext((sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('from public.customers c') && sql.includes('join public.items i')) {
        return { rows: [{ ok: true }] };
      }
      if (sql.startsWith('insert into public.customer_item_prices')) {
        return { rows: [{ id: PRICE_ID }] };
      }
      return { rows: [] };
    });

    const result = await createCustomerItemPrice({
      customerId: CUSTOMER_ID,
      itemId: ITEM_ID,
      unitPrice: 12.5,
      currency: 'GBP',
      effectiveFrom: '2026-07-01',
      effectiveTo: null,
    });

    expect(result).toEqual({ ok: true, id: PRICE_ID });
    const insert = calls.find((call) => call.sql.startsWith('insert into public.customer_item_prices'));
    expect(insert?.params).toEqual([
      CUSTOMER_ID,
      ITEM_ID,
      12.5,
      'GBP',
      '2026-07-01',
      null,
      USER_ID,
    ]);
    expect(insert?.sql).toContain('app.current_org_id()');
  });

  it('updateCustomerItemPrice updates an existing row', async () => {
    mockOrgContext((sql) => {
      if (sql.includes('from public.customers c') && sql.includes('join public.items i')) {
        return { rows: [{ ok: true }] };
      }
      if (sql.startsWith('update public.customer_item_prices cip')) {
        return { rows: [{ id: PRICE_ID }] };
      }
      return { rows: [] };
    });

    const result = await updateCustomerItemPrice({
      id: PRICE_ID,
      customerId: CUSTOMER_ID,
      itemId: ITEM_ID,
      unitPrice: 15,
      currency: 'GBP',
      effectiveFrom: '2026-07-01',
      effectiveTo: '2026-12-31',
    });

    expect(result).toEqual({ ok: true, id: PRICE_ID });
  });

  it('deactivateCustomerItemPrice soft-deletes via deleted_at', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    mockOrgContext((sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('set deleted_at = now()')) {
        return { rows: [{ id: PRICE_ID }] };
      }
      return { rows: [] };
    });

    const result = await deactivateCustomerItemPrice({ id: PRICE_ID });
    expect(result).toEqual({ ok: true, id: PRICE_ID });
    const deactivate = calls.find((call) => call.sql.includes('set deleted_at = now()'));
    expect(deactivate?.params).toEqual([PRICE_ID, USER_ID]);
    expect(deactivate?.sql).toContain('org_id = app.current_org_id()');
  });

  it('createCustomerItemPrice rejects writes without settings.org.update', async () => {
    vi.mocked(hasPermission).mockImplementation(async (_ctx, permission) => permission === 'settings.org.read');
    mockOrgContext(() => ({ rows: [{ ok: true }] }));

    const result = await createCustomerItemPrice({
      customerId: CUSTOMER_ID,
      itemId: ITEM_ID,
      unitPrice: 10,
      currency: 'GBP',
      effectiveFrom: '2026-07-01',
    });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });

  it('deactivateCustomerItemPrice rejects writes without settings.org.update', async () => {
    vi.mocked(hasPermission).mockImplementation(async (_ctx, permission) => permission === 'settings.org.read');
    mockOrgContext(() => ({ rows: [] }));

    const result = await deactivateCustomerItemPrice({ id: PRICE_ID });
    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });
});

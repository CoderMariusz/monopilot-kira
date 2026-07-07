export type CustomerItemPrice = {
  unit_price: string;
  currency: string;
};

/** SO lines persist unit_price_gbp — only matching-currency customer prices apply. */
export const SO_LINE_PRICE_CURRENCY = 'GBP' as const;

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** Keep DB numeric text as a decimal string — never route through JS float. */
export function normalizePriceString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return DECIMAL_RE.test(trimmed) ? trimmed : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null;
  }
  return null;
}

/**
 * Deterministic unit-price precedence for sales-order lines (stored as unit_price_gbp):
 * 1. Active customer_item_prices row when currency matches target (default GBP).
 * 2. items.list_price_gbp
 * 3. '0'
 *
 * Non-GBP customer prices are ignored until SO lines gain a currency column.
 */
export function resolveSalesLinePrice(
  item: { id: string; list_price_gbp?: string | number | null },
  opts?: {
    customerPrice?: CustomerItemPrice | null;
    targetCurrency?: string;
  },
): string {
  const targetCurrency = opts?.targetCurrency ?? SO_LINE_PRICE_CURRENCY;
  const customerPrice = opts?.customerPrice;
  if (customerPrice != null && customerPrice.currency === targetCurrency) {
    const unitPrice = normalizePriceString(customerPrice.unit_price);
    if (unitPrice != null) return unitPrice;
  }
  return normalizePriceString(item.list_price_gbp) ?? '0';
}

/**
 * Batch-load the active customer price per item for a pricing date (SO order_date).
 * Filters to targetCurrency before DISTINCT ON so a newer row in another currency
 * cannot shadow a valid active price in the SO currency.
 * Latest effective_from still inside the window wins per (customer, item, currency).
 */
export async function fetchActiveCustomerItemPrices(
  client: QueryClient,
  customerId: string,
  itemIds: readonly string[],
  asOfDate: string,
  targetCurrency: string = SO_LINE_PRICE_CURRENCY,
): Promise<Map<string, CustomerItemPrice>> {
  if (itemIds.length === 0) return new Map();

  const { rows } = await client.query<{
    item_id: string;
    unit_price: string | number;
    currency: string;
  }>(
    `select distinct on (cip.item_id)
            cip.item_id::text,
            cip.unit_price::text as unit_price,
            cip.currency
       from public.customer_item_prices cip
      where cip.org_id = app.current_org_id()
        and cip.customer_id = $1::uuid
        and cip.item_id = any($2::uuid[])
        and cip.effective_from <= $3::date
        and (cip.effective_to is null or cip.effective_to >= $3::date)
        and cip.currency = $4::text
        and cip.deleted_at is null
      order by cip.item_id, cip.effective_from desc`,
    [customerId, itemIds, asOfDate, targetCurrency],
  );

  const prices = new Map<string, CustomerItemPrice>();
  for (const row of rows) {
    const unitPrice = normalizePriceString(row.unit_price);
    if (unitPrice == null) continue;
    prices.set(row.item_id, { unit_price: unitPrice, currency: row.currency });
  }
  return prices;
}

import { Dec } from '@monopilot/domain';
import { microToFixed, toMicro } from '../../../../../../lib/shared/decimal';

export type CustomerItemPrice = {
  unit_price: string;
  currency: string;
};

/** Resolved GBP unit price plus an optional non-GBP customer price hint for the UI. */
export type SalesLinePriceResolution = {
  unitPriceGbp: string;
  /** Present when an active customer price exists in a currency other than the SO line currency. */
  foreignCustomerPrice?: CustomerItemPrice;
};

/** SO lines persist unit_price_gbp — only matching-currency customer prices apply. */
export const SO_LINE_PRICE_CURRENCY = 'GBP' as const;

/** Postgres `unit_price_gbp` / `line_total_gbp` scale (numeric(14,4)). */
export const SO_LINE_MONEY_SCALE = 4;

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

/** Round a decimal string to the SO line money scale (half away from zero). */
export function normalizeSoUnitPriceGbp(value: unknown): string | null {
  const normalized = normalizePriceString(value);
  if (normalized == null) return null;
  return microToFixed(toMicro(normalized), SO_LINE_MONEY_SCALE);
}

/** `qty * unit_price * (1 - discount/100) * (1 + tax/100)`, rounded to numeric(14,4). */
export function computeSoLineTotal(
  qty: string,
  unitPrice: string,
  discountPct: string = '0',
  taxPct: string = '0',
): string {
  const hundred = Dec.from('100');
  return Dec.from(qty)
    .mul(Dec.from(unitPrice))
    .mul(Dec.from('1').sub(Dec.from(discountPct).div(hundred)))
    .mul(Dec.from('1').add(Dec.from(taxPct).div(hundred)))
    .toFixed(SO_LINE_MONEY_SCALE);
}

/** Compatibility name for legacy GBP callers. */
export function computeSoLineTotalGbp(
  qty: string,
  unitPriceGbp: string,
  discountPct: string = '0',
  taxPct: string = '0',
): string {
  return computeSoLineTotal(qty, unitPriceGbp, discountPct, taxPct);
}

export function sumSoLineTotalsGbp(totals: readonly string[]): string {
  const sumMicros = totals.reduce((sum, total) => sum + toMicro(total), 0n);
  return microToFixed(sumMicros, SO_LINE_MONEY_SCALE);
}

export function formatSoGbpDisplay(value: string): string {
  return formatSoCurrencyDisplay(value, 'GBP');
}

export function formatSoCurrencyDisplay(value: string, currency: string = 'GBP'): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  const code = /^[A-Z]{3}$/.test(currency.trim().toUpperCase()) ? currency.trim().toUpperCase() : 'GBP';
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: code }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

/**
 * Deterministic unit-price precedence for sales-order lines (stored as unit_price_gbp):
 * 1. Active customer_item_prices row when currency matches target (default GBP).
 * 2. items.list_price_gbp (default when no GBP customer price)
 * 3. '0'
 *
 * When only a non-GBP customer price exists, the default remains list_price_gbp but
 * foreignCustomerPrice surfaces the mismatch so the operator sets GBP deliberately.
 */
export function resolveSalesLinePriceDetailed(
  item: { id: string; list_price_gbp?: string | number | null },
  opts?: {
    customerPriceGbp?: CustomerItemPrice | null;
    customerPriceAny?: CustomerItemPrice | null;
    targetCurrency?: string;
  },
): SalesLinePriceResolution {
  const targetCurrency = opts?.targetCurrency ?? SO_LINE_PRICE_CURRENCY;
  const gbpCustomerPrice = opts?.customerPriceGbp;
  if (gbpCustomerPrice != null && gbpCustomerPrice.currency === targetCurrency) {
    const unitPrice = normalizeSoUnitPriceGbp(gbpCustomerPrice.unit_price);
    if (unitPrice != null) return { unitPriceGbp: unitPrice };
  }

  const listPrice = normalizeSoUnitPriceGbp(item.list_price_gbp) ?? '0';
  const anyCustomerPrice = opts?.customerPriceAny;
  if (
    anyCustomerPrice != null &&
    anyCustomerPrice.currency !== targetCurrency
  ) {
    const foreignUnit = normalizePriceString(anyCustomerPrice.unit_price);
    if (foreignUnit != null) {
      return {
        unitPriceGbp: listPrice,
        foreignCustomerPrice: { unit_price: foreignUnit, currency: anyCustomerPrice.currency },
      };
    }
  }

  return { unitPriceGbp: listPrice };
}

export function resolveSalesLinePrice(
  item: { id: string; list_price_gbp?: string | number | null },
  opts?: {
    customerPrice?: CustomerItemPrice | null;
    targetCurrency?: string;
  },
): string {
  return resolveSalesLinePriceDetailed(item, {
    customerPriceGbp: opts?.customerPrice ?? null,
    targetCurrency: opts?.targetCurrency,
  }).unitPriceGbp;
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

/**
 * Latest active customer price per item regardless of currency — used to surface
 * non-GBP customer prices without silently substituting list_price_gbp.
 */
export async function fetchActiveCustomerItemPricesAnyCurrency(
  client: QueryClient,
  customerId: string,
  itemIds: readonly string[],
  asOfDate: string,
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
        and cip.deleted_at is null
      order by cip.item_id, cip.effective_from desc`,
    [customerId, itemIds, asOfDate],
  );

  const prices = new Map<string, CustomerItemPrice>();
  for (const row of rows) {
    const unitPrice = normalizePriceString(row.unit_price);
    if (unitPrice == null) continue;
    prices.set(row.item_id, { unit_price: unitPrice, currency: row.currency });
  }
  return prices;
}

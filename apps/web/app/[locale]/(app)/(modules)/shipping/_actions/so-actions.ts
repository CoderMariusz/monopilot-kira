'use server';

import { Dec } from '@monopilot/domain';
import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { listOrgUnits } from '../../planning/_actions/procurement-shared';
import {
  fetchActiveCustomerItemPrices,
  fetchActiveCustomerItemPricesAnyCurrency,
  normalizePriceString,
  normalizeSoUnitPriceGbp,
  resolveSalesLinePrice,
  resolveSalesLinePriceDetailed,
  SO_LINE_PRICE_CURRENCY,
} from './sales-line-price';
import { cancelOpenShipmentForSoInContext } from './so-shipment-release';
import {
  deallocateSalesOrderInContext,
  releaseRemainingLiveAllocationsInContext,
} from './so-deallocation';
import {
  isLegalSoTransition,
  isSalesOrderStatus,
  SO_CANCEL_BLOCKED_SHIPMENT_STATUSES,
  SO_LEGAL_TRANSITIONS,
  type SalesOrderStatus,
} from './so-transitions';
import { readLockedSalesOrderStatus, writeSalesOrderStatusInContext } from './so-status-write';
import { revalidateLocalized } from '../../../../../../lib/i18n/revalidate-localized';
import { OrderLineUomError, resolveOrderQtyToInventoryQty, SALES_ORDER_LINE_ALLOCATED_TO_ORDER_SQL } from '../../../../../../lib/shipping/order-line-uom';
import {
  DEFAULT_SO_LIST_PAGE_SIZE,
  normalizePage,
  toPaginatedResult,
} from '../../../../../../lib/shared/pagination';
import type {
  ActionFailure,
  ActionResult,
  AllocateSalesOrderResult,
  CreateSalesOrderResult,
  ForbiddenFailure,
  GetSalesOrderResult,
  IllegalTransitionError,
  InsufficientStockError,
  ListSalesOrdersResult,
  NearExpiryAllocationWarning,
  SalesOrder,
  SalesOrderLine,
  SalesOrderListRow,
  UpdateSalesOrderResult,
  DeleteSalesOrderResult,
} from './so-actions-types';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type ShippingContext = { userId: string; orgId: string; client: QueryClient };
type TransitionTarget = SalesOrderStatus;

class SoActionError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
type AllocationStatus = 'unallocated' | 'partially_allocated' | 'allocated';
type InvalidInputFailure = { ok: false; error: 'invalid_input'; message?: string };
type PersistenceFailure = { ok: false; error: 'persistence_failed'; message?: string };

type SoCancelBlockedError = { ok: false; error: 'so_cancel_blocked_shipped' };
type TransitionSalesOrderStatusResult = ActionResult<
  SalesOrder | null,
  ForbiddenFailure | IllegalTransitionError | SoCancelBlockedError
>;
type DeallocateSalesOrderResult = ActionResult<null, ForbiddenFailure | { ok: false; error: 'deallocate_not_allowed' }>;

type CreateSalesOrderInput = {
  customer_id: string;
  requested_date?: string;
  notes?: string;
  lines: Array<{
    item_id: string;
    qty: string;
    uom: string;
    unit_price_gbp?: string;
    discount_pct?: string;
    tax_pct?: string;
    currency?: string;
  }>;
};

type UpdateSalesOrderInput = {
  requiredDate?: string | null;
  notes?: string | null;
  lines?: Array<{
    id: string;
    qty?: string;
    notes?: string | null;
    unit_price_gbp?: string;
    discount_pct?: string;
    tax_pct?: string;
    currency?: string;
  }>;
};

const PRICE_PATTERN = /^\d+(?:\.\d{1,4})?$/;
const PCT_PATTERN = /^\d+(?:\.\d{1,4})?$/;
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/;

function normalizePct(value: string | undefined): string | null {
  const text = value?.trim() || '0';
  if (!PCT_PATTERN.test(text)) return null;
  const pct = Dec.from(text);
  return pct.cmp(Dec.zero()) >= 0 && pct.cmp(Dec.from('100')) <= 0 ? pct.toFixed(4) : null;
}

const SHIP_SO_READ = 'ship.dashboard.view';
const SHIP_SO_CREATE = 'ship.so.create';
const SHIP_SO_CONFIRM = 'ship.so.confirm';
const SHIP_SO_CANCEL = 'ship.so.cancel';
// Migration 212 seeds no granular ship.so.allocate/deallocate permission; keep create for those ops.
const SHIP_SO_ALLOCATE = 'ship.so.create';

/**
 * Default near-expiry WARN window (days) when the org has not configured
 * `near_expiry_warn_days`. An allocated LP whose expiry is within this many days
 * (but not yet expired — expired is a hard filter) gets a soft warning. Set the
 * flag to 0 to opt out of the warning entirely.
 */
const NEAR_EXPIRY_DEFAULT_WARN_DAYS = 7;

function permissionForTransition(newStatus: TransitionTarget): string {
  if (newStatus === 'confirmed') return SHIP_SO_CONFIRM;
  if (newStatus === 'cancelled') return SHIP_SO_CANCEL;
  return SHIP_SO_CREATE;
}

async function requirePermission(ctx: ShippingContext, permission: string): Promise<ForbiddenFailure | null> {
  if (!(await hasPermission(ctx, permission))) {
    return { ok: false, error: 'forbidden' };
  }
  return null;
}

/**
 * Read the org's near-expiry WARN window (days) from
 * `tenant_variations.feature_flags->>'near_expiry_warn_days'`, falling back to
 * NEAR_EXPIRY_DEFAULT_WARN_DAYS. An explicit 0 disables the warning. Mirrors the
 * over-consume / mass-balance feature-flag read pattern (integer days here).
 */
async function readNearExpiryWarnDays(client: QueryClient): Promise<number> {
  const { rows } = await client.query<{ warn_days: string }>(
    `select coalesce(
              case
                when (tv.feature_flags->>'near_expiry_warn_days') ~ '^[0-9]+$'
                  then (tv.feature_flags->>'near_expiry_warn_days')::int
                else $1::int
              end,
              $1::int
            )::text as warn_days
       from public.tenant_variations tv
      where tv.org_id = app.current_org_id()
      limit 1`,
    [String(NEAR_EXPIRY_DEFAULT_WARN_DAYS)],
  );
  if (rows.length === 0) return NEAR_EXPIRY_DEFAULT_WARN_DAYS;
  const parsed = Number(rows[0]?.warn_days);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : NEAR_EXPIRY_DEFAULT_WARN_DAYS;
}

function toText(value: unknown): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function toDate(value: unknown): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return Number(value ?? 0);
}

function decimalToUnits(value: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(value)) throw new Error(`Invalid decimal: ${value}`);
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}

function unitsToDecimal(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  const whole = abs / 1_000_000n;
  const fraction = (abs % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${sign}${whole.toString()}${fraction ? `.${fraction}` : ''}`;
}

function minUnits(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}


function lineAllocationStatus(qty: string, allocatedQty: string): AllocationStatus {
  const ordered = decimalToUnits(qty);
  const allocated = decimalToUnits(allocatedQty);
  if (allocated <= 0n) return 'unallocated';
  if (allocated >= ordered) return 'allocated';
  return 'partially_allocated';
}

function orderAllocationStatus(lines: readonly SalesOrderLine[]): AllocationStatus {
  if (lines.length === 0) return 'unallocated';
  if (lines.every((line) => line.allocation_status === 'allocated')) return 'allocated';
  if (lines.some((line) => line.allocation_status !== 'unallocated')) return 'partially_allocated';
  return 'unallocated';
}

function mapSalesOrderListRow(row: {
  id: string;
  so_number: string | null;
  customer_name: string | null;
  customer_code: string | null;
  status: SalesOrderStatus;
  line_count: number | string | bigint | null;
  total: string | null;
  created_at: string | Date;
  expected_ship_date: string | Date | null;
}): SalesOrderListRow {
  return {
    id: row.id,
    so_number: row.so_number ?? '',
    customer_name: row.customer_name,
    customer_code: row.customer_code,
    status: row.status,
    line_count: toNumber(row.line_count),
    total: row.total ?? '0',
    created_at: toText(row.created_at) ?? '',
    expected_ship_date: toDate(row.expected_ship_date),
  };
}

function mapSalesOrderHeaderRow(row: {
  id: string;
  order_number: string | null;
  status: SalesOrderStatus;
  customer_id: string | null;
  customer_name: string | null;
  customer_code: string | null;
  promised_ship_date: string | Date | null;
  notes: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}): SalesOrder {
  return {
    id: row.id,
    so_number: row.order_number ?? '',
    status: row.status,
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    customer_code: row.customer_code,
    expected_ship_date: toDate(row.promised_ship_date),
    notes: row.notes,
    created_at: toText(row.created_at) ?? '',
    updated_at: toText(row.updated_at) ?? '',
    allocation_status: 'unallocated',
    lines: [],
  };
}

function mapLineRow(row: {
  id: string;
  line_number: number;
  product_id: string;
  item_code: string | null;
  item_name: string | null;
  inventory_qty: string;
  inventory_uom: string | null;
  order_qty: string;
  order_uom: string | null;
  quantity_allocated: string;
  allocated_qty_display: string;
  unit_price_gbp: string;
  line_total_gbp: string;
  discount_pct: string;
  tax_pct: string;
  currency: string;
  notes: string | null;
}): SalesOrderLine {
  const inventoryUom = row.inventory_uom ?? '';
  const orderUom = row.order_uom ?? inventoryUom;
  return {
    id: row.id,
    line_no: row.line_number,
    item_id: row.product_id,
    item_code: row.item_code,
    item_name: row.item_name,
    qty: row.order_qty,
    uom: orderUom,
    inventory_qty: row.inventory_qty,
    inventory_uom: inventoryUom,
    allocated_qty: row.allocated_qty_display,
    allocation_status: lineAllocationStatus(row.inventory_qty, row.quantity_allocated),
    unit_price_gbp: row.unit_price_gbp,
    line_total_gbp: row.line_total_gbp,
    discount_pct: row.discount_pct,
    tax_pct: row.tax_pct,
    currency: row.currency,
    notes: row.notes,
  };
}

async function fetchSalesOrder(ctx: ShippingContext, id: string): Promise<SalesOrder | null> {
  const { rows } = await ctx.client.query<{
    id: string;
    order_number: string | null;
    status: SalesOrderStatus;
    customer_id: string | null;
    customer_name: string | null;
    customer_code: string | null;
    promised_ship_date: string | Date | null;
    notes: string | null;
    created_at: string | Date;
    updated_at: string | Date;
  }>(
    `select so.id::text,
            so.order_number,
            so.status,
            so.customer_id::text,
            c.name as customer_name,
            c.customer_code,
            so.promised_ship_date,
            so.ext_data->>'notes' as notes,
            so.created_at,
            so.updated_at
       from public.sales_orders so
       left join public.customers c on c.id = so.customer_id and c.org_id = app.current_org_id()
      where so.org_id = app.current_org_id()
        and so.id = $1::uuid
        and so.deleted_at is null
      limit 1`,
    [id],
  );
  if (!rows[0]) return null;

  const order = mapSalesOrderHeaderRow(rows[0]);
  const lineRows = await ctx.client.query<{
    id: string;
    line_number: number;
    product_id: string;
    item_code: string | null;
    item_name: string | null;
    inventory_qty: string;
    inventory_uom: string | null;
    order_qty: string;
    order_uom: string | null;
    quantity_allocated: string;
    allocated_qty_display: string;
    unit_price_gbp: string;
    line_total_gbp: string;
    discount_pct: string;
    tax_pct: string;
    currency: string;
    notes: string | null;
  }>(
    `select sol.id::text,
            sol.line_number,
            sol.product_id::text,
            i.item_code,
            i.name as item_name,
            sol.quantity_ordered::text as inventory_qty,
            i.uom_base as inventory_uom,
            coalesce(sol.ext_data->>'order_qty', sol.quantity_ordered::text) as order_qty,
            coalesce(sol.ext_data->>'order_uom', i.uom_base) as order_uom,
            sol.quantity_allocated::text as quantity_allocated,
            ${SALES_ORDER_LINE_ALLOCATED_TO_ORDER_SQL} as allocated_qty_display,
            sol.unit_price_gbp::text as unit_price_gbp,
            coalesce(sol.discount_pct, 0)::text as discount_pct,
            coalesce(sol.tax_pct, 0)::text as tax_pct,
            coalesce(nullif(upper(trim(sol.currency)), ''), o.currency, 'GBP') as currency,
            coalesce(
              sol.line_total_gbp,
              sol.quantity_ordered * sol.unit_price_gbp
                * (1 - coalesce(sol.discount_pct, 0) / 100)
                * (1 + coalesce(sol.tax_pct, 0) / 100)
            )::text as line_total_gbp,
            sol.notes
       from public.sales_order_lines sol
       left join public.items i on i.id = sol.product_id and i.org_id = app.current_org_id()
       left join public.organizations o on o.id = sol.org_id
      where sol.org_id = app.current_org_id()
        and sol.sales_order_id = $1::uuid
        and sol.deleted_at is null
      order by sol.line_number`,
    [id],
  );
  const lines = lineRows.rows.map(mapLineRow);
  order.lines = lines;
  order.allocation_status = orderAllocationStatus(lines);
  return order;
}

async function transitionSalesOrderStatusInContext(
  ctx: ShippingContext,
  id: string,
  newStatus: TransitionTarget,
): Promise<SalesOrder | IllegalTransitionError | null> {
  // `for update` locks the SO row for the whole withOrgContext txn so two
  // concurrent transitions serialize: the loser blocks here, then re-reads the
  // committed status and its LEGAL_TRANSITIONS check rejects the now-illegal move.
  // Without it, two requests could both read the same status, both pass the JS
  // check, and the last writer wins (e.g. a `cancelled` race deallocates LP
  // reserved_qty while another path advances the SO). NOTE: we deliberately do
  // NOT add `and status = $current` to the final UPDATE — deallocate (cancel
  // path) sets status='confirmed' mid-function, so a status-guarded UPDATE would
  // match 0 rows there. The row lock is the correctness guarantee.
  const { rows } = await ctx.client.query<{ status: string }>(
    `select status
       from public.sales_orders
      where org_id = app.current_org_id()
        and id = $1::uuid
        and deleted_at is null
      limit 1
      for update`,
    [id],
  );
  const current = rows[0]?.status;
  if (!current) return null;
  if (!isSalesOrderStatus(current) || !isLegalSoTransition(current, newStatus)) {
    return { ok: false, error: 'ILLEGAL_TRANSITION', from: current, to: newStatus };
  }

  if (newStatus === 'cancelled') {
    const { rows: blockingShipments } = await ctx.client.query<{ id: string }>(
      `select id::text
         from public.shipments
        where org_id = app.current_org_id()
          and sales_order_id = $1::uuid
          and deleted_at is null
          and status = any($2::text[])`,
      [id, SO_CANCEL_BLOCKED_SHIPMENT_STATUSES],
    );
    if (blockingShipments.length > 0) {
      throw new SoActionError('so_cancel_blocked_shipped');
    }

    const { rows: openShipments } = await ctx.client.query<{ id: string }>(
      `select id::text
         from public.shipments
        where org_id = app.current_org_id()
          and sales_order_id = $1::uuid
          and deleted_at is null
          and status not in ('shipped', 'delivered', 'cancelled')
        for update`,
      [id],
    );
    for (const openShipment of openShipments) {
      await cancelOpenShipmentForSoInContext(ctx, openShipment.id, id);
    }
    await releaseRemainingLiveAllocationsInContext(ctx, id);
  }

  const writeResult = await writeSalesOrderStatusInContext(ctx, id, newStatus, {
    currentStatus: current as SalesOrderStatus,
  });
  if (writeResult === 'illegal_transition') {
    throw new SoActionError('ILLEGAL_TRANSITION');
  }
  if (writeResult === 'not_found') return null;

  return fetchSalesOrder(ctx, id);
}

const SO_LIST_WHERE = `
        where so.org_id = app.current_org_id()
          and so.deleted_at is null
          and ($1::text is null or so.status = $1)
          and (
            $2::text is null
            or so.order_number ilike '%' || $2 || '%'
            or c.name ilike '%' || $2 || '%'
            or c.customer_code ilike '%' || $2 || '%'
          )
          and ($3::text is null or c.customer_code = $3)`;

export async function listSalesOrders(params: {
  status?: string;
  search?: string;
  customerCode?: string;
  page?: number;
  offset?: number;
  limit?: number;
} = {}): Promise<ListSalesOrdersResult> {
  const page = normalizePage({
    page: params.page,
    offset: params.offset,
    limit: params.limit,
    defaultLimit: DEFAULT_SO_LIST_PAGE_SIZE,
    maxLimit: 200,
  });

  return withOrgContext(async ({ userId, orgId, client }): Promise<ListSalesOrdersResult> => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    const forbidden = await requirePermission(ctx, SHIP_SO_READ);
    if (forbidden) return forbidden;

    const baseParams = [
      params.status?.trim() || null,
      params.search?.trim() || null,
      params.customerCode?.trim() || null,
    ] as const;

    const [countResult, dataResult] = await Promise.all([
      ctx.client.query<{ total: number }>(
        `select count(*)::int as total
           from public.sales_orders so
           left join public.customers c on c.id = so.customer_id and c.org_id = app.current_org_id()
         ${SO_LIST_WHERE}`,
        [...baseParams],
      ),
      ctx.client.query<{
        id: string;
        so_number: string | null;
        status: SalesOrderStatus;
        customer_name: string | null;
        customer_code: string | null;
        line_count: number | string | bigint | null;
        total: string | null;
        expected_ship_date: string | Date | null;
        created_at: string | Date;
      }>(
        `select so.id::text,
                so.order_number as so_number,
                so.status,
                c.name as customer_name,
                c.customer_code,
                (
                  select count(*)::int
                    from public.sales_order_lines sol
                   where sol.org_id = app.current_org_id()
                     and sol.sales_order_id = so.id
                     and sol.deleted_at is null
                ) as line_count,
                coalesce(
                  so.total_amount_gbp,
                  (
                    select sum(coalesce(
                      sol.line_total_gbp,
                      sol.quantity_ordered * sol.unit_price_gbp
                        * (1 - coalesce(sol.discount_pct, 0) / 100)
                        * (1 + coalesce(sol.tax_pct, 0) / 100)
                    ))
                      from public.sales_order_lines sol
                     where sol.org_id = app.current_org_id()
                       and sol.sales_order_id = so.id
                       and sol.deleted_at is null
                  ),
                  0
                )::text as total,
                so.created_at,
                so.promised_ship_date as expected_ship_date
           from public.sales_orders so
           left join public.customers c on c.id = so.customer_id and c.org_id = app.current_org_id()
         ${SO_LIST_WHERE}
          order by so.created_at desc, so.order_number desc, so.id desc
          limit $4::int offset $5::int`,
        [...baseParams, page.limit, page.offset],
      ),
    ]);

    return {
      ok: true,
      data: toPaginatedResult(
        dataResult.rows.map(mapSalesOrderListRow),
        Number(countResult.rows[0]?.total ?? 0),
        page,
      ),
    };
  });
}

export async function getSalesOrder(id: string): Promise<GetSalesOrderResult> {
  return withOrgContext(async ({ userId, orgId, client }): Promise<GetSalesOrderResult> => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    const forbidden = await requirePermission(ctx, SHIP_SO_READ);
    if (forbidden) return forbidden;
    return { ok: true, data: await fetchSalesOrder(ctx, id) };
  });
}

export async function createSalesOrder(input: CreateSalesOrderInput): Promise<CreateSalesOrderResult> {
  return withOrgContext(async ({ userId, orgId, client }): Promise<CreateSalesOrderResult> => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    const forbidden = await requirePermission(ctx, SHIP_SO_CREATE);
    if (forbidden) return forbidden;
    if (input.lines.length === 0) {
      return { ok: false, error: 'invalid_input', message: 'Sales order requires at least one line' };
    }

    const { rows: customerRows } = await ctx.client.query<{ id: string }>(
      `select id::text
         from public.customers
        where org_id = app.current_org_id()
          and id = $1::uuid
          and deleted_at is null
          and is_active = true
        limit 1`,
      [input.customer_id],
    );
    if (!customerRows[0]) {
      return { ok: false, error: 'invalid_input', message: 'Customer is inactive or not found' };
    }

    const itemIds = Array.from(new Set(input.lines.map((line) => line.item_id)));
    const { rows: itemRows } = await ctx.client.query<{ id: string; list_price_gbp: string | number | null }>(
      `select id::text, list_price_gbp::text as list_price_gbp
         from public.items
        where org_id = app.current_org_id()
          and id = any($1::uuid[])`,
      [itemIds],
    );
    const itemsById = new Map(
      itemRows.map((item) => [
        item.id,
        { id: item.id, list_price_gbp: item.list_price_gbp },
      ]),
    );

    const { rows: orderDateRows } = await ctx.client.query<{ order_date: string }>(
      `select current_date::text as order_date`,
    );
    const orderDate = orderDateRows[0]?.order_date ?? new Date().toISOString().slice(0, 10);
    const customerPricesByItemId = await fetchActiveCustomerItemPrices(
      ctx.client,
      input.customer_id,
      itemIds,
      orderDate,
      SO_LINE_PRICE_CURRENCY,
    );
    const customerPricesAnyByItemId = await fetchActiveCustomerItemPricesAnyCurrency(
      ctx.client,
      input.customer_id,
      itemIds,
      orderDate,
    );

    const orgUnits = await listOrgUnits(ctx.client);
    const validUomCodes = new Set(orgUnits.map((unit) => unit.code));
    if (validUomCodes.size === 0) {
      return {
        ok: false,
        error: 'persistence_failed',
        message: 'Unit of measure registry is not configured; seed units before creating sales orders',
      };
    }
    for (const line of input.lines) {
      const uom = line.uom.trim();
      if (!validUomCodes.has(uom)) {
        return { ok: false, error: 'invalid_input', message: 'Unknown unit of measure' };
      }
    }

    const resolvedLines: Array<{
      item_id: string;
      order_qty: string;
      inventory_qty: string;
      uom: string;
      unitPriceGbp: string;
      discountPct: string;
      taxPct: string;
      currency: string | null;
    }> = [];
    for (const line of input.lines) {
      const item = itemsById.get(line.item_id);
      if (!item) return { ok: false, error: 'invalid_input', message: 'Unknown sales order item' };
      let inventoryQty: string;
      try {
        inventoryQty = await resolveOrderQtyToInventoryQty(ctx.client, {
          itemId: line.item_id,
          orderQty: line.qty,
          orderUom: line.uom,
        });
      } catch (err) {
        if (err instanceof OrderLineUomError) {
          return { ok: false, error: 'unresolved_uom', message: err.message, uom: err.uom };
        }
        throw err;
      }

      const submittedPrice = line.unit_price_gbp?.trim();
      const discountPct = normalizePct(line.discount_pct);
      const taxPct = normalizePct(line.tax_pct);
      const currency = line.currency?.trim().toUpperCase() || null;
      if (discountPct == null || taxPct == null) {
        return { ok: false, error: 'invalid_input', message: 'Discount and tax must be between 0 and 100' };
      }
      if (currency != null && !CURRENCY_PATTERN.test(currency)) {
        return { ok: false, error: 'invalid_input', message: 'Currency must be a 3-letter ISO code' };
      }
      let unitPriceGbp: string;
      if (submittedPrice != null && submittedPrice.length > 0) {
        if (!PRICE_PATTERN.test(submittedPrice) || Number(submittedPrice) <= 0) {
          return { ok: false, error: 'invalid_input', message: 'Unit price must be greater than zero' };
        }
        unitPriceGbp = normalizeSoUnitPriceGbp(submittedPrice) ?? submittedPrice;
      } else {
        unitPriceGbp = resolveSalesLinePriceDetailed(item, {
          customerPriceGbp: customerPricesByItemId.get(line.item_id) ?? null,
          customerPriceAny: customerPricesAnyByItemId.get(line.item_id) ?? null,
        }).unitPriceGbp;
        const normalized = normalizeSoUnitPriceGbp(unitPriceGbp);
        if (normalized == null || Number(normalized) <= 0) {
          return { ok: false, error: 'invalid_input', message: 'Unit price must be greater than zero' };
        }
        unitPriceGbp = normalized;
      }

      resolvedLines.push({
        item_id: line.item_id,
        order_qty: line.qty,
        inventory_qty: inventoryQty,
        uom: line.uom,
        unitPriceGbp,
        discountPct,
        taxPct,
        currency,
      });
    }

    const { rows: numberRows } = await ctx.client.query<{ so_number: string }>(
      `select public.next_sales_order_document_number($1::uuid) as so_number`,
      [orgId],
    );
    const soNumber = numberRows[0]?.so_number;
    if (!soNumber) return { ok: false, error: 'persistence_failed', message: 'Unable to generate sales order number' };

    const { rows } = await ctx.client.query<{ id: string }>(
      `insert into public.sales_orders
        (org_id, order_number, customer_id, order_date, promised_ship_date, status, ext_data, created_by, updated_by)
       values ($1::uuid, $2, $3::uuid, current_date, $4::date, 'draft', jsonb_build_object('notes', $5::text), $6::uuid, $6::uuid)
       returning id::text`,
      [orgId, soNumber, input.customer_id, input.requested_date ?? null, input.notes ?? null, userId],
    );
    const soId = rows[0]?.id;
    if (!soId) return { ok: false, error: 'persistence_failed', message: 'Unable to create sales order' };

    for (const [index, line] of resolvedLines.entries()) {
      await ctx.client.query(
        `insert into public.sales_order_lines
          (org_id, sales_order_id, line_number, product_id, quantity_ordered, quantity_allocated,
           unit_price_gbp, line_total_gbp, discount_pct, tax_pct, currency,
           ext_data, created_by, updated_by)
         values ($1::uuid, $2::uuid, $3::integer, $4::uuid, $5::numeric, 0,
                 $6::numeric,
                 ($7::numeric * $6::numeric * (1 - $8::numeric / 100) * (1 + $9::numeric / 100)),
                 $8::numeric, $9::numeric, $10::text,
                 jsonb_build_object('order_uom', $11::text, 'order_qty', $7::text), $12::uuid, $12::uuid)`,
        [
          orgId,
          soId,
          index + 1,
          line.item_id,
          line.inventory_qty,
          line.unitPriceGbp,
          line.order_qty,
          line.discountPct,
          line.taxPct,
          line.currency,
          line.uom,
          userId,
        ],
      );
    }

    const created = await fetchSalesOrder(ctx, soId);
    revalidateLocalized('/shipping');
    return { ok: true, data: created };
  });
}

export async function updateSalesOrder(soId: string, input: UpdateSalesOrderInput): Promise<UpdateSalesOrderResult> {
  const id = soId.trim();
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false, error: 'invalid_input', message: 'Invalid sales order id' };
  }

  return withOrgContext(async ({ userId, orgId, client }): Promise<UpdateSalesOrderResult> => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    const forbidden = await requirePermission(ctx, SHIP_SO_CREATE);
    if (forbidden) return forbidden;

    const { rows: headerRows } = await ctx.client.query<{ status: string }>(
      `select status
         from public.sales_orders
        where org_id = app.current_org_id()
          and id = $1::uuid
          and deleted_at is null
        limit 1
        for update`,
      [id],
    );
    const currentStatus = headerRows[0]?.status;
    if (!currentStatus) return { ok: true, data: null };
    if (currentStatus !== 'draft') return { ok: false, error: 'not_draft' };

    type ResolvedLineUpdate = {
      id: string;
      inventoryQty: string;
      orderQty: string;
      orderUom: string;
      unitPriceGbp: string;
      discountPct: string;
      taxPct: string;
      currency: string;
      notes?: string | null;
    };

    let resolvedLineUpdates: ResolvedLineUpdate[] | null = null;

    if (input.lines && input.lines.length > 0) {
      const { rows: existingLines } = await ctx.client.query<{
        id: string;
        product_id: string;
        order_qty: string;
        order_uom: string;
      }>(
        `select sol.id::text,
                sol.product_id::text,
                coalesce(sol.ext_data->>'order_qty', sol.quantity_ordered::text) as order_qty,
                coalesce(sol.ext_data->>'order_uom', i.uom_base) as order_uom
           from public.sales_order_lines sol
           left join public.items i on i.id = sol.product_id and i.org_id = app.current_org_id()
          where sol.org_id = app.current_org_id()
            and sol.sales_order_id = $1::uuid
            and sol.deleted_at is null`,
        [id],
      );
      const linesById = new Map(existingLines.map((line) => [line.id, line]));
      resolvedLineUpdates = [];

      for (const patch of input.lines) {
        const existing = linesById.get(patch.id);
        if (!existing) {
          return { ok: false, error: 'invalid_input', message: 'Unknown sales order line' };
        }

        const orderQty = patch.qty?.trim() ?? existing.order_qty;
        const orderUom = existing.order_uom;
        if (!/^\d+(?:\.\d{1,3})?$/.test(orderQty) || Number(orderQty) <= 0) {
          return { ok: false, error: 'invalid_input', message: 'Line quantity must be greater than zero' };
        }

        let inventoryQty: string;
        try {
          inventoryQty = await resolveOrderQtyToInventoryQty(ctx.client, {
            itemId: existing.product_id,
            orderQty,
            orderUom,
          });
        } catch (err) {
          if (err instanceof OrderLineUomError) {
            return { ok: false, error: 'unresolved_uom', message: err.message, uom: err.uom };
          }
          throw err;
        }

        const { rows: priceRows } = await ctx.client.query<{
          unit_price_gbp: string;
          discount_pct: string;
          tax_pct: string;
          currency: string;
        }>(
          `select sol.unit_price_gbp::text,
                  coalesce(sol.discount_pct, 0)::text as discount_pct,
                  coalesce(sol.tax_pct, 0)::text as tax_pct,
                  coalesce(nullif(upper(trim(sol.currency)), ''), o.currency, 'GBP') as currency
             from public.sales_order_lines sol
             left join public.organizations o on o.id = sol.org_id
            where sol.org_id = app.current_org_id()
              and sol.id = $1::uuid
            limit 1`,
          [patch.id],
        );
        const currentTerms = priceRows[0];
        const currentPrice = currentTerms?.unit_price_gbp ?? '0';
        const submittedPrice = patch.unit_price_gbp?.trim();
        let unitPriceGbp: string;
        if (submittedPrice && submittedPrice.length > 0) {
          if (!PRICE_PATTERN.test(submittedPrice) || Number(submittedPrice) <= 0) {
            return { ok: false, error: 'invalid_input', message: 'Unit price must be greater than zero' };
          }
          unitPriceGbp = normalizeSoUnitPriceGbp(submittedPrice) ?? submittedPrice;
        } else {
          const normalized = normalizeSoUnitPriceGbp(currentPrice);
          if (normalized == null || Number(normalized) <= 0) {
            return { ok: false, error: 'invalid_input', message: 'Unit price must be greater than zero' };
          }
          unitPriceGbp = normalized;
        }

        const discountPct = normalizePct(patch.discount_pct ?? currentTerms?.discount_pct);
        const taxPct = normalizePct(patch.tax_pct ?? currentTerms?.tax_pct);
        const currency = (patch.currency ?? currentTerms?.currency ?? 'GBP').trim().toUpperCase();
        if (discountPct == null || taxPct == null) {
          return { ok: false, error: 'invalid_input', message: 'Discount and tax must be between 0 and 100' };
        }
        if (!CURRENCY_PATTERN.test(currency)) {
          return { ok: false, error: 'invalid_input', message: 'Currency must be a 3-letter ISO code' };
        }

        resolvedLineUpdates.push({
          id: patch.id,
          inventoryQty,
          orderQty,
          orderUom,
          unitPriceGbp,
          discountPct,
          taxPct,
          currency,
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        });
      }
    }

    if (input.requiredDate !== undefined || input.notes !== undefined) {
      const setParts: string[] = [];
      const params: unknown[] = [id];
      let paramIndex = 2;

      setParts.push(`updated_by = $${paramIndex}::uuid`);
      params.push(userId);
      paramIndex += 1;

      if (input.requiredDate !== undefined) {
        setParts.push(`promised_ship_date = $${paramIndex}::date`);
        params.push(input.requiredDate);
        paramIndex += 1;
      }
      if (input.notes !== undefined) {
        setParts.push(
          `ext_data = case
             when $${paramIndex}::text is null then coalesce(ext_data, '{}'::jsonb) - 'notes'
             else jsonb_set(coalesce(ext_data, '{}'::jsonb), '{notes}', to_jsonb($${paramIndex}::text), true)
           end`,
        );
        params.push(input.notes);
        paramIndex += 1;
      }

      await ctx.client.query(
        `update public.sales_orders
            set ${setParts.join(', ')}
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'draft'
            and deleted_at is null`,
        params,
      );
    }

    if (resolvedLineUpdates) {
      for (const line of resolvedLineUpdates) {
        if (line.notes !== undefined) {
          await ctx.client.query(
            `update public.sales_order_lines
                set quantity_ordered = $2::numeric,
                    unit_price_gbp = $3::numeric,
                    discount_pct = $4::numeric,
                    tax_pct = $5::numeric,
                    currency = $6::text,
                    line_total_gbp = ($7::numeric * $3::numeric * (1 - $4::numeric / 100) * (1 + $5::numeric / 100)),
                    notes = $8::text,
                    ext_data = jsonb_set(
                      jsonb_set(coalesce(ext_data, '{}'::jsonb), '{order_qty}', to_jsonb($7::text), true),
                      '{order_uom}',
                      to_jsonb($9::text),
                      true
                    ),
                    updated_by = $10::uuid
              where org_id = app.current_org_id()
                and id = $1::uuid
                and sales_order_id = $11::uuid
                and deleted_at is null`,
            [
              line.id,
              line.inventoryQty,
              line.unitPriceGbp,
              line.discountPct,
              line.taxPct,
              line.currency,
              line.orderQty,
              line.notes,
              line.orderUom,
              userId,
              id,
            ],
          );
        } else {
          await ctx.client.query(
            `update public.sales_order_lines
                set quantity_ordered = $2::numeric,
                    unit_price_gbp = $3::numeric,
                    discount_pct = $4::numeric,
                    tax_pct = $5::numeric,
                    currency = $6::text,
                    line_total_gbp = ($7::numeric * $3::numeric * (1 - $4::numeric / 100) * (1 + $5::numeric / 100)),
                    ext_data = jsonb_set(
                      jsonb_set(coalesce(ext_data, '{}'::jsonb), '{order_qty}', to_jsonb($7::text), true),
                      '{order_uom}',
                      to_jsonb($8::text),
                      true
                    ),
                    updated_by = $9::uuid
              where org_id = app.current_org_id()
                and id = $1::uuid
                and sales_order_id = $10::uuid
                and deleted_at is null`,
            [
              line.id,
              line.inventoryQty,
              line.unitPriceGbp,
              line.discountPct,
              line.taxPct,
              line.currency,
              line.orderQty,
              line.orderUom,
              userId,
              id,
            ],
          );
        }
      }

      await ctx.client.query(
        `update public.sales_orders so
            set total_amount_gbp = (
                  select coalesce(sum(coalesce(
                    sol.line_total_gbp,
                    sol.quantity_ordered * sol.unit_price_gbp
                      * (1 - coalesce(sol.discount_pct, 0) / 100)
                      * (1 + coalesce(sol.tax_pct, 0) / 100)
                  )), 0)
                    from public.sales_order_lines sol
                   where sol.org_id = app.current_org_id()
                     and sol.sales_order_id = so.id
                     and sol.deleted_at is null
                ),
                updated_by = $2::uuid
          where so.org_id = app.current_org_id()
            and so.id = $1::uuid`,
        [id, userId],
      );
    }

    const updated = await fetchSalesOrder(ctx, id);
    revalidateLocalized('/shipping');
    revalidateLocalized(`/shipping/${id}`);
    return { ok: true, data: updated };
  });
}

export async function deleteSalesOrder(soId: string): Promise<DeleteSalesOrderResult> {
  const id = soId.trim();
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false, error: 'not_found' };
  }

  return withOrgContext(async ({ userId, orgId, client }): Promise<DeleteSalesOrderResult> => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    const forbidden = await requirePermission(ctx, SHIP_SO_CREATE);
    if (forbidden) return forbidden;

    const { rows } = await ctx.client.query<{ status: string }>(
      `select status
         from public.sales_orders
        where org_id = app.current_org_id()
          and id = $1::uuid
          and deleted_at is null
        limit 1
        for update`,
      [id],
    );
    const currentStatus = rows[0]?.status;
    if (!currentStatus) return { ok: false, error: 'not_found' };
    if (currentStatus !== 'draft') return { ok: false, error: 'not_draft' };

    await releaseRemainingLiveAllocationsInContext(ctx, id);

    await ctx.client.query(
      `update public.sales_order_lines
          set deleted_at = pg_catalog.now(),
              updated_by = $2::uuid
        where org_id = app.current_org_id()
          and sales_order_id = $1::uuid
          and deleted_at is null`,
      [id, userId],
    );
    await ctx.client.query(
      `update public.sales_orders
          set deleted_at = pg_catalog.now(),
              updated_by = $2::uuid
        where org_id = app.current_org_id()
          and id = $1::uuid
          and status = 'draft'
          and deleted_at is null`,
      [id, userId],
    );

    revalidateLocalized('/shipping');
    revalidateLocalized(`/shipping/${id}`);
    return { ok: true, data: null };
  });
}

export async function transitionSalesOrderStatus(
  id: string,
  newStatus: TransitionTarget,
): Promise<TransitionSalesOrderStatusResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<TransitionSalesOrderStatusResult> => {
      const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
      const forbidden = await requirePermission(ctx, permissionForTransition(newStatus));
      if (forbidden) return forbidden;
      const result = await transitionSalesOrderStatusInContext(ctx, id, newStatus);
      if (result && 'error' in result) return result;
      return { ok: true, data: result };
    });
  } catch (err) {
    if (err instanceof SoActionError && err.code === 'so_cancel_blocked_shipped') {
      return { ok: false, error: 'so_cancel_blocked_shipped' };
    }
    throw err;
  }
}

export async function allocateSalesOrder(id: string): Promise<AllocateSalesOrderResult> {
  return withOrgContext(async ({ userId, orgId, client }): Promise<AllocateSalesOrderResult> => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    const forbidden = await requirePermission(ctx, SHIP_SO_ALLOCATE);
    if (forbidden) return forbidden;

    const { rows: statusRows } = await ctx.client.query<{ status: string }>(
      `select status
         from public.sales_orders
        where org_id = app.current_org_id()
          and id = $1::uuid
          and deleted_at is null
        limit 1
        for update`,
      [id],
    );
    const current = statusRows[0]?.status;
    if (!current) return { ok: true, data: null };
    if (!isSalesOrderStatus(current) || !isLegalSoTransition(current, 'allocated')) {
      return { ok: false, error: 'ILLEGAL_TRANSITION', from: current, to: 'allocated' };
    }

    const { rows: lines } = await ctx.client.query<{
      id: string;
      site_id: string | null;
      product_id: string;
      quantity_ordered: string;
      order_qty: string | null;
      order_uom: string | null;
    }>(
      `select sol.id::text,
              sol.site_id::text,
              sol.product_id::text,
              sol.quantity_ordered::text,
              sol.ext_data->>'order_qty' as order_qty,
              sol.ext_data->>'order_uom' as order_uom
         from public.sales_order_lines sol
        where sol.org_id = app.current_org_id()
          and sol.sales_order_id = $1::uuid
          and sol.deleted_at is null
        order by sol.line_number`,
      [id],
    );

    const warnDays = await readNearExpiryWarnDays(ctx.client);

    const planned: Array<{
      lineId: string;
      siteId: string | null;
      allocated: string;
      allocations: Array<{ lpId: string; qty: string }>;
    }> = [];

    // Soft near-expiry tracking across every LP actually allocated to this order.
    let nearExpiryCount = 0;
    let soonestNearExpiry: { date: string; days: number } | null = null;

    for (const line of lines) {
      let needed: bigint;
      let inventoryNeededQty: string;
      try {
        inventoryNeededQty =
          line.order_uom != null
            ? await resolveOrderQtyToInventoryQty(ctx.client, {
                itemId: line.product_id,
                orderQty: line.order_qty ?? line.quantity_ordered,
                orderUom: line.order_uom,
              })
            : line.quantity_ordered;
        needed = decimalToUnits(inventoryNeededQty);
      } catch (err) {
        if (err instanceof OrderLineUomError) {
          return { ok: false, error: 'unresolved_uom', message: err.message, uom: err.uom };
        }
        throw err;
      }
      let available = 0n;
      const allocations: Array<{ lpId: string; qty: string }> = [];

      const { rows: candidates } = await ctx.client.query<{
        lp_id: string;
        available_qty: string;
        expiry_date: string | null;
        days_to_expiry: number | string | null;
      }>(
        `select lp.id::text as lp_id,
                (lp.quantity - lp.reserved_qty)::text as available_qty,
                to_char(lp.expiry_date, 'YYYY-MM-DD') as expiry_date,
                (lp.expiry_date - current_date) as days_to_expiry
           from public.license_plates lp
          where lp.org_id = app.current_org_id()
            and lp.product_id = $1::uuid
            and ($2::uuid is null or lp.site_id = $2::uuid)
            and lp.status = 'available'
            and lp.qa_status = 'released'
            -- Food-safety (G-QA-03 / owner per-rule BLOCK): never allocate an
            -- already-expired LP. The order-by still prefers earliest expiry
            -- (FEFO); this only drops LPs that are past their expiry date.
            and (lp.expiry_date is null or lp.expiry_date >= current_date)
            -- Food-safety (G-QA-07 / owner per-rule BLOCK): never allocate an LP
            -- on an active quality hold. status='available' + qa_status='released'
            -- does NOT cover holds — they are a separate polymorphic layer (T-064,
            -- migration 197). Read the canonical SECURITY INVOKER, org-scoped
            -- v_active_holds view (reference_type='lp') — never quality_holds
            -- directly — mirroring shipShipment's egress guard so held stock is
            -- excluded at allocation as well as at ship.
            and not exists (
              select 1
                from public.v_active_holds h
               where h.org_id = app.current_org_id()
                 and h.reference_type = 'lp'
                 and h.reference_id = lp.id
            )
            and (lp.quantity - lp.reserved_qty) > 0
          order by lp.expiry_date asc nulls last, lp.created_at asc
          for update of lp`,
        [line.product_id, line.site_id],
      );

      for (const lp of candidates) {
        const lpAvailable = decimalToUnits(lp.available_qty);
        available += lpAvailable;
        if (needed <= 0n) continue;
        const take = minUnits(needed, lpAvailable);
        if (take <= 0n) continue;
        allocations.push({ lpId: lp.lp_id, qty: unitsToDecimal(take) });
        needed -= take;

        // Near-expiry WARN (G-QA-03 sibling): this LP is being ALLOCATED (the
        // expired ones were already filtered out above), but it falls inside the
        // org's near-expiry window. Record the soonest one for the soft warning.
        if (warnDays > 0 && lp.expiry_date != null && lp.days_to_expiry != null) {
          const days = Number(lp.days_to_expiry);
          if (Number.isFinite(days) && days >= 0 && days <= warnDays) {
            nearExpiryCount += 1;
            if (soonestNearExpiry === null || days < soonestNearExpiry.days) {
              soonestNearExpiry = { date: lp.expiry_date, days };
            }
          }
        }
      }

      if (needed > 0n) {
        return {
          ok: false,
          error: 'INSUFFICIENT_STOCK',
          item_id: line.product_id,
          needed: inventoryNeededQty,
          available: unitsToDecimal(available),
        };
      }

      let allocated = 0n;
      for (const allocation of allocations) {
        allocated += decimalToUnits(allocation.qty);
      }
      planned.push({ lineId: line.id, siteId: line.site_id, allocated: unitsToDecimal(allocated), allocations });
    }

    for (const line of planned) {
      for (const allocation of line.allocations) {
        await ctx.client.query(
          `insert into public.inventory_allocations
             (org_id, site_id, sales_order_line_id, license_plate_id, quantity_allocated, status, created_by, updated_by)
           values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::numeric, 'allocated', $6::uuid, $6::uuid)`,
          [orgId, line.siteId, line.lineId, allocation.lpId, allocation.qty, userId],
        );
        await ctx.client.query(
          `update public.license_plates
              set reserved_qty = reserved_qty + $2::numeric,
                  updated_by = $3::uuid
            where org_id = app.current_org_id()
              and id = $1::uuid`,
          [allocation.lpId, allocation.qty, userId],
        );
      }

      await ctx.client.query(
        `update public.sales_order_lines
            set quantity_allocated = $2::numeric,
                updated_by = $3::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        [line.lineId, line.allocated, userId],
      );
    }

    const result = await transitionSalesOrderStatusInContext(ctx, id, 'allocated');
    if (result && 'error' in result) return result;

    const nearExpiryWarning: NearExpiryAllocationWarning | undefined =
      soonestNearExpiry !== null
        ? {
            nearExpiry: true,
            reasonCode: 'allocated_lp_near_expiry',
            soonestExpiry: soonestNearExpiry.date,
            daysToExpiry: soonestNearExpiry.days,
            warnDays,
            affectedLpCount: nearExpiryCount,
          }
        : undefined;

    // Soft + additive: only spread the warning when it actually fired.
    return nearExpiryWarning ? { ok: true, data: result, nearExpiryWarning } : { ok: true, data: result };
  });
}

export async function deallocateSalesOrder(soId: string): Promise<DeallocateSalesOrderResult> {
  return withOrgContext(async ({ userId, orgId, client }): Promise<DeallocateSalesOrderResult> => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    const forbidden = await requirePermission(ctx, SHIP_SO_ALLOCATE);
    if (forbidden) return forbidden;
    const result = await deallocateSalesOrderInContext(ctx, soId);
    if (result === 'not_found') return { ok: true, data: null };
    if (result === 'invalid_state') return { ok: false, error: 'deallocate_not_allowed' };
    return { ok: true, data: null };
  });
}

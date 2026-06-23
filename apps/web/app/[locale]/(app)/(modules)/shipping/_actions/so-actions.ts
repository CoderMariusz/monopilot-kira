'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { resolveSalesLinePrice } from './sales-line-price';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type ShippingContext = { userId: string; orgId: string; client: QueryClient };
type SalesOrderStatus =
  | 'draft'
  | 'confirmed'
  | 'allocated'
  | 'partially_picked'
  | 'picked'
  | 'partially_packed'
  | 'packed'
  | 'manifested'
  | 'shipped'
  | 'partially_delivered'
  | 'delivered'
  | 'cancelled';
type TransitionTarget = SalesOrderStatus;
type AllocationStatus = 'unallocated' | 'partially_allocated' | 'allocated';

export type ForbiddenFailure = { ok: false; error: 'forbidden' };
export type InvalidInputFailure = { ok: false; error: 'invalid_input'; message?: string };
export type PersistenceFailure = { ok: false; error: 'persistence_failed'; message?: string };
export type ActionFailure = ForbiddenFailure | InvalidInputFailure | PersistenceFailure;
export type ActionResult<T, F extends { ok: false; error: string } = ForbiddenFailure> =
  | { ok: true; data: T }
  | F;

export type SalesOrderListRow = {
  id: string;
  so_number: string;
  customer_name: string | null;
  customer_code: string | null;
  status: SalesOrderStatus;
  line_count: number;
  total: string;
  created_at: string;
  expected_ship_date: string | null;
};

export type SalesOrderLine = {
  id: string;
  line_no: number;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  qty: string;
  uom: string;
  allocated_qty: string;
  allocation_status: AllocationStatus;
};

export type SalesOrder = {
  id: string;
  so_number: string;
  status: SalesOrderStatus;
  customer_id: string | null;
  customer_name: string | null;
  customer_code: string | null;
  expected_ship_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  allocation_status: AllocationStatus;
  lines: SalesOrderLine[];
};

export type IllegalTransitionError = {
  ok: false;
  error: 'ILLEGAL_TRANSITION';
  from: string;
  to: TransitionTarget;
};

export type InsufficientStockError = {
  ok: false;
  error: 'INSUFFICIENT_STOCK';
  item_id: string;
  needed: string;
  available: string;
};

export type ListSalesOrdersResult = ActionResult<SalesOrderListRow[]>;
export type GetSalesOrderResult = ActionResult<SalesOrder | null>;
export type CreateSalesOrderResult = ActionResult<SalesOrder | null, ActionFailure>;
export type TransitionSalesOrderStatusResult = ActionResult<SalesOrder | null, ForbiddenFailure | IllegalTransitionError>;
export type AllocateSalesOrderResult = ActionResult<
  SalesOrder | null,
  ForbiddenFailure | IllegalTransitionError | InsufficientStockError
>;
export type DeallocateSalesOrderResult = ActionResult<null>;

type CreateSalesOrderInput = {
  customer_id: string;
  requested_date?: string;
  notes?: string;
  lines: { item_id: string; qty: string; uom: string }[];
};

const SHIP_SO_READ = 'ship.dashboard.view';
const SHIP_SO_CREATE = 'ship.so.create';
const SHIP_SO_CONFIRM = 'ship.so.confirm';
const SHIP_SO_CANCEL = 'ship.so.cancel';
// Migration 212 seeds no granular ship.so.allocate/deallocate permission; keep create for those ops.
const SHIP_SO_ALLOCATE = 'ship.so.create';

const LEGAL_TRANSITIONS: Record<SalesOrderStatus, readonly TransitionTarget[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['allocated', 'cancelled'],
  allocated: ['partially_picked', 'picked', 'cancelled'],
  partially_picked: ['picked', 'cancelled'],
  picked: ['partially_packed', 'packed', 'cancelled'],
  partially_packed: ['packed', 'cancelled'],
  packed: ['manifested', 'cancelled'],
  manifested: ['shipped', 'cancelled'],
  shipped: ['partially_delivered', 'delivered'],
  partially_delivered: ['delivered'],
  delivered: [],
  cancelled: [],
};

function isSalesOrderStatus(status: string): status is SalesOrderStatus {
  return Object.prototype.hasOwnProperty.call(LEGAL_TRANSITIONS, status);
}

function permissionForTransition(newStatus: TransitionTarget): string {
  if (newStatus === 'confirmed') return SHIP_SO_CONFIRM;
  if (newStatus === 'cancelled') return SHIP_SO_CANCEL;
  return SHIP_SO_CREATE;
}

async function hasPermission(ctx: ShippingContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

async function requirePermission(ctx: ShippingContext, permission: string): Promise<ForbiddenFailure | null> {
  if (!(await hasPermission(ctx, permission))) {
    return { ok: false, error: 'forbidden' };
  }
  return null;
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

function parseNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
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
  quantity_ordered: string;
  uom: string | null;
  quantity_allocated: string;
}): SalesOrderLine {
  return {
    id: row.id,
    line_no: row.line_number,
    item_id: row.product_id,
    item_code: row.item_code,
    item_name: row.item_name,
    qty: row.quantity_ordered,
    uom: row.uom ?? '',
    allocated_qty: row.quantity_allocated,
    allocation_status: lineAllocationStatus(row.quantity_ordered, row.quantity_allocated),
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
    quantity_ordered: string;
    uom: string | null;
    quantity_allocated: string;
  }>(
    `select sol.id::text,
            sol.line_number,
            sol.product_id::text,
            i.item_code,
            i.name as item_name,
            sol.quantity_ordered::text,
            coalesce(sol.ext_data->>'order_uom', i.uom_base) as uom,
            sol.quantity_allocated::text
       from public.sales_order_lines sol
       left join public.items i on i.id = sol.product_id and i.org_id = app.current_org_id()
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

async function deallocateSalesOrderInContext(ctx: ShippingContext, soId: string): Promise<void> {
  const { rows: allocations } = await ctx.client.query<{ lp_id: string; qty: string }>(
    `select ia.license_plate_id::text as lp_id, ia.quantity_allocated::text as qty
       from public.inventory_allocations ia
       join public.sales_order_lines sol on sol.id = ia.sales_order_line_id
      where ia.org_id = app.current_org_id()
        and sol.org_id = app.current_org_id()
        and sol.sales_order_id = $1::uuid
        and ia.status = 'allocated'`,
    [soId],
  );

  for (const allocation of allocations) {
    await ctx.client.query(
      `update public.license_plates
          set reserved_qty = greatest(0, reserved_qty - $2::numeric),
              updated_by = $3::uuid
        where org_id = app.current_org_id()
          and id = $1::uuid`,
      [allocation.lp_id, allocation.qty, ctx.userId],
    );
  }

  await ctx.client.query(
    `update public.inventory_allocations ia
        set status = 'released',
            released_at = now(),
            updated_by = $2::uuid
       from public.sales_order_lines sol
      where sol.id = ia.sales_order_line_id
        and ia.org_id = app.current_org_id()
        and sol.org_id = app.current_org_id()
        and sol.sales_order_id = $1::uuid
        and ia.status = 'allocated'`,
    [soId, ctx.userId],
  );

  await ctx.client.query(
    `update public.sales_order_lines
        set quantity_allocated = 0,
            updated_by = $2::uuid
      where org_id = app.current_org_id()
        and sales_order_id = $1::uuid`,
    [soId, ctx.userId],
  );
}

async function transitionSalesOrderStatusInContext(
  ctx: ShippingContext,
  id: string,
  newStatus: TransitionTarget,
): Promise<SalesOrder | IllegalTransitionError | null> {
  const { rows } = await ctx.client.query<{ status: string }>(
    `select status
       from public.sales_orders
      where org_id = app.current_org_id()
        and id = $1::uuid
        and deleted_at is null
      limit 1`,
    [id],
  );
  const current = rows[0]?.status;
  if (!current) return null;
  if (!isSalesOrderStatus(current) || !LEGAL_TRANSITIONS[current].includes(newStatus)) {
    return { ok: false, error: 'ILLEGAL_TRANSITION', from: current, to: newStatus };
  }

  if (newStatus === 'cancelled') {
    await deallocateSalesOrderInContext(ctx, id);
  }

  await ctx.client.query(
    `update public.sales_orders
        set status = $2,
            updated_by = $3::uuid,
            shipped_at = case when $2 = 'shipped' then now() else shipped_at end
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [id, newStatus, ctx.userId],
  );
  return fetchSalesOrder(ctx, id);
}

export async function listSalesOrders(params: { status?: string; search?: string } = {}): Promise<ListSalesOrdersResult> {
  return withOrgContext(async ({ userId, orgId, client }): Promise<ListSalesOrdersResult> => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    const forbidden = await requirePermission(ctx, SHIP_SO_READ);
    if (forbidden) return forbidden;

    const { rows } = await ctx.client.query<{
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
                  select sum(coalesce(sol.line_total_gbp, sol.quantity_ordered * sol.unit_price_gbp))
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
        where so.org_id = app.current_org_id()
          and so.deleted_at is null
          and ($1::text is null or so.status = $1)
          and (
            $2::text is null
            or so.order_number ilike '%' || $2 || '%'
            or c.name ilike '%' || $2 || '%'
            or c.customer_code ilike '%' || $2 || '%'
          )
        order by so.created_at desc, so.order_number desc
        limit 200`,
      [params.status?.trim() || null, params.search?.trim() || null],
    );
    return { ok: true, data: rows.map(mapSalesOrderListRow) };
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
        { id: item.id, list_price_gbp: parseNullableNumber(item.list_price_gbp) },
      ]),
    );

    for (const [index, line] of input.lines.entries()) {
      const item = itemsById.get(line.item_id);
      if (!item) return { ok: false, error: 'invalid_input', message: 'Unknown sales order item' };
      const unitPriceGbp = resolveSalesLinePrice(item, { customerId: input.customer_id ?? undefined });

      await ctx.client.query(
        `insert into public.sales_order_lines
          (org_id, sales_order_id, line_number, product_id, quantity_ordered, quantity_allocated,
           unit_price_gbp, line_total_gbp, ext_data, created_by, updated_by)
         values ($1::uuid, $2::uuid, $3::integer, $4::uuid, $5::numeric, 0,
                 $6::numeric, ($5::numeric * $6::numeric), jsonb_build_object('order_uom', $7::text), $8::uuid, $8::uuid)`,
        [orgId, soId, index + 1, line.item_id, line.qty, unitPriceGbp, line.uom, userId],
      );
    }

    return { ok: true, data: await fetchSalesOrder(ctx, soId) };
  });
}

export async function transitionSalesOrderStatus(
  id: string,
  newStatus: TransitionTarget,
): Promise<TransitionSalesOrderStatusResult> {
  return withOrgContext(async ({ userId, orgId, client }): Promise<TransitionSalesOrderStatusResult> => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    const forbidden = await requirePermission(ctx, permissionForTransition(newStatus));
    if (forbidden) return forbidden;
    const result = await transitionSalesOrderStatusInContext(ctx, id, newStatus);
    if (result && 'error' in result) return result;
    return { ok: true, data: result };
  });
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
        limit 1`,
      [id],
    );
    const current = statusRows[0]?.status;
    if (!current) return { ok: true, data: null };
    if (!isSalesOrderStatus(current) || !LEGAL_TRANSITIONS[current].includes('allocated')) {
      return { ok: false, error: 'ILLEGAL_TRANSITION', from: current, to: 'allocated' };
    }

    const { rows: lines } = await ctx.client.query<{
      id: string;
      site_id: string | null;
      product_id: string;
      quantity_ordered: string;
    }>(
      `select id::text, site_id::text, product_id::text, quantity_ordered::text
         from public.sales_order_lines
        where org_id = app.current_org_id()
          and sales_order_id = $1::uuid
          and deleted_at is null
        order by line_number`,
      [id],
    );

    const planned: Array<{
      lineId: string;
      siteId: string | null;
      allocated: string;
      allocations: Array<{ lpId: string; qty: string }>;
    }> = [];

    for (const line of lines) {
      let needed = decimalToUnits(line.quantity_ordered);
      let available = 0n;
      const allocations: Array<{ lpId: string; qty: string }> = [];

      const { rows: candidates } = await ctx.client.query<{
        lp_id: string;
        available_qty: string;
      }>(
        `select lp.id::text as lp_id,
                (lp.quantity - lp.reserved_qty)::text as available_qty
           from public.license_plates lp
          where lp.org_id = app.current_org_id()
            and lp.product_id = $1::uuid
            and lp.status = 'available'
            and lp.qa_status = 'released'
            and (lp.quantity - lp.reserved_qty) > 0
          order by lp.expiry_date asc nulls last, lp.created_at asc
          for update of lp`,
        [line.product_id],
      );

      for (const lp of candidates) {
        const lpAvailable = decimalToUnits(lp.available_qty);
        available += lpAvailable;
        if (needed <= 0n) continue;
        const take = minUnits(needed, lpAvailable);
        if (take <= 0n) continue;
        allocations.push({ lpId: lp.lp_id, qty: unitsToDecimal(take) });
        needed -= take;
      }

      if (needed > 0n) {
        return {
          ok: false,
          error: 'INSUFFICIENT_STOCK',
          item_id: line.product_id,
          needed: line.quantity_ordered,
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
    return { ok: true, data: result };
  });
}

export async function deallocateSalesOrder(soId: string): Promise<DeallocateSalesOrderResult> {
  return withOrgContext(async ({ userId, orgId, client }): Promise<DeallocateSalesOrderResult> => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    const forbidden = await requirePermission(ctx, SHIP_SO_ALLOCATE);
    if (forbidden) return forbidden;
    await deallocateSalesOrderInContext(ctx, soId);
    return { ok: true, data: null };
  });
}

'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type ShippingContext = { userId: string; orgId: string; client: QueryClient };
type SalesOrderStatus = 'draft' | 'confirmed' | 'allocated' | 'shipped' | 'cancelled';
type TransitionTarget = 'confirmed' | 'allocated' | 'shipped' | 'cancelled';

export type SalesOrderLine = {
  id: string;
  lineNo: number;
  itemId: string;
  qty: string;
  uom: string;
  allocatedQty: string;
};

export type SalesOrder = {
  id: string;
  soNumber: string;
  status: SalesOrderStatus;
  customerId: string | null;
  customerName: string | null;
  requestedDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lines?: SalesOrderLine[];
};

export type IllegalTransitionError = {
  error: 'ILLEGAL_TRANSITION';
  from: SalesOrderStatus;
  to: TransitionTarget;
};

export type InsufficientStockError = {
  error: 'INSUFFICIENT_STOCK';
  item_id: string;
  needed: string;
  available: string;
};

type CreateSalesOrderInput = {
  customer_id: string;
  requested_date?: string;
  notes?: string;
  lines: { item_id: string; qty: string; uom: string }[];
};

const SHIP_SO_READ = 'ship.dashboard.view';
const SHIP_SO_WRITE = 'ship.so.create';

const LEGAL_TRANSITIONS: Record<SalesOrderStatus, readonly TransitionTarget[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['allocated', 'cancelled'],
  allocated: ['shipped', 'cancelled'],
  shipped: [],
  cancelled: [],
};

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

async function requirePermission(ctx: ShippingContext, permission: string): Promise<void> {
  if (!(await hasPermission(ctx, permission))) {
    throw new Error(`PermissionDenied:${permission}`);
  }
}

function toText(value: unknown): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function toDate(value: unknown): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
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

function mapSalesOrderRow(row: {
  id: string;
  order_number: string | null;
  status: SalesOrderStatus;
  customer_id: string | null;
  customer_name: string | null;
  promised_ship_date: string | Date | null;
  notes: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}): SalesOrder {
  return {
    id: row.id,
    soNumber: row.order_number ?? '',
    status: row.status,
    customerId: row.customer_id,
    customerName: row.customer_name,
    requestedDate: toDate(row.promised_ship_date),
    notes: row.notes,
    createdAt: toText(row.created_at) ?? '',
    updatedAt: toText(row.updated_at) ?? '',
  };
}

function mapLineRow(row: {
  id: string;
  line_number: number;
  product_id: string;
  quantity_ordered: string;
  uom: string | null;
  quantity_allocated: string;
}): SalesOrderLine {
  return {
    id: row.id,
    lineNo: row.line_number,
    itemId: row.product_id,
    qty: row.quantity_ordered,
    uom: row.uom ?? '',
    allocatedQty: row.quantity_allocated,
  };
}

async function fetchSalesOrder(ctx: ShippingContext, id: string): Promise<SalesOrder | null> {
  const { rows } = await ctx.client.query<{
    id: string;
    order_number: string | null;
    status: SalesOrderStatus;
    customer_id: string | null;
    customer_name: string | null;
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

  const order = mapSalesOrderRow(rows[0]);
  const lineRows = await ctx.client.query<{
    id: string;
    line_number: number;
    product_id: string;
    quantity_ordered: string;
    uom: string | null;
    quantity_allocated: string;
  }>(
    `select sol.id::text,
            sol.line_number,
            sol.product_id::text,
            sol.quantity_ordered::text,
            i.uom_base as uom,
            sol.quantity_allocated::text
       from public.sales_order_lines sol
       left join public.items i on i.id = sol.product_id and i.org_id = app.current_org_id()
      where sol.org_id = app.current_org_id()
        and sol.sales_order_id = $1::uuid
        and sol.deleted_at is null
      order by sol.line_number`,
    [id],
  );
  order.lines = lineRows.rows.map(mapLineRow);
  return order;
}

async function deallocateSalesOrderInContext(ctx: ShippingContext, soId: string): Promise<void> {
  const { rows: allocations } = await ctx.client.query<{ lp_id: string; qty: string }>(
    `select sola.lp_id::text, sola.qty::text
       from public.sales_order_line_allocations sola
       join public.sales_order_lines sol on sol.id = sola.so_line_id
      where sola.org_id = app.current_org_id()
        and sol.org_id = app.current_org_id()
        and sol.sales_order_id = $1::uuid`,
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
    `delete from public.sales_order_line_allocations sola
      using public.sales_order_lines sol
      where sol.id = sola.so_line_id
        and sola.org_id = app.current_org_id()
        and sol.org_id = app.current_org_id()
        and sol.sales_order_id = $1::uuid`,
    [soId],
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
  const { rows } = await ctx.client.query<{ status: SalesOrderStatus }>(
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
  if (!LEGAL_TRANSITIONS[current].includes(newStatus)) {
    return { error: 'ILLEGAL_TRANSITION', from: current, to: newStatus };
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

export async function listSalesOrders(params: { status?: string; search?: string } = {}): Promise<SalesOrder[]> {
  return withOrgContext(async ({ userId, orgId, client }) => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    await requirePermission(ctx, SHIP_SO_READ);

    const { rows } = await ctx.client.query<{
      id: string;
      order_number: string | null;
      status: SalesOrderStatus;
      customer_id: string | null;
      customer_name: string | null;
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
              so.promised_ship_date,
              so.ext_data->>'notes' as notes,
              so.created_at,
              so.updated_at
         from public.sales_orders so
         left join public.customers c on c.id = so.customer_id and c.org_id = app.current_org_id()
        where so.org_id = app.current_org_id()
          and so.deleted_at is null
          and ($1::text is null or so.status = $1)
          and (
            $2::text is null
            or so.order_number ilike '%' || $2 || '%'
            or c.name ilike '%' || $2 || '%'
          )
        order by so.created_at desc, so.order_number desc
        limit 200`,
      [params.status?.trim() || null, params.search?.trim() || null],
    );
    return rows.map(mapSalesOrderRow);
  });
}

export async function getSalesOrder(id: string): Promise<SalesOrder | null> {
  return withOrgContext(async ({ userId, orgId, client }) => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    await requirePermission(ctx, SHIP_SO_READ);
    return fetchSalesOrder(ctx, id);
  });
}

export async function createSalesOrder(input: CreateSalesOrderInput): Promise<SalesOrder | null> {
  return withOrgContext(async ({ userId, orgId, client }) => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    await requirePermission(ctx, SHIP_SO_WRITE);
    if (input.lines.length === 0) throw new Error('Sales order requires at least one line');

    const { rows: numberRows } = await ctx.client.query<{ so_number: string }>(
      `select public.next_sales_order_document_number($1::uuid) as so_number`,
      [orgId],
    );
    const soNumber = numberRows[0]?.so_number;
    if (!soNumber) throw new Error('Unable to generate sales order number');

    const { rows } = await ctx.client.query<{ id: string }>(
      `insert into public.sales_orders
        (org_id, order_number, customer_id, order_date, promised_ship_date, status, ext_data, created_by, updated_by)
       values ($1::uuid, $2, $3::uuid, current_date, $4::date, 'draft', jsonb_build_object('notes', $5::text), $6::uuid, $6::uuid)
       returning id::text`,
      [orgId, soNumber, input.customer_id, input.requested_date ?? null, input.notes ?? null, userId],
    );
    const soId = rows[0]?.id;
    if (!soId) throw new Error('Unable to create sales order');

    for (const [index, line] of input.lines.entries()) {
      await ctx.client.query(
        `insert into public.sales_order_lines
          (org_id, sales_order_id, line_number, product_id, quantity_ordered, quantity_allocated, unit_price_gbp, line_total_gbp, created_by, updated_by)
         values ($1::uuid, $2::uuid, $3::integer, $4::uuid, $5::numeric, 0, 1.0000, $5::numeric, $6::uuid, $6::uuid)`,
        [orgId, soId, index + 1, line.item_id, line.qty, userId],
      );
    }

    return fetchSalesOrder(ctx, soId);
  });
}

export async function transitionSalesOrderStatus(
  id: string,
  newStatus: TransitionTarget,
): Promise<SalesOrder | IllegalTransitionError | null> {
  return withOrgContext(async ({ userId, orgId, client }) => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    await requirePermission(ctx, SHIP_SO_WRITE);
    return transitionSalesOrderStatusInContext(ctx, id, newStatus);
  });
}

export async function allocateSalesOrder(id: string): Promise<SalesOrder | InsufficientStockError | IllegalTransitionError | null> {
  return withOrgContext(async ({ userId, orgId, client }) => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    await requirePermission(ctx, SHIP_SO_WRITE);
    await deallocateSalesOrderInContext(ctx, id);

    const { rows: lines } = await ctx.client.query<{
      id: string;
      product_id: string;
      quantity_ordered: string;
    }>(
      `select id::text, product_id::text, quantity_ordered::text
         from public.sales_order_lines
        where org_id = app.current_org_id()
          and sales_order_id = $1::uuid
          and deleted_at is null
        order by line_number`,
      [id],
    );

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
          error: 'INSUFFICIENT_STOCK',
          item_id: line.product_id,
          needed: line.quantity_ordered,
          available: unitsToDecimal(available),
        };
      }

      let allocated = 0n;
      for (const allocation of allocations) {
        allocated += decimalToUnits(allocation.qty);
        await ctx.client.query(
          `insert into public.sales_order_line_allocations (org_id, so_line_id, lp_id, qty)
           values ($1::uuid, $2::uuid, $3::uuid, $4::numeric)
           on conflict (so_line_id, lp_id) do update set qty = excluded.qty`,
          [orgId, line.id, allocation.lpId, allocation.qty],
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
        [line.id, unitsToDecimal(allocated), userId],
      );
    }

    return transitionSalesOrderStatusInContext(ctx, id, 'allocated');
  });
}

export async function deallocateSalesOrder(soId: string): Promise<{ ok: true }> {
  return withOrgContext(async ({ userId, orgId, client }) => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    await requirePermission(ctx, SHIP_SO_WRITE);
    await deallocateSalesOrderInContext(ctx, soId);
    return { ok: true };
  });
}

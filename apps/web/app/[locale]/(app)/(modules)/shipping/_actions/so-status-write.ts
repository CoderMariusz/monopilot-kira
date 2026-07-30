import {
  isLegalShipmentTransition,
  isLegalSoTransition,
  isSalesOrderStatus,
  isShipmentStatus,
  type SalesOrderStatus,
  type ShipmentStatus,
} from './so-transitions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type ShippingContext = { userId: string; orgId: string; client: QueryClient };

export type StatusWriteResult = 'ok' | 'not_found' | 'illegal_transition';
export type SalesOrderConfirmationBlocker = 'so_lines_required' | 'so_unit_price_required';

type SalesOrderStatusWriteOptions = {
  currentStatus?: SalesOrderStatus;
  /**
   * Internal-only escape hatch for audited shipment reversal flows after stock
   * has already been restored/recomputed. Do not use for operator SO transitions.
   */
  allowShipmentReversal?: boolean;
};

const SHIPMENT_REVERSAL_FROM: readonly SalesOrderStatus[] = ['shipped', 'partially_delivered', 'delivered'];
const SHIPMENT_REVERSAL_TO: readonly SalesOrderStatus[] = [
  'confirmed',
  'allocated',
  'partially_packed',
  'packed',
  'manifested',
  'shipped',
  'partially_delivered',
];

function isShipmentReversalSoTransition(from: SalesOrderStatus, to: SalesOrderStatus): boolean {
  return SHIPMENT_REVERSAL_FROM.includes(from) && SHIPMENT_REVERSAL_TO.includes(to);
}

export async function readLockedSalesOrderStatus(
  ctx: ShippingContext,
  soId: string,
): Promise<SalesOrderStatus | 'not_found'> {
  const { rows } = await ctx.client.query<{ status: string }>(
    `select status
       from public.sales_orders
      where org_id = app.current_org_id()
        and id = $1::uuid
        and deleted_at is null
      for update`,
    [soId],
  );
  const current = rows[0]?.status;
  if (!current || !isSalesOrderStatus(current)) return 'not_found';
  return current;
}

/**
 * Draft lines may carry zero while pricing is incomplete, but a commercial SO
 * cannot be confirmed without at least one positively-priced line.
 */
export async function readSalesOrderConfirmationBlocker(
  ctx: ShippingContext,
  soId: string,
): Promise<SalesOrderConfirmationBlocker | null> {
  const { rows } = await ctx.client.query<{
    line_count: number | string;
    unpriced_line_count: number | string;
  }>(
    `select count(*)::int as line_count,
            count(*) filter (
              where unit_price_gbp is null or unit_price_gbp <= 0
            )::int as unpriced_line_count
       from public.sales_order_lines
      where org_id = app.current_org_id()
        and sales_order_id = $1::uuid
        and deleted_at is null`,
    [soId],
  );
  const lineCount = Number(rows[0]?.line_count ?? 0);
  if (lineCount === 0) return 'so_lines_required';
  return Number(rows[0]?.unpriced_line_count ?? 0) > 0 ? 'so_unit_price_required' : null;
}

export async function writeSalesOrderStatusInContext(
  ctx: ShippingContext,
  soId: string,
  newStatus: SalesOrderStatus,
  options?: SalesOrderStatusWriteOptions,
): Promise<StatusWriteResult> {
  const current = options?.currentStatus ?? (await readLockedSalesOrderStatus(ctx, soId));
  if (current === 'not_found') return 'not_found';
  if (current === newStatus) return 'ok';
  if (!isLegalSoTransition(current, newStatus)) {
    if (!options?.allowShipmentReversal || !isShipmentReversalSoTransition(current, newStatus)) {
      return 'illegal_transition';
    }
  }

  const { rowCount } = await ctx.client.query(
    `update public.sales_orders
        set status = $2,
            shipped_at = case when $2 = 'shipped' then coalesce(shipped_at, now()) else shipped_at end,
            updated_at = now(),
            updated_by = $3::uuid
      where org_id = app.current_org_id()
        and id = $1::uuid
        and deleted_at is null`,
    [soId, newStatus, ctx.userId],
  );
  return rowCount === 1 ? 'ok' : 'not_found';
}

export async function readLockedShipmentStatus(
  ctx: ShippingContext,
  shipmentId: string,
): Promise<{ status: ShipmentStatus; salesOrderId: string | null } | 'not_found'> {
  const { rows } = await ctx.client.query<{ status: string; sales_order_id: string | null }>(
    `select status, sales_order_id::text
       from public.shipments
      where org_id = app.current_org_id()
        and id = $1::uuid
        and deleted_at is null
      for update`,
    [shipmentId],
  );
  const row = rows[0];
  if (!row || !isShipmentStatus(row.status)) return 'not_found';
  return { status: row.status, salesOrderId: row.sales_order_id };
}

export async function writeShipmentStatusInContext(
  ctx: ShippingContext,
  shipmentId: string,
  newStatus: ShipmentStatus,
  options?: {
    currentStatus?: ShipmentStatus;
    /**
     * Internal-only escape hatch for audited voidPod reversal (delivered → shipped).
     * Do not use for operator shipment transitions.
     */
    allowVoidPodReversal?: boolean;
  },
): Promise<StatusWriteResult> {
  const locked = options?.currentStatus
    ? { status: options.currentStatus }
    : await readLockedShipmentStatus(ctx, shipmentId);
  if (locked === 'not_found') return 'not_found';
  if (locked.status === newStatus) return 'ok';
  if (!isLegalShipmentTransition(locked.status, newStatus)) {
    const voidPodReversal =
      options?.allowVoidPodReversal && locked.status === 'delivered' && newStatus === 'shipped';
    if (!voidPodReversal) return 'illegal_transition';
  }

  const { rowCount } = await ctx.client.query(
    `update public.shipments
        set status = $2,
            updated_at = now(),
            updated_by = $3::uuid
      where org_id = app.current_org_id()
        and id = $1::uuid
        and deleted_at is null`,
    [shipmentId, newStatus, ctx.userId],
  );
  return rowCount === 1 ? 'ok' : 'not_found';
}

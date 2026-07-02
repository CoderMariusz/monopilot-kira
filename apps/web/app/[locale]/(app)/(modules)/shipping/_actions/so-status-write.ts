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

export async function writeSalesOrderStatusInContext(
  ctx: ShippingContext,
  soId: string,
  newStatus: SalesOrderStatus,
  options?: { currentStatus?: SalesOrderStatus },
): Promise<StatusWriteResult> {
  const current = options?.currentStatus ?? (await readLockedSalesOrderStatus(ctx, soId));
  if (current === 'not_found') return 'not_found';
  if (current === newStatus) return 'ok';
  if (!isLegalSoTransition(current, newStatus)) return 'illegal_transition';

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
  options?: { currentStatus?: ShipmentStatus },
): Promise<StatusWriteResult> {
  const locked = options?.currentStatus
    ? { status: options.currentStatus }
    : await readLockedShipmentStatus(ctx, shipmentId);
  if (locked === 'not_found') return 'not_found';
  if (locked.status === newStatus) return 'ok';
  if (!isLegalShipmentTransition(locked.status, newStatus)) return 'illegal_transition';

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

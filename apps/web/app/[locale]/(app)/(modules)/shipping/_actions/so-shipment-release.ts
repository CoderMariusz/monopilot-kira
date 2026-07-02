import { LIVE_ALLOCATION_SQL, SHIP_CLOSED_ALLOCATION_REASON } from './so-transitions';
import { writeShipmentStatusInContext } from './so-status-write';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type ShippingContext = { userId: string; orgId: string; client: QueryClient };

type AllocationReleaseRow = {
  id: string;
  lp_id: string;
  qty: string;
  sales_order_line_id: string;
};

/**
 * Release live allocations backing LPs packed into this shipment only (never the whole SO).
 */
export async function releaseShipmentLiveAllocationsInContext(
  ctx: ShippingContext,
  shipmentId: string,
  soId: string,
): Promise<void> {
  const { rows: allocations } = await ctx.client.query<AllocationReleaseRow>(
    `select ia.id::text,
            ia.license_plate_id::text as lp_id,
            ia.quantity_allocated::text as qty,
            ia.sales_order_line_id::text
       from public.inventory_allocations ia
       join public.sales_order_lines sol on sol.id = ia.sales_order_line_id
        and sol.org_id = app.current_org_id()
        and sol.sales_order_id = $2::uuid
        and sol.deleted_at is null
       join public.shipment_box_contents sbc on sbc.license_plate_id = ia.license_plate_id
        and sbc.org_id = app.current_org_id()
        and sbc.deleted_at is null
       join public.shipment_boxes sb on sb.id = sbc.shipment_box_id
        and sb.org_id = app.current_org_id()
        and sb.shipment_id = $1::uuid
        and sb.deleted_at is null
      where ia.org_id = app.current_org_id()
        and ia.deleted_at is null
        and ${LIVE_ALLOCATION_SQL}
      for update of ia`,
    [shipmentId, soId],
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

  if (allocations.length > 0) {
    await ctx.client.query(
      `update public.inventory_allocations ia
          set status = 'released',
              released_at = now(),
              updated_by = $2::uuid
         from public.shipment_box_contents sbc
         join public.shipment_boxes sb on sb.id = sbc.shipment_box_id
          and sb.org_id = app.current_org_id()
          and sb.shipment_id = $1::uuid
          and sb.deleted_at is null
        where ia.id = any($3::uuid[])
          and sbc.license_plate_id = ia.license_plate_id
          and sbc.org_id = app.current_org_id()
          and sbc.deleted_at is null
          and ia.org_id = app.current_org_id()`,
      [shipmentId, ctx.userId, allocations.map((row) => row.id)],
    );

    for (const allocation of allocations) {
      await ctx.client.query(
        `update public.sales_order_lines
            set quantity_allocated = greatest(0, quantity_allocated - $2::numeric),
                updated_by = $3::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        [allocation.sales_order_line_id, allocation.qty, ctx.userId],
      );
    }
  }
}

export async function voidShipmentBoxesInContext(ctx: ShippingContext, shipmentId: string, extData: string): Promise<void> {
  await ctx.client.query(
    `update public.shipment_box_contents sbc
        set deleted_at = coalesce(deleted_at, now()),
            updated_at = now(),
            updated_by = $2::uuid,
            ext_data = coalesce(ext_data, '{}'::jsonb) || $3::jsonb
       from public.shipment_boxes sb
      where sb.id = sbc.shipment_box_id
        and sb.org_id = app.current_org_id()
        and sb.shipment_id = $1::uuid
        and sbc.org_id = app.current_org_id()
        and sbc.deleted_at is null`,
    [shipmentId, ctx.userId, extData],
  );

  await ctx.client.query(
    `update public.shipment_boxes
        set deleted_at = coalesce(deleted_at, now()),
            updated_at = now(),
            updated_by = $2::uuid,
            ext_data = coalesce(ext_data, '{}'::jsonb) || $3::jsonb
      where org_id = app.current_org_id()
        and shipment_id = $1::uuid
        and deleted_at is null`,
    [shipmentId, ctx.userId, extData],
  );
}

/**
 * Cancel a non-shipped shipment during SO cancel cascade (no e-sign).
 */
export async function cancelOpenShipmentForSoInContext(
  ctx: ShippingContext,
  shipmentId: string,
  soId: string,
): Promise<void> {
  await releaseShipmentLiveAllocationsInContext(ctx, shipmentId, soId);
  await voidShipmentBoxesInContext(
    ctx,
    shipmentId,
    JSON.stringify({ cancelled_via: 'so_cancel', cancelled_at: new Date().toISOString() }),
  );
  const cancelWrite = await writeShipmentStatusInContext(ctx, shipmentId, 'cancelled');
  if (cancelWrite !== 'ok') {
    throw new Error(`cancel_open_shipment_failed:${cancelWrite}`);
  }

  await ctx.client.query(
    `update public.shipments
        set ext_data = coalesce(ext_data, '{}'::jsonb) || $2::jsonb,
            updated_at = now(),
            updated_by = $3::uuid
      where org_id = app.current_org_id()
        and id = $1::uuid
        and status = 'cancelled'
        and deleted_at is null`,
    [
      shipmentId,
      JSON.stringify({ cancelled_via: 'so_cancel', cancelled_at: new Date().toISOString() }),
      ctx.userId,
    ],
  );
}

export { SHIP_CLOSED_ALLOCATION_REASON };

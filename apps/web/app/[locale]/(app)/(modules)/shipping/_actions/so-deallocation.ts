import {
  DEALLOCATABLE_SO_STATUSES,
  isDeallocatableSalesOrderStatus,
  LIVE_ALLOCATION_SQL,
  type SalesOrderStatus,
} from './so-transitions';
import { readLockedSalesOrderStatus, writeSalesOrderStatusInContext } from './so-status-write';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type ShippingContext = { userId: string; orgId: string; client: QueryClient };

export type DeallocateResult = 'ok' | 'not_found' | 'invalid_state';

export async function deallocateSalesOrderInContext(
  ctx: ShippingContext,
  soId: string,
  options?: { skipStatusWrite?: boolean; currentStatus?: SalesOrderStatus },
): Promise<DeallocateResult> {
  const currentStatus = options?.currentStatus ?? (await readLockedSalesOrderStatus(ctx, soId));
  if (currentStatus === 'not_found') return 'not_found';
  if (!isDeallocatableSalesOrderStatus(currentStatus)) return 'invalid_state';

  const { rows: allocations } = await ctx.client.query<{ lp_id: string; qty: string }>(
    `select ia.license_plate_id::text as lp_id, ia.quantity_allocated::text as qty
       from public.inventory_allocations ia
       join public.sales_order_lines sol on sol.id = ia.sales_order_line_id
      where ia.org_id = app.current_org_id()
        and sol.org_id = app.current_org_id()
        and sol.sales_order_id = $1::uuid
        and ${LIVE_ALLOCATION_SQL}`,
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
        and ${LIVE_ALLOCATION_SQL}`,
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

  if (!options?.skipStatusWrite) {
    const writeResult = await writeSalesOrderStatusInContext(ctx, soId, 'confirmed', { currentStatus });
    if (writeResult !== 'ok') return writeResult === 'not_found' ? 'not_found' : 'invalid_state';
  }

  return 'ok';
}

/** Release every live allocation on the SO (no status guard — SO cancel path only). */
export async function releaseRemainingLiveAllocationsInContext(ctx: ShippingContext, soId: string): Promise<void> {
  const { rows: allocations } = await ctx.client.query<{ lp_id: string; qty: string }>(
    `select ia.license_plate_id::text as lp_id, ia.quantity_allocated::text as qty
       from public.inventory_allocations ia
       join public.sales_order_lines sol on sol.id = ia.sales_order_line_id
      where ia.org_id = app.current_org_id()
        and sol.org_id = app.current_org_id()
        and sol.sales_order_id = $1::uuid
        and ${LIVE_ALLOCATION_SQL}`,
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
        and ${LIVE_ALLOCATION_SQL}`,
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

export { DEALLOCATABLE_SO_STATUSES };

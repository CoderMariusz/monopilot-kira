type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type ShippingContext = { userId: string; orgId: string; client: QueryClient };

export async function deallocateSalesOrderInContext(ctx: ShippingContext, soId: string): Promise<void> {
  const { rows: allocations } = await ctx.client.query<{ lp_id: string; qty: string }>(
    `select ia.license_plate_id::text as lp_id, ia.quantity_allocated::text as qty
       from public.inventory_allocations ia
       join public.sales_order_lines sol on sol.id = ia.sales_order_line_id
      where ia.org_id = app.current_org_id()
        and sol.org_id = app.current_org_id()
        and sol.sales_order_id = $1::uuid
        and ia.status in ('allocated', 'picked')`,
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
        and ia.status in ('allocated', 'picked')`,
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

  await ctx.client.query(
    `update public.sales_orders
        set status = 'confirmed',
            updated_by = $2::uuid
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [soId, ctx.userId],
  );
}

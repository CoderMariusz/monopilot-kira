type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type UpsertWacInput = {
  orgId: string;
  siteId: string | null;
  itemId: string;
  deltaQtyKg: string;
  deltaValue: string;
  updatedBy: string;
};

type WacUpdateResult = {
  totalQtyKg: string;
  totalValue: string;
  clamped: boolean;
};

export async function upsertWac(
  client: QueryClient,
  { orgId, itemId, deltaQtyKg, deltaValue, updatedBy }: UpsertWacInput,
): Promise<WacUpdateResult> {
  const { rows } = await client.query<WacUpdateResult>(
    `with existing as materialized (
       select total_qty_kg, total_value
         from public.item_wac_state
        where org_id = $1::uuid
          and item_id = $2::uuid
          and currency_id = (select id from public.currencies where code = 'GBP')
        for update
     ),
     computed as (
       select greatest(coalesce((select total_qty_kg from existing), 0) + $3::numeric, 0) as total_qty_kg,
              greatest(coalesce((select total_value from existing), 0) + $4::numeric, 0) as total_value,
              (
                coalesce((select total_qty_kg from existing), 0) + $3::numeric < 0
                or coalesce((select total_value from existing), 0) + $4::numeric < 0
              ) as clamped
     ),
     upserted as (
       insert into public.item_wac_state (
         org_id, item_id, currency_id, total_qty_kg, total_value, updated_by, updated_at
       )
       select $1::uuid,
              $2::uuid,
              (select id from public.currencies where code = 'GBP'),
              computed.total_qty_kg,
              computed.total_value,
              $5::uuid,
              now()
         from computed
       on conflict (org_id, item_id, currency_id) do update set
         total_qty_kg = excluded.total_qty_kg,
         total_value = excluded.total_value,
         updated_by = $5::uuid,
         updated_at = now()
       returning total_qty_kg::text, total_value::text
     )
     select upserted.total_qty_kg as "totalQtyKg",
            upserted.total_value as "totalValue",
            computed.clamped
       from upserted
       cross join computed`,
    [orgId, itemId, deltaQtyKg, deltaValue, updatedBy],
  );
  const result = rows[0] ?? { totalQtyKg: '0', totalValue: '0', clamped: false };
  if (result.clamped) {
    console.warn('[finance] item_wac_state clamped at zero', { orgId, itemId });
  }
  return result;
}

export type WacDeltaQtyKgResolution = {
  qtyKg: string;
  resolved: boolean;
};

export async function resolveWacDeltaQtyKg(
  client: QueryClient,
  { itemId, qty, uom }: { itemId: string; qty: string; uom: string },
): Promise<WacDeltaQtyKgResolution> {
  const { rows } = await client.query<{ qty_kg: string; resolved: boolean }>(
    `select (
       case
         when lower($2::text) = 'kg' then $1::numeric
         when lower($2::text) = 'base' and lower(coalesce(i.uom_base, '')) = 'kg' then $1::numeric
         when lower($2::text) = lower(coalesce(i.uom_base, '')) and lower(coalesce(i.uom_base, '')) = 'kg' then $1::numeric
         when lower($2::text) = 'each' and i.net_qty_per_each is not null then $1::numeric * i.net_qty_per_each
         when lower($2::text) = 'box' and i.net_qty_per_each is not null and i.each_per_box is not null
           then $1::numeric * i.each_per_box::numeric * i.net_qty_per_each
         else $1::numeric
       end
     )::text as qty_kg,
     (
       case
         when lower($2::text) = 'kg' then true
         when lower($2::text) = 'base' and lower(coalesce(i.uom_base, '')) = 'kg' then true
         when lower($2::text) = lower(coalesce(i.uom_base, '')) and lower(coalesce(i.uom_base, '')) = 'kg' then true
         when lower($2::text) = 'each' and i.net_qty_per_each is not null then true
         when lower($2::text) = 'box' and i.net_qty_per_each is not null and i.each_per_box is not null then true
         else false
       end
     ) as resolved
       from public.items i
      where i.org_id = app.current_org_id()
        and i.id = $3::uuid
      limit 1`,
    [qty, uom, itemId],
  );
  const row = rows[0];
  if (!row) {
    console.warn('[wac] unresolved_uom', { itemId, uom, qty });
    return { qtyKg: qty, resolved: false };
  }
  if (!row.resolved) {
    console.warn('[wac] unresolved_uom', { itemId, uom, qty });
  }
  return { qtyKg: row.qty_kg, resolved: row.resolved };
}

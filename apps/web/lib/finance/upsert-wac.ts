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

export async function upsertWac(
  client: QueryClient,
  { orgId, itemId, deltaQtyKg, deltaValue, updatedBy }: UpsertWacInput,
): Promise<void> {
  await client.query(
    `insert into public.item_wac_state (
       org_id, item_id, currency_id, total_qty_kg, total_value, updated_by, updated_at
     )
     values (
       $1::uuid,
       $2::uuid,
       (select id from public.currencies where code = 'GBP'),
       greatest($3::numeric, 0),
       greatest($4::numeric, 0),
       $5::uuid,
       now()
     )
     on conflict (org_id, item_id, currency_id) do update set
       total_qty_kg = greatest(item_wac_state.total_qty_kg + $3::numeric, 0),
       total_value = greatest(item_wac_state.total_value + $4::numeric, 0),
       updated_by = $5::uuid,
       updated_at = now()`,
    [orgId, itemId, deltaQtyKg, deltaValue, updatedBy],
  );
}

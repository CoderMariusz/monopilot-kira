import { resolveWacDeltaQtyKg, upsertWac } from './upsert-wac';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type ReceiptWacContext = {
  orgId: string;
  userId: string;
  siteId: string | null;
};

export type ReceiptWacInput = {
  grnItemId: string;
  itemId: string;
  qty: string;
  uom: string;
  poLineId: string;
};

export async function bookReceiptWacAfterGrnItem(
  client: QueryClient,
  ctx: ReceiptWacContext,
  receipt: ReceiptWacInput,
): Promise<void> {
  const line = await loadLineUnitPrice(client, ctx.orgId, receipt.poLineId);
  if (!line) return;

  const wacResolution = await resolveWacDeltaQtyKg(client, {
    itemId: line.item_id,
    qty: receipt.qty,
    uom: receipt.uom,
  });
  if (!wacResolution.resolved) {
    await client.query(
      `update public.grn_items
          set ext_jsonb = coalesce(ext_jsonb, '{}'::jsonb) || $3::jsonb,
              updated_by = $2::uuid,
              updated_at = now()
        where org_id = $1::uuid
          and id = $4::uuid`,
      [
        ctx.orgId,
        ctx.userId,
        JSON.stringify({
          wac_excluded: 'unresolved_uom',
          wac_uom: receipt.uom,
          wac_qty: receipt.qty,
        }),
        receipt.grnItemId,
      ],
    );
    return;
  }

  const receivedQtyKg = wacResolution.qtyKg;
  const receivedValue = await multiplyNumeric(client, receipt.qty, line.unit_price);
  const currencyCode = normalizeCurrencyCode(line.currency);
  await upsertWac(client, {
    orgId: ctx.orgId,
    siteId: ctx.siteId,
    itemId: line.item_id,
    deltaQtyKg: receivedQtyKg,
    deltaValue: receivedValue,
    updatedBy: ctx.userId,
    currencyCode,
  });
  await client.query(
    `update public.grn_items
        set ext_jsonb = coalesce(ext_jsonb, '{}'::jsonb) || $3::jsonb,
            updated_by = $2::uuid,
            updated_at = now()
      where org_id = $1::uuid
          and id = $4::uuid`,
    [
      ctx.orgId,
      ctx.userId,
      JSON.stringify({
        wac_qty_kg: receivedQtyKg,
        wac_value: receivedValue,
        wac_currency_code: currencyCode,
      }),
      receipt.grnItemId,
    ],
  );
}

async function loadLineUnitPrice(
  client: QueryClient,
  orgId: string,
  poLineId: string,
): Promise<{ item_id: string; unit_price: string; currency: string } | null> {
  const { rows } = await client.query<{ item_id: string; unit_price: string; currency: string }>(
    `select pol.item_id::text,
            pol.unit_price::text as unit_price,
            po.currency
       from public.purchase_order_lines pol
       join public.purchase_orders po
         on po.org_id = pol.org_id
        and po.id = pol.po_id
      where pol.org_id = $1::uuid
        and pol.id = $2::uuid
      limit 1`,
    [orgId, poLineId],
  );
  return rows[0] ?? null;
}

function normalizeCurrencyCode(currency: string | null | undefined): string {
  const normalized = currency?.trim().toUpperCase();
  return normalized && normalized.length === 3 ? normalized : 'GBP';
}

async function multiplyNumeric(client: QueryClient, left: string, right: string | null): Promise<string> {
  const { rows } = await client.query<{ value: string }>(
    `select ($1::numeric * coalesce($2::numeric, 0))::text as value`,
    [left, right ?? '0'],
  );
  return rows[0]?.value ?? '0';
}

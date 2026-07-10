import { normalizePieceUom } from '../uom/piece';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type OrderLineUomErrorCode = 'unresolved_uom';

export class OrderLineUomError extends Error {
  readonly code: OrderLineUomErrorCode;
  readonly uom?: string;
  readonly qty?: string;

  constructor(code: OrderLineUomErrorCode, details: { uom?: string; qty?: string; message?: string } = {}) {
    super(
      details.message ??
        `Cannot convert order quantity: unit of measure "${details.uom ?? 'unknown'}" is unsupported or pack hierarchy is incomplete`,
    );
    this.name = 'OrderLineUomError';
    this.code = code;
    this.uom = details.uom;
    this.qty = details.qty;
  }
}

const BOX_ORDER_UOMS = new Set(['box', 'boxes', 'case', 'cases', 'carton', 'cartons', 'pack']);

/** Map trade-item labels (case/carton/pack) to the box rung of the pack hierarchy. */
export function normalizeOrderUomLabel(uom: string): string {
  const trimmed = uom.trim();
  const lower = trimmed.toLowerCase();
  if (BOX_ORDER_UOMS.has(lower)) return 'box';
  const piece = normalizePieceUom(trimmed);
  if (piece === 'pcs') return 'each';
  return trimmed;
}

/**
 * SQL: convert an entered order quantity to the item's canonical inventory quantity
 * (license_plates.quantity grain) using exact NUMERIC pack factors.
 *
 * Count inventory (output_uom each/box or uom_base pcs): box/case → × each_per_box;
 * pallet → × boxes_per_pallet × each_per_box.
 * Weight inventory (uom_base kg): each → × net_qty_per_each; box/case → × each_per_box × net_qty_per_each;
 * pallet → × boxes_per_pallet × each_per_box × net_qty_per_each.
 */
export const ORDER_QTY_TO_INVENTORY_SQL = `select (
       case
         when lower($2::text) in (lower(coalesce(i.uom_base, '')), 'base')
           then $1::numeric
         when lower($2::text) = lower(coalesce(i.uom_base, ''))
           then $1::numeric
         when lower($2::text) in ('pcs', 'ea', 'szt', 'each')
           then case
                  when lower(coalesce(i.uom_base, '')) = 'kg'
                       and i.net_qty_per_each is not null
                       and i.net_qty_per_each > 0
                    then $1::numeric * i.net_qty_per_each
                  when lower(coalesce(i.uom_base, '')) in ('pcs', 'ea', 'szt')
                       or i.output_uom in ('each', 'box')
                    then $1::numeric
                  else null
                end
         when lower($2::text) in ('box', 'cases', 'case', 'carton', 'cartons', 'pack', 'boxes')
           then case
                  when lower(coalesce(i.uom_base, '')) = 'kg'
                       and i.net_qty_per_each is not null
                       and i.net_qty_per_each > 0
                       and i.each_per_box is not null
                       and i.each_per_box > 0
                    then $1::numeric * i.each_per_box::numeric * i.net_qty_per_each
                  when i.each_per_box is not null and i.each_per_box > 0
                    then $1::numeric * i.each_per_box::numeric
                  else null
                end
         when lower($2::text) = 'pallet'
           then case
                  when i.boxes_per_pallet is not null
                       and i.boxes_per_pallet > 0
                       and i.each_per_box is not null
                       and i.each_per_box > 0
                       and lower(coalesce(i.uom_base, '')) = 'kg'
                       and i.net_qty_per_each is not null
                       and i.net_qty_per_each > 0
                    then $1::numeric
                         * i.boxes_per_pallet::numeric
                         * i.each_per_box::numeric
                         * i.net_qty_per_each
                  when i.boxes_per_pallet is not null
                       and i.boxes_per_pallet > 0
                       and i.each_per_box is not null
                       and i.each_per_box > 0
                    then $1::numeric * i.boxes_per_pallet::numeric * i.each_per_box::numeric
                  else null
                end
         else null
       end
     )::text as inventory_qty,
     (
       case
         when lower($2::text) in (lower(coalesce(i.uom_base, '')), 'base') then true
         when lower($2::text) = lower(coalesce(i.uom_base, '')) then true
         when lower($2::text) in ('pcs', 'ea', 'szt', 'each')
           then (
             (lower(coalesce(i.uom_base, '')) = 'kg' and i.net_qty_per_each is not null and i.net_qty_per_each > 0)
             or lower(coalesce(i.uom_base, '')) in ('pcs', 'ea', 'szt')
             or i.output_uom in ('each', 'box')
           )
         when lower($2::text) in ('box', 'cases', 'case', 'carton', 'cartons', 'pack', 'boxes')
           then (
             (lower(coalesce(i.uom_base, '')) = 'kg'
              and i.net_qty_per_each is not null and i.net_qty_per_each > 0
              and i.each_per_box is not null and i.each_per_box > 0)
             or (i.each_per_box is not null and i.each_per_box > 0)
           )
         when lower($2::text) = 'pallet'
           then i.boxes_per_pallet is not null and i.boxes_per_pallet > 0
                and i.each_per_box is not null and i.each_per_box > 0
                and (
                  lower(coalesce(i.uom_base, '')) <> 'kg'
                  or (i.net_qty_per_each is not null and i.net_qty_per_each > 0)
                )
         else false
       end
     ) as resolved
       from public.items i
      where i.org_id = app.current_org_id()
        and i.id = $3::uuid
      limit 1`;

export async function resolveOrderQtyToInventoryQty(
  client: QueryClient,
  input: { itemId: string; orderQty: string; orderUom: string },
): Promise<string> {
  const orderUom = input.orderUom.trim();
  const { rows } = await client.query<{ inventory_qty: string | null; resolved: boolean }>(
    ORDER_QTY_TO_INVENTORY_SQL,
    [input.orderQty, orderUom, input.itemId],
  );
  const row = rows[0];
  if (!row?.resolved || row.inventory_qty == null) {
    throw new OrderLineUomError('unresolved_uom', { uom: orderUom, qty: input.orderQty });
  }
  return row.inventory_qty;
}

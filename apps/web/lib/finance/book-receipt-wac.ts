import { resolveWacDeltaQtyKg, upsertWac } from './upsert-wac';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type BookReceiptWacErrorCode = 'unknown_currency' | 'unresolved_uom';

export class BookReceiptWacError extends Error {
  readonly code: BookReceiptWacErrorCode;
  readonly currencyCode?: string;
  readonly uom?: string;
  readonly qty?: string;

  constructor(
    code: BookReceiptWacErrorCode,
    details: { currencyCode?: string; uom?: string; qty?: string } = {},
  ) {
    const message =
      code === 'unknown_currency'
        ? `Unknown currency code for WAC booking: ${details.currencyCode ?? 'unknown'}`
        : `Cannot receive into WAC: UoM "${details.uom ?? 'unknown'}" cannot be converted to kg for valuation`;
    super(message);
    this.name = 'BookReceiptWacError';
    this.code = code;
    this.currencyCode = details.currencyCode;
    this.uom = details.uom;
    this.qty = details.qty;
  }
}

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

export type ReceiptWacPreflightInput = Omit<ReceiptWacInput, 'grnItemId'>;

/**
 * Reject WAC-governed PO receipts whose UoM cannot be converted to kg before any
 * GRN/LP/grn_item writes (P1-08). No-op when the PO line has no unit price.
 */
export async function preflightReceiptWacResolvability(
  client: QueryClient,
  ctx: ReceiptWacContext,
  receipt: ReceiptWacPreflightInput,
): Promise<void> {
  const line = await loadLineUnitPrice(client, ctx.orgId, receipt.poLineId);
  if (!line) return;

  await assertWacUomResolvable(client, {
    itemId: line.item_id,
    qty: receipt.qty,
    uom: receipt.uom,
  });
}

export async function bookReceiptWacAfterGrnItem(
  client: QueryClient,
  ctx: ReceiptWacContext,
  receipt: ReceiptWacInput,
): Promise<void> {
  const line = await loadLineUnitPrice(client, ctx.orgId, receipt.poLineId);
  if (!line) return;

  const wacResolution = await assertWacUomResolvable(client, {
    itemId: line.item_id,
    qty: receipt.qty,
    uom: receipt.uom,
  });

  const receivedQtyKg = wacResolution.qtyKg;
  const receivedValue = await multiplyNumeric(client, receipt.qty, line.unit_price);
  const currencyCode = normalizeCurrencyCode(line.currency);
  await assertResolvableCurrency(client, currencyCode);
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

async function assertWacUomResolvable(
  client: QueryClient,
  receipt: { itemId: string; qty: string; uom: string },
): Promise<{ qtyKg: string; resolved: true }> {
  const wacResolution = await resolveWacDeltaQtyKg(client, {
    itemId: receipt.itemId,
    qty: receipt.qty,
    uom: receipt.uom,
  });
  if (!wacResolution.resolved) {
    // PO receipts with a unit price are WAC-governed: block unvalued stock rather than
    // committing inventory while silently skipping valuation (P1-08).
    throw new BookReceiptWacError('unresolved_uom', { uom: receipt.uom, qty: receipt.qty });
  }
  return { qtyKg: wacResolution.qtyKg, resolved: true };
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

async function assertResolvableCurrency(client: QueryClient, currencyCode: string): Promise<void> {
  const { rows } = await client.query<{ id: string }>(
    `select id::text
       from public.currencies
      where code = $1::text
      limit 1`,
    [currencyCode],
  );
  if (!rows[0]?.id) {
    throw new BookReceiptWacError('unknown_currency', { currencyCode });
  }
}

async function multiplyNumeric(client: QueryClient, left: string, right: string | null): Promise<string> {
  const { rows } = await client.query<{ value: string }>(
    `select ($1::numeric * coalesce($2::numeric, 0))::text as value`,
    [left, right ?? '0'],
  );
  return rows[0]?.value ?? '0';
}

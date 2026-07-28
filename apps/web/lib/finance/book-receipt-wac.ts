import { pieceUomToWacEach } from '../uom/piece';
import {
  isZeroDecimalString,
  resolveWacDeltaQtyKg,
  upsertWac,
  WAC_VALUATION_CURRENCY_CODE,
  type WacDeltaQtyKgResolution,
} from './upsert-wac';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type BookReceiptWacErrorCode = 'unknown_currency' | 'unsupported_currency' | 'unresolved_uom';

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
        : code === 'unsupported_currency'
          ? `WAC booking requires base currency ${WAC_VALUATION_CURRENCY_CODE}; PO currency is ${details.currencyCode ?? 'unknown'}`
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
 * GRN/LP/grn_item writes (P1-08). No-op when the PO line carries no unit price
 * (unit_price = 0, the column default) — such a line books no value either way.
 */
export async function preflightReceiptWacResolvability(
  client: QueryClient,
  ctx: ReceiptWacContext,
  receipt: ReceiptWacPreflightInput,
): Promise<void> {
  const line = await loadLineUnitPrice(client, ctx.orgId, receipt.poLineId);
  if (!line) return;

  await assertWacUomResolvable(
    client,
    {
      itemId: line.item_id,
      qty: receipt.qty,
      uom: receipt.uom,
    },
    line.unit_price,
  );
}

export async function bookReceiptWacAfterGrnItem(
  client: QueryClient,
  ctx: ReceiptWacContext,
  receipt: ReceiptWacInput,
): Promise<void> {
  const line = await loadLineUnitPrice(client, ctx.orgId, receipt.poLineId);
  if (!line) return;

  const wacResolution = await assertWacUomResolvable(
    client,
    {
      itemId: line.item_id,
      qty: receipt.qty,
      uom: receipt.uom,
    },
    line.unit_price,
  );
  if (!wacResolution.resolved) {
    // Only reachable for a free line (assertWacUomResolvable throws on priced ones):
    // there is no value to book, so record the exclusion the reversal path already
    // understands (isWacExcluded) instead of writing a contribution that never happened.
    //
    // The EXPLICIT ZERO matters as much as the marker. Receipt cancellation takes its
    // snapshot branch only when wac_qty_kg/wac_value are both present, and otherwise
    // falls back to re-deriving the contribution from TODAY's item master — which by
    // then may carry the conversion factor that was missing at receipt time. That
    // fallback subtracts value the pool never received. A zero snapshot reverses to
    // zero, which is the truth for a receipt that booked nothing.
    await writeGrnItemWacExt(client, ctx, receipt.grnItemId, {
      wac_excluded: 'unresolved_uom',
      wac_qty_kg: '0',
      wac_value: '0',
    });
    return;
  }

  const receivedQtyKg = wacResolution.qtyKg;
  const receivedValue = await multiplyNumeric(client, receipt.qty, line.unit_price);
  const poCurrencyCode = parsePoCurrencyCode(line.currency);
  await assertResolvableCurrency(client, poCurrencyCode);
  if (poCurrencyCode !== WAC_VALUATION_CURRENCY_CODE) {
    throw new BookReceiptWacError('unsupported_currency', { currencyCode: poCurrencyCode });
  }
  const wacCurrencyCode = WAC_VALUATION_CURRENCY_CODE;
  const wac = await upsertWac(client, {
    orgId: ctx.orgId,
    siteId: ctx.siteId,
    itemId: line.item_id,
    deltaQtyKg: receivedQtyKg,
    deltaValue: receivedValue,
    updatedBy: ctx.userId,
    currencyCode: wacCurrencyCode,
  });
  // Snapshot what the POOL TOOK, not what we asked it to take. A gram-scale
  // receipt quantizes to zero against numeric(14,3) and contributes nothing; a
  // snapshot of the requested amount would let cancellation subtract value that
  // was never added, breaking the valuation in the opposite direction.
  await writeGrnItemWacExt(client, ctx, receipt.grnItemId, {
    wac_qty_kg: wac.appliedQtyKg ?? receivedQtyKg,
    wac_value: wac.appliedValue ?? receivedValue,
    wac_currency_code: wacCurrencyCode,
  });
}

async function writeGrnItemWacExt(
  client: QueryClient,
  ctx: ReceiptWacContext,
  grnItemId: string,
  ext: Record<string, string>,
): Promise<void> {
  await client.query(
    `update public.grn_items
        set ext_jsonb = coalesce(ext_jsonb, '{}'::jsonb) || $3::jsonb,
            updated_by = $2::uuid,
            updated_at = now()
      where org_id = $1::uuid
          and id = $4::uuid`,
    [ctx.orgId, ctx.userId, JSON.stringify(ext), grnItemId],
  );
}

async function assertWacUomResolvable(
  client: QueryClient,
  receipt: { itemId: string; qty: string; uom: string },
  // NOT NULL DEFAULT 0 in the schema; `?? ''` only keeps a malformed row on the blocking side.
  unitPrice: string | null | undefined,
): Promise<WacDeltaQtyKgResolution> {
  const wacResolution = await resolveWacDeltaQtyKg(client, {
    itemId: receipt.itemId,
    qty: receipt.qty,
    uom: receipt.uom,
  });
  if (!wacResolution.resolved && !isZeroDecimalString(unitPrice ?? '')) {
    // PO receipts with a unit price are WAC-governed: block unvalued stock rather than
    // committing inventory while silently skipping valuation (P1-08).
    //
    // A free line (unit_price = 0, the column default) books qty × 0 = 0 value, so an
    // unconvertible UoM costs the valuation nothing — blocking it protected nothing and
    // only made the goods unreceivable. This is the no-op this function has always
    // documented but never implemented, because unit_price is NOT NULL DEFAULT 0 and the
    // old `if (!line) return` guard could only ever fire for a missing line row (R07-03).
    throw new BookReceiptWacError('unresolved_uom', { uom: receipt.uom, qty: receipt.qty });
  }
  return wacResolution;
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

function parsePoCurrencyCode(currency: string | null | undefined): string {
  const normalized = currency?.trim().toUpperCase();
  if (!normalized || normalized.length !== 3) {
    throw new BookReceiptWacError('unknown_currency', { currencyCode: currency ?? undefined });
  }
  return normalized;
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

export type UnvaluablePoLine = {
  lineNo: number;
  itemCode: string;
  uom: string;
  /** Item-master field that would make this line's UoM convertible to kg. */
  missingField: 'net_qty_per_each' | 'each_per_box' | 'kg_conversion';
};

type PricedPoLineRow = {
  item_id: string;
  line_no: number;
  item_code: string | null;
  qty: string;
  uom: string;
  net_qty_per_each: string | null;
};

/**
 * PO-confirm gate (R07-03): a priced line whose UoM cannot be converted to kg can be
 * ordered today and only fails at physical receipt, when the goods are already on the
 * dock and no GRN can be written. Reject it while the order can still be corrected.
 *
 * Runs the same resolver as the receipt path, so it can only reject lines the receipt
 * would have rejected anyway — it cannot block a UoM that works today. Free lines
 * (unit_price = 0) are never gated: they book no value, so they stay receivable.
 */
export async function findUnvaluablePricedPoLines(
  client: QueryClient,
  orgId: string,
  poId: string,
): Promise<UnvaluablePoLine[]> {
  const { rows } = await client.query<PricedPoLineRow>(
    `select pol.item_id::text as item_id,
            pol.line_no,
            i.item_code,
            pol.qty::text as qty,
            pol.uom,
            i.net_qty_per_each::text as net_qty_per_each
       from public.purchase_order_lines pol
       left join public.items i
         on i.org_id = pol.org_id
        and i.id = pol.item_id
      where pol.org_id = $1::uuid
        and pol.po_id = $2::uuid
        and pol.unit_price > 0
      order by pol.line_no asc`,
    [orgId, poId],
  );

  const blocked: UnvaluablePoLine[] = [];
  for (const row of rows) {
    // ponytail: one resolver call per priced line (a PO carries a handful). Reusing the
    // receipt resolver is exactly what stops confirm and receipt disagreeing again.
    const resolution = await resolveWacDeltaQtyKg(client, {
      itemId: row.item_id,
      qty: row.qty,
      uom: row.uom,
    });
    if (resolution.resolved) continue;
    blocked.push({
      lineNo: Number(row.line_no),
      itemCode: row.item_code ?? '',
      uom: row.uom,
      missingField: missingWacPackFactor(row.uom, row.net_qty_per_each),
    });
  }
  return blocked;
}

/** Names the item-master field the WAC resolver looked for and did not find. */
function missingWacPackFactor(uom: string, netQtyPerEach: string | null): UnvaluablePoLine['missingField'] {
  const wacUom = pieceUomToWacEach(uom)?.toLowerCase();
  if (wacUom === 'each') return 'net_qty_per_each';
  if (wacUom === 'box') return netQtyPerEach == null ? 'net_qty_per_each' : 'each_per_box';
  return 'kg_conversion';
}

/** Named reason for the PO-confirm rejection — points at the missing master-data field. */
export function describeUnvaluablePoLines(lines: readonly UnvaluablePoLine[]): string {
  return lines
    .map((line) =>
      line.missingField === 'kg_conversion'
        ? `line ${line.lineNo} (${line.itemCode}): UoM "${line.uom}" has no conversion to kg for costing`
        : `line ${line.lineNo} (${line.itemCode}): UoM "${line.uom}" needs items.${line.missingField} to convert to kg`,
    )
    .join('; ');
}

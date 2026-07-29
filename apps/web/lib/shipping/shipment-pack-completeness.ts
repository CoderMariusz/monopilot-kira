import { microToFixed, toMicro } from '../shared/decimal';

/** Postgres shipment / SO qty columns (numeric(14,3)). */
export const SHIPMENT_QTY_SCALE = 3;

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type PackCompletenessLine = {
  lineId: string;
  uom: string;
  requiredQty: string;
  packedQty: string;
  remainingQty: string;
};

export type PackCompletenessUomRollup = {
  uom: string;
  requiredQty: string;
  packedQty: string;
  remainingQty: string;
};

export type PackCompletenessSummary = {
  complete: boolean;
  /** Per-UoM display — never sums unlike units into one number. */
  requiredDisplay: string;
  packedDisplay: string;
  remainingDisplay: string;
  /** Aliases for callers that still read *Total field names. */
  requiredTotal: string;
  packedTotal: string;
  remainingTotal: string;
  uomRollups: PackCompletenessUomRollup[];
  /** Picked lines missing inventory UoM — excluded from cross-line qty totals. */
  skippedLineCount: number;
  lines: PackCompletenessLine[];
};

function normalizeQty(value: string): string {
  return microToFixed(toMicro(value), SHIPMENT_QTY_SCALE);
}

function addQty(a: string, b: string): string {
  return microToFixed(toMicro(a) + toMicro(b), SHIPMENT_QTY_SCALE);
}

function subQty(a: string, b: string): string {
  const diff = toMicro(a) - toMicro(b);
  return diff <= 0n ? '0' : microToFixed(diff, SHIPMENT_QTY_SCALE);
}

function qtyIsZero(value: string): boolean {
  return toMicro(value) <= 0n;
}

function qtysEqual(a: string, b: string): boolean {
  return normalizeQty(a) === normalizeQty(b);
}

function normalizeUom(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '—';
}

/** Human-readable per-UoM totals — never sums unlike units into one number. */
export function formatShipmentQtyByUom(
  rows: readonly { uom: string; qty: string }[],
): string {
  const visible = rows.filter((row) => !qtyIsZero(row.qty));
  if (visible.length === 0) return '0';
  return visible.map((row) => `${row.qty} ${row.uom}`).join(' · ');
}

/**
 * A shipment is completely packed when:
 * 1. At least one SO line has quantity_picked > 0, and
 * 2. For every line (picked or packed), sum(box contents.quantity) equals quantity_picked
 *    exactly in inventory UoM (numeric 14,3).
 */
export function assessPackCompleteness(
  requiredByLine: readonly { lineId: string; qty: string; uom: string }[],
  packedByLine: readonly { lineId: string; qty: string }[],
): PackCompletenessSummary {
  const packedMap = new Map<string, string>();
  for (const row of packedByLine) {
    const prior = packedMap.get(row.lineId) ?? '0';
    packedMap.set(row.lineId, addQty(prior, row.qty));
  }

  const requiredMap = new Map<string, { qty: string; uom: string }>();
  for (const row of requiredByLine) {
    requiredMap.set(row.lineId, {
      qty: normalizeQty(row.qty),
      uom: normalizeUom(row.uom),
    });
  }

  const lineIds = new Set<string>([...requiredMap.keys(), ...packedMap.keys()]);
  const lines: PackCompletenessLine[] = [];
  let complete = requiredByLine.some((row) => !qtyIsZero(row.qty));
  let skippedLineCount = 0;

  for (const lineId of lineIds) {
    const required = requiredMap.get(lineId);
    const requiredQty = required?.qty ?? '0';
    const uom = required?.uom ?? '—';
    const packedQty = normalizeQty(packedMap.get(lineId) ?? '0');
    const remainingQty = subQty(requiredQty, packedQty);

    if (uom === '—' && (!qtyIsZero(requiredQty) || !qtyIsZero(remainingQty))) {
      skippedLineCount += 1;
    }

    lines.push({ lineId, uom, requiredQty, packedQty, remainingQty });

    if (!qtysEqual(requiredQty, packedQty)) {
      complete = false;
    }
  }

  if (!requiredByLine.some((row) => !qtyIsZero(row.qty))) {
    complete = false;
  }

  const rollupMap = new Map<string, { required: string; packed: string; remaining: string }>();
  for (const line of lines) {
    if (line.uom === '—') continue;
    const prior = rollupMap.get(line.uom) ?? { required: '0', packed: '0', remaining: '0' };
    rollupMap.set(line.uom, {
      required: addQty(prior.required, line.requiredQty),
      packed: addQty(prior.packed, line.packedQty),
      remaining: addQty(prior.remaining, line.remainingQty),
    });
  }

  const uomRollups: PackCompletenessUomRollup[] = [...rollupMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([uom, totals]) => ({
      uom,
      requiredQty: totals.required,
      packedQty: totals.packed,
      remainingQty: totals.remaining,
    }));

  const requiredDisplay = formatShipmentQtyByUom(
    uomRollups.map((row) => ({ uom: row.uom, qty: row.requiredQty })),
  );
  const packedDisplay = formatShipmentQtyByUom(
    uomRollups.map((row) => ({ uom: row.uom, qty: row.packedQty })),
  );
  const remainingRollups = uomRollups.filter((row) => !qtyIsZero(row.remainingQty));
  const remainingDisplay = complete
    ? '0'
    : formatShipmentQtyByUom(
        remainingRollups.map((row) => ({ uom: row.uom, qty: row.remainingQty })),
      ) || '0';

  return {
    complete,
    requiredDisplay,
    packedDisplay,
    remainingDisplay,
    requiredTotal: requiredDisplay,
    packedTotal: packedDisplay,
    remainingTotal: remainingDisplay,
    uomRollups,
    skippedLineCount,
    lines,
  };
}

export async function fetchShipmentPackCompleteness(
  client: QueryClient,
  shipmentId: string,
  salesOrderId: string,
): Promise<PackCompletenessSummary> {
  const [{ rows: requiredRows }, { rows: packedRows }] = await Promise.all([
    client.query<{ line_id: string; required_qty: string; uom: string }>(
      `select sol.id::text as line_id,
              sol.quantity_picked::text as required_qty,
              coalesce(nullif(trim(i.uom_base), ''), '—') as uom
         from public.sales_order_lines sol
         left join public.items i
           on i.id = sol.product_id
          and i.org_id = app.current_org_id()
        where sol.org_id = app.current_org_id()
          and sol.sales_order_id = $1::uuid
          and sol.deleted_at is null
          and sol.quantity_picked > 0`,
      [salesOrderId],
    ),
    client.query<{ line_id: string; packed_qty: string }>(
      `select sbc.sales_order_line_id::text as line_id,
              coalesce(sum(sbc.quantity), 0)::text as packed_qty
         from public.shipment_box_contents sbc
         join public.shipment_boxes sb
           on sb.id = sbc.shipment_box_id
          and sb.org_id = app.current_org_id()
          and sb.deleted_at is null
        where sbc.org_id = app.current_org_id()
          and sbc.deleted_at is null
          and sb.shipment_id = $1::uuid
        group by sbc.sales_order_line_id`,
      [shipmentId],
    ),
  ]);

  return assessPackCompleteness(
    requiredRows.map((row) => ({
      lineId: row.line_id,
      qty: row.required_qty,
      uom: row.uom,
    })),
    packedRows.map((row) => ({ lineId: row.line_id, qty: row.packed_qty })),
  );
}

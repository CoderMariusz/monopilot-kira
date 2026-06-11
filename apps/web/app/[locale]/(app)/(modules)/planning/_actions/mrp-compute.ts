/**
 * W9-M2 — MRP read-first netting core (pure, unit-tested, no I/O).
 *
 * Netting formula per item (all quantities normalized to the item's BASE UoM):
 *
 *   netPosition = onHand − reserved + openSupply − demand
 *
 *   onHand     = Σ v_inventory_available.quantity        (status=available, qa released)
 *   reserved   = Σ v_inventory_available.reserved_qty    (same view; see caveat below)
 *   openSupply = Σ open-PO line remainder (qty − received via grn_items, non-cancelled GRNs)
 *              + Σ schedule_outputs.expected_qty of open WOs (disposition='to_stock')
 *   demand     = Σ greatest(wo_materials.required_qty − consumed_qty, 0)
 *                across WOs in DRAFT / RELEASED / IN_PROGRESS
 *
 * Caveats (documented, read-first slice — nothing is persisted):
 *   - v_inventory_available filters available_qty > 0, so a fully-reserved LP is
 *     invisible: onHand and reserved are understated by the SAME amount — the net
 *     position is unaffected (onHand − reserved ≡ Σ available_qty).
 *   - An IN_PROGRESS WO that already registered output counts its full
 *     expected_qty as open supply while the registered output is also on-hand as
 *     an LP — a transient over-statement until the WO completes (wo_outputs is
 *     08-production canonical; this slice does not join it).
 *   - UoM handling: a source row is netted only when its uom equals the item's
 *     uom_base, OR it is 'each'/'box' and the item's pack hierarchy (mig 267:
 *     net_qty_per_each / each_per_box) cleanly converts it to base (same factor
 *     semantics as apps/web/lib/uom/convert.ts: missing/zero/negative factor →
 *     no conversion). Anything else is EXCLUDED from the math and surfaced per
 *     row in `excludedUoms` — never silently mixed.
 *
 * NUMERIC exactness (Codex batch-D F1): NUMERIC decimal strings are NEVER netted
 * with JS float arithmetic. Every quantity is parsed into micro-unit bigints
 * (lib/shared/decimal.ts, scale 6 — the K-II transfer-orders pattern), all
 * netting/aggregation runs on bigints, and values are formatted back to 3-dp
 * decimal strings only at the edge.
 *
 * Suggested action: BUY for rm / ingredient / packaging, MAKE for intermediate;
 * suggested qty = shortage rounded UP to whole base units.
 */
import {
  MICRO_SCALE,
  ceilMicroToWholeUnits,
  microToFixed,
  mulMicro,
  toMicro,
} from '../../../../../../lib/shared/decimal';

/** Item master row (mig 153 + pack hierarchy mig 267). */
export type MrpItemRow = {
  id: string;
  item_code: string;
  name: string;
  item_type: string;
  uom_base: string;
  output_uom: string | null;
  net_qty_per_each: string | number | null;
  each_per_box: string | number | null;
};

/** Generic per-(item, uom) quantity bucket returned by the grouped SQL reads. */
export type MrpQtyBucket = {
  product_id: string;
  uom: string;
  qty: string | number;
};

/** On-hand bucket — carries both quantity and reserved from the FEFO view. */
export type MrpOnHandBucket = {
  product_id: string;
  uom: string;
  on_hand: string | number;
  reserved: string | number;
};

export type MrpSeverity = 'shortage' | 'at_risk' | 'covered';

export type MrpRow = {
  itemId: string;
  itemCode: string;
  itemName: string;
  itemType: string;
  uomBase: string;
  /** Decimal strings (3 dp) in the item's base UoM. */
  onHand: string;
  reserved: string;
  openSupply: string;
  demand: string;
  net: string;
  severity: MrpSeverity;
  /** null when no shortage. qty = shortage rounded up to whole base units. */
  suggestedAction: { type: 'buy' | 'make'; qty: string } | null;
  /** UoMs whose quantities could NOT be netted (no clean base conversion). */
  excludedUoms: string[];
};

export type MrpKpis = {
  itemsAnalyzed: number;
  itemsShort: number;
  /** Σ demand across items, each in its own base UoM (indicator only — mixed bases). */
  totalDemand: string;
  /** Demand-weighted coverage: (1 − Σshortage/Σdemand) × 100, capped 0..100. */
  coveragePct: number;
};

export type MrpComputeResult = { rows: MrpRow[]; kpis: MrpKpis };

/** All accumulator quantities are exact micro-unit bigints (scale 6). */
type Acc = {
  onHand: bigint;
  reserved: bigint;
  openSupply: bigint;
  demand: bigint;
  excludedUoms: Set<string>;
  touched: boolean;
};

/** Pack factor as positive micro-units, or null when unusable (→ excluded). */
function packFactorMicro(value: string | number | null): bigint | null {
  if (value === null || value === undefined || value === '') return null;
  const micro = toMicro(value);
  return micro > 0n ? micro : null;
}

/**
 * Normalize one bucket qty (micro-units) into the item's base UoM — exact
 * bigint arithmetic end-to-end. Returns null when the uom cannot be cleanly
 * converted (→ excluded). Factor semantics mirror lib/uom/convert.ts
 * requireFactor: missing / non-numeric / ≤ 0 → no conversion.
 */
export function normalizeToBaseMicro(
  item: MrpItemRow,
  uom: string,
  qtyMicro: bigint,
): bigint | null {
  if (uom === item.uom_base) return qtyMicro;
  if (uom === 'base') return qtyMicro;
  if (uom === 'each' || uom === 'box') {
    const netPerEach = packFactorMicro(item.net_qty_per_each);
    if (netPerEach === null) return null;
    if (uom === 'each') return mulMicro(qtyMicro, netPerEach);
    const eachPerBox = packFactorMicro(item.each_per_box);
    if (eachPerBox === null) return null;
    // box → each first (each_per_box is typically integral → exact), then → base.
    return mulMicro(mulMicro(qtyMicro, eachPerBox), netPerEach);
  }
  return null;
}

/**
 * Number-facing wrapper kept for existing callers/tests; the netting core uses
 * normalizeToBaseMicro directly so no float ever enters the accumulation.
 */
export function normalizeToBase(item: MrpItemRow, uom: string, qty: number): number | null {
  const micro = normalizeToBaseMicro(item, uom, toMicro(qty));
  return micro === null ? null : Number(micro) / Number(MICRO_SCALE);
}

const SEVERITY_RANK: Record<MrpSeverity, number> = { shortage: 0, at_risk: 1, covered: 2 };

export function computeMrp(input: {
  items: MrpItemRow[];
  onHand: MrpOnHandBucket[];
  demand: MrpQtyBucket[];
  poSupply: MrpQtyBucket[];
  productionSupply: MrpQtyBucket[];
}): MrpComputeResult {
  const itemById = new Map<string, MrpItemRow>();
  for (const item of input.items) itemById.set(item.id, item);

  const accById = new Map<string, Acc>();
  const accFor = (itemId: string): Acc => {
    let acc = accById.get(itemId);
    if (!acc) {
      acc = { onHand: 0n, reserved: 0n, openSupply: 0n, demand: 0n, excludedUoms: new Set(), touched: false };
      accById.set(itemId, acc);
    }
    return acc;
  };

  const apply = (
    buckets: MrpQtyBucket[],
    assign: (acc: Acc, baseQtyMicro: bigint) => void,
  ): void => {
    for (const bucket of buckets) {
      const item = itemById.get(bucket.product_id);
      if (!item) continue; // not an MRP-planned item type (fg etc.) — out of scope
      const acc = accFor(item.id);
      const qty = toMicro(bucket.qty);
      if (qty === 0n) continue;
      const base = normalizeToBaseMicro(item, bucket.uom, qty);
      if (base === null) {
        acc.excludedUoms.add(bucket.uom);
        acc.touched = true;
        continue;
      }
      assign(acc, base);
      acc.touched = true;
    }
  };

  // On-hand carries two quantities per bucket — normalize each with the same rule.
  for (const bucket of input.onHand) {
    const item = itemById.get(bucket.product_id);
    if (!item) continue;
    const acc = accFor(item.id);
    const onHandQty = toMicro(bucket.on_hand);
    const reservedQty = toMicro(bucket.reserved);
    if (onHandQty === 0n && reservedQty === 0n) continue;
    const onHandBase = normalizeToBaseMicro(item, bucket.uom, onHandQty);
    if (onHandBase === null) {
      acc.excludedUoms.add(bucket.uom);
      acc.touched = true;
      continue;
    }
    const reservedBase = normalizeToBaseMicro(item, bucket.uom, reservedQty) ?? 0n;
    acc.onHand += onHandBase;
    acc.reserved += reservedBase;
    acc.touched = true;
  }

  apply(input.demand, (acc, q) => {
    acc.demand += q;
  });
  apply(input.poSupply, (acc, q) => {
    acc.openSupply += q;
  });
  apply(input.productionSupply, (acc, q) => {
    acc.openSupply += q;
  });

  const rows: MrpRow[] = [];
  let itemsShort = 0;
  let totalDemand = 0n;
  let totalShortage = 0n;

  for (const [itemId, acc] of accById) {
    if (!acc.touched) continue;
    const item = itemById.get(itemId);
    if (!item) continue;

    // Exact bigint netting — no EPS needed (no float dust to tolerate).
    const net = acc.onHand - acc.reserved + acc.openSupply - acc.demand;
    const isShort = net < 0n;
    const available = acc.onHand - acc.reserved;
    const severity: MrpSeverity = isShort
      ? 'shortage'
      : acc.demand > 0n && available < acc.demand
        ? 'at_risk'
        : 'covered';

    if (isShort) {
      itemsShort += 1;
      const shortage = -net;
      totalShortage += shortage < acc.demand ? shortage : acc.demand;
    }
    totalDemand += acc.demand;

    const suggestedAction = isShort
      ? {
          type: item.item_type === 'intermediate' ? ('make' as const) : ('buy' as const),
          qty: ceilMicroToWholeUnits(-net).toString(),
        }
      : null;

    rows.push({
      itemId,
      itemCode: item.item_code,
      itemName: item.name,
      itemType: item.item_type,
      uomBase: item.uom_base,
      onHand: microToFixed(acc.onHand, 3),
      reserved: microToFixed(acc.reserved, 3),
      openSupply: microToFixed(acc.openSupply, 3),
      demand: microToFixed(acc.demand, 3),
      net: microToFixed(net, 3),
      severity,
      suggestedAction,
      excludedUoms: [...acc.excludedUoms].sort(),
    });
  }

  rows.sort((a, b) => {
    const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rank !== 0) return rank;
    const net = Number(a.net) - Number(b.net);
    if (net !== 0) return net;
    return a.itemCode.localeCompare(b.itemCode);
  });

  // Demand-weighted coverage, exact until the final 1-dp rounding:
  // covered/demand × 1000 (rounded) → ÷10 gives the percentage with one decimal.
  // totalShortage ≤ totalDemand by construction (per-item min), so 0..100 holds.
  let coveragePct = 100;
  if (totalDemand > 0n) {
    const covered = totalDemand - totalShortage;
    const clamped = covered < 0n ? 0n : covered;
    const pctTimes10 = (clamped * 1000n + totalDemand / 2n) / totalDemand;
    coveragePct = Number(pctTimes10) / 10;
  }

  return {
    rows,
    kpis: {
      itemsAnalyzed: rows.length,
      itemsShort,
      totalDemand: microToFixed(totalDemand, 3),
      coveragePct,
    },
  };
}

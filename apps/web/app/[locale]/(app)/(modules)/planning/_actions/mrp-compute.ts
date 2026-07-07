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
 *   demand     = Σ greatest(wo_materials.required_qty − consumed_qty, 0)   (DEPENDENT)
 *                across WOs in DRAFT / RELEASED / IN_PROGRESS
 *              + Σ demand_forecasts.qty (mig 302, base UoM) for the run horizon  (INDEPENDENT)
 *                — independent/forecast demand entered on /planning/forecasts
 *              + Σ open sales_order_lines remainder (ordered − shipped) on post-confirm,
 *                pre-ship SOs whose need-by date falls within the planning horizon
 *                (INDEPENDENT — confirmed sales-order demand, NN-PLAN-4)
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
 *
 * Reorder thresholds (mig 178 reorder_thresholds, CL2 slice 2) — reorder-point
 * semantics derived from the DDL (min_qty + reorder_qty per (org, item), both
 * NUMERIC(18,6) >= 0, preferred_supplier_id a soft FK to suppliers):
 *   - min_qty      = the floor the projected net position must not fall below.
 *   - reorder_qty  = the configured replenishment lot (0 = no fixed lot;
 *                    "just top up to min").
 *   - net <  0                          → 'shortage' (red), unchanged.
 *   - net >= 0 and 0 < net < min_qty,
 *     or net == 0 with min_qty > 0      → 'below_min' (amber — its own severity,
 *                    distinct from the red shortage badge AND from 'at_risk').
 *   - Suggested qty WITH a threshold    = ceil(max(min_qty − net, reorder_qty))
 *     (top back up to the floor, never less than the configured lot). Without
 *     a threshold the existing rule holds: ceil(−net) on shortage only.
 *   - Suggested due date = today + suppliers.lead_time_days (mig 261) ONLY when
 *     preferred_supplier_id resolves to a supplier row; otherwise null (honest —
 *     we never invent a lead time).
 *   - An item with min_qty > 0 but NO stock/demand/supply anywhere still
 *     surfaces as below_min (net 0 < min) — that is the point of the floor.
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

/** reorder_thresholds row (mig 178) + the preferred supplier's lead time (mig 261 soft join). */
export type MrpThresholdRow = {
  item_id: string;
  min_qty: string | number;
  reorder_qty: string | number;
  preferred_supplier_id: string | null;
  /** suppliers.lead_time_days resolved via preferred_supplier_id; null when unset/unresolved. */
  lead_time_days: number | null;
};

export type MrpSeverity = 'shortage' | 'below_min' | 'at_risk' | 'covered';

export type MrpSuggestedAction = {
  type: 'buy' | 'make';
  /** Whole base units, rounded up. */
  qty: string;
  /** today + suppliers.lead_time_days when a preferred supplier resolves; else null. */
  dueDate: string | null;
  /** reorder_thresholds.preferred_supplier_id when set; else null. */
  supplierId: string | null;
};

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
  /**
   * Portion of `demand` coming from demand_forecasts (independent demand, mig 302).
   * 3-dp base-UoM string; '0.000' when no forecast contributed. When > 0 the
   * persisted requirement row is tagged source_type='independent' (mig 178).
   */
  forecastDemand: string;
  /**
   * Portion of `demand` coming from open sales orders (independent demand, NN-PLAN-4).
   * 3-dp base-UoM string; '0.000' when no SO contributed. When > 0 the persisted
   * requirement row is tagged source_type='independent' (mig 178).
   */
  soDemand: string;
  net: string;
  severity: MrpSeverity;
  /** null when nothing to do (covered / at_risk with no threshold breach). */
  suggestedAction: MrpSuggestedAction | null;
  /** min_qty from reorder_thresholds (3-dp string) when configured; else null. */
  minQty: string | null;
  /** UoMs whose quantities could NOT be netted (no clean base conversion). */
  excludedUoms: string[];
};

export type MrpKpis = {
  itemsAnalyzed: number;
  itemsShort: number;
  /** Items with net >= 0 that still sit below their configured min_qty floor. */
  itemsBelowMin: number;
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
  /** Sub-total of `demand` that came from demand_forecasts (independent demand). */
  forecastDemand: bigint;
  /** Sub-total of `demand` that came from open sales orders (independent demand). */
  soDemand: bigint;
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

const SEVERITY_RANK: Record<MrpSeverity, number> = {
  shortage: 0,
  below_min: 1,
  at_risk: 2,
  covered: 3,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** today (yyyy-mm-dd) + N days, UTC-safe. */
function addDaysIso(todayIso: string, days: number): string {
  const base = new Date(`${todayIso}T00:00:00Z`);
  return new Date(base.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function computeMrp(input: {
  items: MrpItemRow[];
  onHand: MrpOnHandBucket[];
  demand: MrpQtyBucket[];
  /** Independent demand from demand_forecasts (mig 302), already summed per item in base UoM. */
  forecastDemand?: MrpQtyBucket[];
  /** Independent demand from open sales orders (NN-PLAN-4), grouped per (item, uom). */
  soDemand?: MrpQtyBucket[];
  poSupply: MrpQtyBucket[];
  productionSupply: MrpQtyBucket[];
  /** reorder_thresholds (mig 178) joined with supplier lead times; optional. */
  thresholds?: MrpThresholdRow[];
  /** Reference date (yyyy-mm-dd) for due-date math — injectable for tests. */
  today?: string;
}): MrpComputeResult {
  const itemById = new Map<string, MrpItemRow>();
  for (const item of input.items) itemById.set(item.id, item);

  const todayIso = input.today ?? new Date().toISOString().slice(0, 10);
  const thresholdByItem = new Map<string, MrpThresholdRow>();
  for (const t of input.thresholds ?? []) {
    if (itemById.has(t.item_id)) thresholdByItem.set(t.item_id, t);
  }

  const accById = new Map<string, Acc>();
  const accFor = (itemId: string): Acc => {
    let acc = accById.get(itemId);
    if (!acc) {
      acc = {
        onHand: 0n,
        reserved: 0n,
        openSupply: 0n,
        demand: 0n,
        forecastDemand: 0n,
        soDemand: 0n,
        excludedUoms: new Set(),
        touched: false,
      };
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
  // Independent (forecast) demand — same base-UoM netting as dependent WO demand,
  // but also tracked separately so the persisted requirement can be attributed.
  apply(input.forecastDemand ?? [], (acc, q) => {
    acc.demand += q;
    acc.forecastDemand += q;
  });
  apply(input.soDemand ?? [], (acc, q) => {
    acc.demand += q;
    acc.soDemand += q;
  });
  apply(input.poSupply, (acc, q) => {
    acc.openSupply += q;
  });
  apply(input.productionSupply, (acc, q) => {
    acc.openSupply += q;
  });

  // A configured floor surfaces its item even with zero stock/demand/supply —
  // net 0 < min_qty is exactly what the Material Demand dashboard must show.
  for (const [itemId, t] of thresholdByItem) {
    if (toMicro(t.min_qty) > 0n) accFor(itemId).touched = true;
  }

  const rows: MrpRow[] = [];
  let itemsShort = 0;
  let itemsBelowMin = 0;
  let totalDemand = 0n;
  let totalShortage = 0n;

  for (const [itemId, acc] of accById) {
    if (!acc.touched) continue;
    const item = itemById.get(itemId);
    if (!item) continue;

    const threshold = thresholdByItem.get(itemId) ?? null;
    const minQty = threshold ? toMicro(threshold.min_qty) : 0n;
    const reorderQty = threshold ? toMicro(threshold.reorder_qty) : 0n;

    // Exact bigint netting — no EPS needed (no float dust to tolerate).
    const net = acc.onHand - acc.reserved + acc.openSupply - acc.demand;
    const isShort = net < 0n;
    const isBelowMin = !isShort && minQty > 0n && net < minQty;
    const available = acc.onHand - acc.reserved;
    const severity: MrpSeverity = isShort
      ? 'shortage'
      : isBelowMin
        ? 'below_min'
        : acc.demand > 0n && available < acc.demand
          ? 'at_risk'
          : 'covered';

    if (isShort) {
      itemsShort += 1;
      const shortage = -net;
      totalShortage += shortage < acc.demand ? shortage : acc.demand;
    }
    if (isBelowMin) itemsBelowMin += 1;
    totalDemand += acc.demand;

    // Suggested qty: without a threshold, cover the shortage; with one, top
    // back up to the min_qty floor and never order less than the configured
    // reorder lot — ceil(max(min_qty − net, reorder_qty, −net)).
    let suggestedAction: MrpSuggestedAction | null = null;
    if (isShort || isBelowMin) {
      const gap = minQty - net > -net ? minQty - net : -net;
      const qtyMicro = gap > reorderQty ? gap : reorderQty;
      const leadDays = threshold?.preferred_supplier_id ? threshold.lead_time_days : null;
      suggestedAction = {
        type: item.item_type === 'intermediate' || item.item_type === 'fg' ? 'make' : 'buy',
        qty: ceilMicroToWholeUnits(qtyMicro).toString(),
        dueDate:
          leadDays !== null && leadDays !== undefined && Number.isFinite(leadDays)
            ? addDaysIso(todayIso, leadDays)
            : null,
        supplierId: threshold?.preferred_supplier_id ?? null,
      };
    }

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
      forecastDemand: microToFixed(acc.forecastDemand, 3),
      soDemand: microToFixed(acc.soDemand, 3),
      net: microToFixed(net, 3),
      severity,
      suggestedAction,
      minQty: threshold ? microToFixed(minQty, 3) : null,
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
      itemsBelowMin,
      totalDemand: microToFixed(totalDemand, 3),
      coveragePct,
    },
  };
}

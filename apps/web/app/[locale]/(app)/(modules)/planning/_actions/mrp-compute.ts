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
 *              + Σ schedule_outputs.expected_qty of RELEASED/IN_PROGRESS WOs (disposition='to_stock')
 *   demand     = Σ greatest(wo_materials.required_qty − consumed_qty, 0)   (DEPENDENT)
 *                across WOs in DRAFT / RELEASED / IN_PROGRESS
 *              + Σ demand_forecasts.qty (mig 302, base UoM) for the run horizon  (INDEPENDENT)
 *                — independent/forecast demand entered on /planning/forecasts
 *              + Σ open sales_order_lines remainder (ordered − shipped box aggregate) on
 *                post-confirm SOs whose need-by date falls within the planning horizon
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
 *   - Suggested qty WITH a threshold    = ceil(gap / reorder_qty) × reorder_qty
 *     when reorder_qty > 0 (fixed lot / lot multiple); else ceil(gap) whole
 *     units. gap = max(min_qty − net, −net). Without a threshold the existing
 *     rule holds: ceil(−net) on shortage only.
 *   - Suggested due date = today + suppliers.lead_time_days (mig 261) ONLY when
 *     preferred_supplier_id resolves to a supplier row; otherwise null (honest —
 *     we never invent a lead time).
 *   - An item with min_qty > 0 but NO stock/demand/supply anywhere still
 *     surfaces as below_min (net 0 < min) — that is the point of the floor.
 */
import {
  MICRO_SCALE,
  ceilGapToLotMultiple,
  formatSuggestedQty,
  microToFixed,
  mulMicro,
  toMicro,
} from '../../../../../../lib/shared/decimal';
import {
  addDaysIso,
  buildMrpBucketDates,
  dateToBucketIndex,
  isoWeekToBucketIndex,
  OUT_OF_HORIZON_BUCKET_INDEX,
} from './mrp-buckets';

/** Default weekly horizon — mirrors mrp.ts MRP_PLANNING_HORIZON_WEEKS. */
export const MRP_DEFAULT_HORIZON_WEEKS = 12;
export const MRP_BUCKET_DAYS = 7;

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

/** Demand / supply row dated for time-phased bucketing (yyyy-mm-dd). */
export type MrpTimedQtyBucket = MrpQtyBucket & {
  need_date: string;
};

/** Forecast demand keyed by ISO week (demand_forecasts.iso_week). */
export type MrpForecastQtyBucket = MrpQtyBucket & {
  iso_week: string;
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
  /** Bucket need-by date (shortage bucket) or today + lead time for single-bucket runs. */
  dueDate: string | null;
  /** Planned release date = dueDate − lead_time_days when lead time resolves; else null. */
  releaseDate?: string | null;
  /** True when lead time forces release before today — releaseDate is clamped to today. */
  isLate?: boolean;
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

/** Per-item per-bucket projected-available-balance ledger row. */
export type MrpBucketRequirement = {
  itemId: string;
  bucketDate: string;
  bucketIndex: number;
  grossRequirement: string;
  scheduledReceipts: string;
  projectedOnHand: string;
  netRequirement: string;
  forecastDemand: string;
  soDemand: string;
  dependentDemand: string;
  severity: MrpSeverity;
  suggestedAction: MrpSuggestedAction | null;
};

export type MrpComputeResult = {
  rows: MrpRow[];
  kpis: MrpKpis;
  bucketRequirements: MrpBucketRequirement[];
  bucketDates: string[];
};

/** One item × one weekly bucket in the time-phased netting ledger. */
export type MrpBucketRow = MrpRow & {
  bucketDate: string;
  bucketIndex: number;
  scheduledReceipts: string;
  grossRequirement: string;
  projectedAvailable: string;
};

export type MrpPhasedComputeResult = MrpComputeResult & {
  bucketRows: MrpBucketRow[];
};

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
    // back up to the min_qty floor and round up to the configured lot multiple.
    let suggestedAction: MrpSuggestedAction | null = null;
    if (isShort || isBelowMin) {
      const gap = minQty - net > -net ? minQty - net : -net;
      const qtyMicro = ceilGapToLotMultiple(gap, reorderQty);
      const leadDays = threshold?.preferred_supplier_id ? threshold.lead_time_days : null;
      suggestedAction = {
        type: item.item_type === 'intermediate' || item.item_type === 'fg' ? 'make' : 'buy',
        qty: formatSuggestedQty(qtyMicro),
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
    bucketRequirements: [],
    bucketDates: [],
  };
}

type BucketAcc = {
  demand: bigint;
  forecastDemand: bigint;
  soDemand: bigint;
  scheduledReceipts: bigint;
  excludedUoms: Set<string>;
  touched: boolean;
};

function worstSeverity(a: MrpSeverity, b: MrpSeverity): MrpSeverity {
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;
}

function buildSuggestedAction(
  item: MrpItemRow,
  threshold: MrpThresholdRow | null,
  minQty: bigint,
  reorderQty: bigint,
  net: bigint,
  isShort: boolean,
  isBelowMin: boolean,
  bucketDate: string,
  leadDays: number | null,
  todayIso: string,
  singleBucketMode: boolean,
): MrpSuggestedAction | null {
  if (!isShort && !isBelowMin) return null;
  const gap = minQty - net > -net ? minQty - net : -net;
  const qtyMicro = ceilGapToLotMultiple(gap, reorderQty);
  const hasLead = leadDays !== null && leadDays !== undefined && Number.isFinite(leadDays);
  let dueDate =
    singleBucketMode && hasLead ? addDaysIso(todayIso, leadDays!) : bucketDate;
  if (dueDate < todayIso) {
    dueDate = todayIso;
  }
  let releaseDate: string | null = null;
  let isLate = false;
  if (hasLead) {
    const rawRelease = addDaysIso(dueDate, -leadDays!);
    if (rawRelease < todayIso) {
      releaseDate = todayIso;
      isLate = true;
    } else {
      releaseDate = rawRelease;
    }
  } else if (bucketDate < todayIso) {
    releaseDate = todayIso;
    isLate = true;
  }
  return {
    type: item.item_type === 'intermediate' || item.item_type === 'fg' ? 'make' : 'buy',
    qty: formatSuggestedQty(qtyMicro),
    dueDate: hasLead || !singleBucketMode ? dueDate : null,
    ...(releaseDate ? { releaseDate } : {}),
    ...(isLate ? { isLate } : {}),
    supplierId: threshold?.preferred_supplier_id ?? null,
  };
}

/**
 * Time-phased MRP: bucket gross demand + scheduled receipts per ISO week, roll
 * projected-available-balance forward, and peg planned-order releases to the
 * shortage bucket minus supplier lead time.
 *
 * When `horizonWeeks` is 1 every dated input lands in the sole bucket and the
 * rolled-up `rows` match `computeMrp` for the same totals (invariance).
 */
export function computeMrpPhased(input: {
  items: MrpItemRow[];
  onHand: MrpOnHandBucket[];
  demand: MrpTimedQtyBucket[];
  forecastDemand?: MrpForecastQtyBucket[];
  soDemand?: MrpTimedQtyBucket[];
  poSupply: MrpTimedQtyBucket[];
  productionSupply: MrpTimedQtyBucket[];
  thresholds?: MrpThresholdRow[];
  today?: string;
  horizonWeeks?: number;
}): MrpPhasedComputeResult {
  const itemById = new Map<string, MrpItemRow>();
  for (const item of input.items) itemById.set(item.id, item);

  const todayIso = input.today ?? new Date().toISOString().slice(0, 10);
  const horizonWeeks = input.horizonWeeks ?? MRP_DEFAULT_HORIZON_WEEKS;
  const bucketDates = buildMrpBucketDates(todayIso, horizonWeeks);
  const bucketCount = bucketDates.length;
  const singleBucketMode = horizonWeeks === 1;

  const thresholdByItem = new Map<string, MrpThresholdRow>();
  for (const t of input.thresholds ?? []) {
    if (itemById.has(t.item_id)) thresholdByItem.set(t.item_id, t);
  }

  const onHandByItem = new Map<string, { onHand: bigint; reserved: bigint; excluded: Set<string> }>();
  for (const bucket of input.onHand) {
    const item = itemById.get(bucket.product_id);
    if (!item) continue;
    const entry = onHandByItem.get(item.id) ?? { onHand: 0n, reserved: 0n, excluded: new Set<string>() };
    const onHandQty = toMicro(bucket.on_hand);
    const reservedQty = toMicro(bucket.reserved);
    const onHandBase = normalizeToBaseMicro(item, bucket.uom, onHandQty);
    if (onHandBase === null) {
      entry.excluded.add(bucket.uom);
      onHandByItem.set(item.id, entry);
      continue;
    }
    const reservedBase = normalizeToBaseMicro(item, bucket.uom, reservedQty) ?? 0n;
    entry.onHand += onHandBase;
    entry.reserved += reservedBase;
    onHandByItem.set(item.id, entry);
  }

  const bucketAcc = new Map<string, BucketAcc[]>();
  const accFor = (itemId: string, bucketIndex: number): BucketAcc => {
    let rows = bucketAcc.get(itemId);
    if (!rows) {
      rows = Array.from({ length: bucketCount }, () => ({
        demand: 0n,
        forecastDemand: 0n,
        soDemand: 0n,
        scheduledReceipts: 0n,
        excludedUoms: new Set<string>(),
        touched: false,
      }));
      bucketAcc.set(itemId, rows);
    }
    return rows[bucketIndex]!;
  };

  const applyTimed = (
    buckets: MrpTimedQtyBucket[],
    assign: (acc: BucketAcc, baseQtyMicro: bigint) => void,
  ): void => {
    for (const bucket of buckets) {
      const item = itemById.get(bucket.product_id);
      if (!item) continue;
      const qty = toMicro(bucket.qty);
      if (qty === 0n) continue;
      const base = normalizeToBaseMicro(item, bucket.uom, qty);
      const idx = dateToBucketIndex(bucket.need_date, bucketDates);
      if (idx === OUT_OF_HORIZON_BUCKET_INDEX) continue;
      const acc = accFor(item.id, idx);
      if (base === null) {
        acc.excludedUoms.add(bucket.uom);
        acc.touched = true;
        continue;
      }
      assign(acc, base);
      acc.touched = true;
    }
  };

  const applyForecast = (buckets: MrpForecastQtyBucket[]): void => {
    for (const bucket of buckets) {
      const item = itemById.get(bucket.product_id);
      if (!item) continue;
      const qty = toMicro(bucket.qty);
      if (qty === 0n) continue;
      const base = normalizeToBaseMicro(item, bucket.uom, qty);
      const idx = isoWeekToBucketIndex(bucket.iso_week, bucketDates);
      if (idx === OUT_OF_HORIZON_BUCKET_INDEX) continue;
      const acc = accFor(item.id, idx);
      if (base === null) {
        acc.excludedUoms.add(bucket.uom);
        acc.touched = true;
        continue;
      }
      acc.demand += base;
      acc.forecastDemand += base;
      acc.touched = true;
    }
  };

  applyTimed(input.demand, (acc, q) => {
    acc.demand += q;
  });
  applyForecast(input.forecastDemand ?? []);
  applyTimed(input.soDemand ?? [], (acc, q) => {
    acc.demand += q;
    acc.soDemand += q;
  });
  applyTimed(input.poSupply, (acc, q) => {
    acc.scheduledReceipts += q;
  });
  applyTimed(input.productionSupply, (acc, q) => {
    acc.scheduledReceipts += q;
  });

  for (const [itemId, t] of thresholdByItem) {
    if (toMicro(t.min_qty) > 0n) accFor(itemId, 0).touched = true;
  }

  const bucketRows: MrpBucketRow[] = [];
  const bucketRequirements: MrpBucketRequirement[] = [];
  const summaryByItem = new Map<string, MrpRow>();
  let itemsShort = 0;
  let itemsBelowMin = 0;
  let totalDemand = 0n;
  let totalShortage = 0n;

  for (const [itemId, perBucket] of bucketAcc) {
    const item = itemById.get(itemId);
    if (!item) continue;
    if (!perBucket.some((b) => b.touched)) continue;

    const threshold = thresholdByItem.get(itemId) ?? null;
    const minQty = threshold ? toMicro(threshold.min_qty) : 0n;
    const reorderQty = threshold ? toMicro(threshold.reorder_qty) : 0n;
    const leadDays = threshold?.preferred_supplier_id ? threshold.lead_time_days : null;
    const onHandEntry = onHandByItem.get(itemId) ?? { onHand: 0n, reserved: 0n, excluded: new Set<string>() };

    let pab = onHandEntry.onHand - onHandEntry.reserved;
    let totalDemandMicro = 0n;
    let totalReceiptsMicro = 0n;
    let totalForecastMicro = 0n;
    let totalSoMicro = 0n;
    let worst: MrpSeverity = 'covered';
    let summaryAction: MrpSuggestedAction | null = null;
    const excludedUoms = new Set<string>(onHandEntry.excluded);

    for (let i = 0; i < bucketCount; i += 1) {
      const acc = perBucket[i]!;
      for (const uom of acc.excludedUoms) excludedUoms.add(uom);
      totalDemandMicro += acc.demand;
      totalReceiptsMicro += acc.scheduledReceipts;
      totalForecastMicro += acc.forecastDemand;
      totalSoMicro += acc.soDemand;

      const rawPab = pab + acc.scheduledReceipts - acc.demand;
      const isShort = rawPab < 0n;
      const isBelowMin = !isShort && minQty > 0n && rawPab < minQty;
      const severity: MrpSeverity = isShort
        ? 'shortage'
        : isBelowMin
          ? 'below_min'
          : acc.demand > 0n && rawPab < acc.demand
            ? 'at_risk'
            : 'covered';
      worst = worstSeverity(worst, severity);

      let suggestedAction: MrpSuggestedAction | null = null;
      let netRequirementMicro = 0n;
      if (isShort || isBelowMin) {
        netRequirementMicro = isShort ? -rawPab : minQty - rawPab;
        suggestedAction = buildSuggestedAction(
          item,
          threshold,
          minQty,
          reorderQty,
          rawPab,
          isShort,
          isBelowMin,
          bucketDates[i]!,
          leadDays,
          todayIso,
          singleBucketMode,
        );
        if (suggestedAction && summaryAction === null) summaryAction = suggestedAction;
      }

      const pabAfterPlanned =
        rawPab + (suggestedAction ? toMicro(suggestedAction.qty) : 0n);

      const hasActivity =
        acc.touched || isShort || isBelowMin || acc.demand > 0n || acc.scheduledReceipts > 0n;
      if (!hasActivity) {
        pab = pabAfterPlanned;
        continue;
      }

      bucketRows.push({
        itemId,
        itemCode: item.item_code,
        itemName: item.name,
        itemType: item.item_type,
        uomBase: item.uom_base,
        onHand: i === 0 ? microToFixed(onHandEntry.onHand, 3) : '0.000',
        reserved: i === 0 ? microToFixed(onHandEntry.reserved, 3) : '0.000',
        openSupply: microToFixed(acc.scheduledReceipts, 3),
        demand: microToFixed(acc.demand, 3),
        forecastDemand: microToFixed(acc.forecastDemand, 3),
        soDemand: microToFixed(acc.soDemand, 3),
        net: microToFixed(rawPab, 3),
        severity,
        suggestedAction,
        minQty: threshold ? microToFixed(minQty, 3) : null,
        excludedUoms: [...excludedUoms].sort(),
        bucketDate: bucketDates[i]!,
        bucketIndex: i,
        scheduledReceipts: microToFixed(acc.scheduledReceipts, 3),
        grossRequirement: microToFixed(acc.demand, 3),
        projectedAvailable: microToFixed(pabAfterPlanned, 3),
      });

      if (acc.touched || isShort || isBelowMin) {
        bucketRequirements.push({
          itemId,
          bucketDate: bucketDates[i]!,
          bucketIndex: i,
          grossRequirement: microToFixed(acc.demand, 3),
          scheduledReceipts: microToFixed(acc.scheduledReceipts, 3),
          projectedOnHand: microToFixed(pabAfterPlanned, 3),
          netRequirement: microToFixed(netRequirementMicro > 0n ? netRequirementMicro : 0n, 3),
          forecastDemand: microToFixed(acc.forecastDemand, 3),
          soDemand: microToFixed(acc.soDemand, 3),
          dependentDemand: microToFixed(acc.demand - acc.forecastDemand - acc.soDemand, 3),
          severity,
          suggestedAction,
        });
      }

      pab = pabAfterPlanned;
    }

    const rawFinalNet = onHandEntry.onHand - onHandEntry.reserved + totalReceiptsMicro - totalDemandMicro;
    const isShortSummary = rawFinalNet < 0n;
    const isBelowMinSummary = !isShortSummary && minQty > 0n && rawFinalNet < minQty;
    if (isShortSummary) {
      itemsShort += 1;
      const shortage = -rawFinalNet;
      totalShortage += shortage < totalDemandMicro ? shortage : totalDemandMicro;
    }
    if (isBelowMinSummary) itemsBelowMin += 1;
    totalDemand += totalDemandMicro;

    summaryByItem.set(itemId, {
      itemId,
      itemCode: item.item_code,
      itemName: item.name,
      itemType: item.item_type,
      uomBase: item.uom_base,
      onHand: microToFixed(onHandEntry.onHand, 3),
      reserved: microToFixed(onHandEntry.reserved, 3),
      openSupply: microToFixed(totalReceiptsMicro, 3),
      demand: microToFixed(totalDemandMicro, 3),
      forecastDemand: microToFixed(totalForecastMicro, 3),
      soDemand: microToFixed(totalSoMicro, 3),
      net: microToFixed(rawFinalNet, 3),
      severity: worst,
      suggestedAction: summaryAction,
      minQty: threshold ? microToFixed(minQty, 3) : null,
      excludedUoms: [...excludedUoms].sort(),
    });
  }

  const rows = [...summaryByItem.values()];
  rows.sort((a, b) => {
    const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rank !== 0) return rank;
    const net = Number(a.net) - Number(b.net);
    if (net !== 0) return net;
    return a.itemCode.localeCompare(b.itemCode);
  });

  bucketRows.sort((a, b) => {
    const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rank !== 0) return rank;
    if (a.bucketIndex !== b.bucketIndex) return a.bucketIndex - b.bucketIndex;
    return a.itemCode.localeCompare(b.itemCode);
  });

  let coveragePct = 100;
  if (totalDemand > 0n) {
    const covered = totalDemand - totalShortage;
    const clamped = covered < 0n ? 0n : covered;
    const pctTimes10 = (clamped * 1000n + totalDemand / 2n) / totalDemand;
    coveragePct = Number(pctTimes10) / 10;
  }

  return {
    bucketDates,
    bucketRows,
    bucketRequirements,
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

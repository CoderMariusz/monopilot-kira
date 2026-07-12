/**
 * WO consumption progress — never sum unlike UoMs (kg + pcs) into one scalar.
 */

export type ConsumptionUomProgress = {
  uom: string;
  requiredQty: string;
  consumedQty: string;
  progressPct: number;
};

export type ConsumptionProgressSummary = {
  /** Set only when exactly one UoM is present on the WO BOM snapshot. */
  progressPct: number | null;
  byUom: ConsumptionUomProgress[];
  mixedUnits: boolean;
};

type MaterialRow = {
  uom: string;
  required_qty: string | number;
  consumed_qty: string | number;
};

function toDecimalString(value: string | number): string {
  return String(value);
}

function roundPct(consumed: number, required: number): number {
  if (required <= 0) return 0;
  return Math.round((consumed / required) * 1000) / 10;
}

export function summarizeConsumptionProgress(rows: MaterialRow[]): ConsumptionProgressSummary {
  const byUomMap = new Map<string, { required: number; consumed: number }>();

  for (const row of rows) {
    const uom = (row.uom ?? 'kg').trim() || 'kg';
    const required = Number(row.required_qty ?? 0);
    const consumed = Number(row.consumed_qty ?? 0);
    const prev = byUomMap.get(uom) ?? { required: 0, consumed: 0 };
    byUomMap.set(uom, {
      required: prev.required + required,
      consumed: prev.consumed + consumed,
    });
  }

  const byUom: ConsumptionUomProgress[] = [...byUomMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([uom, totals]) => ({
      uom,
      requiredQty: toDecimalString(totals.required),
      consumedQty: toDecimalString(totals.consumed),
      progressPct: roundPct(totals.consumed, totals.required),
    }));

  const mixedUnits = byUom.length > 1;
  const progressPct = byUom.length === 1 ? byUom[0]!.progressPct : null;

  return { progressPct, byUom, mixedUnits };
}

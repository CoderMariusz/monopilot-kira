export type OutputUom = 'base' | 'each' | 'box';

export type UomSnapshot = {
  outputUom: OutputUom;
  uomBase: string;
  netQtyPerEach: number | null;
  eachPerBox: number | null;
  boxesPerPallet: number | null;
  weightMode: 'fixed' | 'catch';
};

export class TypedError extends Error {
  code: 'uom_conversion_unavailable';

  constructor(code: 'uom_conversion_unavailable', message = code) {
    super(message);
    this.name = 'TypedError';
    this.code = code;
  }
}

type ItemLike = {
  output_uom?: string | null;
  outputUom?: string | null;
  uom_base?: string | null;
  uomBase?: string | null;
  net_qty_per_each?: string | number | null;
  netQtyPerEach?: string | number | null;
  each_per_box?: string | number | null;
  eachPerBox?: string | number | null;
  boxes_per_pallet?: string | number | null;
  boxesPerPallet?: string | number | null;
  weight_mode?: string | null;
  weightMode?: string | null;
};

export function toBaseQty(snap: UomSnapshot, qty: number, uom: OutputUom): number {
  if (uom === 'base') return qty;
  if (uom === 'each') return qty * requireFactor(snap.netQtyPerEach);
  return qty * requireFactor(snap.eachPerBox) * requireFactor(snap.netQtyPerEach);
}

export function fromBaseQty(snap: UomSnapshot, baseQty: number, uom: OutputUom): number {
  if (uom === 'base') return baseQty;
  if (uom === 'each') return baseQty / requireFactor(snap.netQtyPerEach);
  return baseQty / (requireFactor(snap.eachPerBox) * requireFactor(snap.netQtyPerEach));
}

export function snapshotFromItemRow(row: ItemLike): UomSnapshot {
  const outputUom = (row.output_uom ?? row.outputUom ?? 'base') as OutputUom;
  const weightMode = (row.weight_mode ?? row.weightMode ?? 'fixed') as 'fixed' | 'catch';
  return {
    outputUom,
    uomBase: row.uom_base ?? row.uomBase ?? 'kg',
    netQtyPerEach: nullableNumber(row.net_qty_per_each ?? row.netQtyPerEach),
    eachPerBox: nullableNumber(row.each_per_box ?? row.eachPerBox),
    boxesPerPallet: nullableNumber(row.boxes_per_pallet ?? row.boxesPerPallet),
    weightMode,
  };
}

/**
 * Pre-production pack-hierarchy completeness gate.
 *
 * A Finished-Good item that is physically packed in `each` or `box` units must
 * have the factors needed to convert that pack unit to its base (kg/liquid)
 * quantity, otherwise output/consumption conversion fails later at production
 * time (`uom_conversion_unavailable`). This pure check lets callers (e.g. WO
 * release) fail fast with an actionable message instead.
 *
 * Rules:
 *  - `base`  → always complete (bulk FG is legitimate, never blocked).
 *  - `each`  → requires net_qty_per_each > 0.
 *  - `box`   → requires net_qty_per_each > 0 AND each_per_box > 0.
 */
export function packHierarchyComplete(snap: UomSnapshot): boolean {
  if (snap.outputUom === 'base') return true;
  if (snap.outputUom === 'each') return positiveFactor(snap.netQtyPerEach);
  if (snap.outputUom === 'box') {
    return positiveFactor(snap.netQtyPerEach) && positiveFactor(snap.eachPerBox);
  }
  return false;
}

function positiveFactor(value: number | null): boolean {
  return value !== null && Number.isFinite(value) && value > 0;
}

function nullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  return Number(value);
}

/** Lossless decimal string for WO snapshot SQL binds — never round-trip through JS float. */
export function snapshotDecimalString(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return String(value);
  }
  return null;
}

export function woSnapshotWacQtyFields(
  snapshot: Record<string, unknown> | null | undefined,
  fallbackUomBase: string,
): { uomBase: string; netQtyPerEach: string | null; eachPerBox: string | null } {
  const snap = snapshot ?? {};
  const uomBaseRaw = snap.uom_base ?? snap.uomBase ?? fallbackUomBase;
  return {
    uomBase: typeof uomBaseRaw === 'string' ? uomBaseRaw : String(uomBaseRaw ?? 'kg'),
    netQtyPerEach: snapshotDecimalString(
      (snap.net_qty_per_each ?? snap.netQtyPerEach) as string | number | null | undefined,
    ),
    eachPerBox: snapshotDecimalString(
      (snap.each_per_box ?? snap.eachPerBox) as string | number | null | undefined,
    ),
  };
}

function requireFactor(value: number | null): number {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    throw new TypedError('uom_conversion_unavailable');
  }
  return value;
}

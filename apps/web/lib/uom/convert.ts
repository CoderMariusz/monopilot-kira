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

function nullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  return Number(value);
}

function requireFactor(value: number | null): number {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    throw new TypedError('uom_conversion_unavailable');
  }
  return value;
}

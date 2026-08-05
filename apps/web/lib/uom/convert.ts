import { microToDecimal, microToFixed, mulMicro, toMicro } from '../shared/decimal';

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

type ItemQuantityUomRow = {
  base_uom: string;
  secondary_uom: string | null;
  output_uom: 'base' | 'each' | 'box';
  net_qty_per_each: string | null;
  each_per_box: string | null;
  input_factor_to_base: string | null;
  input_category: string | null;
  base_factor_to_base: string | null;
  base_category: string | null;
};

type UomQueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type NormalizedItemQuantity = {
  quantity: string;
  uom: string;
};

/**
 * Normalize a user-entered item quantity to the item's base UoM.
 * The item master is the allow-list: base, configured secondary, and configured
 * each/box output units are accepted. All arithmetic stays at micro-6 scale.
 */
export async function normalizeItemQuantityToBase(
  client: UomQueryClient,
  input: { itemId: string; quantity: string; uom: string },
): Promise<NormalizedItemQuantity | null> {
  const { rows } = await client.query<ItemQuantityUomRow>(
    `select i.uom_base as base_uom,
            i.uom_secondary as secondary_uom,
            i.output_uom,
            i.net_qty_per_each::text,
            i.each_per_box::text,
            input_uom.factor_to_base::text as input_factor_to_base,
            input_uom.category as input_category,
            base_uom.factor_to_base::text as base_factor_to_base,
            base_uom.category as base_category
       from public.items i
       left join public.unit_of_measure input_uom
         on input_uom.org_id = i.org_id
        and lower(input_uom.code) = lower($1::text)
        and input_uom.deleted_at is null
       left join public.unit_of_measure base_uom
         on base_uom.org_id = i.org_id
        and lower(base_uom.code) = lower(i.uom_base)
        and base_uom.deleted_at is null
      where i.org_id = app.current_org_id()
        and i.id = $2::uuid
      limit 1`,
    [input.uom, input.itemId],
  );
  const row = rows[0];
  if (!row) return null;

  const enteredUom = input.uom.trim().toLowerCase();
  // Pozycja bez jednostki bazowej (albo bez trafienia w left joinie) to brak przelicznika,
  // a nie awaria — bez tego całe dodanie linii wywracało się wyjątkiem zamiast zwrócić
  // `line_uom_not_convertible`.
  const rawBaseUom = typeof row.base_uom === 'string' ? row.base_uom : null;
  if (!rawBaseUom) return null;
  const baseUom = rawBaseUom.trim().toLowerCase();
  const entered = toMicro(input.quantity);
  let quantityBase: bigint | null = null;

  if (enteredUom === baseUom) {
    quantityBase = entered;
  } else if (
    ['pcs', 'each', 'ea', 'szt'].includes(enteredUom)
    && (row.output_uom === 'each' || row.output_uom === 'box')
    && row.net_qty_per_each
  ) {
    quantityBase = mulMicro(entered, toMicro(row.net_qty_per_each));
  } else if (
    enteredUom === 'box'
    && row.output_uom === 'box'
    && row.net_qty_per_each
    && row.each_per_box
  ) {
    quantityBase = mulMicro(
      entered,
      mulMicro(toMicro(row.net_qty_per_each), toMicro(row.each_per_box)),
    );
  } else if (
    enteredUom === row.secondary_uom?.trim().toLowerCase()
    && row.input_category
    && row.input_category === row.base_category
    && row.input_factor_to_base
    && row.base_factor_to_base
  ) {
    const numerator = entered * toMicro(row.input_factor_to_base);
    const denominator = toMicro(row.base_factor_to_base);
    if (denominator > 0n) quantityBase = (numerator + denominator / 2n) / denominator;
  }

  if (quantityBase === null || quantityBase <= 0n) return null;
  return { quantity: microToDecimal(quantityBase), uom: row.base_uom };
}

export function toBaseQty(snap: UomSnapshot, qty: number, uom: OutputUom): number {
  if (uom === 'base') return qty;
  if (uom === 'each') return qty * requireFactor(snap.netQtyPerEach);
  return qty * requireFactor(snap.eachPerBox) * requireFactor(snap.netQtyPerEach);
}

/** Decimal-string UoM conversion — no JS float arithmetic (NUMERIC-exact). */
export function toBaseQtyFromDecimal(snap: UomSnapshot, qty: string, uom: OutputUom): string {
  const qtyMicro = toMicro(qty);
  if (uom === 'base') return microToFixed(qtyMicro, 3);
  if (uom === 'each') {
    return microToFixed(mulMicro(qtyMicro, toMicro(requireFactorDecimal(snap.netQtyPerEach))), 3);
  }
  return microToFixed(
    mulMicro(qtyMicro, mulMicro(toMicro(requireFactorDecimal(snap.eachPerBox)), toMicro(requireFactorDecimal(snap.netQtyPerEach)))),
    3,
  );
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

function requireFactorDecimal(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    throw new TypedError('uom_conversion_unavailable');
  }
  return String(value);
}

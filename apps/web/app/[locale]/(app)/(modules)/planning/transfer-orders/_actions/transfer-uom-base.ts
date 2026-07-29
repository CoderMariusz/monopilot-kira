import { MICRO_SCALE, mulMicro, toMicro } from '../../../../../../../lib/shared/decimal';

/** Item row fields needed to convert transfer line / LP qty into base UoM at micro-6. */
export type TransferItemUomRow = {
  id: string;
  uom_base: string;
  net_qty_per_each: string | number | null;
  each_per_box: string | number | null;
};

const GRAMS_PER_KG = 1000n;

function normUom(uom: string): string {
  return uom.trim().toLowerCase();
}

function packFactorMicro(value: string | number | null | undefined): bigint | null {
  if (value === null || value === undefined || value === '') return null;
  const micro = toMicro(value);
  return micro > 0n ? micro : null;
}

/**
 * Convert a transfer qty into the item base UoM at micro-6 scale.
 * Mirrors WAC g↔kg rules and pack factors from lib/uom/convert.ts — kept at 6 dp
 * to match transfer_order_lines.qty / license_plates.quantity (numeric 18,6).
 */
export function qtyToBaseMicro6(item: TransferItemUomRow, qty: string, uom: string): bigint | null {
  const u = normUom(uom);
  const base = normUom(item.uom_base);
  const qtyMicro = toMicro(qty);

  if (u === base || u === 'base') return qtyMicro;
  if (base === 'kg' && u === 'kg') return qtyMicro;
  if (base === 'kg' && u === 'g') {
    const baseMicro = qtyMicro / GRAMS_PER_KG;
    // Sub-gram residue cannot be represented in kg base at micro-6 — reject, never zero-fill.
    if (qtyMicro > 0n && baseMicro === 0n) return null;
    return baseMicro;
  }

  if (u === 'each' || u === 'box') {
    const netPerEach = packFactorMicro(item.net_qty_per_each);
    if (!netPerEach) return null;
    if (u === 'each') return mulMicro(qtyMicro, netPerEach);
    const eachPerBox = packFactorMicro(item.each_per_box);
    if (!eachPerBox) return null;
    return mulMicro(mulMicro(qtyMicro, eachPerBox), netPerEach);
  }

  return null;
}

/** Inverse of qtyToBaseMicro6 for a target display/storage UoM at micro-6. */
export function baseMicro6ToQty(item: TransferItemUomRow, baseMicro: bigint, targetUom: string): bigint | null {
  if (baseMicro <= 0n) return 0n;
  const u = normUom(targetUom);
  const base = normUom(item.uom_base);

  if (u === base || u === 'base') return baseMicro;
  if (base === 'kg' && u === 'kg') return baseMicro;
  if (base === 'kg' && u === 'g') return baseMicro * GRAMS_PER_KG;

  if (u === 'each' || u === 'box') {
    const netPerEach = packFactorMicro(item.net_qty_per_each);
    if (!netPerEach) return null;
    // Inverse of mulMicro: eachMicro = round(baseMicro * SCALE / netPerEach) at micro-6.
    const eachMicro = (baseMicro * MICRO_SCALE + netPerEach / 2n) / netPerEach;
    if (u === 'each') return eachMicro;
    const eachPerBox = packFactorMicro(item.each_per_box);
    if (!eachPerBox) return null;
    return (eachMicro * MICRO_SCALE + eachPerBox / 2n) / eachPerBox;
  }

  return null;
}

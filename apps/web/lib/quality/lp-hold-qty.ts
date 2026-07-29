import { formatDecimalString } from '../shared/decimal';

/**
 * Resolve the kg quantity recorded on quality_hold_items for an LP.
 * Never maps countable UoM (pcs/each/box) into kg — use catch_weight_kg when present.
 * Truncates to 3 dp (column scale) without rounding up the LP quantity.
 */
export function resolveLpQtyHeldKg(lp: {
  quantity: string;
  uom: string;
  catch_weight_kg: string | null;
}): string | null {
  if (lp.catch_weight_kg != null && lp.catch_weight_kg.trim() !== '') {
    return formatDecimalString(lp.catch_weight_kg, 3);
  }
  if (lp.uom.trim().toLowerCase() === 'kg') {
    return formatDecimalString(lp.quantity, 3);
  }
  return null;
}

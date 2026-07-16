import { Dec } from '@monopilot/domain';

import { microToFixed, toMicro } from '../../../../../../lib/shared/decimal';
import { SO_LINE_MONEY_SCALE, normalizeSoUnitPriceGbp } from './sales-line-price';

/** Postgres `quantity_ordered` scale (numeric(14,3)). */
export const SO_LINE_QTY_SCALE = 3;

/** Accepts any non-negative decimal string, including trailing zeros. */
const DECIMAL_INPUT_RE = /^\d+(?:\.\d+)?$/;

function isPositiveDecimalInput(value: string): boolean {
  const trimmed = value.trim();
  if (!DECIMAL_INPUT_RE.test(trimmed)) return false;
  if (/^0+(?:\.0+)?$/.test(trimmed)) return false;
  try {
    return Dec.from(trimmed).cmp(Dec.zero()) > 0;
  } catch {
    return false;
  }
}

/** Normalize a positive SO line qty to numeric(14,3) text — never route through float. */
export function normalizeSoLineQty(value: string): string | null {
  const trimmed = value.trim();
  if (!isPositiveDecimalInput(trimmed)) return null;
  const fixed = microToFixed(toMicro(trimmed), SO_LINE_QTY_SCALE);
  if (!fixed.includes('.')) return fixed;
  return fixed.replace(/0+$/, '').replace(/\.$/, '');
}

/** Normalize a positive SO line unit price to numeric(14,4) text. */
export function normalizeSoLineUnitPrice(value: string): string | null {
  const trimmed = value.trim();
  if (!isPositiveDecimalInput(trimmed)) return null;
  return normalizeSoUnitPriceGbp(trimmed);
}

export function isValidSoLineQtyInput(value: string): boolean {
  return normalizeSoLineQty(value) != null;
}

export function isValidSoLineUnitPriceInput(value: string): boolean {
  return normalizeSoLineUnitPrice(value) != null;
}

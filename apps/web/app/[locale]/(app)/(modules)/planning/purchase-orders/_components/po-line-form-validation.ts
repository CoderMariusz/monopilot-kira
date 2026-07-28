/**
 * Shared PO line draft validation for create/edit modals.
 *
 * Distinguishes an unstarted (blank) row from a started row the operator is
 * filling in. Only started rows are validated; a trailing empty row must not
 * block submission when another row is complete.
 */

export const QTY_PATTERN = /^\d+(?:\.\d{1,6})?$/;
export const PRICE_PATTERN = /^\d+(?:\.\d{1,4})?$/;
export const PCT_PATTERN = /^\d+(?:\.\d{1,4})?$/;

export type PoLineDraft = {
  item: unknown;
  qty: string;
  uom: string;
  unitPrice: string;
  taxPct: string;
};

export type LineField = 'item' | 'qty' | 'uom' | 'unitPrice' | 'taxPct';

export type LineFieldErrorReason = 'required' | 'invalid';

export type PoLineFieldError = {
  field: LineField;
  lineNo: number;
  reason: LineFieldErrorReason;
};

/** True once the operator has touched any field beyond factory defaults. */
export function isPoLineStarted(line: PoLineDraft): boolean {
  return Boolean(
    line.item ||
      line.qty.trim() ||
      line.uom.trim() ||
      line.unitPrice.trim() ||
      (line.taxPct.trim() !== '' && line.taxPct.trim() !== '0'),
  );
}

/** A started row with every required field valid. */
export function isPoLineComplete(line: PoLineDraft): boolean {
  if (!isPoLineStarted(line)) return false;
  return getPoLineFieldErrors(line, 0).length === 0;
}

export function getPoLineFieldErrors(line: PoLineDraft, lineNo: number): PoLineFieldError[] {
  if (!isPoLineStarted(line)) return [];

  const errors: PoLineFieldError[] = [];

  if (!line.item) {
    errors.push({ field: 'item', lineNo, reason: 'required' });
  }
  if (!QTY_PATTERN.test(line.qty.trim()) || Number(line.qty) <= 0) {
    errors.push({ field: 'qty', lineNo, reason: 'invalid' });
  }
  if (!line.uom.trim()) {
    errors.push({ field: 'uom', lineNo, reason: 'required' });
  }

  const priceTrimmed = line.unitPrice.trim();
  if (priceTrimmed.length === 0) {
    errors.push({ field: 'unitPrice', lineNo, reason: 'required' });
  } else if (!PRICE_PATTERN.test(priceTrimmed)) {
    errors.push({ field: 'unitPrice', lineNo, reason: 'invalid' });
  }

  if (!PCT_PATTERN.test(line.taxPct.trim()) || Number(line.taxPct) < 0 || Number(line.taxPct) > 100) {
    errors.push({ field: 'taxPct', lineNo, reason: 'invalid' });
  }

  return errors;
}

export function getAllPoLineFieldErrors(lines: PoLineDraft[]): PoLineFieldError[] {
  return lines.flatMap((line, idx) => getPoLineFieldErrors(line, idx + 1));
}

export function hasInvalidStartedPoLine(lines: PoLineDraft[]): boolean {
  return getAllPoLineFieldErrors(lines).length > 0;
}

export function getCompletePoLines<T extends PoLineDraft>(lines: T[]): T[] {
  return lines.filter(isPoLineComplete);
}

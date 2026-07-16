/**
 * NPD target retail price — NUMERIC(12,2) exact scale shared by wizard, brief, and server actions.
 */

export const NPD_RETAIL_PRICE_DP = 2;

const INPUT_RE = /^\d+(\.\d+)?$/;

function canonicalRetailPriceEur(trimmed: string): string {
  const [intPart, fracPart = ''] = trimmed.split('.');
  return `${intPart}.${fracPart.padEnd(NPD_RETAIL_PRICE_DP, '0').slice(0, NPD_RETAIL_PRICE_DP)}`;
}

/**
 * Parse wizard/brief user input to a canonical 2dp string, or:
 * - `null` when empty (optional field omitted)
 * - `undefined` when invalid (negative, non-numeric, or >2 decimal places)
 */
export function parseRetailPriceEurInput(value: string): string | null | undefined {
  const trimmed = value.trim().replace(',', '.');
  if (trimmed.length === 0) return null;
  if (!INPUT_RE.test(trimmed)) return undefined;
  const [, frac = ''] = trimmed.split('.');
  if (frac.length > NPD_RETAIL_PRICE_DP) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return canonicalRetailPriceEur(trimmed);
}

/** Format a stored NUMERIC string for display at the same 2dp scale. */
export function formatRetailPriceEurDisplay(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = parseRetailPriceEurInput(trimmed);
  return parsed === undefined ? null : parsed;
}

/** Server-side guard for create/brief payloads (string or legacy number). */
export function parseOptionalRetailPriceEur(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value === 'string') return parseRetailPriceEurInput(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return undefined;
    return parseRetailPriceEurInput(String(value));
  }
  return undefined;
}

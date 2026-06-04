/**
 * 03-technical cost NUMERIC display helpers (T-050).
 *
 * The hard rule: cost values arrive as exact decimal STRINGS from Postgres
 * NUMERIC columns and must be displayed without binary-float rounding artifacts
 * (e.g. 0.1 + 0.2). These helpers operate on the decimal digit strings using
 * BigInt-scaled integer arithmetic, so 12.3400 displays as "12.34" and a Δ% is
 * computed exactly to one decimal place — never via `Number()` math on a cost.
 */

/** Strip a leading +/- sign and split into integer + fractional digit strings. */
function parseDecimal(value: string): { neg: boolean; int: string; frac: string } {
  const trimmed = value.trim();
  const neg = trimmed.startsWith('-');
  const unsigned = neg ? trimmed.slice(1) : trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  const [int = '0', frac = ''] = unsigned.split('.');
  return { neg, int: int || '0', frac };
}

/** Convert a decimal string to a scaled BigInt at `scale` fractional digits. */
function toScaledBigInt(value: string, scale: number): bigint {
  const { neg, int, frac } = parseDecimal(value);
  const fracPadded = (frac + '0'.repeat(scale)).slice(0, scale);
  const digits = `${int}${fracPadded}`.replace(/^0+(?=\d)/, '');
  const magnitude = BigInt(digits === '' ? '0' : digits);
  return neg ? -magnitude : magnitude;
}

/**
 * Format an exact NUMERIC string to a fixed number of decimal places (default 2)
 * for presentation, with no float involvement. "12.3400" → "12.34"; null → "—".
 */
export function formatCost(value: string | null, dp = 2): string {
  if (value === null || value.trim() === '') return '—';
  const { neg, int, frac } = parseDecimal(value);
  if (!/^\d+$/.test(int) || (frac !== '' && !/^\d+$/.test(frac))) return '—';
  let intPart = int.replace(/^0+(?=\d)/, '');
  let fracPart = frac;
  if (fracPart.length > dp) {
    // Round half-up on the integer-scaled representation (exact).
    const scaled = toScaledBigInt(`${int}.${frac}`, dp + 1);
    const base = scaled / 10n;
    const lastDigit = (scaled < 0n ? -scaled : scaled) % 10n;
    const rounded = lastDigit >= 5n ? base + (scaled < 0n ? -1n : 1n) : base;
    const abs = rounded < 0n ? -rounded : rounded;
    const s = abs.toString().padStart(dp + 1, '0');
    intPart = s.slice(0, s.length - dp).replace(/^0+(?=\d)/, '') || '0';
    fracPart = dp > 0 ? s.slice(s.length - dp) : '';
    const sign = rounded < 0n ? '-' : '';
    return dp > 0 ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`;
  }
  fracPart = (fracPart + '0'.repeat(dp)).slice(0, dp);
  const sign = neg && /[1-9]/.test(`${intPart}${fracPart}`) ? '-' : '';
  return dp > 0 ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`;
}

/**
 * Exact Δ% = (next - prev) / prev × 100, to one decimal place, as a signed
 * string ("12.5", "-3.4", "0.0"). Uses BigInt-scaled integer math so the percent
 * is precise (no JS float). Returns null when prev is 0/invalid (undefined Δ%).
 */
export function deltaPctExact(prev: string, next: string, dp = 1): string | null {
  const SCALE = 6;
  const p = toScaledBigInt(prev, SCALE);
  const n = toScaledBigInt(next, SCALE);
  if (p === 0n) return null;
  // ((n - p) * 100 * 10^dp) / p, with half-up rounding on the last digit.
  const numerator = (n - p) * 100n * 10n ** BigInt(dp + 1);
  const q = numerator / p;
  const base = q / 10n;
  const last = (q < 0n ? -q : q) % 10n;
  const rounded = last >= 5n ? base + (q < 0n ? -1n : 1n) : base;
  const neg = rounded < 0n;
  const abs = (neg ? -rounded : rounded).toString().padStart(dp + 1, '0');
  const intPart = abs.slice(0, abs.length - dp) || '0';
  const fracPart = dp > 0 ? abs.slice(abs.length - dp) : '';
  const body = dp > 0 ? `${intPart}.${fracPart}` : intPart;
  return neg ? `-${body}` : body;
}

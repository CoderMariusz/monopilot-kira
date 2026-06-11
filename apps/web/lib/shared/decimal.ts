/**
 * Shared NUMERIC-exact decimal helpers — micro-unit bigint, scale 6.
 *
 * Postgres NUMERIC quantities (3-4 dp across the schema; license_plates uses 6)
 * must never round-trip through a JS float: text in, bigint micro-units for the
 * arithmetic, text out. This is the K-II transfer-orders pattern
 * (planning/transfer-orders/_actions/actions.ts toMicro6/microToText6) extracted
 * for reuse — first consumer: the MRP netting core (Codex batch-D F1).
 *
 * 1 unit = 1_000_000 micros. Inputs with more than 6 dp are truncated at the
 * 7th dp (beyond every NUMERIC scale in the schema). Unparseable input maps to
 * 0n, mirroring the defensive Number()-fallback the float code had.
 */

export const MICRO_DP = 6;
export const MICRO_SCALE = 1_000_000n;

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/** Parse a decimal string (or number) into exact micro-units. */
export function toMicro(value: string | number): bigint {
  const text = typeof value === 'number' ? String(value) : value.trim();
  // Scientific notation (only reachable via extreme JS numbers) and garbage are
  // out of the NUMERIC 3-4dp domain — treat as 0, never NaN-poison the math.
  if (!DECIMAL_RE.test(text)) return 0n;
  const neg = text.startsWith('-');
  const body = neg ? text.slice(1) : text;
  const [intPart, fracRaw = ''] = body.split('.');
  const frac = (fracRaw + '0'.repeat(MICRO_DP)).slice(0, MICRO_DP);
  const micro = BigInt(intPart || '0') * MICRO_SCALE + BigInt(frac || '0');
  return neg ? -micro : micro;
}

/**
 * Format micro-units as a FIXED-dp decimal string (0 ≤ dp ≤ 6), rounding half
 * away from zero. Never emits "-0.000".
 */
export function microToFixed(micro: bigint, dp: number): string {
  const drop = 10n ** BigInt(MICRO_DP - dp);
  const neg = micro < 0n;
  const abs = neg ? -micro : micro;
  const units = (abs + drop / 2n) / drop; // value in 10^-dp units, rounded
  const div = 10n ** BigInt(dp);
  const frac = dp > 0 ? `.${(units % div).toString().padStart(dp, '0')}` : '';
  const out = `${units / div}${frac}`;
  return neg && units !== 0n ? `-${out}` : out;
}

/** Format micro-units as a minimal decimal string (trailing zeros trimmed). */
export function microToDecimal(micro: bigint): string {
  const neg = micro < 0n;
  const abs = neg ? -micro : micro;
  const frac = (abs % MICRO_SCALE).toString().padStart(MICRO_DP, '0').replace(/0+$/, '');
  const out = frac ? `${abs / MICRO_SCALE}.${frac}` : `${abs / MICRO_SCALE}`;
  return neg && abs !== 0n ? `-${out}` : out;
}

/**
 * Multiply two micro-unit quantities (e.g. qty × pack factor), rounding the
 * result to the nearest micro (half away from zero).
 */
export function mulMicro(a: bigint, b: bigint): bigint {
  const prod = a * b;
  const neg = prod < 0n;
  const abs = neg ? -prod : prod;
  const rounded = (abs + MICRO_SCALE / 2n) / MICRO_SCALE;
  return neg ? -rounded : rounded;
}

/** Ceil a positive micro quantity to WHOLE base units (≤ 0 → 0n). */
export function ceilMicroToWholeUnits(micro: bigint): bigint {
  if (micro <= 0n) return 0n;
  return (micro + MICRO_SCALE - 1n) / MICRO_SCALE;
}

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

/**
 * Canonical quantity-input guard for forms writing a NUMERIC(_,6) column: 1-6
 * decimals, no leading zeros (`01.5`), no bare `.5`, no trailing `1.`, no sign.
 *
 * Deliberately identical to the server guard (`parseDecimal` in
 * lib/warehouse/receive-po-line-core.ts) so a form can never accept a value the
 * action rejects — nor reject one it would have accepted. It lives here because
 * the receiving UIs each kept a private copy that drifted to 3 decimals while
 * the columns and the server stayed at 6, making the last 0.000600 of a line
 * impossible to receive.
 */
export const DECIMAL_QTY_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;

/** Parse a decimal string (or number) into exact micro-units. */
export function toMicro(value: string | number | null | undefined): bigint {
  if (value == null) return 0n;
  const text = typeof value === 'number' ? String(value) : value.trim();
  // Scientific notation (only reachable via extreme JS numbers), null/undefined,
  // and garbage are out of the NUMERIC 3-4dp domain — treat as 0, never
  // NaN-poison the math.
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
 * Display a NUMERIC column value — up to `maxDp` decimal places, trailing zeros
 * trimmed. Never round-trips through JS float.
 */
export function formatDecimalString(value: string, maxDp: number = MICRO_DP): string {
  const trimmed = value.trim();
  if (!trimmed.length) return '';
  if (!DECIMAL_RE.test(trimmed)) return trimmed;
  const neg = trimmed.startsWith('-');
  const body = neg ? trimmed.slice(1) : trimmed;
  const [intPart, fracRaw = ''] = body.split('.');
  const frac = fracRaw.slice(0, maxDp).replace(/0+$/, '');
  const out = frac ? `${intPart}.${frac}` : intPart;
  return neg ? `-${out}` : out;
}

/** Multiply two decimal strings for display (result trimmed to MICRO_DP). */
export function mulDecimalStrings(a: string, b: string): string {
  return microToDecimal(mulMicro(toMicro(a), toMicro(b)));
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

/**
 * Round a replenishment gap up to the next whole multiple of a fixed lot size.
 * When lotMicro ≤ 0, falls back to whole-unit ceiling (legacy no-lot behaviour).
 */
export function ceilGapToLotMultiple(gapMicro: bigint, lotMicro: bigint): bigint {
  if (gapMicro <= 0n) return 0n;
  if (lotMicro <= 0n) return ceilMicroToWholeUnits(gapMicro) * MICRO_SCALE;
  const lots = (gapMicro + lotMicro - 1n) / lotMicro;
  return lots * lotMicro;
}

/** Format a suggested replenishment qty — integer when whole, else trimmed decimal. */
export function formatSuggestedQty(qtyMicro: bigint): string {
  if (qtyMicro <= 0n) return '0';
  if (qtyMicro % MICRO_SCALE === 0n) return (qtyMicro / MICRO_SCALE).toString();
  return microToDecimal(qtyMicro);
}

/**
 * Compare two decimal strings at full precision (no float, no 6dp truncation).
 * Returns null when either operand is not a finite decimal literal.
 * Inclusive equality: compareDecimalStrings('5.5000', '5.5') === 0.
 */
export function compareDecimalStrings(a: string, b: string): -1 | 0 | 1 | null {
  const left = normalizeComparableDecimal(a);
  const right = normalizeComparableDecimal(b);
  if (!left || !right) return null;
  if (left.negative !== right.negative) {
    return left.negative ? -1 : 1;
  }
  const scale = Math.max(left.frac.length, right.frac.length);
  const leftScaled = left.int * 10n ** BigInt(scale) + BigInt(left.frac.padEnd(scale, '0') || '0');
  const rightScaled = right.int * 10n ** BigInt(scale) + BigInt(right.frac.padEnd(scale, '0') || '0');
  if (leftScaled === rightScaled) return 0;
  const leftGreater = leftScaled > rightScaled;
  if (left.negative) return leftGreater ? -1 : 1;
  return leftGreater ? 1 : -1;
}

function normalizeComparableDecimal(value: string): { negative: boolean; int: bigint; frac: string } | null {
  const trimmed = value.trim();
  if (!DECIMAL_RE.test(trimmed)) return null;
  const negative = trimmed.startsWith('-');
  const body = negative ? trimmed.slice(1) : trimmed;
  const [intPart, fracPart = ''] = body.split('.');
  const frac = fracPart.replace(/0+$/, '');
  return {
    negative,
    int: BigInt(intPart || '0'),
    frac,
  };
}

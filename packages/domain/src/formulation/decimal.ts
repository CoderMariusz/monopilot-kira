/**
 * Exact fixed-point decimal arithmetic for money / NUMERIC values.
 *
 * WHY: JS `number` is IEEE-754 binary floating point and cannot represent
 * decimal fractions like 0.1 exactly (`0.1 + 0.2 === 0.30000000000000004`).
 * Cost / margin math in 01-NPD must be NUMERIC-exact (BRCGS/finance audit),
 * and the repo reads Postgres NUMERIC columns as **strings** — so we keep them
 * as strings end-to-end and never `Number()` a money value.
 *
 * Implementation: each value is a `bigint` mantissa scaled by a fixed number
 * of fractional digits (`SCALE`). All add/sub/mul/div happen on integers, which
 * are exact and deterministic. Division rounds half-up at the working scale.
 *
 * This is intentionally a tiny, dependency-free decimal — the workspace ships
 * no decimal.js / big.js, and a full library is overkill for the handful of
 * operations recomputeCalc needs (and would add an I/O-free pure module a dep).
 */

/** Working scale: number of fractional digits carried internally. */
export const SCALE = 12;

const SCALE_FACTOR = 10n ** BigInt(SCALE);

export class Dec {
  /** Scaled integer mantissa: value = mantissa / 10^SCALE. */
  private readonly m: bigint;

  private constructor(mantissa: bigint) {
    this.m = mantissa;
  }

  static zero(): Dec {
    return new Dec(0n);
  }

  /**
   * Parse a decimal STRING (or null/undefined → 0) into an exact Dec.
   *
   * MONEY IS STRING-ONLY at the type boundary. A JS `number` is rejected at
   * BOTH the type level (the signature accepts only `string | null | undefined`)
   * AND at runtime (a defensive `typeof` guard throws) so a binary IEEE-754
   * float can never enter the exact-money path — even from an untyped caller
   * (e.g. a JS test, a loosely-typed JSON payload, or `any`).
   *
   * Accepts an optional leading sign and a single decimal point. Throws on
   * anything else so a malformed NUMERIC never silently becomes NaN.
   */
  static from(value: string | null | undefined): Dec {
    if (value === null || value === undefined || value === '') return Dec.zero();
    if (typeof value !== 'string') {
      // Defensive runtime guard: monetary inputs must be NUMERIC strings.
      // A `number` would re-introduce binary-float drift into exact money.
      throw new Error(
        `Dec.from: monetary values must be strings, not ${typeof value}: ${JSON.stringify(value)}`,
      );
    }
    const s = value.trim();
    if (!/^[+-]?\d*\.?\d*$/.test(s) || s === '' || s === '.' || s === '+' || s === '-') {
      throw new Error(`Dec.from: not a decimal string: ${JSON.stringify(value)}`);
    }
    const negative = s.startsWith('-');
    const unsigned = s.replace(/^[+-]/, '');
    const [intPart, fracPartRaw = ''] = unsigned.split('.');
    // Pad / truncate the fractional part to SCALE digits (truncation only ever
    // happens for literals longer than 12 dp, which money inputs never are).
    const fracPart = fracPartRaw.padEnd(SCALE, '0').slice(0, SCALE);
    const digits = `${intPart || '0'}${fracPart}`;
    const mantissa = BigInt(digits);
    return new Dec(negative ? -mantissa : mantissa);
  }

  add(other: Dec): Dec {
    return new Dec(this.m + other.m);
  }

  sub(other: Dec): Dec {
    return new Dec(this.m - other.m);
  }

  mul(other: Dec): Dec {
    // (a/10^S) * (b/10^S) = (a*b) / 10^(2S) → rescale back to 10^S.
    return new Dec(divRoundHalfUp(this.m * other.m, SCALE_FACTOR));
  }

  /** Division; returns Dec.zero() when the divisor is zero (caller guards intent). */
  div(other: Dec): Dec {
    if (other.m === 0n) return Dec.zero();
    // (a/10^S) / (b/10^S) = a/b → scale numerator by 10^S before integer divide.
    return new Dec(divRoundHalfUp(this.m * SCALE_FACTOR, other.m));
  }

  isZero(): boolean {
    return this.m === 0n;
  }

  /** Compare: -1, 0, 1. */
  cmp(other: Dec): number {
    if (this.m < other.m) return -1;
    if (this.m > other.m) return 1;
    return 0;
  }

  /**
   * Render to a fixed number of decimal places (half-up rounding), always with
   * exactly `dp` fractional digits. Deterministic — same input → same string.
   */
  toFixed(dp: number): string {
    if (dp < 0) throw new Error('toFixed: dp must be >= 0');
    // Reduce the internal mantissa from SCALE digits to `dp` digits, half-up.
    let scaled: bigint;
    if (dp >= SCALE) {
      scaled = this.m * 10n ** BigInt(dp - SCALE);
    } else {
      scaled = divRoundHalfUp(this.m, 10n ** BigInt(SCALE - dp));
    }
    const negative = scaled < 0n;
    const abs = (negative ? -scaled : scaled).toString().padStart(dp + 1, '0');
    const intPart = dp === 0 ? abs : abs.slice(0, abs.length - dp);
    const fracPart = dp === 0 ? '' : abs.slice(abs.length - dp);
    const body = dp === 0 ? intPart : `${intPart}.${fracPart}`;
    // Normalise "-0.00" → "0.00".
    if (negative && /^-?0(\.0*)?$/.test(`-${body}`)) {
      return body;
    }
    return negative ? `-${body}` : body;
  }
}

/** Integer division with half-up rounding (round-half-away-from-zero). */
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n;
  const negative = numerator < 0n !== denominator < 0n;
  const a = numerator < 0n ? -numerator : numerator;
  const b = denominator < 0n ? -denominator : denominator;
  const q = a / b;
  const r = a % b;
  // Round half up: if remainder*2 >= divisor, bump the quotient.
  const bumped = r * 2n >= b ? q + 1n : q;
  return negative ? -bumped : bumped;
}

/**
 * Dependency-free Code128 (set B) encoder for GS1-128 barcodes.
 * Renders module patterns as 0/1 strings (1 = black bar module).
 */

const CODE128_B_CHARS =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';

/** ISO/IEC 15417 patterns: values 0–105 are 11 modules; STOP (106) is 13 modules. */
const CODE128_PATTERNS: readonly string[] = [
  '11011001100',
  '11001101100',
  '11001100110',
  '10010011000',
  '10010001100',
  '10001001100',
  '10011001000',
  '10011000100',
  '10001100100',
  '11001001000',
  '11001000100',
  '11000100100',
  '10110011100',
  '10011011100',
  '10011001110',
  '10111001100',
  '10011101100',
  '10011100110',
  '11001110010',
  '11001011100',
  '11001001110',
  '11011100100',
  '11001110100',
  '11101101110',
  '11101001100',
  '11100101100',
  '11100100110',
  '11101100100',
  '11100110100',
  '11100110010',
  '11011011000',
  '11011000110',
  '11000110110',
  '10100011000',
  '10001011000',
  '10001000110',
  '10110001000',
  '10001101000',
  '10001100010',
  '11010001000',
  '11000101000',
  '11000100010',
  '10110111000',
  '10110001110',
  '10001101110',
  '10111011000',
  '10111000110',
  '10001110110',
  '11101110110',
  '11010001110',
  '11000101110',
  '11011101000',
  '11011100010',
  '11011101110',
  '11101011000',
  '11101000110',
  '11100010110',
  '11101101000',
  '11101100010',
  '11100011010',
  '11101111010',
  '11001000010',
  '11110001010',
  '10100110000',
  '10100001100',
  '10010110000',
  '10010000110',
  '10000101100',
  '10000100110',
  '10110010000',
  '10110000100',
  '10011010000',
  '10011000010',
  '10000110100',
  '10000110010',
  '11000010010',
  '11001010000',
  '11110111010',
  '11000010100',
  '10001111010',
  '10100111100',
  '10010111100',
  '10010011110',
  '10111100100',
  '10011110100',
  '10011110010',
  '11110100100',
  '11110010100',
  '11110010010',
  '11011011110',
  '11011110110',
  '11110110110',
  '10101111000',
  '10100011110',
  '10001011110',
  '10111101000',
  '10111100010',
  '11110101000',
  '11110100010',
  '10111011110',
  '10111101110',
  '11101011110',
  '11110101110',
  '11010000100',
  '11010010000',
  '11010011100',
  '1100011101011',
];

const START_B = 104;
const FNC1 = 102;
const STOP = 106;

export type Code128EncodeOptions = {
  /** Prefix FNC1 for GS1-128 (AI element strings). */
  gs1?: boolean;
};

function charCodeB(char: string): number {
  const index = CODE128_B_CHARS.indexOf(char);
  if (index < 0) {
    throw new Error(`Code128 set B cannot encode character: ${JSON.stringify(char)}`);
  }
  return index;
}

function checksum(codes: number[]): number {
  let sum = codes[0] ?? 0;
  for (let i = 1; i < codes.length; i += 1) {
    sum += (codes[i] ?? 0) * i;
  }
  return sum % 103;
}

/** Encode printable ASCII (set B) into Code128 symbol indices (includes start/check/stop). */
export function encodeCode128B(value: string, options: Code128EncodeOptions = {}): number[] {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Code128 value must be a non-empty string');
  }

  const codes: number[] = [START_B];
  if (options.gs1) {
    codes.push(FNC1);
  }
  for (const char of value) {
    codes.push(charCodeB(char));
  }
  codes.push(checksum(codes));
  codes.push(STOP);
  return codes;
}

/** Flatten symbol indices into a module pattern (`1` = bar, `0` = space). */
export function code128Modules(codes: number[]): string {
  return codes.map((code) => CODE128_PATTERNS[code] ?? '').join('');
}

/** Encode a value and return the full module pattern string. */
export function encodeCode128Pattern(value: string, options: Code128EncodeOptions = {}): string {
  return code128Modules(encodeCode128B(value, options));
}

export { CODE128_B_CHARS, FNC1, START_B, STOP };

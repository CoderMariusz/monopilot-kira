/**
 * GS1 Standard Mod-10 check digit computation.
 * Per GS1 General Specs 24.0
 *
 * Algorithm: from right-to-left, multiply each digit alternately by 3 then 1
 * (rightmost digit gets multiplier 3), sum all products, check digit =
 * (10 - (sum mod 10)) mod 10.
 *
 * @param digits - numeric string without check digit
 * @returns check digit character '0'–'9'
 */
export function computeMod10(digits: string): string {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const posFromRight = digits.length - i; // 1-indexed from right
    const weight = posFromRight % 2 === 1 ? 3 : 1; // odd positions get ×3
    sum += parseInt(digits[i], 10) * weight;
  }
  return String((10 - (sum % 10)) % 10);
}

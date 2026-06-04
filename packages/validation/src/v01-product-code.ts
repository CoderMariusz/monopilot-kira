export const V01_PRODUCT_CODE_PATTERN = /^FA[A-Z0-9]+$/;

export type V01ProductCodeResult =
  | { ok: true; productCode: string }
  | { ok: false; code: 'V01_FORMAT' };

export function validateProductCodeV01(input: string): V01ProductCodeResult {
  const productCode = input.trim();
  if (!V01_PRODUCT_CODE_PATTERN.test(productCode)) {
    return { ok: false, code: 'V01_FORMAT' };
  }
  return { ok: true, productCode };
}

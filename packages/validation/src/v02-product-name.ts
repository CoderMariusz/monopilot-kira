export type V02ProductNameResult =
  | { ok: true; productName: string }
  | { ok: false; code: 'V02_REQUIRED' };

export function validateProductNameV02(input: string): V02ProductNameResult {
  const productName = input.trim();
  if (productName.length === 0) {
    return { ok: false, code: 'V02_REQUIRED' };
  }
  return { ok: true, productName };
}

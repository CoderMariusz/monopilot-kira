/**
 * Deterministic allergen reference ids for shipping customer restrictions.
 * Must stay in sync with public.shipping_allergen_reference_id (migration 541).
 */
import { createHash } from 'node:crypto';

export const SHIPPING_ALLERGEN_REFERENCE_ID_PREFIX = 'shipping.allergen_ref:';

export function shippingAllergenReferenceId(orgId: string, allergenCode: string): string {
  const seed = `${SHIPPING_ALLERGEN_REFERENCE_ID_PREFIX}${orgId}:${allergenCode.trim().toLowerCase()}`;
  const hex = createHash('sha256').update(seed, 'utf8').digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(12, 15)}-a${hex.slice(16, 19)}-${hex.slice(20, 32)}`;
}

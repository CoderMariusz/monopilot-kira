'use server';

import { revalidatePath } from 'next/cache';

import { setAllergenOverride } from '../../../actions/set-allergen-override';

/**
 * T-040 — Override submit adapter for the AllergenOverrideModal.
 *
 * setAllergenOverride (T-039) THROWS on validation/authorization failure; the modal's
 * injected action contract is { ok: boolean }. This wrapper normalizes the throw into
 * a non-throwing result so the modal can surface an error state without leaking a stack,
 * and revalidates the allergens route so the cascade re-renders with the new published set.
 *
 * RBAC + reason min-length + org scope are all enforced inside setAllergenOverride; this
 * wrapper adds no trust and carries the (productCode, allergenCode, action, reason) shape.
 */
export async function submitAllergenOverride(
  productCode: string,
  allergenCode: string,
  action: 'add' | 'remove',
  reason: string,
): Promise<{ ok: boolean }> {
  try {
    const result = await setAllergenOverride(productCode, allergenCode, action, reason);
    if (result.ok) {
      revalidatePath(`/npd/fg/${productCode}/allergens`);
    }
    return { ok: result.ok };
  } catch {
    return { ok: false };
  }
}

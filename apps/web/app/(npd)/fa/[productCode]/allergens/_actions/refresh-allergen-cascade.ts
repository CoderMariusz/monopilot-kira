'use server';

import { revalidatePath } from 'next/cache';

import { updateFaAllergenSet } from './update-allergen-set';

/**
 * T-040 — Refresh adapter for the AllergenCascadeWidget Refresh button.
 *
 * Re-runs the T-038 cascade ENGINE (updateFaAllergenSet) for the FG and revalidates
 * the allergens route so the freshly materialized derived/published sets re-render.
 * The widget debounces clicks client-side; this wrapper carries the (productCode: string)
 * → void signature the widget expects.
 *
 * RBAC + org scope are enforced inside updateFaAllergenSet (FORBIDDEN when the caller
 * lacks npd.allergen.write). This wrapper never trusts the client.
 */
export async function refreshAllergenCascade(productCode: string): Promise<void> {
  const code = typeof productCode === 'string' ? productCode.trim() : '';
  if (!code) return;

  const result = await updateFaAllergenSet({ productCode: code });
  if (result.ok && result.changed) {
    revalidatePath(`/npd/fg/${code}/allergens`);
  }
}

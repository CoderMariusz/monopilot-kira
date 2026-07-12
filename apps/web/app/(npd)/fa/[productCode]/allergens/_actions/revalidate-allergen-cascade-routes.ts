import { revalidateLocalized } from '../../../../../../lib/i18n/revalidate-localized';

/** Canonical FG allergen cascade routes (locale prefix applied by revalidateLocalized). */
export function revalidateAllergenCascadeRoutes(productCode: string): void {
  const code = productCode.trim();
  if (!code) return;
  revalidateLocalized(`/fg/${code}`, 'page');
  revalidateLocalized(`/fg/${code}/allergens`, 'page');
  revalidateLocalized('/allergen-cascade', 'page');
}

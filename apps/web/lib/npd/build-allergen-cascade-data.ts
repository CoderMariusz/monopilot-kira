import type { AllergenCascadeData } from '../../app/(npd)/fa/[productCode]/_components/allergen-cascade-widget';

export function buildAllergenCascadeData(
  productCode: string,
  cascade: {
    productCode?: string;
    derivedAllergens?: string[];
    publishedAllergens?: string[];
    mayContainAllergens?: string[];
    conditionalProcessAllergens?: string[];
  } | null,
  declaration: { accepted: boolean; acceptedBy: string | null; acceptedAt: string | null },
): AllergenCascadeData {
  return {
    productCode: cascade?.productCode ?? productCode,
    derivedAllergens: cascade?.derivedAllergens ?? [],
    publishedAllergens: cascade?.publishedAllergens ?? [],
    mayContainAllergens: cascade?.mayContainAllergens ?? [],
    conditionalProcessAllergens: cascade?.conditionalProcessAllergens ?? [],
    declarationAccepted: declaration.accepted,
    declarationAcceptedBy: declaration.acceptedBy,
    declarationAcceptedAt: declaration.acceptedAt,
  };
}

export function canEditProductionFromFormulationIngredientCount(count: number | null | undefined): boolean {
  return Number.isFinite(count) && Number(count) >= 1;
}

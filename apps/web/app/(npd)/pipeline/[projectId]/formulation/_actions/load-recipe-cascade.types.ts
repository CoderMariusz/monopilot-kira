export type RecipeCascadeSubRecipe = {
  lines: RecipeCascadeSubLine[];
  totalCost: number;
  cycle?: boolean;
  maxDepthReached?: boolean;
};

export type RecipeCascadeSubLine = {
  itemCode: string;
  itemName: string;
  pct: number;
  unitCost: number;
  nutritionPer100g?: Record<string, number>;
  hasSubRecipe?: boolean;
  subRecipe?: RecipeCascadeSubRecipe;
};

export type RecipeCascadeNode = {
  ingredientLineId: string;
  /** Stable ordering key — survives saveDraft delete/reinsert of formulation_ingredients. */
  sequence: number;
  /** Stable item reference for cascade row lookup when line ids rotate. */
  itemId: string | null;
  itemCode: string;
  itemName: string;
  hasSubRecipe: boolean;
  subRecipe?: RecipeCascadeSubRecipe;
};

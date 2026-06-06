/**
 * Finish-WIP editor — shared types, zod schemas and constants.
 *
 * This is a PLAIN module (NOT `'use server'`): a `'use server'` file may only
 * export async functions, so the zod schemas / result types / permission-string
 * constants live here and are imported by both the Server Actions
 * (`finish-wip.ts`) and the client component / tests. Keeping them out of the
 * `'use server'` module is what keeps `next build` happy (the recurring
 * "`'use server'` non-async export" live-bug for this module).
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Seeded RBAC permission strings (byte-identical to the migration seeds).
//   read  → npd.fa.read    (packages/db/migrations/149|236; pages CHECK it)
//   write → npd.core.write (packages/db/migrations/080|149|236)
// ---------------------------------------------------------------------------

export const FINISH_WIP_READ_PERMISSION = 'npd.fa.read';
export const FINISH_WIP_WRITE_PERMISSION = 'npd.core.write';

/** Outbox event for Core/recipe component changes (shared with chain 3). */
export const FINISH_WIP_EVENT = 'fa.recipe_changed';
export const FINISH_WIP_APP_VERSION = 'finish-wip-editor-v1';

// ---------------------------------------------------------------------------
// zod input schemas
// ---------------------------------------------------------------------------

export const listProdDetailSchema = z.object({
  productCode: z.string().trim().min(1),
});
export type ListProdDetailInput = z.input<typeof listProdDetailSchema>;

export const addProdDetailRowSchema = z.object({
  productCode: z.string().trim().min(1),
  /** Human component / PR display code (the editable "Finish WIP component"). */
  intermediateCode: z.string().trim().min(1).max(64),
  /** Optional per-component weight in grams. */
  componentWeight: z.union([z.string(), z.number()]).optional(),
});
export type AddProdDetailRowInput = z.input<typeof addProdDetailRowSchema>;

export const updateProdDetailRowSchema = z.object({
  productCode: z.string().trim().min(1),
  prodDetailId: z.string().uuid(),
  /** New human component code; the RM/intermediate code is RE-DERIVED server-side. */
  intermediateCode: z.string().trim().min(1).max(64),
  componentWeight: z.union([z.string(), z.number()]).optional(),
});
export type UpdateProdDetailRowInput = z.input<typeof updateProdDetailRowSchema>;

export const removeProdDetailRowSchema = z.object({
  productCode: z.string().trim().min(1),
  prodDetailId: z.string().uuid(),
});
export type RemoveProdDetailRowInput = z.input<typeof removeProdDetailRowSchema>;

// ---------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------

/** A single finish-WIP row as rendered by the editor (real prod_detail shape). */
export type FinishWipRow = {
  /** prod_detail.id (uuid). */
  id: string;
  /** 1-based component_index (display order). */
  componentIndex: number;
  /** Editable human component / PR code (prod_detail.intermediate_code). */
  intermediateCode: string;
  /**
   * AUTO-derived RM / ingredient code (read-only green). Derived from the
   * component code via cascade chain 3 (`deriveIngredientCodes`), NOT stored as
   * a separate column — it is computed for display so the editor mirrors the
   * Core tab's "Ingredient codes (auto)" green field.
   */
  ingredientCode: string;
  /** Optional per-component weight in grams (display only here). */
  componentWeight: number | null;
};

export type ListProdDetailResult = {
  rows: FinishWipRow[];
};

export type AddProdDetailRowResult = FinishWipRow;
export type UpdateProdDetailRowResult = FinishWipRow;
export type RemoveProdDetailRowResult = { removed: boolean };

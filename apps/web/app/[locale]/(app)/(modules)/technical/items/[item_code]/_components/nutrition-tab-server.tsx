/**
 * TAXONOMY lane — Item Detail · Nutrition tab server wrapper (TEC-012).
 *
 * Resolves the tab MODE from the item's type (server-side, never client-trusted)
 * and loads the matching real Supabase data:
 *   - rm / ingredient / intermediate → getItemNutrition (the editable per-100 g +
 *     inherited-allergen model), Save bound to upsertNutrition.
 *   - fg → getNutritionPanel (the NPD-materialized read model in
 *     public.nutrition_profiles), rendered read-only.
 *   - packaging / co_product / byproduct → 'na' empty state (no read).
 *
 * No mocks: every read/write hits Supabase under withOrgContext + RLS.
 */

import { getItemNutrition, upsertNutrition } from '../_actions/upsert-nutrition';
import { getNutritionPanel } from '../../../nutrition/_actions/list-nutrition';
import {
  NutritionTab,
  type NutritionEditData,
  type NutritionReadonlyData,
  type NutritionSaveResult,
  type NutritionTabLabels,
  type NutritionTabMode,
} from './nutrition-tab.client';
import type { ItemType } from '../../_actions/shared';

const EDIT_TYPES: ReadonlySet<ItemType> = new Set<ItemType>(['rm', 'ingredient', 'intermediate']);

function modeForType(itemType: ItemType): NutritionTabMode {
  if (EDIT_TYPES.has(itemType)) return 'edit';
  if (itemType === 'fg') return 'readonly';
  return 'na';
}

export async function NutritionTabServer({
  itemCode,
  itemType,
  canEdit,
  labels,
}: {
  itemCode: string;
  itemType: ItemType;
  canEdit: boolean;
  labels: NutritionTabLabels;
}) {
  const mode = modeForType(itemType);

  if (mode === 'na') {
    return (
      <NutritionTab mode="na" state="empty" itemCode={itemCode} canEdit={false} labels={labels} />
    );
  }

  if (mode === 'readonly') {
    const panel = await getNutritionPanel(itemCode);
    const readonlyData: NutritionReadonlyData | null =
      panel.ok
        ? {
            productName: panel.panel.productName,
            computedAt: panel.panel.computedAt,
            macros: panel.panel.macros.map((m) => ({
              nutrientCode: m.nutrientCode,
              displayName: m.displayName,
              unit: m.unit,
              per100g: m.per100g,
              perPortion: m.perPortion,
            })),
            allergens: panel.panel.allergens.map((a) => ({
              code: a.allergenCode,
              name: a.name,
              presence: a.presence,
            })),
          }
        : null;
    return (
      <NutritionTab
        mode="readonly"
        state={panel.ok ? 'ready' : 'error'}
        itemCode={itemCode}
        canEdit={false}
        labels={labels}
        readonlyData={readonlyData}
      />
    );
  }

  // edit mode
  const loaded = await getItemNutrition(itemCode);
  const editData: NutritionEditData | null = loaded
    ? { itemCode, nutrition: loaded.nutrition, allergensInherited: loaded.allergensInherited }
    : null;

  async function saveAction(input: NutritionEditData): Promise<NutritionSaveResult> {
    'use server';
    const result = await upsertNutrition({
      itemCode: input.itemCode,
      nutrition: input.nutrition,
      allergensInherited: input.allergensInherited,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  return (
    <NutritionTab
      mode="edit"
      state="ready"
      itemCode={itemCode}
      canEdit={canEdit}
      labels={labels}
      editData={editData}
      saveAction={saveAction}
    />
  );
}

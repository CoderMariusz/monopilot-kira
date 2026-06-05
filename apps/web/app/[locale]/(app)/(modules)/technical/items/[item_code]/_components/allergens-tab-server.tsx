/**
 * Lane A1 — Item Detail · Allergens tab server wrapper (TEC-012 / TEC-040).
 *
 * Loads the real allergen profile (loadAllergenProfileEditor → withOrgContext +
 * RLS) and renders the existing client editor with the saveAllergenOverride
 * Server Action bound. Keeps the detail page lean and lets the deferred tab be
 * server-fetched on demand. No mocks — every read/write hits real Supabase.
 */

import {
  loadAllergenProfileEditor,
  saveAllergenOverride,
  type AllergenProfileEditorData,
} from '../_actions/allergen-profile';
import { AllergensTab, type AllergensTabLabels } from './allergens-tab.client';
import type { DeclarationDraft, DeclarationSaveResult } from './allergen-declaration-modal';

export async function AllergensTabServer({
  itemCode,
  labels,
}: {
  itemCode: string;
  labels: AllergensTabLabels;
}) {
  const data: AllergenProfileEditorData = await loadAllergenProfileEditor(itemCode);

  const state =
    data.state === 'error' ? 'error' : data.state === 'empty' ? 'empty' : 'ready';

  async function saveOverrideAction(
    draft: DeclarationDraft & { itemCode: string },
  ): Promise<DeclarationSaveResult> {
    'use server';
    const result = await saveAllergenOverride({
      itemCode: draft.itemCode,
      allergenCode: draft.allergenCode,
      intensity: draft.intensity,
      confidence: draft.confidence,
      reason: draft.reason,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  return (
    <AllergensTab
      data={data}
      labels={labels}
      state={state}
      canEdit={data.canEdit}
      saveOverrideAction={saveOverrideAction}
    />
  );
}

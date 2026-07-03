'use server';

import { searchWipDefinitions } from '../../../../../[locale]/(app)/(modules)/technical/wip-library/_actions/wip-definition-actions';

export type WipDefinitionPickerOption = {
  id: string;
  name: string;
  baseUom: string;
  itemId: string;
  itemCode: string;
};

export async function searchWipDefinitionsForFormulation(input: { q?: string }) {
  const result = await searchWipDefinitions({ q: input.q ?? '' });
  if (!result.ok) return { ok: false as const, error: result.error };
  return {
    ok: true as const,
    options: result.options as WipDefinitionPickerOption[],
  };
}

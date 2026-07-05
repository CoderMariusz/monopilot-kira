/** W5 — legacy prod_detail columns hidden from the Production grid (data may still load). */
export const W5_HIDDEN_PRODUCTION_COLUMN_KEYS = new Set<string>([
  'line',
  'rate',
  'resource_requirement',
]);

/** W5 — legacy Reference dropdown replaced by UUID production_lines picker. */
export const W5_LEGACY_LINE_DROPDOWN_SOURCE = 'Lines_By_PackSize';

export type FaProductionLineOption = {
  id: string;
  code: string;
  name: string;
};

export function isW5HiddenProductionColumn(key: string, dropdownSource?: string): boolean {
  if (W5_HIDDEN_PRODUCTION_COLUMN_KEYS.has(key)) return true;
  if (dropdownSource === W5_LEGACY_LINE_DROPDOWN_SOURCE) return true;
  return false;
}

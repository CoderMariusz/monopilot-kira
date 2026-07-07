/** W5 + R4.2 — legacy prod_detail columns hidden from the Production grid (data
 * may still load; server columns are NOT dropped). The per-process card model
 * (line + consumption + processes) supersedes these:
 *   - line / rate               → W5 UUID production-line picker + per-process line
 *   - resource_requirement / staffing → per-process roles (labor)
 *   - equipment_setup / dieset  → auto-derived-from-line noise (chain 1)
 *   - closed_production         → duplicate of the real production model (audit §1)
 * The physical DeptColumns keys are equipment_setup (labeled "Dieset") and
 * resource_requirement (labeled "Staffing"); the friendly aliases dieset/staffing
 * are hidden too so a re-keyed catalog can't reintroduce them. */
export const W5_HIDDEN_PRODUCTION_COLUMN_KEYS = new Set<string>([
  'line',
  'rate',
  'resource_requirement',
  'staffing',
  'equipment_setup',
  'dieset',
  'closed_production',
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

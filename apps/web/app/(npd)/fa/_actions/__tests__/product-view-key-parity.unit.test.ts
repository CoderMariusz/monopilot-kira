import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../../../..');

// Snapshot of public.product columns from packages/db/migrations/359-product-as-items-view-cut.sql.
const PRODUCT_VIEW_COLUMNS = new Set([
  'product_code',
  'product_name',
  'pack_size',
  'number_of_cases',
  'recipe_components',
  'ingredient_codes',
  'template',
  'closed_core',
  'primary_ingredient_pct',
  'runs_per_week',
  'date_code_per_week',
  'closed_planning',
  'launch_date',
  'department_number',
  'article_number',
  'bar_codes',
  'cases_per_week_w1',
  'cases_per_week_w2',
  'cases_per_week_w3',
  'closed_commercial',
  'process_1',
  'yield_p1',
  'process_2',
  'yield_p2',
  'process_3',
  'yield_p3',
  'process_4',
  'yield_p4',
  'line',
  'dieset',
  'yield_line',
  'staffing',
  'rate',
  'pr_code_p1',
  'pr_code_p2',
  'pr_code_p3',
  'pr_code_p4',
  'pr_code_final',
  'closed_production',
  'shelf_life',
  'closed_technical',
  'box',
  'top_label',
  'bottom_label',
  'web',
  'mrp_box',
  'mrp_labels',
  'mrp_films',
  'mrp_sleeves',
  'mrp_cartons',
  'tara_weight',
  'pallet_stacking_plan',
  'box_dimensions',
  'closed_mrp',
  'price',
  'lead_time',
  'supplier',
  'proc_shelf_life',
  'closed_procurement',
  'done_core',
  'done_planning',
  'done_commercial',
  'done_production',
  'done_technical',
  'done_mrp',
  'done_procurement',
  'status_overall',
  'days_to_launch',
  'built',
  'org_id',
  'ext_jsonb',
  'private_jsonb',
  'schema_version',
  'model_prediction_id',
  'epcis_event_id',
  'external_id',
  'created_at',
  'created_by_user',
  'created_by_device',
  'app_version',
  'allergens',
  'may_contain',
  'deleted_at',
  'volume',
  'dev_code',
  'weight',
  'packs_per_case',
  'benchmark',
  'price_brief',
  'comments',
  'allergens_declaration_accepted',
  'allergens_declaration_accepted_by',
  'allergens_declaration_accepted_at',
]);

const FALLBACK_CATALOG_SOURCES = [
  'apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/page.tsx',
  'apps/web/app/(npd)/fa/_actions/load-formulation-wip-panel.ts',
];

function autoDerivedKeysFromSource(path: string): string[] {
  const source = readFileSync(resolve(repoRoot, path), 'utf8');
  const match = source.match(/const AUTO_DERIVED_KEYS = new Set<string>\(\[([\s\S]*?)\]\);/);
  expect(match, `${path} should declare AUTO_DERIVED_KEYS`).not.toBeNull();
  return Array.from((match?.[1] ?? '').matchAll(/'([a-z0-9_]+)'/g), (keyMatch) => keyMatch[1]);
}

describe('NPD TS fallback catalog keys', () => {
  it('stay aligned to the public.product view shape', () => {
    const keys = FALLBACK_CATALOG_SOURCES.flatMap(autoDerivedKeysFromSource);
    expect(keys).toContain('dieset');
    expect(keys).not.toContain('equipment_setup');
    expect(keys).not.toContain('resource_requirement');
    expect(keys.filter((key) => !PRODUCT_VIEW_COLUMNS.has(key))).toEqual([]);
  });
});

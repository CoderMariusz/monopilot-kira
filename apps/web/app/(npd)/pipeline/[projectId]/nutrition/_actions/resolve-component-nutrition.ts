import {
  resolveComponentNutrition,
  type ResolvedComponentNutrition,
} from '@monopilot/domain';

/** Postgres SQLSTATE for "undefined_table" (relation does not exist). */
const PG_UNDEFINED_TABLE = '42P01';

interface RawMaterialNutritionRow {
  rm_code: string;
  nutrition_per_100g: Record<string, unknown> | null;
  allergens_inherited: string[] | null;
}

interface IntermediateRow {
  item_code: string;
  id: string;
}

interface BomLineRow {
  component_code: string;
  quantity: string;
}

export type NutritionQueryClient = {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

export type ResolvedComponentNutritionLoadResult = {
  sources: Record<string, ResolvedComponentNutrition>;
  nutritionByCode: Record<string, Record<string, string>>;
  /** False only when Reference.RawMaterials is missing (42P01). */
  sourceAvailable: boolean;
};

export function stringifyNutrition(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined) continue;
    out[key] = String(value);
  }
  return out;
}

/**
 * Recursively resolve per-100g nutrition for formulation component codes (RM leaf +
 * intermediate/WIP via active BOM or wip_definition_ingredients). Shared by the
 * persisted compute path, recompute cache, and the live Recipe Nutrition read model.
 */
export async function loadResolvedComponentNutrition(
  client: NutritionQueryClient,
  rmCodes: readonly string[],
): Promise<ResolvedComponentNutritionLoadResult> {
  let sourceAvailable = true;
  const sources = await resolveComponentNutrition(rmCodes, {
    loadRawMaterials: async (codes) => {
      let rows: RawMaterialNutritionRow[];
      try {
        ({ rows } = await client.query<RawMaterialNutritionRow>(
          `select rm_code, nutrition_per_100g, allergens_inherited
             from "Reference"."RawMaterials"
            where org_id = app.current_org_id()
              and rm_code = any($1::text[])`,
          [codes],
        ));
      } catch (err) {
        if ((err as { code?: string })?.code !== PG_UNDEFINED_TABLE) throw err;
        sourceAvailable = false;
        return {};
      }
      return Object.fromEntries(
        rows.map((row) => [
          row.rm_code,
          {
            nutritionPer100g: stringifyNutrition(row.nutrition_per_100g ?? {}),
            allergensInherited: row.allergens_inherited ?? [],
          },
        ]),
      );
    },
    loadIntermediates: async (codes) => {
      const { rows } = await client.query<IntermediateRow>(
        `select item_code, id::text as id
           from public.items
          where org_id = app.current_org_id()
            and item_type = 'intermediate'
            and item_code = any($1::text[])`,
        [codes],
      );
      return Object.fromEntries(rows.map((row) => [row.item_code, row.id]));
    },
    loadActiveBom: async (itemId) => {
      const { rows } = await client.query<BomLineRow>(
        `with active_bom as (
           select bl.component_code, bl.quantity::text as quantity, bl.line_no as sequence
             from public.bom_lines bl
             join public.bom_headers h
               on h.id = bl.bom_header_id and h.org_id = bl.org_id
            where bl.org_id = app.current_org_id()
              and h.org_id = app.current_org_id()
              and h.item_id = $1::uuid
              and h.status = 'active'
         ),
         active_definition as (
           select id
             from public.wip_definitions
            where org_id = app.current_org_id()
              and item_id = $1::uuid
              and status = 'active'
            limit 1
         ),
         selected_components as (
           select component_code, quantity, sequence from active_bom
           union all
           select i.item_code, wdi.qty_per_unit::text, wdi.sequence
             from active_definition wd
             join public.wip_definition_ingredients wdi
               on wdi.wip_definition_id = wd.id
              and wdi.org_id = app.current_org_id()
             join public.items i
               on i.id = wdi.item_id
              and i.org_id = app.current_org_id()
            where not exists (select 1 from active_bom)
         )
         select component_code, quantity
           from selected_components
          order by sequence asc`,
        [itemId],
      );
      return rows.map((row) => ({ componentCode: row.component_code, quantity: row.quantity }));
    },
  });

  const nutritionByCode: Record<string, Record<string, string>> = {};
  for (const [code, source] of Object.entries(sources)) {
    nutritionByCode[code] = stringifyNutrition(source.nutritionPer100g);
  }

  return { sources, nutritionByCode, sourceAvailable };
}

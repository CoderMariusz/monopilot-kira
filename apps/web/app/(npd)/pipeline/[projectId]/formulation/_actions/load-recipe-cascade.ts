'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

import type {
  RecipeCascadeNode,
  RecipeCascadeSubLine,
  RecipeCascadeSubRecipe,
} from './load-recipe-cascade.types';

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

type IngredientLineRow = {
  ingredient_line_id: string;
  line_sequence: number;
  item_id: string | null;
  item_code: string | null;
  item_name: string | null;
};

type RecipeVersionRow = {
  version_id: string;
};

type RecipeComponentRow = {
  item_id: string | null;
  item_code: string | null;
  item_name: string | null;
  pct: string | null;
  qty_kg: string | null;
  unit_cost: string | null;
  nutrition_per_100g: Record<string, unknown> | null;
};

type BomComponentRow = {
  item_id: string | null;
  item_code: string | null;
  item_name: string | null;
  qty_kg: string | null;
  unit_cost: string | null;
  nutrition_per_100g: Record<string, unknown> | null;
};

const MAX_DEPTH = 3;
const PG_UNDEFINED_TABLE = '42P01';
const BOM_CASCADE_LOAD_FAILED = 'BOM_CASCADE_LOAD_FAILED';

export async function loadRecipeCascade(
  projectId: string,
  formulationVersionId: string,
): Promise<RecipeCascadeNode[]> {
  if (!parseUuid(projectId) || !parseUuid(formulationVersionId)) return [];

  try {
    return await withOrgContext(async ({ client }) => {
      const ingredients = await client.query<IngredientLineRow>(
        `select fi.id::text as ingredient_line_id,
                fi.sequence as line_sequence,
                fi.item_id::text as item_id,
                i.item_code,
                i.name as item_name
           from public.formulations f
           join public.formulation_versions fv
             on fv.formulation_id = f.id
            and fv.id = $2::uuid
           join public.formulation_ingredients fi
             on fi.version_id = fv.id
           left join public.items i
             on i.id = fi.item_id
            and i.org_id = app.current_org_id()
          where f.project_id = $1::uuid
            and f.org_id = app.current_org_id()
          order by fi.sequence`,
        [projectId, formulationVersionId],
      );

      const nodes: RecipeCascadeNode[] = [];
      for (const ingredient of ingredients.rows) {
        const itemCode = ingredient.item_code ?? '';
        const itemName = ingredient.item_name ?? itemCode;
        const subRecipe =
          itemCode || ingredient.item_id
            ? await loadSubRecipe(client, itemCode, 1, new Set(itemCode ? [itemCode] : []), ingredient.item_id)
            : undefined;
        nodes.push({
          ingredientLineId: ingredient.ingredient_line_id,
          sequence: ingredient.line_sequence,
          itemId: ingredient.item_id,
          itemCode,
          itemName,
          hasSubRecipe: Boolean(subRecipe),
          ...(subRecipe ? { subRecipe } : {}),
        });
      }
      return nodes;
    });
  } catch (err) {
    // BOM fallback failures must not collapse into a silent empty cascade.
    if ((err as { code?: string })?.code === BOM_CASCADE_LOAD_FAILED) throw err;
    return [];
  }
}

async function loadSubRecipe(
  client: QueryClient,
  itemCode: string,
  depth: number,
  visited: Set<string>,
  itemId?: string | null,
): Promise<RecipeCascadeSubRecipe | undefined> {
  if (depth >= MAX_DEPTH) {
    if (itemCode || itemId) {
      if (await hasExpandableSubRecipe(client, itemCode, itemId ?? null)) {
        return { lines: [], totalCost: 0, maxDepthReached: true };
      }
    }
    return undefined;
  }

  const version = itemCode ? await findActiveRecipeVersion(client, itemCode) : null;
  if (version) {
    return loadFormulationSubRecipe(client, version.version_id, depth, visited);
  }

  // WIP/intermediate: prefer ACTIVE bom-with-lines; else active wip_definition_ingredients.
  if (!itemId) return undefined;

  const bom = await loadBomSubRecipe(client, itemId, depth, visited);
  if (bom) return bom;
  return loadWipDefinitionSubRecipe(client, itemId, depth, visited);
}

async function hasExpandableSubRecipe(
  client: QueryClient,
  itemCode: string,
  itemId: string | null,
): Promise<boolean> {
  if (itemCode) {
    const version = await findActiveRecipeVersion(client, itemCode);
    if (version) {
      const components = await loadRecipeComponents(client, version.version_id);
      if (components.rows.length > 0) return true;
    }
  }
  if (!itemId) return false;
  const bom = await loadBomComponents(client, itemId);
  if (bom.rows.length > 0) return true;
  const wipDef = await loadWipDefinitionComponents(client, itemId);
  return wipDef.rows.length > 0;
}

async function loadFormulationSubRecipe(
  client: QueryClient,
  versionId: string,
  depth: number,
  visited: Set<string>,
): Promise<RecipeCascadeSubRecipe> {
  const components = await loadRecipeComponents(client, versionId);
  const lines: RecipeCascadeSubLine[] = [];
  let totalCost = 0;

  for (const component of components.rows) {
    const componentCode = component.item_code ?? '';
    const pct = toNumber(component.pct);
    const unitCost = toNumber(component.unit_cost);
    const qtyKg = toNumber(component.qty_kg);
    totalCost += unitCost * qtyKg;

    const nutritionPer100g = normalizeNutrition(component.nutrition_per_100g);
    const line: RecipeCascadeSubLine = {
      itemCode: componentCode,
      itemName: component.item_name ?? componentCode,
      pct,
      unitCost,
      ...(nutritionPer100g ? { nutritionPer100g } : {}),
    };

    await attachNestedSubRecipe(client, line, componentCode, component.item_id, depth, visited);
    lines.push(line);
  }

  return { lines, totalCost };
}

async function loadBomSubRecipe(
  client: QueryClient,
  itemId: string,
  depth: number,
  visited: Set<string>,
): Promise<RecipeCascadeSubRecipe | undefined> {
  const components = await loadBomComponents(client, itemId);
  if (components.rows.length === 0) return undefined;
  return buildQtyBasedSubRecipe(client, components.rows, depth, visited);
}

/** ACTIVE wip_definitions recipe via wip_definition_ingredients (pre-materialisation source). */
async function loadWipDefinitionSubRecipe(
  client: QueryClient,
  itemId: string,
  depth: number,
  visited: Set<string>,
): Promise<RecipeCascadeSubRecipe | undefined> {
  const components = await loadWipDefinitionComponents(client, itemId);
  if (components.rows.length === 0) return undefined;
  return buildQtyBasedSubRecipe(client, components.rows, depth, visited);
}

async function buildQtyBasedSubRecipe(
  client: QueryClient,
  rows: BomComponentRow[],
  depth: number,
  visited: Set<string>,
): Promise<RecipeCascadeSubRecipe> {
  const qtyValues = rows.map((row) => toNumber(row.qty_kg));
  const qtySum = qtyValues.reduce((sum, qty) => sum + qty, 0);

  const lines: RecipeCascadeSubLine[] = [];
  let totalCost = 0;

  for (let i = 0; i < rows.length; i++) {
    const component = rows[i]!;
    const componentCode = component.item_code ?? '';
    const qtyKg = qtyValues[i] ?? 0;
    const unitCost = toNumber(component.unit_cost);
    totalCost += unitCost * qtyKg;

    const nutritionPer100g = normalizeNutrition(component.nutrition_per_100g);
    const line: RecipeCascadeSubLine = {
      itemCode: componentCode,
      itemName: component.item_name ?? componentCode,
      pct: qtySum > 0 ? (qtyKg / qtySum) * 100 : 0,
      unitCost,
      ...(nutritionPer100g ? { nutritionPer100g } : {}),
    };

    await attachNestedSubRecipe(client, line, componentCode, component.item_id, depth, visited);
    lines.push(line);
  }

  return { lines, totalCost };
}

async function attachNestedSubRecipe(
  client: QueryClient,
  line: RecipeCascadeSubLine,
  componentCode: string,
  componentItemId: string | null | undefined,
  depth: number,
  visited: Set<string>,
): Promise<void> {
  if (!componentCode && !componentItemId) return;

  const visitKey = componentCode || `id:${componentItemId}`;
  if (visited.has(visitKey) || (componentCode && visited.has(componentCode))) {
    line.hasSubRecipe = true;
    line.subRecipe = { lines: [], totalCost: 0, cycle: true };
    return;
  }

  const nextVisited = new Set(visited);
  nextVisited.add(visitKey);
  if (componentCode) nextVisited.add(componentCode);

  const child = await loadSubRecipe(client, componentCode, depth + 1, nextVisited, componentItemId);
  if (child) {
    line.hasSubRecipe = true;
    line.subRecipe = child;
  }
}

async function findActiveRecipeVersion(client: QueryClient, itemCode: string): Promise<RecipeVersionRow | null> {
  const result = await client.query<RecipeVersionRow>(
    `select fv.id::text as version_id
       from public.formulations f
       join public.formulation_versions fv
         on fv.formulation_id = f.id
      where f.org_id = app.current_org_id()
        and f.product_code = $1::text
        and fv.state in ('locked', 'active')
      order by (fv.id = f.current_version_id) desc,
               fv.version_number desc
      limit 1`,
    [itemCode],
  );
  return result.rows[0] ?? null;
}

async function loadRecipeComponents(client: QueryClient, versionId: string): Promise<{ rows: RecipeComponentRow[] }> {
  try {
    return await client.query<RecipeComponentRow>(
      `select i.id::text as item_id,
              coalesce(i.item_code, fi.rm_code) as item_code,
              coalesce(i.name, fi.rm_code) as item_name,
              fi.pct::text,
              fi.qty_kg::text,
              vec.amount::text as unit_cost,
              rm.nutrition_per_100g
         from public.formulation_ingredients fi
         left join public.items i
           on i.id = fi.item_id
          and i.org_id = app.current_org_id()
         left join public.v_item_effective_cost vec
           on vec.item_id = i.id
          and vec.org_id = app.current_org_id()
         left join "Reference"."RawMaterials" rm
           on rm.org_id = app.current_org_id()
          and rm.rm_code = coalesce(i.item_code, fi.rm_code)
        where fi.version_id = $1::uuid
        order by fi.sequence`,
      [versionId],
    );
  } catch (err) {
    if ((err as { code?: string })?.code !== PG_UNDEFINED_TABLE) throw err;
    return await client.query<RecipeComponentRow>(
      `select i.id::text as item_id,
              coalesce(i.item_code, fi.rm_code) as item_code,
              coalesce(i.name, fi.rm_code) as item_name,
              fi.pct::text,
              fi.qty_kg::text,
              vec.amount::text as unit_cost,
              null::jsonb as nutrition_per_100g
         from public.formulation_ingredients fi
         left join public.items i
           on i.id = fi.item_id
          and i.org_id = app.current_org_id()
         left join public.v_item_effective_cost vec
           on vec.item_id = i.id
          and vec.org_id = app.current_org_id()
        where fi.version_id = $1::uuid
        order by fi.sequence`,
      [versionId],
    );
  }
}

/**
 * Active wip_definition ingredients by item_id — canonical NPD WIP recipe before BOM
 * materialisation. qty_per_unit maps to qty_kg for pct/cost roll-up.
 */
async function loadWipDefinitionComponents(
  client: QueryClient,
  wipItemId: string,
): Promise<{ rows: BomComponentRow[] }> {
  try {
    return await client.query<BomComponentRow>(
      `select wdi.item_id::text as item_id,
              i.item_code,
              coalesce(i.name, i.item_code) as item_name,
              wdi.qty_per_unit::text as qty_kg,
              vec.amount::text as unit_cost,
              rm.nutrition_per_100g
         from public.wip_definitions wd
         join public.wip_definition_ingredients wdi
           on wdi.wip_definition_id = wd.id
          and wdi.org_id = wd.org_id
         join public.items i
           on i.id = wdi.item_id
          and i.org_id = app.current_org_id()
         left join public.v_item_effective_cost vec
           on vec.item_id = wdi.item_id
          and vec.org_id = app.current_org_id()
         left join "Reference"."RawMaterials" rm
           on rm.org_id = app.current_org_id()
          and rm.rm_code = i.item_code
        where wd.org_id = app.current_org_id()
          and wd.item_id = $1::uuid
          and wd.status = 'active'
        order by wdi.sequence, i.item_code`,
      [wipItemId],
    );
  } catch (err) {
    if ((err as { code?: string })?.code !== PG_UNDEFINED_TABLE) throw err;
    // ponytail: RawMaterials may be absent in some test/envs; cost/name still resolve.
    return await client.query<BomComponentRow>(
      `select wdi.item_id::text as item_id,
              i.item_code,
              coalesce(i.name, i.item_code) as item_name,
              wdi.qty_per_unit::text as qty_kg,
              vec.amount::text as unit_cost,
              null::jsonb as nutrition_per_100g
         from public.wip_definitions wd
         join public.wip_definition_ingredients wdi
           on wdi.wip_definition_id = wd.id
          and wdi.org_id = wd.org_id
         join public.items i
           on i.id = wdi.item_id
          and i.org_id = app.current_org_id()
         left join public.v_item_effective_cost vec
           on vec.item_id = wdi.item_id
          and vec.org_id = app.current_org_id()
        where wd.org_id = app.current_org_id()
          and wd.item_id = $1::uuid
          and wd.status = 'active'
        order by wdi.sequence, i.item_code`,
      [wipItemId],
    );
  }
}

/** Exact pattern of technical/bom loadWipSubBom — ACTIVE header by item_id — plus cost/name for cascade. */
async function loadBomComponents(client: QueryClient, wipItemId: string): Promise<{ rows: BomComponentRow[] }> {
  try {
    try {
      return await client.query<BomComponentRow>(
        `select bl.item_id::text as item_id,
                bl.component_code as item_code,
                coalesce(i.name, bl.component_code) as item_name,
                bl.quantity::text as qty_kg,
                vec.amount::text as unit_cost,
                rm.nutrition_per_100g
           from public.bom_lines bl
           join public.bom_headers h
             on h.id = bl.bom_header_id and h.org_id = bl.org_id
           left join public.items i
             on i.id = bl.item_id and i.org_id = bl.org_id
           left join public.v_item_effective_cost vec
             on vec.item_id = bl.item_id
            and vec.org_id = app.current_org_id()
           left join "Reference"."RawMaterials" rm
             on rm.org_id = app.current_org_id()
            and rm.rm_code = bl.component_code
          where bl.org_id = app.current_org_id()
            and h.org_id = app.current_org_id()
            and h.item_id = $1::uuid
            and h.status = 'active'
          order by bl.line_no asc`,
        [wipItemId],
      );
    } catch (err) {
      if ((err as { code?: string })?.code !== PG_UNDEFINED_TABLE) throw err;
      // ponytail: RawMaterials may be absent in some test/envs; cost/name still resolve.
      return await client.query<BomComponentRow>(
        `select bl.item_id::text as item_id,
                bl.component_code as item_code,
                coalesce(i.name, bl.component_code) as item_name,
                bl.quantity::text as qty_kg,
                vec.amount::text as unit_cost,
                null::jsonb as nutrition_per_100g
           from public.bom_lines bl
           join public.bom_headers h
             on h.id = bl.bom_header_id and h.org_id = bl.org_id
           left join public.items i
             on i.id = bl.item_id and i.org_id = bl.org_id
           left join public.v_item_effective_cost vec
             on vec.item_id = bl.item_id
            and vec.org_id = app.current_org_id()
          where bl.org_id = app.current_org_id()
            and h.org_id = app.current_org_id()
            and h.item_id = $1::uuid
            and h.status = 'active'
          order by bl.line_no asc`,
        [wipItemId],
      );
    }
  } catch (err) {
    console.error('[npd/formulation] loadRecipeCascade BOM fallback failed', {
      itemId: wipItemId,
      err: err instanceof Error ? err.message : String(err),
    });
    throw Object.assign(new Error(BOM_CASCADE_LOAD_FAILED), {
      code: BOM_CASCADE_LOAD_FAILED,
      cause: err,
    });
  }
}

function normalizeNutrition(src: Record<string, unknown> | null): Record<string, number> | undefined {
  if (!src) return undefined;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(src)) {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(numeric)) out[key] = numeric;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function toNumber(value: string | null): number {
  if (!value) return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseUuid(value: unknown): string | null {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

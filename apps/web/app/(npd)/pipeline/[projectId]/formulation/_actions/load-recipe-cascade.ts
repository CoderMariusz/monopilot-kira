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
  item_code: string | null;
  item_name: string | null;
};

type RecipeVersionRow = {
  version_id: string;
};

type RecipeComponentRow = {
  item_code: string | null;
  item_name: string | null;
  pct: string | null;
  qty_kg: string | null;
  unit_cost: string | null;
  nutrition_per_100g: Record<string, unknown> | null;
};

const MAX_DEPTH = 3;
const PG_UNDEFINED_TABLE = '42P01';

export async function loadRecipeCascade(
  projectId: string,
  formulationVersionId: string,
): Promise<RecipeCascadeNode[]> {
  if (!parseUuid(projectId) || !parseUuid(formulationVersionId)) return [];

  try {
    return await withOrgContext(async ({ client }) => {
      const ingredients = await client.query<IngredientLineRow>(
        `select fi.id::text as ingredient_line_id,
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
        const subRecipe = itemCode
          ? await loadSubRecipe(client, itemCode, 1, new Set([itemCode]))
          : undefined;
        nodes.push({
          ingredientLineId: ingredient.ingredient_line_id,
          itemCode,
          itemName,
          hasSubRecipe: Boolean(subRecipe),
          ...(subRecipe ? { subRecipe } : {}),
        });
      }
      return nodes;
    });
  } catch {
    return [];
  }
}

async function loadSubRecipe(
  client: QueryClient,
  itemCode: string,
  depth: number,
  visited: Set<string>,
): Promise<RecipeCascadeSubRecipe | undefined> {
  const version = await findActiveRecipeVersion(client, itemCode);
  if (!version) return undefined;
  if (depth >= MAX_DEPTH) {
    return { lines: [], totalCost: 0, maxDepthReached: true };
  }

  const components = await loadRecipeComponents(client, version.version_id);
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

    if (componentCode) {
      if (visited.has(componentCode)) {
        line.hasSubRecipe = true;
        line.subRecipe = { lines: [], totalCost: 0, cycle: true };
      } else {
        const nextVisited = new Set(visited);
        nextVisited.add(componentCode);
        const child = await loadSubRecipe(client, componentCode, depth + 1, nextVisited);
        if (child) {
          line.hasSubRecipe = true;
          line.subRecipe = child;
        }
      }
    }

    lines.push(line);
  }

  return { lines, totalCost };
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
      `select coalesce(i.item_code, fi.rm_code) as item_code,
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
      `select coalesce(i.item_code, fi.rm_code) as item_code,
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

import type pg from 'pg';

export interface RecipeComponentsChangedArgs {
  orgId: string;
  productCode: string;
  previousRecipeComponents: string | null;
  nextRecipeComponents: string | null;
  appVersion: string;
  ingredientPrefix?: string;
}

export interface RecipeSyncDiff {
  added: string[];
  removed: string[];
  unchanged: string[];
  ingredientCodes: string;
}

interface ProdDetailRow extends pg.QueryResultRow {
  id: string;
  intermediate_code: string;
  component_index: number;
}

const DEFAULT_INGREDIENT_PREFIX = 'RM';

export function parseRecipeComponents(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((component) => component.trim())
    .filter((component) => component.length > 0);
}

export function extractDigits(value: string): string {
  return Array.from(value.matchAll(/\d+/g), (match) => match[0]).join('');
}

export function deriveIngredientCodes(
  components: readonly string[],
  ingredientPrefix = DEFAULT_INGREDIENT_PREFIX,
): string {
  return components
    .map((component) => `${ingredientPrefix}${extractDigits(component)}`)
    .join(', ');
}

export async function handleRecipeComponentsChanged(
  client: pg.PoolClient,
  args: RecipeComponentsChangedArgs,
): Promise<RecipeSyncDiff> {
  await client.query('savepoint chain3_recipe_components_sync');

  try {
    const diff = await syncRecipeComponentsWithinTransaction(client, args);
    await client.query('release savepoint chain3_recipe_components_sync');
    return diff;
  } catch (error) {
    await client.query('rollback to savepoint chain3_recipe_components_sync').catch(() => undefined);
    await client.query('release savepoint chain3_recipe_components_sync').catch(() => undefined);
    throw error;
  }
}

async function syncRecipeComponentsWithinTransaction(
  client: pg.PoolClient,
  args: RecipeComponentsChangedArgs,
): Promise<RecipeSyncDiff> {
  const nextComponents = uniquePreservingOrder(parseRecipeComponents(args.nextRecipeComponents));
  const ingredientPrefix = args.ingredientPrefix ?? DEFAULT_INGREDIENT_PREFIX;
  const ingredientCodes = deriveIngredientCodes(nextComponents, ingredientPrefix);

  const currentRowsResult = await client.query<ProdDetailRow>(
    `
      select id, intermediate_code, component_index
      from public.prod_detail
      where org_id = $1::uuid
        and product_code = $2
      order by component_index, created_at, id
    `,
    [args.orgId, args.productCode],
  );

  const currentByCode = new Map(
    currentRowsResult.rows.map((row) => [row.intermediate_code, row] as const),
  );
  const nextSet = new Set(nextComponents);
  const currentSet = new Set(currentByCode.keys());

  const added = nextComponents.filter((component) => !currentSet.has(component));
  const removed = currentRowsResult.rows
    .map((row) => row.intermediate_code)
    .filter((component) => !nextSet.has(component));
  const unchanged = nextComponents.filter((component) => currentSet.has(component));

  const updated = await client.query(
    `
      update public.product
      set recipe_components = $3,
          ingredient_codes = $4
      where org_id = $1::uuid
        and product_code = $2
    `,
    [args.orgId, args.productCode, nextComponents.join(', '), ingredientCodes],
  );

  if (updated.rowCount === 0) {
    throw new Error('product_not_found');
  }

  if (removed.length > 0) {
    await client.query(
      `
        delete from public.prod_detail
        where org_id = $1::uuid
          and product_code = $2
          and intermediate_code = any($3::text[])
      `,
      [args.orgId, args.productCode, removed],
    );
  }

  for (const [index, intermediateCode] of nextComponents.entries()) {
    const componentIndex = index + 1;
    const existing = currentByCode.get(intermediateCode);

    if (existing) {
      if (existing.component_index !== componentIndex) {
        await client.query(
          `
            update public.prod_detail
            set component_index = $4
            where org_id = $1::uuid
              and product_code = $2
              and intermediate_code = $3
          `,
          [args.orgId, args.productCode, intermediateCode, componentIndex],
        );
      }
      continue;
    }

    await client.query(
      `
        insert into public.prod_detail (org_id, product_code, intermediate_code, component_index)
        values ($1::uuid, $2, $3, $4)
      `,
      [args.orgId, args.productCode, intermediateCode, componentIndex],
    );
  }

  if (added.length > 0 || removed.length > 0) {
    await client.query(
      `
        insert into public.outbox_events
          (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
        values ($1::uuid, 'fa.recipe_changed', 'fa', $2, $3::jsonb, $4)
      `,
      [
        args.orgId,
        args.productCode,
        JSON.stringify({
          product_code: args.productCode,
          previous_recipe_components: args.previousRecipeComponents ?? '',
          next_recipe_components: nextComponents.join(', '),
          ingredient_codes: ingredientCodes,
          diff: {
            added,
            removed,
            unchanged,
          },
        }),
        args.appVersion,
      ],
    );
  }

  return { added, removed, unchanged, ingredientCodes };
}

function uniquePreservingOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    unique.push(value);
  }

  return unique;
}

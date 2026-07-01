'use server';

/**
 * Finish-WIP (production components) editor — Server Actions.
 *
 * Backs the multi-row "Finish WIP" editor on the FG (FA) Core tab with the REAL
 * `prod_detail` table (1 row per component, org_id + product_code scope —
 * packages/db/schema/prod-detail.ts + migration 076). Replaces the single
 * comma-separated "Recipe components → Ingredient codes (auto)" Core field.
 *
 * ProdDetail ↔ Main-Table aggregate rule (MON-domain-npd glossary): ProdDetail is
 * the multi-component source of truth. When N>1 the Main Table aggregate columns
 * are auto-derived from ProdDetail; when N==1 ProdDetail mirrors the Main Table.
 *
 * Source-of-truth write path (NO double-write): every mutation edits the product's
 * `recipe_components` free-text list and then calls the canonical, idempotent,
 * org-scoped SECURITY-DEFINER function `public.sync_prod_detail_rows(product_code,
 * app_version)` (migration 157). That function adds/removes/reorders the
 * `prod_detail` rows to match `recipe_components`, wires `item_id` from the items
 * master, and emits the `fa.recipe_changed` outbox event. This is EXACTLY the
 * path update-fa-cell uses for the Core recipe_components cell — we reuse it
 * rather than hand-mutating prod_detail (which would risk diverging from the
 * Main-Table aggregate). The previously-dead cascade-engine recipe chain is NOT
 * used (the codebase replaced it with this SQL function).
 *
 * Auto-derived RM/ingredient code (the read-only GREEN cell): derived from the
 * component code via the chain-3 rule = ingredient prefix + the component's digits
 * (e.g. PR8801 → RM8801). The prefix is the configurable chain-3 ingredient
 * prefix (default 'RM'), NOT a hardcoded process suffix.
 *
 * Contract (mirrors fa/* actions): withOrgContext (app_user + RLS), zod input
 * (schemas in the sibling non-'use server' module), server-side RBAC
 * (read=npd.fa.read, write=npd.core.write — seeded byte-identical in migrations
 * 080/149/236), revalidatePath for the FG detail route. Never client-trusted.
 */

import { revalidatePath } from 'next/cache';

import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { AuthError, ValidationError } from '../../../../../../(npd)/fa/actions/errors';
import {
  addProdDetailRowSchema,
  FINISH_WIP_APP_VERSION,
  FINISH_WIP_READ_PERMISSION,
  FINISH_WIP_WRITE_PERMISSION,
  listProdDetailSchema,
  removeProdDetailRowSchema,
  updateProdDetailRowSchema,
  type AddProdDetailRowInput,
  type AddProdDetailRowResult,
  type ListProdDetailInput,
  type ListProdDetailResult,
  type RemoveProdDetailRowInput,
  type RemoveProdDetailRowResult,
  type UpdateProdDetailRowInput,
  type UpdateProdDetailRowResult,
} from './finish-wip-types';

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

const DEFAULT_INGREDIENT_PREFIX = 'RM';

/** chain-3 ingredient-code derivation: prefix + the component code's digits. */
function deriveIngredientCode(componentCode: string, prefix = DEFAULT_INGREDIENT_PREFIX): string {
  const digits = Array.from(componentCode.matchAll(/\d+/g), (m) => m[0]).join('');
  return `${prefix}${digits}`;
}

function parseRecipeComponents(value: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (value ?? '').split(',')) {
    const c = raw.trim();
    if (c.length > 0 && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

async function readRecipeComponents(ctx: OrgContextLike, productCode: string): Promise<string> {
  const res = await ctx.client.query<{ recipe_components: string | null }>(
    `select recipe_components from public.product
      where org_id = app.current_org_id() and product_code = $1 and deleted_at is null
      limit 1`,
    [productCode],
  );
  if (res.rows.length === 0) {
    throw new ValidationError('PRODUCT_NOT_FOUND', 'Finished good is not visible in this organisation');
  }
  return res.rows[0].recipe_components ?? '';
}

/**
 * Persist a new recipe_components list + re-materialize prod_detail via the
 * canonical SQL sync. Also keeps the aggregate ingredient_codes Core field in
 * step (auto-derived, never client-authored).
 */
async function persistComponents(
  ctx: OrgContextLike,
  productCode: string,
  components: string[],
): Promise<void> {
  const recipe = components.join(', ');
  const ingredientCodes = components.map((c) => deriveIngredientCode(c)).join(', ');

  const updated = await ctx.client.query(
    `update public.product
        set recipe_components = $2,
            ingredient_codes = $3
      where org_id = app.current_org_id() and product_code = $1`,
    [productCode, recipe, ingredientCodes],
  );
  if ((updated.rowCount ?? 0) === 0) {
    throw new ValidationError('PRODUCT_NOT_FOUND', 'Finished good is not visible in this organisation');
  }

  // Canonical, idempotent, org-scoped prod_detail materialization + outbox.
  await ctx.client.query(`select public.sync_prod_detail_rows($1, $2)`, [
    productCode,
    FINISH_WIP_APP_VERSION,
  ]);
}

/** Read the live prod_detail rows for the editor (org-scoped, RLS). */
export async function listProdDetail(input: ListProdDetailInput): Promise<ListProdDetailResult> {
  const parsed = listProdDetailSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('INVALID_INPUT', 'Invalid list input');
  }
  const { productCode } = parsed.data;

  return withOrgContext<ListProdDetailResult>(async (rawCtx) => {
    const ctx = rawCtx as OrgContextLike;
    if (!(await hasPermission(ctx, FINISH_WIP_READ_PERMISSION))) {
      throw new AuthError('FORBIDDEN', `${FINISH_WIP_READ_PERMISSION} is required to read components`);
    }

    const { rows } = await ctx.client.query<{
      id: string;
      component_index: number;
      intermediate_code: string;
      component_weight: string | null;
    }>(
      `select id, component_index, intermediate_code, component_weight::text as component_weight
         from public.prod_detail
        where org_id = app.current_org_id() and product_code = $1
        order by component_index asc, created_at asc, id asc`,
      [productCode],
    );

    return {
      rows: rows.map((r) => ({
        id: r.id,
        componentIndex: Number(r.component_index),
        intermediateCode: r.intermediate_code,
        ingredientCode: deriveIngredientCode(r.intermediate_code),
        componentWeight:
          r.component_weight === null || r.component_weight === undefined
            ? null
            : Number(r.component_weight),
      })),
    };
  });
}

/** Add a finish-WIP row by appending its component code (idempotent via the SQL sync). */
export async function addProdDetailRow(input: AddProdDetailRowInput): Promise<AddProdDetailRowResult> {
  const parsed = addProdDetailRowSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('INVALID_INPUT', 'Invalid add input');
  }
  const { productCode, intermediateCode } = parsed.data;

  return withOrgContext<AddProdDetailRowResult>(async (rawCtx) => {
    const ctx = rawCtx as OrgContextLike;
    if (!(await hasPermission(ctx, FINISH_WIP_WRITE_PERMISSION))) {
      throw new AuthError('FORBIDDEN', `${FINISH_WIP_WRITE_PERMISSION} is required to add a component`);
    }

    const components = parseRecipeComponents(await readRecipeComponents(ctx, productCode));
    if (components.includes(intermediateCode)) {
      throw new ValidationError('DUPLICATE_COMPONENT', 'Component already exists for this finished good');
    }
    const next = [...components, intermediateCode];
    await persistComponents(ctx, productCode, next);

    safeRevalidatePath(`/npd/fg/${productCode}`);
    const created = await ctx.client.query<{ id: string; component_index: number }>(
      `select id, component_index from public.prod_detail
        where org_id = app.current_org_id() and product_code = $1 and intermediate_code = $2
        limit 1`,
      [productCode, intermediateCode],
    );
    return {
      id: created.rows[0]?.id ?? '',
      componentIndex: Number(created.rows[0]?.component_index ?? next.length),
      intermediateCode,
      ingredientCode: deriveIngredientCode(intermediateCode),
      componentWeight: null,
    };
  });
}

/** Rename a finish-WIP row's component code (re-derives the ingredient code via the SQL sync). */
export async function updateProdDetailRow(
  input: UpdateProdDetailRowInput,
): Promise<UpdateProdDetailRowResult> {
  const parsed = updateProdDetailRowSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('INVALID_INPUT', 'Invalid update input');
  }
  const { productCode, prodDetailId, intermediateCode } = parsed.data;

  return withOrgContext<UpdateProdDetailRowResult>(async (rawCtx) => {
    const ctx = rawCtx as OrgContextLike;
    if (!(await hasPermission(ctx, FINISH_WIP_WRITE_PERMISSION))) {
      throw new AuthError('FORBIDDEN', `${FINISH_WIP_WRITE_PERMISSION} is required to edit a component`);
    }

    const target = await ctx.client.query<{ intermediate_code: string; component_index: number }>(
      `select intermediate_code, component_index from public.prod_detail
        where org_id = app.current_org_id() and product_code = $1 and id = $2::uuid
        limit 1`,
      [productCode, prodDetailId],
    );
    const current = target.rows[0];
    if (!current) {
      throw new ValidationError('ROW_NOT_FOUND', 'Component row is not visible in this organisation');
    }

    const components = parseRecipeComponents(await readRecipeComponents(ctx, productCode));
    if (intermediateCode !== current.intermediate_code && components.includes(intermediateCode)) {
      throw new ValidationError('DUPLICATE_COMPONENT', 'Component already exists for this finished good');
    }
    const next = components.map((c) => (c === current.intermediate_code ? intermediateCode : c));
    await persistComponents(ctx, productCode, next);

    safeRevalidatePath(`/npd/fg/${productCode}`);
    const fresh = await ctx.client.query<{ id: string; component_index: number }>(
      `select id, component_index from public.prod_detail
        where org_id = app.current_org_id() and product_code = $1 and intermediate_code = $2
        limit 1`,
      [productCode, intermediateCode],
    );
    return {
      id: fresh.rows[0]?.id ?? prodDetailId,
      componentIndex: Number(fresh.rows[0]?.component_index ?? current.component_index),
      intermediateCode,
      ingredientCode: deriveIngredientCode(intermediateCode),
      componentWeight: null,
    };
  });
}

/** Remove a finish-WIP row by its prod_detail id (idempotent via the SQL sync). */
export async function removeProdDetailRow(
  input: RemoveProdDetailRowInput,
): Promise<RemoveProdDetailRowResult> {
  const parsed = removeProdDetailRowSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('INVALID_INPUT', 'Invalid remove input');
  }
  const { productCode, prodDetailId } = parsed.data;

  return withOrgContext<RemoveProdDetailRowResult>(async (rawCtx) => {
    const ctx = rawCtx as OrgContextLike;
    if (!(await hasPermission(ctx, FINISH_WIP_WRITE_PERMISSION))) {
      throw new AuthError('FORBIDDEN', `${FINISH_WIP_WRITE_PERMISSION} is required to remove a component`);
    }

    const target = await ctx.client.query<{ intermediate_code: string }>(
      `select intermediate_code from public.prod_detail
        where org_id = app.current_org_id() and product_code = $1 and id = $2::uuid
        limit 1`,
      [productCode, prodDetailId],
    );
    const code = target.rows[0]?.intermediate_code;
    if (!code) {
      return { removed: false };
    }

    const next = parseRecipeComponents(await readRecipeComponents(ctx, productCode)).filter(
      (c) => c !== code,
    );
    await persistComponents(ctx, productCode, next);

    safeRevalidatePath(`/npd/fg/${productCode}`);
    return { removed: true };
  });
}

function safeRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static-generation store.
  }
}

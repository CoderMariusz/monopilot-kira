'use server';

/**
 * Lane-B — add (and remove) a production component on the FA Production tab.
 *
 * Live product-owner gap: the Production tab had NO "add component" control, and
 * a "component" was free text with no link to a real item. This action creates a
 * `prod_detail` row that references a REAL item from the items master
 * (item_type rm/intermediate/co_product), so a component is always a real item.
 *
 * Contract (mirrors the other fa/* actions):
 *   - withOrgContext (app_user + RLS pinned to app.current_org_id());
 *   - zod-validated input;
 *   - server-side RBAC: npd.production.write (same permission update-fa-cell
 *     enforces for the Production dept) — the client never grants permission;
 *   - the referenced item is re-resolved org-scoped (RLS) so a caller cannot
 *     attach an item from another org;
 *   - outbox 'fa.recipe_changed' audit event so the FA history reflects the add.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { hasPermission } from '../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { AuthError, ValidationError } from './errors';

const PRODUCTION_WRITE_PERMISSION = 'npd.production.write';
const RECIPE_CHANGED_EVENT = 'fa.recipe_changed';
const APP_VERSION = 'add-prod-detail-component-v1';

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

const addInputSchema = z.object({
  productCode: z.string().trim().min(1),
  itemId: z.string().uuid(),
  /** Optional per-component weight (grams) — NUMERIC string or number. */
  componentWeight: z.union([z.string(), z.number()]).optional(),
});

export type AddProdDetailComponentInput = z.input<typeof addInputSchema>;

export type AddProdDetailComponentResult = {
  id: string;
  intermediateCode: string;
  componentIndex: number;
  itemId: string;
};

const removeInputSchema = z.object({
  productCode: z.string().trim().min(1),
  prodDetailId: z.string().uuid(),
});

export type RemoveProdDetailComponentInput = z.input<typeof removeInputSchema>;

/**
 * Add a production component backed by a real item. Idempotent on (product, item):
 * re-adding an item already present returns the existing row instead of failing.
 */
export async function addProdDetailComponent(
  input: AddProdDetailComponentInput,
): Promise<AddProdDetailComponentResult> {
  const parsed = addInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('INVALID_INPUT', 'Invalid add-component input');
  }
  const { productCode, itemId, componentWeight } = parsed.data;
  const weight =
    componentWeight === undefined || componentWeight === '' ? null : String(componentWeight);

  return withOrgContext<AddProdDetailComponentResult>(async (rawCtx) => {
    const ctx = rawCtx as OrgContextLike;

    if (!(await hasPermission(ctx, PRODUCTION_WRITE_PERMISSION))) {
      throw new AuthError('FORBIDDEN', `${PRODUCTION_WRITE_PERMISSION} is required to add a component`);
    }

    // The FA must exist in this org (RLS pins org scope).
    const productExists = await ctx.client.query<{ ok: boolean }>(
      `select true as ok from public.product
        where org_id = app.current_org_id() and product_code = $1 and deleted_at is null
        limit 1`,
      [productCode],
    );
    if (productExists.rows.length === 0) {
      throw new ValidationError('PRODUCT_NOT_FOUND', 'Finished Good is not visible in this organisation');
    }

    // Re-resolve the item org-scoped — never trust the client's item label/code.
    const itemRes = await ctx.client.query<{ id: string; item_code: string }>(
      `select i.id, i.item_code
         from public.items i
        where i.org_id = app.current_org_id()
          and i.id = $1::uuid
          and i.item_type in ('rm', 'ingredient', 'intermediate', 'co_product')
        limit 1`,
      [itemId],
    );
    const item = itemRes.rows[0];
    if (!item) {
      throw new ValidationError('ITEM_NOT_FOUND', 'Selected item is not a valid component in this organisation');
    }

    // Idempotent: if this product already has a row for this item, return it.
    const existing = await ctx.client.query<{ id: string; component_index: number }>(
      `select id, component_index from public.prod_detail
        where org_id = app.current_org_id() and product_code = $1 and item_id = $2::uuid
        limit 1`,
      [productCode, itemId],
    );
    if (existing.rows[0]) {
      return {
        id: existing.rows[0].id,
        intermediateCode: item.item_code,
        componentIndex: existing.rows[0].component_index,
        itemId,
      };
    }

    // Next component_index (1-based, append at end).
    const idxRes = await ctx.client.query<{ next_index: number }>(
      `select coalesce(max(component_index), 0) + 1 as next_index
         from public.prod_detail
        where org_id = app.current_org_id() and product_code = $1`,
      [productCode],
    );
    const componentIndex = Number(idxRes.rows[0]?.next_index ?? 1);

    const inserted = await ctx.client.query<{ id: string }>(
      `insert into public.prod_detail
         (org_id, product_code, intermediate_code, item_id, component_index, component_weight)
       values
         (app.current_org_id(), $1, $2, $3::uuid, $4, $5::numeric)
       returning id`,
      [productCode, item.item_code, itemId, componentIndex, weight],
    );
    const id = inserted.rows[0]?.id;
    if (!id) {
      throw new ValidationError('INSERT_FAILED', 'Could not add the production component');
    }

    await ctx.client.query(
      `insert into public.outbox_events
         (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
       values
         (app.current_org_id(), $1, 'fa', $2, $3::jsonb, $4)`,
      [
        RECIPE_CHANGED_EVENT,
        productCode,
        JSON.stringify({
          org_id: ctx.orgId,
          actor_user_id: ctx.userId,
          product_code: productCode,
          diff: { added: [item.item_code], removed: [] },
          item_id: itemId,
        }),
        APP_VERSION,
      ],
    );

    safeRevalidatePath('/[locale]/fg/[productCode]', 'page');
    return { id, intermediateCode: item.item_code, componentIndex, itemId };
  });
}

/** Remove a production component row (org-scoped, RBAC-gated). */
export async function removeProdDetailComponent(
  input: RemoveProdDetailComponentInput,
): Promise<{ removed: boolean }> {
  const parsed = removeInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('INVALID_INPUT', 'Invalid remove-component input');
  }
  const { productCode, prodDetailId } = parsed.data;

  return withOrgContext<{ removed: boolean }>(async (rawCtx) => {
    const ctx = rawCtx as OrgContextLike;

    if (!(await hasPermission(ctx, PRODUCTION_WRITE_PERMISSION))) {
      throw new AuthError('FORBIDDEN', `${PRODUCTION_WRITE_PERMISSION} is required to remove a component`);
    }

    const deleted = await ctx.client.query<{ intermediate_code: string }>(
      `delete from public.prod_detail
        where org_id = app.current_org_id()
          and product_code = $1
          and id = $2::uuid
        returning intermediate_code`,
      [productCode, prodDetailId],
    );
    const removedCode = deleted.rows[0]?.intermediate_code;
    if (!removedCode) {
      return { removed: false };
    }

    await ctx.client.query(
      `insert into public.outbox_events
         (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
       values
         (app.current_org_id(), $1, 'fa', $2, $3::jsonb, $4)`,
      [
        RECIPE_CHANGED_EVENT,
        productCode,
        JSON.stringify({
          org_id: ctx.orgId,
          actor_user_id: ctx.userId,
          product_code: productCode,
          diff: { added: [], removed: [removedCode] },
        }),
        APP_VERSION,
      ],
    );

    safeRevalidatePath('/[locale]/fg/[productCode]', 'page');
    return { removed: true };
  });
}

function safeRevalidatePath(path: string, type?: 'page' | 'layout'): void {
  try {
    revalidatePath(path, type);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}

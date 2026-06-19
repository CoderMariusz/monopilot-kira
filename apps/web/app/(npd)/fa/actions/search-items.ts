'use server';

/**
 * Lane-B — org-scoped item search for the component item-picker.
 *
 * Queries public.items DIRECTLY (RLS-pinned via withOrgContext → app_user →
 * app.current_org_id()) so a "component" resolves to a REAL item from the items
 * master — never free text and never a hardcoded list. Returns the item id +
 * code (+ name / type / cost / status) the picker needs to wire a prod_detail /
 * formulation_ingredient row.
 *
 * Deliberately independent of Lane A's items-master list action: the picker only
 * needs read access to the items table, which RLS already scopes per-org.
 */

import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { ValidationError } from './errors';

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

/** Item types the search action will ACCEPT in its `itemTypes` filter.
 *  'ingredient' behaves like a raw material for production usage; 'byproduct' is
 *  a legal items.item_type (mig 248 CHECK) and a valid recipe input (e.g. trims
 *  reused as a component) so it must be reachable in the picker; 'packaging' is
 *  accepted ONLY so the NPD packaging stage can request a packaging-restricted
 *  picker — it is deliberately excluded from DEFAULT_COMPONENT_ITEM_TYPES so a
 *  caller that omits `itemTypes` (the recipe picker) never receives packaging. */
const SEARCHABLE_ITEM_TYPES = ['fg', 'rm', 'ingredient', 'intermediate', 'co_product', 'byproduct', 'packaging'] as const;

/** The default fan-out when a caller passes no `itemTypes` — recipe/component
 *  types only. Includes 'byproduct' because a by-product (e.g. trims) can be
 *  reused as a recipe input; NEVER packaging (packaging must be requested
 *  explicitly). */
const DEFAULT_COMPONENT_ITEM_TYPES = ['rm', 'ingredient', 'intermediate', 'co_product', 'byproduct'] as const;

export type ItemPickerOption = {
  id: string;
  itemCode: string;
  name: string;
  itemType: string;
  status: string;
  costPerKgEur: string | null;
  /** Base unit of measure from the items master (e.g. 'kg'). */
  uomBase: string;
};

const searchInputSchema = z.object({
  query: z.string().trim().max(120).optional().default(''),
  /** Restrict to a subset of searchable types; defaults to component types only
   *  (NEVER packaging unless the caller requests it explicitly). */
  itemTypes: z.array(z.enum(SEARCHABLE_ITEM_TYPES)).optional(),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

export type SearchItemsInput = z.input<typeof searchInputSchema>;

type ItemRow = {
  id: string;
  item_code: string;
  name: string;
  item_type: string;
  status: string;
  cost_per_kg: string | null;
  uom_base: string;
};

/**
 * Search the items master (org-scoped) by code or name. An empty query returns
 * the most-recently-updated active component items so the picker is never blank
 * on first open (when Lane A has seeded items).
 */
export async function searchItems(input: SearchItemsInput = {}): Promise<ItemPickerOption[]> {
  const parsed = searchInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('INVALID_INPUT', 'Invalid item search input');
  }
  const { query, itemTypes, limit } = parsed.data;
  const types = itemTypes && itemTypes.length > 0 ? itemTypes : [...DEFAULT_COMPONENT_ITEM_TYPES];
  const term = query.trim();

  return withOrgContext<ItemPickerOption[]>(async (ctx) => {
    const context = ctx as OrgContextLike;
    const like = term.length > 0 ? `%${term.replace(/[%_]/g, (m) => `\\${m}`)}%` : null;

    const { rows } = await context.client.query<ItemRow>(
      `select i.id,
              i.item_code,
              i.name,
              i.item_type,
              i.status,
              i.cost_per_kg,
              i.uom_base
         from public.items i
        where i.org_id = app.current_org_id()
          and i.item_type = any($1::text[])
          and i.status = 'active'
          and (
            $2::text is null
            or i.item_code ilike $2 escape '\\'
            or i.name ilike $2 escape '\\'
          )
        order by
          case when $2::text is not null and i.item_code ilike $2 escape '\\' then 0 else 1 end,
          i.updated_at desc,
          i.item_code asc
        limit $3`,
      [types, like, limit],
    );

    return rows.map((r) => ({
      id: r.id,
      itemCode: r.item_code,
      name: r.name,
      itemType: r.item_type,
      status: r.status,
      costPerKgEur: r.cost_per_kg,
      uomBase: r.uom_base,
    }));
  });
}

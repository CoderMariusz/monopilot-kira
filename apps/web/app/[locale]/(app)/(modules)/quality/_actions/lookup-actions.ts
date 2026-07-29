'use server';

/**
 * QUALITY — read-only reference lookups for the MODAL-HOLD-CREATE flow.
 *
 * Audit defect #4: the create-hold modal asked operators to paste raw UUIDs into
 * a text input, but createHold (hold-actions.ts:100) validates referenceId as a
 * UUID — operators cannot know UUIDs. These reads turn a human-typed LP NUMBER
 * (and, where cheap, a WO/GRN number) into the org-scoped UUID the action needs.
 *
 * RBAC: gated on quality.dashboard.view (same permission the holds list reads
 * under). Enforced server-side inside withOrgContext — never client-trusted.
 *
 * These are ADDITIVE reads — hold-actions.ts is NOT touched. Decimal columns are
 * returned as strings (qty), never coerced to JS number.
 */

import { z } from 'zod';

import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type LookupContext = { userId: string; orgId: string; client: QueryClient };

type ActionFailure = { ok: false; reason: 'forbidden' | 'error'; message?: string };
type ActionResult<T> = { ok: true; data: T } | ActionFailure;

const LOOKUP_PERMISSION = 'quality.dashboard.view';

export type LpLookupResult = {
  id: string;
  lpNumber: string;
  itemCode: string | null;
  productId: string | null;
  qty: string;
  uom: string;
  status: string;
  qaStatus: string;
};

/** Generic ref-number → id resolution result (for wo / grn). */
export type RefLookupResult = { id: string; display: string };

const resolveSchema = z.object({ lpNumber: z.string().trim().min(1).max(120) });
const searchSchema = z.object({
  query: z.string().trim().min(1).max(120),
  limit: z.number().int().min(1).max(50).optional(),
});

function mapLpRow(row: {
  id: string;
  lp_number: string;
  item_code: string | null;
  product_id: string | null;
  quantity: string;
  uom: string;
  status: string;
  qa_status: string;
}): LpLookupResult {
  return {
    id: row.id,
    lpNumber: row.lp_number,
    itemCode: row.item_code,
    productId: row.product_id,
    qty: String(row.quantity),
    uom: row.uom,
    status: row.status,
    qaStatus: row.qa_status,
  };
}

const LP_SELECT = `
  select lp.id::text,
         lp.lp_number,
         i.item_code,
         lp.product_id::text,
         lp.quantity::text,
         lp.uom,
         lp.status,
         lp.qa_status
    from public.license_plates lp
    left join public.items i on i.id = lp.product_id and i.org_id = lp.org_id
   where lp.org_id = app.current_org_id()`;

/**
 * Resolve a single LP by its NUMBER. Exact (case-insensitive) match wins; falls
 * back to a unique prefix match. Returns null when nothing/ambiguous matches —
 * the caller surfaces an inline "could not resolve" error and submits nothing.
 */
export async function resolveLpByNumber(
  input: { lpNumber: string },
): Promise<ActionResult<LpLookupResult | null>> {
  try {
    const parsed = resolveSchema.parse(input);
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ActionResult<LpLookupResult | null>> => {
      const ctx: LookupContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, LOOKUP_PERMISSION))) return { ok: false, reason: 'forbidden' };

      // Exact case-insensitive match first.
      const exact = await ctx.client.query<Parameters<typeof mapLpRow>[0]>(
        `${LP_SELECT} and lower(lp.lp_number) = lower($1) limit 2`,
        [parsed.lpNumber],
      );
      if (exact.rows.length === 1) return { ok: true, data: mapLpRow(exact.rows[0]) };
      if (exact.rows.length > 1) return { ok: true, data: null };

      // Unique prefix fallback (operator typed a partial number).
      const prefix = await ctx.client.query<Parameters<typeof mapLpRow>[0]>(
        `${LP_SELECT} and lp.lp_number ilike $1 || '%' order by lp.lp_number limit 2`,
        [parsed.lpNumber],
      );
      if (prefix.rows.length === 1) return { ok: true, data: mapLpRow(prefix.rows[0]) };
      return { ok: true, data: null };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Autocomplete list: LPs whose number OR item code ilike-matches the query.
 * Ordered by lp_number, capped (default 10) — for the create-modal dropdown.
 */
export async function searchLps(
  input: { query: string; limit?: number },
): Promise<ActionResult<LpLookupResult[]>> {
  try {
    const parsed = searchSchema.parse(input);
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ActionResult<LpLookupResult[]>> => {
      const ctx: LookupContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, LOOKUP_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<Parameters<typeof mapLpRow>[0]>(
        `${LP_SELECT}
           and (lp.lp_number ilike '%' || $1 || '%' or i.item_code ilike '%' || $1 || '%')
         order by lp.lp_number
         limit $2::int`,
        [parsed.query, parsed.limit ?? 10],
      );
      return { ok: true, data: rows.map(mapLpRow) };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Resolve a WO by its number (exact, case-insensitive). Cheap org-scoped read —
 * mirrors the listHolds reference_display join (work_orders.wo_number).
 */
export async function resolveWoByNumber(
  input: { woNumber: string },
): Promise<ActionResult<RefLookupResult | null>> {
  try {
    const woNumber = z.string().trim().min(1).max(120).parse(input.woNumber);
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ActionResult<RefLookupResult | null>> => {
      const ctx: LookupContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, LOOKUP_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<{ id: string; wo_number: string }>(
        `select id::text, wo_number
           from public.work_orders
          where org_id = app.current_org_id()
            and lower(wo_number) = lower($1)
          limit 2`,
        [woNumber],
      );
      if (rows.length !== 1) return { ok: true, data: null };
      return { ok: true, data: { id: rows[0].id, display: rows[0].wo_number } };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Resolve a GRN by its number (exact, case-insensitive). Cheap org-scoped read —
 * mirrors the listHolds reference_display join (grns.grn_number).
 */
export type InspectionLookupResult = {
  id: string;
  inspectionNumber: string;
  referenceDisplay: string;
  productId: string | null;
  productCode: string | null;
  status: string;
};

export type HoldLookupResult = {
  id: string;
  holdNumber: string;
  referenceDisplay: string;
};

/**
 * Autocomplete inspections for the MODAL-NCR-CREATE source picker. Matches
 * inspection number or the linked LP / GRN / WO output display text.
 */
export async function searchInspectionsForNcr(
  input: { query: string; limit?: number },
): Promise<ActionResult<InspectionLookupResult[]>> {
  try {
    const parsed = searchSchema.parse(input);
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ActionResult<InspectionLookupResult[]>> => {
      const ctx: LookupContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, LOOKUP_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<{
        id: string;
        inspection_number: string;
        reference_display: string | null;
        product_id: string | null;
        product_code: string | null;
        status: string;
      }>(
        `select
           qi.id::text,
           qi.inspection_number,
           coalesce(
             case when qi.reference_type = 'lp' then lp.lp_number end,
             case when qi.reference_type = 'grn' then grn.grn_number end,
             case when qi.reference_type = 'wo_output' then wo.wo_number || coalesce(' / ' || woo.batch_number, '') end,
             qi.reference_id::text
           ) as reference_display,
           coalesce(qi.product_id, lp.product_id, woo.product_id)::text as product_id,
           i.item_code as product_code,
           qi.status
         from public.quality_inspections qi
         left join public.license_plates lp on qi.reference_type = 'lp' and lp.id = qi.reference_id and lp.org_id = qi.org_id
         left join public.grns grn on qi.reference_type = 'grn' and grn.id = qi.reference_id and grn.org_id = qi.org_id
         left join public.wo_outputs woo on qi.reference_type = 'wo_output' and woo.id = qi.reference_id and woo.org_id = qi.org_id
         left join public.work_orders wo on wo.id = woo.wo_id and wo.org_id = qi.org_id
         left join public.items i on i.id = coalesce(qi.product_id, lp.product_id, woo.product_id) and i.org_id = qi.org_id
        where qi.org_id = app.current_org_id()
          and (
            qi.inspection_number ilike '%' || $1 || '%'
            or lp.lp_number ilike '%' || $1 || '%'
            or grn.grn_number ilike '%' || $1 || '%'
            or wo.wo_number ilike '%' || $1 || '%'
            or i.item_code ilike '%' || $1 || '%'
          )
        order by qi.created_at desc
        limit $2::int`,
        [parsed.query, parsed.limit ?? 10],
      );

      return {
        ok: true,
        data: rows.map((row) => ({
          id: row.id,
          inspectionNumber: row.inspection_number,
          referenceDisplay: row.reference_display ?? '—',
          productId: row.product_id,
          productCode: row.product_code,
          status: row.status,
        })),
      };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Autocomplete quality holds for the MODAL-NCR-CREATE linked-hold picker.
 */
export async function searchHoldsForNcr(
  input: { query: string; limit?: number },
): Promise<ActionResult<HoldLookupResult[]>> {
  try {
    const parsed = searchSchema.parse(input);
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ActionResult<HoldLookupResult[]>> => {
      const ctx: LookupContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, LOOKUP_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<{
        id: string;
        hold_number: string;
        reference_display: string | null;
      }>(
        `select
           h.id::text,
           h.hold_number,
           coalesce(
             case when h.reference_type = 'lp' then lp.lp_number || coalesce(' / ' || i.item_code, '') end,
             case when h.reference_type = 'wo' then wo.wo_number end,
             case when h.reference_type = 'grn' then grn.grn_number end,
             h.reference_text,
             h.reference_id::text
           ) as reference_display
         from public.quality_holds h
         left join public.license_plates lp on h.reference_type = 'lp' and lp.id = h.reference_id and lp.org_id = h.org_id
         left join public.items i on i.id = lp.product_id and i.org_id = h.org_id
         left join public.work_orders wo on h.reference_type = 'wo' and wo.id = h.reference_id and wo.org_id = h.org_id
         left join public.grns grn on h.reference_type = 'grn' and grn.id = h.reference_id and grn.org_id = h.org_id
        where h.org_id = app.current_org_id()
          and (
            h.hold_number ilike '%' || $1 || '%'
            or h.reference_text ilike '%' || $1 || '%'
            or lp.lp_number ilike '%' || $1 || '%'
            or wo.wo_number ilike '%' || $1 || '%'
            or grn.grn_number ilike '%' || $1 || '%'
          )
        order by h.created_at desc
        limit $2::int`,
        [parsed.query, parsed.limit ?? 10],
      );

      return {
        ok: true,
        data: rows.map((row) => ({
          id: row.id,
          holdNumber: row.hold_number,
          referenceDisplay: row.reference_display ?? '—',
        })),
      };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function resolveGrnByNumber(
  input: { grnNumber: string },
): Promise<ActionResult<RefLookupResult | null>> {
  try {
    const grnNumber = z.string().trim().min(1).max(120).parse(input.grnNumber);
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ActionResult<RefLookupResult | null>> => {
      const ctx: LookupContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, LOOKUP_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<{ id: string; grn_number: string }>(
        `select id::text, grn_number
           from public.grns
          where org_id = app.current_org_id()
            and lower(grn_number) = lower($1)
          limit 2`,
        [grnNumber],
      );
      if (rows.length !== 1) return { ok: true, data: null };
      return { ok: true, data: { id: rows[0].id, display: rows[0].grn_number } };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

const productSearchSchema = z.object({
  query: z.string().trim().max(120).optional().default(''),
  limit: z.number().int().min(1).max(50).optional(),
});

const NCR_PRODUCT_ITEM_TYPES = ['fg', 'rm', 'ingredient', 'intermediate', 'packaging'] as const;

export type NcrProductLookupResult = { id: string; itemCode: string; name: string };

/**
 * Autocomplete products for the MODAL-NCR-CREATE product picker. Named Server Action
 * so the NCR list RSC can pass it across the client boundary (no inline closure).
 */
export async function searchProductsForNcr(
  input: { query?: string; limit?: number } = {},
): Promise<NcrProductLookupResult[]> {
  const parsed = productSearchSchema.parse(input);
  const term = parsed.query.trim();
  const limit = parsed.limit ?? 10;

  return withOrgContext<NcrProductLookupResult[]>(async ({ userId, orgId, client }) => {
    const ctx: LookupContext = { userId, orgId, client: client as QueryClient };
    if (!(await hasPermission(ctx, LOOKUP_PERMISSION))) return [];

    const like = term.length > 0 ? `%${term.replace(/[%_]/g, (m) => `\\${m}`)}%` : null;
    const { rows } = await ctx.client.query<{ id: string; item_code: string; name: string }>(
      `select i.id::text,
              i.item_code,
              i.name
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
        limit $3::int`,
      [NCR_PRODUCT_ITEM_TYPES, like, limit],
    );

    return rows.map((row) => ({
      id: row.id,
      itemCode: row.item_code,
      name: row.name,
    }));
  });
}

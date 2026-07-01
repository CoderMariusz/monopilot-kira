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
  quantity: string;
  uom: string;
  status: string;
  qa_status: string;
}): LpLookupResult {
  return {
    id: row.id,
    lpNumber: row.lp_number,
    itemCode: row.item_code,
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

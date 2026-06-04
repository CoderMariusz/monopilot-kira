'use server';

/**
 * 03-technical shared BOM SSOT — read Server Actions (T-012).
 *
 * BOM list per FG (newest version first) + BOM detail (flattened header + lines +
 * co_products, shape matching the snapshot_json contract so the same renderer
 * serves the snapshot viewer / diff). Org-scoped reads under withOrgContext + RLS
 * (`app.current_org_id()`). No service-role bypass, no audit-only fields echoed.
 *
 * Route mapping: `:itemCode` resolves to `bom_headers.product_id` (the FG's
 * product_code natural key). Cross-org reads return zero rows (RLS), which the
 * route layer maps to 404 (AC#3).
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  BOM_LIST_PAGE_SIZE,
  type BomDetailView,
  type BomHeaderView,
  type BomStatus,
  mapCoProduct,
  mapHeader,
  mapLine,
  type QueryClient,
} from './shared';

const HEADER_COLS = `id, product_id, npd_project_id, fa_code, origin_module, status, version,
  supersedes_bom_header_id, yield_pct, effective_from, effective_to, approved_by, approved_at, notes`;

export type ListBomsResult =
  | { ok: true; data: BomHeaderView[] }
  | { ok: false; error: 'load_failed' };

// ── BOM list (hero view, TEC-020 / T-037) ─────────────────────────────────────
/**
 * One row per FG product: the latest BOM version (highest `version`) of each
 * `product_id`, with the FG's display name + category from `public.product`.
 * This powers the BOM list page; `getBomDetail` / `listBoms` remain per-FG.
 *
 * Org-scoped under RLS (`app.current_org_id()`) — both `bom_headers` and the
 * joined `product` rows are filtered by the same org. The query is paginated
 * (red-line: never load all BOMs unpaginated) via LIMIT/OFFSET, with the total
 * FG count returned via a window function for the pager.
 */
export type BomListRow = {
  productId: string;
  productName: string | null;
  category: string | null;
  version: number;
  status: BomStatus;
  yieldPct: string;
  componentCount: number;
  updatedAt: string | null;
};

export type ListBomHeadersResult =
  | { ok: true; data: BomListRow[]; total: number }
  | { ok: false; error: 'load_failed' };

type BomListSqlRow = {
  product_id: string;
  product_name: string | null;
  category: string | null;
  version: number;
  status: string;
  yield_pct: string;
  component_count: string | number;
  updated_at: string | Date | null;
  total_count: string | number;
};

export async function listBomHeaders(opts?: {
  status?: BomStatus;
  query?: string;
  page?: number;
  pageSize?: number;
}): Promise<ListBomHeadersResult> {
  const pageSize = Math.min(Math.max(opts?.pageSize ?? BOM_LIST_PAGE_SIZE, 1), 200);
  const page = Math.max(opts?.page ?? 1, 1);
  const offset = (page - 1) * pageSize;
  const status = opts?.status;
  const q = opts?.query?.trim() ? `%${opts.query.trim()}%` : null;

  try {
    return await withOrgContext(async ({ client }): Promise<ListBomHeadersResult> => {
      const c = client as QueryClient;
      // DISTINCT ON (product_id) keeps the highest version per FG. The optional
      // status filter applies to that latest version; the optional text filter
      // matches the product_id or the joined product_name. The window count gives
      // the total number of FGs for pagination without a second round-trip.
      const { rows } = await c.query<BomListSqlRow>(
        `with latest as (
            select distinct on (h.product_id)
                   h.id,
                   h.product_id,
                   h.version,
                   h.status,
                   h.yield_pct::text as yield_pct,
                   h.updated_at,
                   pr.product_name,
                   pr.department_number as category
              from public.bom_headers h
              left join public.product pr
                on pr.org_id = h.org_id
               and pr.product_code = h.product_id
             where h.org_id = app.current_org_id()
               and h.product_id is not null
             order by h.product_id, h.version desc
         ),
         filtered as (
            select latest.*,
                   (select count(*)::int
                      from public.bom_lines bl
                     where bl.org_id = app.current_org_id()
                       and bl.bom_header_id = latest.id) as component_count
              from latest
             where ($1::text is null or latest.status = $1)
               and ($2::text is null
                    or latest.product_id ilike $2
                    or coalesce(latest.product_name, '') ilike $2)
         )
         select product_id, product_name, category, version, status, yield_pct,
                component_count,
                updated_at,
                count(*) over () as total_count
           from filtered
          order by product_id asc
          limit $3 offset $4`,
        [status ?? null, q, pageSize, offset],
      );

      const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
      const data: BomListRow[] = rows.map((r) => ({
        productId: r.product_id,
        productName: r.product_name,
        category: r.category,
        version: Number(r.version),
        status: r.status as BomStatus,
        yieldPct: String(r.yield_pct),
        componentCount: Number(r.component_count),
        updatedAt:
          r.updated_at == null
            ? null
            : r.updated_at instanceof Date
              ? r.updated_at.toISOString()
              : String(r.updated_at),
      }));
      return { ok: true, data, total };
    });
  } catch (err) {
    console.error('[technical/bom] listBomHeaders load_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'load_failed' };
  }
}

/** BOM list for an FG (product_id), newest version first (AC#1). */
export async function listBoms(productId: string): Promise<ListBomsResult> {
  try {
    return await withOrgContext(async ({ client }): Promise<ListBomsResult> => {
      const { rows } = await (client as QueryClient).query(
        `select ${HEADER_COLS}
           from public.bom_headers
          where org_id = app.current_org_id()
            and product_id = $1
          order by version desc`,
        [productId],
      );
      return { ok: true, data: rows.map((r) => mapHeader(r as never)) };
    });
  } catch (err) {
    console.error('[technical/bom] listBoms load_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'load_failed' };
  }
}

// ── BOM Generator (T-016/T-041): eligible-FG picker source ────────────────────
export type EligibleFg = { productCode: string; name: string | null };

export type ListEligibleFgsResult =
  | { ok: true; data: EligibleFg[] }
  | { ok: false; error: 'load_failed' };

/**
 * The V-TEC-15 eligible FG set for the BOM Generator picker: org-scoped
 * (withOrgContext + RLS) reads of `public.product` whose `status_overall` is
 * 'Complete' (case-insensitive). Real data — feeds the `selected` scope picker
 * so the UI can only ever offer FGs the server-side generator would accept.
 */
export async function listEligibleFgs(): Promise<ListEligibleFgsResult> {
  try {
    return await withOrgContext(async ({ client }): Promise<ListEligibleFgsResult> => {
      const { rows } = await (client as QueryClient).query<{ product_code: string; product_name: string | null }>(
        `select product_code, product_name
           from public.product
          where org_id = app.current_org_id()
            and lower(trim(coalesce(status_overall, ''))) = 'complete'
          order by product_code asc`,
      );
      return { ok: true, data: rows.map((r) => ({ productCode: r.product_code, name: r.product_name })) };
    });
  } catch (err) {
    console.error('[technical/bom] listEligibleFgs load_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'load_failed' };
  }
}

export type GetBomDetailResult =
  | { ok: true; data: BomDetailView }
  | { ok: false; error: 'not_found' | 'load_failed' };

/** BOM detail (header + lines + co_products) for one FG version (AC#2/AC#3). */
export async function getBomDetail(productId: string, version: number): Promise<GetBomDetailResult> {
  try {
    return await withOrgContext(async ({ client }): Promise<GetBomDetailResult> => {
      const c = client as QueryClient;
      const headerRes = await c.query(
        `select ${HEADER_COLS}
           from public.bom_headers
          where org_id = app.current_org_id()
            and product_id = $1
            and version = $2`,
        [productId, version],
      );
      const headerRow = headerRes.rows[0];
      if (!headerRow) return { ok: false, error: 'not_found' };
      const header = mapHeader(headerRow as never);

      const [linesRes, coProductsRes] = await Promise.all([
        c.query(
          `select id, line_no, item_id, component_code, component_type, quantity, uom, scrap_pct,
                  manufacturing_operation_name, sequence, is_phantom
             from public.bom_lines
            where org_id = app.current_org_id()
              and bom_header_id = $1
            order by line_no asc`,
          [header.id],
        ),
        c.query(
          `select id, co_product_item_id, quantity, uom, allocation_pct, is_byproduct
             from public.bom_co_products
            where org_id = app.current_org_id()
              and bom_header_id = $1
            order by created_at asc`,
          [header.id],
        ),
      ]);

      return {
        ok: true,
        data: {
          header,
          lines: linesRes.rows.map((r) => mapLine(r as never)),
          co_products: coProductsRes.rows.map((r) => mapCoProduct(r as never)),
        },
      };
    });
  } catch (err) {
    console.error('[technical/bom] getBomDetail load_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'load_failed' };
  }
}

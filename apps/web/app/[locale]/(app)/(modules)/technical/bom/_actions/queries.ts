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
  type BomDetailView,
  type BomHeaderView,
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

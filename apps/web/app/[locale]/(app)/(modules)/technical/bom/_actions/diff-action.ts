'use server';

/**
 * 03-technical shared BOM SSOT — version diff Server Action (T-015).
 *
 * GET equivalent for `/api/technical/items/:code/boms/diff?from=&to=`. Loads two
 * BOM versions (org-scoped under RLS) and returns the structured diff
 * (added/removed/changed for lines + co_products, plus header field changes) via
 * the pure `diffBom`. Missing version pair -> not_found (route maps to 404).
 *
 * Red-line: private_jsonb is never part of the diff — only the whitelisted
 * header/line/co-product view fields are compared.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { type BomDiff, diffBom } from './diff';
import {
  type BomDetailView,
  BomDiffInput,
  mapCoProduct,
  mapHeader,
  mapLine,
  type QueryClient,
} from './shared';

const HEADER_COLS = `id, product_id, npd_project_id, fa_code, origin_module, status, version,
  supersedes_bom_header_id, yield_pct, effective_from, effective_to, approved_by, approved_at, notes`;

export type BomDiffResult =
  | { ok: true; data: BomDiff }
  | { ok: false; error: 'invalid_input' | 'not_found' | 'load_failed'; message?: string };

async function loadDetail(c: QueryClient, productId: string, version: number): Promise<BomDetailView | null> {
  const headerRes = await c.query(
    `select ${HEADER_COLS}
       from public.bom_headers
      where org_id = app.current_org_id()
        and item_id = (
          select id
            from public.items
           where org_id = app.current_org_id()
             and item_code = $1
        )
        and version = $2`,
    [productId, version],
  );
  const headerRow = headerRes.rows[0];
  if (!headerRow) return null;
  const header = mapHeader(headerRow as never);

  const [linesRes, coProductsRes] = await Promise.all([
    c.query(
      `select id, line_no, item_id, component_code, component_type, quantity, uom, scrap_pct,
              manufacturing_operation_name, sequence, is_phantom
         from public.bom_lines
        where org_id = app.current_org_id() and bom_header_id = $1
        order by line_no asc`,
      [header.id],
    ),
    c.query(
      `select id, co_product_item_id, quantity, uom, allocation_pct, is_byproduct
         from public.bom_co_products
        where org_id = app.current_org_id() and bom_header_id = $1
        order by created_at asc`,
      [header.id],
    ),
  ]);

  return {
    header,
    lines: linesRes.rows.map((r) => mapLine(r as never)),
    co_products: coProductsRes.rows.map((r) => mapCoProduct(r as never)),
  };
}

export async function diffBomVersions(rawInput: unknown): Promise<BomDiffResult> {
  const parsed = BomDiffInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const { productId, from, to } = parsed.data;

  try {
    return await withOrgContext(async ({ client }): Promise<BomDiffResult> => {
      const c = client as QueryClient;
      const [fromBom, toBom] = await Promise.all([loadDetail(c, productId, from), loadDetail(c, productId, to)]);
      if (!fromBom || !toBom) return { ok: false, error: 'not_found' };
      return { ok: true, data: diffBom(fromBom, toBom) };
    });
  } catch (err) {
    console.error('[technical/bom] diffBomVersions load_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'load_failed' };
  }
}

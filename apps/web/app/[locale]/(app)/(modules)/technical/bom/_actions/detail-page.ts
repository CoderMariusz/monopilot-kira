'use server';

/**
 * 03-technical shared BOM SSOT — BOM Detail page loader (TEC-021 / T-038).
 *
 * Aggregates everything the 7-tab BOM Detail screen needs in a single org-scoped
 * read under withOrgContext + RLS (`app.current_org_id()`). Builds on the existing
 * read primitives in queries.ts (`getBomDetail`) and adds the data the extra tabs
 * require — version history, approval chain, snapshots and where-used — without a
 * service-role bypass or any hardcoded rows.
 *
 * Route mapping: `:itemCode` resolves to `bom_headers.product_id` (the FG's
 * product_code natural key). Cross-org reads return zero rows (RLS), which the
 * route layer maps to 404.
 *
 * Red-lines honoured:
 *   - FG is canonical; no FA-* identifiers are introduced.
 *   - Released/approved rows are never mutated here (read-only loader).
 *   - Shared BOM SSOT tables (bom_headers/lines/co_products/snapshots) are the
 *     single source of truth — read directly, no shadow copies.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  type BomCoProductView,
  type BomLineView,
  type BomStatus,
  mapCoProduct,
  mapHeader,
  mapLine,
  type QueryClient,
} from './shared';

const HEADER_COLS = `id, product_id, npd_project_id, fa_code, origin_module, status, version,
  supersedes_bom_header_id, yield_pct, effective_from, effective_to, approved_by, approved_at, notes`;

export type BomVersionRow = {
  id: string;
  version: number;
  status: BomStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  notes: string | null;
  isSelected: boolean;
};

export type BomSnapshotRow = {
  id: string;
  workOrderId: string | null;
  snapshotAt: string | null;
};

export type BomWhereUsedRow = {
  parentProductId: string;
  parentProductName: string | null;
  parentVersion: number;
  parentStatus: BomStatus;
  quantity: string;
  uom: string;
};

export type BomDetailPage = {
  productId: string;
  productName: string | null;
  category: string | null;
  /** The version currently rendered (latest by default, or the requested one). */
  selectedVersion: number;
  header: ReturnType<typeof mapHeader>;
  lines: BomLineView[];
  coProducts: BomCoProductView[];
  versions: BomVersionRow[];
  snapshots: BomSnapshotRow[];
  whereUsed: BomWhereUsedRow[];
};

export type GetBomDetailPageResult =
  | { ok: true; data: BomDetailPage }
  | { ok: false; error: 'not_found' | 'load_failed' };

/**
 * Lightweight FG resolver for the FIRST-AUTHORING state.
 *
 * `getBomDetailPage` returns `not_found` for BOTH a truly unknown item code AND a
 * known FG that simply has no `bom_headers` row yet (the "create the first BOM"
 * case). To tell them apart the route asks this loader whether the `:itemCode`
 * resolves to a real finished good in the org-scoped items master. When it does,
 * the route renders the authoring shell instead of a 404 so the New-BOM picker's
 * "route an active FG → /technical/bom/{code}" flow no longer dead-ends.
 *
 * `:itemCode` = `public.items.item_code` (= `bom_headers.product_id`). Cross-org
 * rows are invisible (RLS), so an unknown/cross-org code returns null → 404.
 */
export type BomFgSummary = {
  /** FG natural key (item_code = product_id). */
  productId: string;
  /** Display name from the items master (falls back to the code in the UI). */
  productName: string | null;
  /** Items-master lifecycle status (`draft | active | deprecated | blocked`). */
  status: string;
  /** Whether a BOM may be authored against it (only active FGs are eligible). */
  eligible: boolean;
};

export async function getBomFgSummary(
  itemCode: string,
): Promise<{ ok: true; data: BomFgSummary } | { ok: false; error: 'not_found' | 'load_failed' }> {
  try {
    return await withOrgContext(async ({ client }) => {
      const c = client as QueryClient;
      const { rows } = await c.query<{ item_code: string; name: string | null; status: string }>(
        `select item_code, name, status
           from public.items
          where org_id = app.current_org_id()
            and item_code = $1
            and item_type = 'fg'
          limit 1`,
        [itemCode],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' } as const;
      return {
        ok: true,
        data: {
          productId: row.item_code,
          productName: row.name,
          status: row.status,
          eligible: row.status === 'active',
        },
      } as const;
    });
  } catch (err) {
    console.error('[technical/bom] getBomFgSummary load_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'load_failed' };
  }
}

type VersionSqlRow = {
  id: string;
  version: number;
  status: string;
  effective_from: string | Date;
  effective_to: string | Date | null;
  approved_by_name: string | null;
  approved_at: string | Date | null;
  notes: string | null;
};

function toDateStr(v: string | Date | null): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
}

function toIso(v: string | Date | null): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

/**
 * Loads the BOM Detail page for one FG. When `version` is omitted the latest
 * (highest) version is rendered. Returns `not_found` when the FG has no BOM
 * versions in this org (route → 404).
 */
export async function getBomDetailPage(
  productId: string,
  version?: number,
): Promise<GetBomDetailPageResult> {
  try {
    return await withOrgContext(async ({ client }): Promise<GetBomDetailPageResult> => {
      const c = client as QueryClient;

      // 1) All versions of this FG (newest first) + approver display name.
      const versionsRes = await c.query<VersionSqlRow>(
        `select h.id, h.version, h.status, h.effective_from, h.effective_to,
                u.display_name as approved_by_name, h.approved_at, h.notes
           from public.bom_headers h
           left join public.users u
             on u.id = h.approved_by
          where h.org_id = app.current_org_id()
            and h.product_id = $1
          order by h.version desc`,
        [productId],
      );
      if (versionsRes.rows.length === 0) return { ok: false, error: 'not_found' };

      const selectedVersion =
        version != null && versionsRes.rows.some((r) => Number(r.version) === version)
          ? version
          : Number(versionsRes.rows[0].version);

      const versions: BomVersionRow[] = versionsRes.rows.map((r) => ({
        id: String(r.id),
        version: Number(r.version),
        status: r.status as BomStatus,
        effectiveFrom: toDateStr(r.effective_from) ?? '',
        effectiveTo: toDateStr(r.effective_to),
        approvedByName: r.approved_by_name,
        approvedAt: toIso(r.approved_at),
        notes: r.notes,
        isSelected: Number(r.version) === selectedVersion,
      }));

      const selectedId = versions.find((v) => v.isSelected)!.id;

      // 2) The selected version header (full view shape) + product name/category.
      const [headerRes, productRes] = await Promise.all([
        c.query(
          `select ${HEADER_COLS}
             from public.bom_headers
            where org_id = app.current_org_id() and id = $1`,
          [selectedId],
        ),
        c.query<{ product_name: string | null; category: string | null }>(
          `select product_name, department_number as category
             from public.product
            where org_id = app.current_org_id() and product_code = $1
            limit 1`,
          [productId],
        ),
      ]);
      const headerRow = headerRes.rows[0];
      if (!headerRow) return { ok: false, error: 'not_found' };
      const header = mapHeader(headerRow as never);

      // 3) Lines + co-products + snapshots + where-used (parallel, org-scoped).
      const [linesRes, coProductsRes, snapshotsRes, whereUsedRes] = await Promise.all([
        c.query(
          `select id, line_no, item_id, component_code, component_type, quantity, uom, scrap_pct,
                  manufacturing_operation_name, sequence, is_phantom
             from public.bom_lines
            where org_id = app.current_org_id() and bom_header_id = $1
            order by line_no asc`,
          [selectedId],
        ),
        c.query(
          `select id, co_product_item_id, quantity, uom, allocation_pct, is_byproduct, expected_yield_pct
             from public.bom_co_products
            where org_id = app.current_org_id() and bom_header_id = $1
            order by created_at asc`,
          [selectedId],
        ),
        c.query<{ id: string; work_order_id: string | null; snapshot_at: string | Date | null }>(
          `select id, work_order_id, snapshot_at
             from public.bom_snapshots
            where org_id = app.current_org_id() and bom_header_id = $1
            order by snapshot_at desc
            limit 50`,
          [selectedId],
        ),
        // Where-used: other (active) BOMs whose lines reference THIS FG as a
        // component (component_code = this product_id). Distinct parent FGs.
        c.query<{
          parent_product_id: string;
          parent_product_name: string | null;
          parent_version: number;
          parent_status: string;
          quantity: string;
          uom: string;
        }>(
          `select distinct on (ph.product_id)
                  ph.product_id as parent_product_id,
                  pr.product_name as parent_product_name,
                  ph.version as parent_version,
                  ph.status as parent_status,
                  bl.quantity::text as quantity,
                  bl.uom as uom
             from public.bom_lines bl
             join public.bom_headers ph
               on ph.id = bl.bom_header_id and ph.org_id = bl.org_id
             left join public.product pr
               on pr.org_id = ph.org_id and pr.product_code = ph.product_id
            where bl.org_id = app.current_org_id()
              and bl.component_code = $1
              and ph.product_id is not null
              and ph.product_id <> $1
            order by ph.product_id, ph.version desc
            limit 100`,
          [productId],
        ),
      ]);

      const data: BomDetailPage = {
        productId,
        productName: productRes.rows[0]?.product_name ?? null,
        category: productRes.rows[0]?.category ?? null,
        selectedVersion,
        header,
        lines: linesRes.rows.map((r) => mapLine(r as never)),
        coProducts: coProductsRes.rows.map((r) => mapCoProduct(r as never)),
        versions,
        snapshots: snapshotsRes.rows.map((r) => ({
          id: String(r.id),
          workOrderId: r.work_order_id,
          snapshotAt: toIso(r.snapshot_at),
        })),
        whereUsed: whereUsedRes.rows.map((r) => ({
          parentProductId: r.parent_product_id,
          parentProductName: r.parent_product_name,
          parentVersion: Number(r.parent_version),
          parentStatus: r.parent_status as BomStatus,
          quantity: String(r.quantity),
          uom: r.uom,
        })),
      };
      return { ok: true, data };
    });
  } catch (err) {
    console.error('[technical/bom] getBomDetailPage load_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'load_failed' };
  }
}

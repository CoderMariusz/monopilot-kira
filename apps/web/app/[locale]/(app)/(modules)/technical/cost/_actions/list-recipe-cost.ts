'use server';

/**
 * 03-technical Recipe costing (TEC-013) — page-load Server Action.
 *
 * Real BOM-driven standard-cost roll-up under withOrgContext + RLS
 * (`app.current_org_id()`), no mocks. Two reads:
 *   1. listCostedProducts() — the FG/intermediate products that have a BOM
 *      header (DISTINCT product_id) so the page can offer a product picker.
 *   2. getRecipeCost(productCode) — for the latest non-archived BOM of the
 *      product, the material cost roll-up = Σ(line.quantity × component
 *      items.cost_per_kg), computed entirely in SQL NUMERIC space (no JS float),
 *      plus the per-line breakdown and the header yield_pct.
 *
 * Prototype parity:
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:536-585
 *   (CostingScreen) — Std/Target/Selling/Margin KPIs + a cost breakdown bar list +
 *   the yield note. See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Ownership (dual with Finance): this reads ONLY items.cost_per_kg + bom_* and
 * SUMs them for a material rollup — it NEVER reads/writes Finance standard-cost /
 * valuation / variance tables. There is no target/selling price in Technical's
 * schema, so those prototype KPIs are surfaced as N/A (the breakdown + total are
 * the real, data-backed values). NUMERIC stays a string end-to-end.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import type { QueryClient } from './shared';

export type CostedProductOption = {
  productCode: string;
  name: string | null;
  /** Latest BOM version surfaced for context. */
  bomVersion: number;
  bomStatus: string;
  /**
   * Phase-3 NPD↔Technical shortcut: the NPD project id whose product_code matches
   * this product, when one exists (org-scoped, read-only). Null → no "See NPD
   * costing →" link is rendered for the product. Resolved server-side in the page
   * loader, never fetched client-side.
   */
  npdProjectId?: string | null;
};

export type ListCostedProductsResult = {
  products: CostedProductOption[];
  state: 'ready' | 'empty' | 'error';
};

/** One BOM line costed = quantity × component cost_per_kg (NUMERIC strings). */
export type RecipeCostLine = {
  componentCode: string;
  componentName: string | null;
  componentType: string | null;
  /** NUMERIC — string. */
  quantity: string;
  uom: string;
  /** NUMERIC — string, null when the component has no cost recorded. */
  unitCost: string | null;
  /** NUMERIC — string, null when unitCost is null. */
  lineCost: string | null;
};

export type RecipeCost = {
  productCode: string;
  name: string | null;
  bomVersion: number;
  bomStatus: string;
  /** NUMERIC(6,3) yield — string. */
  yieldPct: string;
  /** Σ lineCost, NUMERIC — string. null when no line had a cost. */
  totalMaterialCost: string | null;
  /** Currency unit recorded on items (PLN default). Display-only. */
  lines: RecipeCostLine[];
};

export type GetRecipeCostResult =
  | { ok: true; state: 'ready' | 'empty'; cost: RecipeCost }
  | { ok: false; state: 'error' };

type ProductRow = {
  product_code: string;
  name: string | null;
  bom_version: number;
  bom_status: string;
};

type NpdProjectRow = { product_code: string; project_id: string };

type HeaderRow = {
  id: string;
  product_code: string;
  name: string | null;
  bom_version: number;
  bom_status: string;
  yield_pct: string;
  total_material_cost: string | null;
};

type LineRow = {
  component_code: string;
  component_name: string | null;
  component_type: string | null;
  quantity: string;
  uom: string;
  unit_cost: string | null;
  line_cost: string | null;
};

export async function listCostedProducts(): Promise<ListCostedProductsResult> {
  try {
    return await withOrgContext(async ({ client }): Promise<ListCostedProductsResult> => {
      const qc = client as QueryClient;
      // Latest (highest version, non-archived) BOM per product_id, joined to the
      // item master for the product name (product_id is TEXT → items.item_code).
      const { rows } = await qc.query<ProductRow>(
        `select distinct on (bh.product_id)
                bh.product_id as product_code,
                i.name,
                bh.version   as bom_version,
                bh.status    as bom_status
           from public.bom_headers bh
           left join public.items i
                  on i.item_code = bh.product_id
                 and i.org_id = app.current_org_id()
          where bh.org_id = app.current_org_id()
            and bh.product_id is not null
            and bh.status <> 'archived'
          order by bh.product_id, bh.version desc`,
      );

      // Phase-3 NPD↔Technical shortcut: one cheap org-scoped read mapping each
      // product_code to the NPD project that owns it (npd_projects.product_code).
      // Read-only; null when no project maps → the cost client omits the link.
      const codes = rows.map((r) => r.product_code).filter((c): c is string => !!c);
      const npdByCode = new Map<string, string>();
      if (codes.length > 0) {
        const { rows: npdRows } = await qc.query<NpdProjectRow>(
          `select distinct on (np.product_code)
                  np.product_code,
                  np.id as project_id
             from public.npd_projects np
            where np.org_id = app.current_org_id()
              and np.product_code = any($1::text[])
            order by np.product_code, np.created_at desc`,
          [codes],
        );
        for (const r of npdRows) npdByCode.set(r.product_code, r.project_id);
      }

      const products: CostedProductOption[] = rows.map((r) => ({
        productCode: r.product_code,
        name: r.name,
        bomVersion: Number(r.bom_version),
        bomStatus: r.bom_status,
        npdProjectId: npdByCode.get(r.product_code) ?? null,
      }));

      return { products, state: products.length ? 'ready' : 'empty' };
    });
  } catch (error) {
    console.error('[technical/cost] listCostedProducts load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { products: [], state: 'error' };
  }
}

export async function getRecipeCost(rawProductCode: unknown): Promise<GetRecipeCostResult> {
  const productCode = typeof rawProductCode === 'string' ? rawProductCode.trim() : '';
  if (!productCode) return { ok: false, state: 'error' };

  try {
    return await withOrgContext(async ({ client }): Promise<GetRecipeCostResult> => {
      const qc = client as QueryClient;

      // The latest non-archived BOM header for this product, with the SQL-computed
      // material roll-up. The Σ(quantity × cost_per_kg) is done in NUMERIC space.
      const headerResult = await qc.query<HeaderRow>(
        `select bh.id,
                bh.product_id as product_code,
                i.name,
                bh.version    as bom_version,
                bh.status     as bom_status,
                bh.yield_pct::text as yield_pct,
                (select sum(bl.quantity * ci.cost_per_kg)::text
                   from public.bom_lines bl
                   left join public.items ci
                          on ci.org_id = app.current_org_id()
                         and (ci.id = bl.item_id or ci.item_code = bl.component_code)
                  where bl.org_id = app.current_org_id()
                    and bl.bom_header_id = bh.id
                    and ci.cost_per_kg is not null) as total_material_cost
           from public.bom_headers bh
           left join public.items i
                  on i.item_code = bh.product_id
                 and i.org_id = app.current_org_id()
          where bh.org_id = app.current_org_id()
            and bh.product_id = $1
            and bh.status <> 'archived'
          order by bh.version desc
          limit 1`,
        [productCode],
      );

      const header = headerResult.rows[0];
      if (!header) {
        return {
          ok: true,
          state: 'empty',
          cost: {
            productCode,
            name: null,
            bomVersion: 0,
            bomStatus: 'none',
            yieldPct: '100.000',
            totalMaterialCost: null,
            lines: [],
          },
        };
      }

      const lineResult = await qc.query<LineRow>(
        `select bl.component_code,
                ci.name as component_name,
                bl.component_type,
                bl.quantity::text as quantity,
                bl.uom,
                ci.cost_per_kg::text as unit_cost,
                (bl.quantity * ci.cost_per_kg)::text as line_cost
           from public.bom_lines bl
           left join public.items ci
                  on ci.org_id = app.current_org_id()
                 and (ci.id = bl.item_id or ci.item_code = bl.component_code)
          where bl.org_id = app.current_org_id()
            and bl.bom_header_id = $1::uuid
          order by bl.component_code asc`,
        [header.id],
      );

      const lines: RecipeCostLine[] = lineResult.rows.map((r) => ({
        componentCode: r.component_code,
        componentName: r.component_name,
        componentType: r.component_type,
        quantity: r.quantity,
        uom: r.uom,
        unitCost: r.unit_cost,
        lineCost: r.line_cost,
      }));

      const cost: RecipeCost = {
        productCode,
        name: header.name,
        bomVersion: Number(header.bom_version),
        bomStatus: header.bom_status,
        yieldPct: header.yield_pct,
        totalMaterialCost: header.total_material_cost,
        lines,
      };

      return { ok: true, state: lines.length ? 'ready' : 'empty', cost };
    });
  } catch (error) {
    console.error('[technical/cost] getRecipeCost load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, state: 'error' };
  }
}

'use server';

/**
 * Allergen cascade preview (AllergenCascadeScreen) page-load action.
 *
 * Parity: prototypes/design/Monopilot Design System/technical/
 *   other-screens.jsx:1370-1431. READ-ONLY visualization of the cascade contract
 *   (PRD §10.2): FG allergens = UNION(RM allergens via BOM) + UNION(process
 *   additions per manufacturing operation). Manual overrides are preserved.
 *
 * RED LINE — the cascade source is MATERIALIZED + READ-ONLY at the NPD boundary:
 *   this surface NEVER recomputes nor writes. It reads:
 *     - the FG's FINAL allergen set from item_allergen_profiles (already written by
 *       the cascade engine T-024 / NPD materialization);
 *     - the NPD-materialized public.product.allergens / may_contain (the boundary
 *       value, read-only) joined on item_code = product_code;
 *     - the derivation chain = the active BOM's component allergen profiles +
 *       manufacturing-operation additions (the "why" behind each final badge).
 *   Edits happen in Product detail → Allergens; this is a preview only.
 *
 * Real Supabase data via withOrgContext + RLS — no mocks. FG canonical (no FA).
 */

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  hasAnyTechnicalAccess,
  type LoadState,
  type OrgActionContext,
  type QueryClient,
} from '../../../allergens-config/_actions/shared';

export type FinalAllergen = {
  code: string;
  name: string;
  intensity: string;
  source: string;
};

export type ChainNode = {
  level: 'RM' | 'Intermediate' | 'Packaging' | 'Process' | 'FG';
  code: string;
  name: string;
  detail: string;
  contributes: { code: string; name: string }[];
};

export type CascadeProduct = {
  itemCode: string;
  itemName: string;
  bomVersionLabel: string | null;
  finalAllergens: FinalAllergen[];
  chain: ChainNode[];
};

export type LoadCascadeResult = {
  state: LoadState;
  products: CascadeProduct[];
};

const FG_LIMIT = 50;

type FgRow = { id: string; item_code: string; name: string };

export async function loadAllergenCascade(): Promise<LoadCascadeResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<LoadCascadeResult> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      const qc = client as QueryClient;

      if (!(await hasAnyTechnicalAccess(ctx))) {
        return { state: 'denied', products: [] };
      }

      const { rows: fgRows } = await qc.query<FgRow>(
        `select i.id, i.item_code, i.name
           from public.items i
          where i.org_id = app.current_org_id()
            and i.item_type = 'fg'
            and i.status = 'active'
            and exists (
              select 1 from public.item_allergen_profiles ap
               where ap.org_id = app.current_org_id() and ap.item_id = i.id
            )
          order by i.item_code asc
          limit $1`,
        [FG_LIMIT],
      );

      if (fgRows.length === 0) {
        return { state: 'empty', products: [] };
      }

      const products: CascadeProduct[] = [];

      for (const fg of fgRows) {
        // (1) Final allergen set — the materialized current profile.
        const { rows: finals } = await qc.query<{
          allergen_code: string;
          allergen_name: string | null;
          intensity: string;
          source: string;
        }>(
          `select p.allergen_code, a.allergen_name, p.intensity, p.source
             from public.item_allergen_profiles p
             left join "Reference"."Allergens" a
               on a.org_id = p.org_id and a.allergen_code = p.allergen_code
            where p.org_id = app.current_org_id() and p.item_id = $1::uuid
            order by p.allergen_code asc`,
          [fg.id],
        );

        // (2) Active BOM version label (read-only).
        const { rows: bomRows } = await qc.query<{ version: number | null }>(
          `select bh.version
             from public.bom_headers bh
            where bh.org_id = app.current_org_id()
              and bh.product_id = $1
              and bh.status = 'active'
            order by bh.version desc
            limit 1`,
          [fg.item_code],
        );

        // (3) Derivation chain — component allergen contributions + process additions
        //     from the active BOM (the "why" behind the final badges). Read-only.
        const { rows: components } = await qc.query<{
          item_code: string;
          name: string;
          item_type: string;
          contributes_code: string | null;
          contributes_name: string | null;
        }>(
          `with active_bom as (
              select bh.id as bom_header_id
                from public.bom_headers bh
               where bh.org_id = app.current_org_id()
                 and bh.product_id = $1
                 and bh.status = 'active'
               order by bh.version desc
               limit 1
           )
           select c.item_code, c.name, c.item_type,
                  iap.allergen_code as contributes_code,
                  ra.allergen_name as contributes_name
             from active_bom ab
             join public.bom_lines bl
               on bl.bom_header_id = ab.bom_header_id and bl.org_id = app.current_org_id()
             join public.items c
               on c.id = bl.item_id and c.org_id = app.current_org_id()
             left join public.item_allergen_profiles iap
               on iap.org_id = app.current_org_id() and iap.item_id = c.id
             left join "Reference"."Allergens" ra
               on ra.org_id = app.current_org_id() and ra.allergen_code = iap.allergen_code
            where bl.item_id is not null
            order by c.item_code asc`,
          [fg.item_code],
        );

        const { rows: processAdds } = await qc.query<{
          manufacturing_operation_name: string;
          allergen_code: string;
          allergen_name: string | null;
        }>(
          `with active_bom as (
              select bh.id as bom_header_id
                from public.bom_headers bh
               where bh.org_id = app.current_org_id()
                 and bh.product_id = $1
                 and bh.status = 'active'
               order by bh.version desc
               limit 1
           )
           select distinct moa.manufacturing_operation_name, moa.allergen_code,
                  ra.allergen_name
             from active_bom ab
             join public.bom_lines bl
               on bl.bom_header_id = ab.bom_header_id and bl.org_id = app.current_org_id()
             join public.manufacturing_operation_allergen_additions moa
               on moa.org_id = app.current_org_id()
              and moa.manufacturing_operation_name = bl.manufacturing_operation_name
             left join "Reference"."Allergens" ra
               on ra.org_id = app.current_org_id() and ra.allergen_code = moa.allergen_code
            where bl.manufacturing_operation_name is not null
            order by moa.manufacturing_operation_name asc`,
          [fg.item_code],
        );

        // Group component contributions by component item.
        const componentMap = new Map<string, ChainNode>();
        for (const c of components) {
          let node = componentMap.get(c.item_code);
          if (!node) {
            node = {
              level:
                c.item_type === 'intermediate'
                  ? 'Intermediate'
                  : c.item_type === 'packaging'
                    ? 'Packaging'
                    : 'RM',
              code: c.item_code,
              name: c.name,
              detail: `${fg.item_code} → ${c.item_code}`,
              contributes: [],
            };
            componentMap.set(c.item_code, node);
          }
          if (c.contributes_code) {
            node.contributes.push({
              code: c.contributes_code,
              name: c.contributes_name ?? c.contributes_code,
            });
          }
        }

        // Group process additions by operation.
        const processMap = new Map<string, ChainNode>();
        for (const p of processAdds) {
          let node = processMap.get(p.manufacturing_operation_name);
          if (!node) {
            node = {
              level: 'Process',
              code: p.manufacturing_operation_name,
              name: p.manufacturing_operation_name,
              detail: `${fg.item_code} · process`,
              contributes: [],
            };
            processMap.set(p.manufacturing_operation_name, node);
          }
          node.contributes.push({ code: p.allergen_code, name: p.allergen_name ?? p.allergen_code });
        }

        const chain: ChainNode[] = [
          ...componentMap.values(),
          ...processMap.values(),
          {
            level: 'FG',
            code: fg.item_code,
            name: fg.name,
            detail: bomRows[0]?.version != null ? `BOM v${bomRows[0].version}` : '',
            contributes: finals
              .filter((f) => f.intensity === 'contains')
              .map((f) => ({ code: f.allergen_code, name: f.allergen_name ?? f.allergen_code })),
          },
        ];

        products.push({
          itemCode: fg.item_code,
          itemName: fg.name,
          bomVersionLabel: bomRows[0]?.version != null ? `BOM v${bomRows[0].version}` : null,
          finalAllergens: finals.map((f) => ({
            code: f.allergen_code,
            name: f.allergen_name ?? f.allergen_code,
            intensity: f.intensity,
            source: f.source,
          })),
          chain,
        });
      }

      return { state: 'ready', products };
    });
  } catch (error) {
    console.error('[technical/allergens/cascade] loadAllergenCascade failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { state: 'error', products: [] };
  }
}

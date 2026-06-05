'use server';

/**
 * Allergen matrix (AllergenScreen) page-load action.
 *
 * Parity: prototypes/design/Monopilot Design System/technical/other-screens.jsx:78-132.
 * At-a-glance allergen presence across active products. Reads REAL Supabase data
 * org-scoped via withOrgContext + RLS (`app.current_org_id()`) — no mocks:
 *
 *   rows = active items (fg + intermediate) ordered by item_code;
 *   cols = EU-14 (+org custom) allergen codes from "Reference"."Allergens";
 *   cell = the strongest item_allergen_profiles intensity for (item × allergen):
 *            contains            → 2 (red ●)
 *            may_contain / trace → 1 (amber ⚠)
 *            absent              → 0
 *
 * Auto-cascaded badges are read-only at this surface (the matrix is a viewer; edits
 * happen in Product Detail → Allergens). FG canonical (no FA aliases).
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  hasAnyTechnicalAccess,
  type LoadState,
  type OrgActionContext,
  type QueryClient,
} from './shared';

export type AllergenColumn = { code: string; name: string };

export type MatrixCell = 0 | 1 | 2;

export type MatrixRow = {
  itemCode: string;
  itemName: string;
  cells: MatrixCell[];
};

export type LoadMatrixResult = {
  state: LoadState;
  columns: AllergenColumn[];
  rows: MatrixRow[];
};

type ProfileRow = {
  item_code: string;
  item_name: string;
  allergen_code: string | null;
  intensity: string | null;
};

const ROW_LIMIT = 300;

function cellFor(intensity: string | null): MatrixCell {
  if (intensity === 'contains') return 2;
  if (intensity === 'may_contain' || intensity === 'trace') return 1;
  return 0;
}

export async function loadAllergenMatrix(): Promise<LoadMatrixResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<LoadMatrixResult> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };

      if (!(await hasAnyTechnicalAccess(ctx))) {
        return { state: 'denied', columns: [], rows: [] };
      }

      const qc = client as QueryClient;

      // Columns: EU-14 + org custom allergen reference, alphabetical by name.
      const { rows: cols } = await qc.query<{ allergen_code: string; allergen_name: string }>(
        `select allergen_code, allergen_name
           from "Reference"."Allergens"
          where org_id = app.current_org_id()
          order by allergen_name asc`,
      );
      const columns: AllergenColumn[] = cols.map((c) => ({ code: c.allergen_code, name: c.allergen_name }));

      // Rows: active fg + intermediate items, left-joined to their declared profile.
      const { rows: profileRows } = await qc.query<ProfileRow>(
        `select i.item_code,
                i.name as item_name,
                p.allergen_code,
                p.intensity
           from public.items i
           left join public.item_allergen_profiles p
                  on p.org_id = app.current_org_id() and p.item_id = i.id
          where i.org_id = app.current_org_id()
            and i.item_type in ('fg', 'intermediate')
            and i.status = 'active'
          order by i.item_code asc, p.allergen_code asc`,
      );

      // Pivot in JS into the column order. Distinct items capped at ROW_LIMIT.
      const colIndex = new Map(columns.map((c, idx) => [c.code, idx]));
      const byItem = new Map<string, MatrixRow>();
      for (const r of profileRows) {
        let row = byItem.get(r.item_code);
        if (!row) {
          if (byItem.size >= ROW_LIMIT) continue;
          row = { itemCode: r.item_code, itemName: r.item_name, cells: columns.map(() => 0 as MatrixCell) };
          byItem.set(r.item_code, row);
        }
        if (r.allergen_code != null) {
          const idx = colIndex.get(r.allergen_code);
          if (idx != null) {
            const next = cellFor(r.intensity);
            if (next > row.cells[idx]) row.cells[idx] = next;
          }
        }
      }

      const rows = [...byItem.values()];

      return {
        state: rows.length === 0 ? 'empty' : 'ready',
        columns,
        rows,
      };
    });
  } catch (error) {
    console.error('[technical/allergens-config] loadAllergenMatrix failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { state: 'error', columns: [], rows: [] };
  }
}

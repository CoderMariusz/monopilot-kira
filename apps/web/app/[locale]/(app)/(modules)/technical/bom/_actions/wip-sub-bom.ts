'use server';

/**
 * 03-technical shared BOM SSOT — WIP sub-BOM lazy loader (W5 / T5 ruling).
 *
 * The BOM Detail Components tab can expand a WIP-type line to reveal that WIP
 * item's own ACTIVE BOM one level deep. Loading is lazy (only when the row is
 * expanded) so the parent screen stays a single-level read; the sub-BOM is
 * fetched on demand through this org-scoped action.
 *
 * Resolution: a WIP line carries `bom_lines.item_id` (the WIP item). Its sub-BOM
 * is the ACTIVE `bom_headers` row for that item_id (status='active'). We read the
 * lines of that active header with the SAME shape/mapper as the parent detail
 * loader, plus each line's substitute code/name via the same join. Everything is
 * scoped by `app.current_org_id()` under withOrgContext + RLS — no service-role
 * bypass. A WIP with no active BOM returns an honest empty result.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import type { QueryClient } from './shared';

export type WipSubBomLine = {
  id: string;
  lineNo: number;
  componentCode: string;
  componentType: string | null;
  quantity: string;
  uom: string;
  scrapPct: string;
  isPhantom: boolean;
  substituteCode: string | null;
  substituteName: string | null;
};

export type WipSubBomResult =
  | { ok: true; lines: WipSubBomLine[] }
  | { ok: false; error: 'load_failed' };

type LineSqlRow = {
  id: string;
  line_no: number;
  component_code: string;
  component_type: string | null;
  quantity: string;
  uom: string;
  scrap_pct: string;
  is_phantom: boolean;
  substitute_code: string | null;
  substitute_name: string | null;
};

/**
 * Loads the ACTIVE BOM lines for a WIP component item (by its items.id). Returns
 * an empty `lines` array (still `ok: true`) when the WIP has no active BOM — the
 * caller renders the honest "no active BOM for this WIP" empty state.
 */
export async function loadWipSubBom(wipItemId: string): Promise<WipSubBomResult> {
  if (!wipItemId) return { ok: true, lines: [] };
  try {
    return await withOrgContext(async ({ client }): Promise<WipSubBomResult> => {
      const c = client as QueryClient;
      const { rows } = await c.query<LineSqlRow>(
        `select bl.id, bl.line_no, bl.component_code, bl.component_type,
                bl.quantity::text as quantity, bl.uom, bl.scrap_pct::text as scrap_pct,
                bl.is_phantom,
                si.item_code as substitute_code,
                si.name      as substitute_name
           from public.bom_lines bl
           join public.bom_headers h
             on h.id = bl.bom_header_id and h.org_id = bl.org_id
           left join public.items si
             on si.id = bl.substitute_item_id and si.org_id = bl.org_id
          where bl.org_id = app.current_org_id()
            and h.org_id = app.current_org_id()
            and h.item_id = $1::uuid
            and h.status = 'active'
          order by bl.line_no asc`,
        [wipItemId],
      );
      const lines: WipSubBomLine[] = rows.map((r) => ({
        id: String(r.id),
        lineNo: Number(r.line_no),
        componentCode: r.component_code,
        componentType: r.component_type,
        quantity: String(r.quantity),
        uom: r.uom,
        scrapPct: String(r.scrap_pct),
        isPhantom: Boolean(r.is_phantom),
        substituteCode: r.substitute_code,
        substituteName: r.substitute_name,
      }));
      return { ok: true, lines };
    });
  } catch (err) {
    console.error('[technical/bom] loadWipSubBom load_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'load_failed' };
  }
}

'use server';

/**
 * 03-technical · TEC-025 BOM Snapshot Diff (T-086, spec-driven): diff action.
 *
 * Computes a flattened JSON-path diff (kinds noop/chg/add/rem — mirrors
 * spec-driven-screens.jsx:307-354) of an immutable snapshot's frozen
 * `snapshot_json` vs the CURRENT canonical BOM (header + lines + co_products,
 * rebuilt from bom_headers / bom_lines / bom_co_products for the snapshot's
 * bom_header). Org-scoped under withOrgContext + RLS.
 *
 * Strictly read-only: never mutates the snapshot (immutable) nor the canonical
 * BOM. If the canonical BOM header no longer exists (orphaned snapshot), the
 * "current" side is empty and every frozen path diffs as `rem` — the snapshot
 * stays readable for audit/traceability.
 */

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { normalizeBomSnapshotJsonUoms, normalizePieceUom } from '../../../../../../../../lib/uom/piece';
import { diffSnapshotVsCurrent, type QueryClient, type SnapshotDiffEntry } from './shared';

export type DiffSnapshotResult =
  | { ok: true; data: { diff: SnapshotDiffEntry[]; snapshotJson: unknown; currentExists: boolean } }
  | { ok: false; error: 'not_found' | 'load_failed' };

type SnapRow = { snapshot_json: unknown; bom_header_id: string };
type HeaderRow = { id: string; product_id: string | null; version: number; status: string; yield_pct: string };
type LineRow = {
  line_no: number;
  component_code: string;
  component_type: string | null;
  quantity: string;
  uom: string;
  scrap_pct: string;
  manufacturing_operation_name: string | null;
};

export async function diffBomSnapshot(snapshotId: string): Promise<DiffSnapshotResult> {
  try {
    return await withOrgContext(async ({ client }): Promise<DiffSnapshotResult> => {
      const qc = client as QueryClient;

      const snap = await qc.query<SnapRow>(
        `select snapshot_json, bom_header_id
           from public.bom_snapshots
          where id = $1::uuid and org_id = app.current_org_id()
          limit 1`,
        [snapshotId],
      );
      const snapRow = snap.rows[0];
      if (!snapRow) return { ok: false, error: 'not_found' };

      // Rebuild the CURRENT canonical BOM for the snapshot's header (may be gone).
      const headerRes = await qc.query<HeaderRow>(
        `select id, product_id, version, status, yield_pct::text as yield_pct
           from public.bom_headers
          where id = $1::uuid and org_id = app.current_org_id()
          limit 1`,
        [snapRow.bom_header_id],
      );
      const header = headerRes.rows[0];

      let current: unknown = {};
      if (header) {
        const linesRes = await qc.query<LineRow>(
          `select line_no, component_code, component_type, quantity::text as quantity,
                  uom, scrap_pct::text as scrap_pct, manufacturing_operation_name
             from public.bom_lines
            where bom_header_id = $1::uuid and org_id = app.current_org_id()
            order by line_no asc`,
          [snapRow.bom_header_id],
        );
        current = {
          header: {
            product_id: header.product_id,
            version: header.version,
            status: header.status,
            yield_pct: header.yield_pct,
          },
          lines: linesRes.rows.map((l) => ({
            line_no: l.line_no,
            code: l.component_code,
            type: l.component_type,
            quantity: l.quantity,
            uom: normalizePieceUom(l.uom) ?? l.uom,
            scrap_pct: l.scrap_pct,
            manufacturing_operation_name: l.manufacturing_operation_name,
          })),
        };
      }

      const frozen = normalizeBomSnapshotJsonUoms(snapRow.snapshot_json as Record<string, unknown>);
      const diff = diffSnapshotVsCurrent(frozen, current);
      return { ok: true, data: { diff, snapshotJson: frozen, currentExists: Boolean(header) } };
    });
  } catch (error) {
    console.error('[technical/boms/snapshots] diffBomSnapshot load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'load_failed' };
  }
}

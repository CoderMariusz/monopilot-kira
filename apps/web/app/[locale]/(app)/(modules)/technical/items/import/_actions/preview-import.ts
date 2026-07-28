'use server';

/**
 * 03-technical · TEC-014 Bulk Import CSV (T-085, spec-driven): preview action.
 *
 * Parses an uploaded items CSV, validates every row org-scoped, and computes a
 * diff (create / update / no-op) against the org's existing item master. This is
 * the spec-driven equivalent of the 02-settings reference CSV import preview
 * (settings/reference/[code]/import/_actions/previewImport.ts) — same 3-step
 * upload → preview → commit contract, adapted to public.items.
 *
 * Real data, org-scoped under withOrgContext + RLS (`app.current_org_id()`):
 *   - the existing-item snapshot is read from public.items for the active org;
 *   - org_id is ALWAYS taken from the auth session, never from the CSV
 *     (red-line: org-scoped, no D365 dependency);
 *   - the parse/validate/diff is pure (lib/import/parse-items-csv.ts) so RTL can
 *     exercise it without Supabase.
 *
 * The actual INSERTs happen at commit time via the existing `createItem` Server
 * Action — this preview never mutates.
 */

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  hasPermission,
  ITEMS_CREATE_PERMISSION,
  type OrgActionContext,
  type QueryClient,
} from '../../_actions/shared';
import {
  diffItemsAgainstExisting,
  type ImportScope,
  type ItemImportPreview,
  parseItemsCsv,
} from '../../../../../../../../lib/import/parse-items-csv';

export type PreviewImportResult =
  | { ok: true; preview: ItemImportPreview }
  | { ok: false; error: 'forbidden' | 'parse_failed' };

// The catch-weight envelope travels with the snapshot so the preview validates
// the MERGED row (import is a patch — an omitted column keeps the stored value).
type ExistingRow = {
  item_code: string;
  item_type: string;
  name: string;
  weight_mode: string | null;
  nominal_weight: string | null;
  gross_weight_max: string | null;
  variance_tolerance_pct: string | null;
};

export async function previewItemsImport(scope: ImportScope, csvText: string): Promise<PreviewImportResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<PreviewImportResult> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };

      // RBAC: importing creates/updates items — reuse the create permission.
      if (!(await hasPermission(ctx, ITEMS_CREATE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const parsed = parseItemsCsv(scope, csvText);
      if (!parsed.ok) return { ok: false, error: 'parse_failed' };

      // Existing item snapshot for the diff (org-scoped via RLS).
      const { rows } = await qc.query<ExistingRow>(
        `select item_code, item_type, name, weight_mode, nominal_weight, gross_weight_max, variance_tolerance_pct
           from public.items where org_id = app.current_org_id()`,
      );
      const existing = new Map(
        rows.map((r) => [
          r.item_code,
          {
            itemType: r.item_type,
            name: r.name,
            weightMode: r.weight_mode,
            nominalWeight: r.nominal_weight,
            grossWeightMax: r.gross_weight_max,
            varianceTolerancePct: r.variance_tolerance_pct,
          },
        ]),
      );

      const preview = diffItemsAgainstExisting(scope, parsed.rows, existing);
      return { ok: true, preview };
    });
  } catch (error) {
    console.error('[technical/items/import] previewItemsImport failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'parse_failed' };
  }
}

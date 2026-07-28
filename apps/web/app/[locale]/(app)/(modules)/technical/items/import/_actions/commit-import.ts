'use server';

/**
 * 03-technical · TEC-014 Bulk Import CSV (T-085, spec-driven): commit action.
 *
 * Re-parses + re-diffs the CSV server-side (NEVER trusts a client-supplied diff —
 * fail-closed) and applies it by consuming the EXISTING items Server Actions:
 *   - create rows  → createItem (T-009, technical.items.create gate);
 *   - update rows  → updateItem (T-010, technical.items.edit gate, id resolved
 *                    from item_code under RLS);
 *   - no-op / error rows are skipped.
 *
 * An audit note (min 10 chars, captured in the confirm step) is required and is
 * recorded against the import via audit_log. Org-scoped under withOrgContext +
 * RLS (`app.current_org_id()`); org_id is taken from the session, never the CSV.
 * No D365 dependency.
 */

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { createItem } from '../../_actions/create-item';
import { updateItem } from '../../_actions/update-item';
import { safeRevalidatePath } from '../../_actions/revalidate';
import {
  hasPermission,
  ITEMS_CREATE_PERMISSION,
  type OrgActionContext,
  type QueryClient,
  writeAudit,
} from '../../_actions/shared';
import {
  diffItemsAgainstExisting,
  type ImportScope,
  parseItemsCsv,
} from '../../../../../../../../lib/import/parse-items-csv';
import { INVALID_STATUS_TRANSITION_IMPORT_ERROR } from './import-error-codes';

/**
 * A row the commit refused. EVERY refusal produces one of these — previously
 * only the status-transition case did, and every other failure just bumped an
 * `errors` counter the UI rendered inside a green "Applied" banner.
 */
export type CommitImportRowError =
  | {
      rowNumber: number;
      itemCode: string;
      column: 'status';
      code: typeof INVALID_STATUS_TRANSITION_IMPORT_ERROR;
      from: string;
      to: string;
    }
  | { rowNumber: number; itemCode: string; column: string; code: 'row_rejected'; message: string };

export type CommitImportResult =
  | {
      ok: true;
      committed: { created: number; updated: number; skipped: number; errors: number };
      rowErrors: CommitImportRowError[];
    }
  | { ok: false; error: 'forbidden' | 'parse_failed' | 'invalid_reason' };

// Every column updateItem writes: the import is a PATCH, so anything the CSV
// omits must be carried over from the stored row instead of being written NULL.
type ExistingRow = {
  id: string;
  item_code: string;
  item_type: string;
  name: string;
  status: string;
  uom_base: string;
  uom_secondary: string | null;
  weight_mode: string;
  nominal_weight: string | null;
  tare_weight: string | null;
  gross_weight_max: string | null;
  variance_tolerance_pct: string | null;
  description: string | null;
  product_group: string | null;
  category_code: string | null;
  gs1_gtin: string | null;
  shelf_life_days: number | null;
  shelf_life_mode: string | null;
  output_uom: string | null;
  net_qty_per_each: string | null;
  each_per_box: number | null;
  boxes_per_pallet: number | null;
  list_price_gbp: string | null;
};

/**
 * Turn a Server Action failure into something a table row can show. `message` on
 * an `invalid_input` result is zod's issue array as JSON — pull the first issue's
 * field + text out of it so the user sees "nominalWeight: … required (> 0)"
 * instead of a counter.
 */
function describeRefusal(error: string, message?: string): { column: string; message: string } {
  if (!message) return { column: '—', message: error };
  try {
    const issues = JSON.parse(message) as Array<{ path?: unknown[]; message?: string }>;
    const first = Array.isArray(issues) ? issues[0] : undefined;
    if (first) return { column: String(first.path?.[0] ?? '—'), message: first.message ?? error };
  } catch {
    // Not a zod payload (e.g. 'invalid_transition') — show it as-is.
  }
  return { column: '—', message };
}

export async function commitItemsImport(
  scope: ImportScope,
  csvText: string,
  reason: string,
): Promise<CommitImportResult> {
  if (!reason || reason.trim().length < 10) return { ok: false, error: 'invalid_reason' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<CommitImportResult> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };
      if (!(await hasPermission(ctx, ITEMS_CREATE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const parsed = parseItemsCsv(scope, csvText);
      if (!parsed.ok) return { ok: false, error: 'parse_failed' };

      const { rows: existingRows } = await qc.query<ExistingRow>(
        `select id, item_code, item_type, name, status, uom_base, uom_secondary, weight_mode,
                nominal_weight, tare_weight, gross_weight_max, variance_tolerance_pct,
                description, product_group, category_code, gs1_gtin,
                shelf_life_days, shelf_life_mode,
                output_uom, net_qty_per_each, each_per_box, boxes_per_pallet, list_price_gbp
           from public.items where org_id = app.current_org_id()`,
      );
      const byCode = new Map(existingRows.map((r) => [r.item_code, r]));
      const preview = diffItemsAgainstExisting(
        scope,
        parsed.rows,
        new Map(
          existingRows.map((r) => [
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
        ),
      );

      let created = 0;
      let updated = 0;
      let skipped = 0;
      let errors = preview.counts.errors;
      const rowErrors: CommitImportRowError[] = [];

      /** Refusals are never silent — the wizard renders these against the row. */
      const reject = (row: { rowNumber: number; itemCode: string }, error: string, message?: string) => {
        errors += 1;
        rowErrors.push({ rowNumber: row.rowNumber, itemCode: row.itemCode, code: 'row_rejected', ...describeRefusal(error, message) });
      };

      for (const row of preview.rows) {
        if (row.op === 'create') {
          const res = await createItem({
            itemCode: row.parsed.itemCode,
            name: row.parsed.name,
            itemType: row.parsed.itemType.toLowerCase(),
            uomBase: row.parsed.uomBase,
            status: row.parsed.status,
            weightMode: row.parsed.weightMode,
            nominalWeight: row.parsed.nominalWeight,
            grossWeightMax: row.parsed.grossWeightMax,
            varianceTolerancePct: row.parsed.varianceTolerancePct,
            description: row.parsed.description,
            productGroup: row.parsed.productGroup,
            uomSecondary: row.parsed.uomSecondary,
            costPerKg: row.parsed.costPerKg,
          });
          if (res.ok) created += 1;
          else reject(row, res.error, res.message);
        } else if (row.op === 'update') {
          const prior = byCode.get(row.itemCode);
          if (!prior) {
            reject(row, 'not_found');
            continue;
          }
          // PATCH, not replace. updateItem writes EVERY column unconditionally,
          // so a CSV that changes only `name` used to blank the item's whole
          // catch-weight envelope (and its shelf life, pack hierarchy, GTIN…).
          // Anything the CSV does not carry is re-sent from the stored row.
          const res = await updateItem({
            id: prior.id,
            name: row.parsed.name,
            itemType: row.parsed.itemType.toLowerCase(),
            status: row.parsed.status ?? prior.status,
            uomBase: row.parsed.uomBase,
            weightMode: row.parsed.weightMode ?? prior.weight_mode,
            description: row.parsed.description ?? prior.description ?? undefined,
            productGroup: row.parsed.productGroup ?? prior.product_group ?? undefined,
            categoryCode: prior.category_code ?? undefined,
            uomSecondary: row.parsed.uomSecondary ?? prior.uom_secondary ?? undefined,
            gs1Gtin: prior.gs1_gtin ?? undefined,
            nominalWeight: row.parsed.nominalWeight ?? prior.nominal_weight ?? undefined,
            tareWeight: prior.tare_weight ?? undefined,
            grossWeightMax: row.parsed.grossWeightMax ?? prior.gross_weight_max ?? undefined,
            varianceTolerancePct: row.parsed.varianceTolerancePct ?? prior.variance_tolerance_pct ?? undefined,
            shelfLifeDays: prior.shelf_life_days ?? undefined,
            shelfLifeMode: prior.shelf_life_mode ?? undefined,
            outputUom: prior.output_uom ?? undefined,
            netQtyPerEach: prior.net_qty_per_each ?? undefined,
            eachPerBox: prior.each_per_box ?? undefined,
            boxesPerPallet: prior.boxes_per_pallet ?? undefined,
            listPriceGbp: prior.list_price_gbp ?? undefined,
            costPerKg: row.parsed.costPerKg,
          });
          if (res.ok) updated += 1;
          else if (res.error === 'invalid_input' && res.message === 'invalid_transition') {
            errors += 1;
            rowErrors.push({
              rowNumber: row.rowNumber,
              itemCode: row.itemCode,
              column: 'status',
              code: INVALID_STATUS_TRANSITION_IMPORT_ERROR,
              from: prior.status,
              to: row.parsed.status ?? prior.status,
            });
          } else reject(row, res.error, res.message);
        } else {
          skipped += 1;
        }
      }

      // Record the import itself (with the audit note) in audit_log.
      await writeAudit(qc, {
        orgId,
        actorUserId: userId,
        action: 'items.bulk_imported',
        resourceId: orgId,
        beforeState: null,
        afterState: { scope, reason: reason.trim(), created, updated, skipped, errors },
      });

      safeRevalidatePath('/technical/items');
      return { ok: true, committed: { created, updated, skipped, errors }, rowErrors };
    });
  } catch (error) {
    console.error('[technical/items/import] commitItemsImport failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'parse_failed' };
  }
}

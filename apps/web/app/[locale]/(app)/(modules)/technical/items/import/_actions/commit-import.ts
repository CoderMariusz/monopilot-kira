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

export type CommitImportRowError = {
  rowNumber: number;
  itemCode: string;
  column: 'status';
  code: typeof INVALID_STATUS_TRANSITION_IMPORT_ERROR;
  from: string;
  to: string;
};

export type CommitImportResult =
  | {
      ok: true;
      committed: { created: number; updated: number; skipped: number; errors: number };
      rowErrors: CommitImportRowError[];
    }
  | { ok: false; error: 'forbidden' | 'parse_failed' | 'invalid_reason' };

type ExistingRow = { id: string; item_code: string; item_type: string; name: string; status: string };

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
        `select id, item_code, item_type, name, status from public.items where org_id = app.current_org_id()`,
      );
      const byCode = new Map(existingRows.map((r) => [r.item_code, r]));
      const preview = diffItemsAgainstExisting(
        scope,
        parsed.rows,
        new Map(existingRows.map((r) => [r.item_code, { itemType: r.item_type, name: r.name }])),
      );

      let created = 0;
      let updated = 0;
      let skipped = 0;
      let errors = preview.counts.errors;
      const rowErrors: CommitImportRowError[] = [];

      for (const row of preview.rows) {
        if (row.op === 'create') {
          const res = await createItem({
            itemCode: row.parsed.itemCode,
            name: row.parsed.name,
            itemType: row.parsed.itemType.toLowerCase(),
            uomBase: row.parsed.uomBase,
            status: row.parsed.status,
            weightMode: row.parsed.weightMode,
            description: row.parsed.description,
            productGroup: row.parsed.productGroup,
            uomSecondary: row.parsed.uomSecondary,
            costPerKg: row.parsed.costPerKg,
          });
          if (res.ok) created += 1;
          else errors += 1;
        } else if (row.op === 'update') {
          const prior = byCode.get(row.itemCode);
          if (!prior) {
            errors += 1;
            continue;
          }
          const res = await updateItem({
            id: prior.id,
            name: row.parsed.name,
            itemType: row.parsed.itemType.toLowerCase(),
            status: row.parsed.status ?? 'active',
            uomBase: row.parsed.uomBase,
            weightMode: row.parsed.weightMode ?? 'fixed',
            description: row.parsed.description,
            productGroup: row.parsed.productGroup,
            uomSecondary: row.parsed.uomSecondary,
            costPerKg: row.parsed.costPerKg,
          });
          if (res.ok) updated += 1;
          else {
            errors += 1;
            if (res.error === 'invalid_input' && res.message === 'invalid_transition') {
              rowErrors.push({
                rowNumber: row.rowNumber,
                itemCode: row.itemCode,
                column: 'status',
                code: INVALID_STATUS_TRANSITION_IMPORT_ERROR,
                from: prior.status,
                to: row.parsed.status ?? 'active',
              });
            }
          }
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

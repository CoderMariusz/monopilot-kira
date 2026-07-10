'use server';

/**
 * Wave E-IO — "Export to file" for the Purchase Orders list (CSV, export-only).
 *
 * Single reader: this action does NOT re-implement the PO list SQL. It calls the
 * very same readers the list screen uses — `listPurchaseOrders({ status, q,
 * archived })` (org-scoped via withOrgContext / RLS) plus `listPurchaseOrderLineCounts()`
 * for the "Lines" column — so the export always matches exactly what the screen
 * shows for the active status tab / search / supplier filter the user passes in.
 *
 * Human-readable values only (S-IO-4 / S-IO-5): the CSV carries PO number, supplier
 * CODE + name, item-free header columns and the line count — NEVER raw UUIDs. The
 * supplier UUID is resolved to its CODE by `listPurchaseOrders` (s.code), and we drop
 * the id columns from the serialized output entirely.
 *
 * Job ledger: writes an `import_export_jobs` row (kind='export', target='purchase_orders',
 * status='completed' — the DB check constraint has no 'done' state) so the export
 * surfaces automatically in /settings/import-export (the hub reads the same table).
 *
 * RBAC: reuses the EXISTING purchase-order permission the sibling PO write actions
 * already check (`npd.planning.write` / PLANNING_WRITE_PERMISSION). The list read
 * itself is RLS-scoped with no dedicated read permission, and we must not add a new
 * permission enum entry in this lane (concurrent edits).
 * TODO(E-IO): dedicated io.export.run permission
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { hasPlanningReadPermission, requireActionPermission, PLANNING_PO_MANAGE_PERMISSION, type OrgActionContext, type QueryClient } from '../../_actions/procurement-shared';
import { listPurchaseOrders } from './actions';
import { listPurchaseOrderLineCounts } from './po-form-data';

/**
 * CSV column order (human-readable; NO UUIDs). Module-local (NOT exported): this
 * is a `'use server'` file, which may only export async server actions — a const
 * export here breaks the production build.
 */
const PO_EXPORT_CSV_COLUMNS = [
  'po_number',
  'supplier_code',
  'supplier_name',
  'status',
  'expected_delivery',
  'line_count',
  'currency',
  'notes',
] as const;

export type CreateExportJobInput = {
  /** Active status tab ('all' → undefined); mirrors the list's client status filter. */
  status?: string;
  /** Free-text search (PO number / supplier code); mirrors the list's search box. */
  q?: string;
  /** Supplier filter (UUID) applied to the rows after the same read. */
  supplierId?: string;
  /** Archive tab — when true exports the archived dataset (server re-fetch). */
  archived?: boolean;
};

export type CreateExportJobResult =
  | { ok: true; data: { jobId: string; filename: string; csv: string; rows: number } }
  | { ok: false; error: 'forbidden' | 'persistence_failed' | 'invalid_input' };

/** RFC-4180 escape: quote a field holding `"`, `,`, CR or LF; double inner `"`. */
function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return /["\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fileSafe(segment: string): string {
  return segment.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'export';
}

export async function createExportJob(rawInput: unknown = {}): Promise<CreateExportJobResult> {
  const input = (rawInput ?? {}) as CreateExportJobInput;
  const statusParam = typeof input.status === 'string' && input.status !== 'all' ? input.status : undefined;
  const q = typeof input.q === 'string' && input.q.trim() ? input.q.trim() : undefined;
  const supplierId = typeof input.supplierId === 'string' && input.supplierId.trim() ? input.supplierId.trim() : undefined;
  const archived = input.archived === true;

  // Single reader: the SAME actions the list screen renders from. listPurchaseOrders
  // re-validates `status` against the PO status enum and returns invalid_input for a
  // bogus tab; we surface that rather than exporting an unfiltered list.
  const [listResult, lineCounts] = await Promise.all([
    listPurchaseOrders({ status: statusParam, q, supplierId, archived, limit: 200 }),
    listPurchaseOrderLineCounts(),
  ]);

  if (!listResult.ok) {
    return { ok: false, error: listResult.error === 'invalid_input' ? 'invalid_input' : 'persistence_failed' };
  }

  const rows = listResult.data;

  const csvLines = [PO_EXPORT_CSV_COLUMNS.join(',')];
  for (const po of rows) {
    csvLines.push(
      [
        po.poNumber,
        po.supplierCode ?? '',
        po.supplierName ?? '',
        po.status,
        po.expectedDelivery ?? '',
        lineCounts[po.id] ?? 0,
        po.currency,
        po.notes ?? '',
      ]
        .map(csvCell)
        .join(','),
    );
  }
  const csv = csvLines.join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${fileSafe(`purchase-orders-${stamp}`)}.csv`;

  try {
    const jobId = await withOrgContext(async ({ userId, orgId, client }): Promise<string> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      const perm = await requireActionPermission(ctx, PLANNING_PO_MANAGE_PERMISSION);
      if (!perm.ok) throw new ExportForbiddenError();

      const { rows: jobRows } = await ctx.client.query<{ id: string }>(
        `insert into public.import_export_jobs
           (org_id, kind, target, status, progress_processed, progress_total,
            content_type, created_by, completed_at, metadata)
         values
           (app.current_org_id(), 'export', 'purchase_orders', 'completed', $1::integer, $1::integer,
            'text/csv', $2::uuid, pg_catalog.now(), $3::jsonb)
         returning id`,
        [
          rows.length,
          userId,
          JSON.stringify({
            rows: rows.length,
            filters: {
              status: statusParam ?? 'all',
              q: q ?? null,
              supplierId: supplierId ?? null,
              archived,
            },
          }),
        ],
      );
      const id = jobRows[0]?.id;
      if (!id) throw new Error('export job insert returned no row');
      return id;
    });

    return { ok: true, data: { jobId, filename, csv, rows: rows.length } };
  } catch (err) {
    if (err instanceof ExportForbiddenError) return { ok: false, error: 'forbidden' };
    console.error('[planning/purchase-orders] createExportJob failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

class ExportForbiddenError extends Error {}

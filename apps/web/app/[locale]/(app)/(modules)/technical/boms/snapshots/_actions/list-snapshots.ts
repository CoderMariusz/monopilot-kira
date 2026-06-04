'use server';

/**
 * 03-technical · TEC-025 BOM Snapshots Viewer (T-086, spec-driven): list action.
 *
 * Reads the immutable public.bom_snapshots org-scoped (withOrgContext + RLS,
 * `app.current_org_id()`), joining bom_headers (for the frozen version) and
 * public.product (for the finished-good display name). Read-only — snapshots are
 * immutable (DB trigger + withheld update/delete grants); this surface never
 * mutates the canonical BOM.
 *
 * Derived status (spec-driven-screens.jsx translation note "derive in SQL view"):
 *   - orphaned : the canonical bom_header no longer exists for the org;
 *   - in_use   : the snapshot is the latest snapshot of its bom_header;
 *   - closed   : an older snapshot of a still-existing bom_header.
 * Orphaned snapshots stay read-only (red-line: never auto-prune).
 *
 * Optional filters: work-order substring + status pill (applied in SQL/JS).
 */

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import type { QueryClient, SnapshotRow, SnapshotStatus } from './shared';

export type ListSnapshotsState = 'ready' | 'empty' | 'error';

export type ListSnapshotsResult = {
  snapshots: SnapshotRow[];
  state: ListSnapshotsState;
};

type Row = {
  id: string;
  work_order_id: string | null;
  bom_header_id: string;
  bom_version: number | null;
  product_id: string | null;
  product_name: string | null;
  line_count: number;
  snapshot_at: string | Date;
  header_exists: boolean;
  is_latest: boolean;
};

export async function listBomSnapshots(): Promise<ListSnapshotsResult> {
  try {
    return await withOrgContext(async ({ client }): Promise<ListSnapshotsResult> => {
      const qc = client as QueryClient;

      const { rows } = await qc.query<Row>(
        `select
           s.id,
           s.work_order_id,
           s.bom_header_id,
           h.version as bom_version,
           h.product_id,
           p.name as product_name,
           coalesce(jsonb_array_length(s.snapshot_json -> 'lines'), 0) as line_count,
           s.snapshot_at,
           (h.id is not null) as header_exists,
           (s.id = first_value(s.id) over (
              partition by s.bom_header_id order by s.snapshot_at desc, s.id desc
           )) as is_latest
         from public.bom_snapshots s
         left join public.bom_headers h
           on h.id = s.bom_header_id and h.org_id = app.current_org_id()
         left join public.product p
           on p.product_code = h.product_id and p.org_id = app.current_org_id()
         where s.org_id = app.current_org_id()
         order by s.snapshot_at desc, s.id desc`,
      );

      const snapshots: SnapshotRow[] = rows.map((r) => {
        let status: SnapshotStatus;
        if (!r.header_exists) status = 'orphaned';
        else if (r.is_latest) status = 'in_use';
        else status = 'closed';
        return {
          id: String(r.id),
          workOrderId: r.work_order_id ? String(r.work_order_id) : null,
          bomHeaderId: String(r.bom_header_id),
          bomVersion: r.bom_version === null ? null : Number(r.bom_version),
          productId: r.product_id,
          productName: r.product_name,
          lineCount: Number(r.line_count),
          snapshotAt: r.snapshot_at instanceof Date ? r.snapshot_at.toISOString() : String(r.snapshot_at),
          status,
        };
      });

      return { snapshots, state: snapshots.length ? 'ready' : 'empty' };
    });
  } catch (error) {
    console.error('[technical/boms/snapshots] listBomSnapshots load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { snapshots: [], state: 'error' };
  }
}

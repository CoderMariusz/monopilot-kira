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
import {
  LIST_SNAPSHOTS_SQL,
  mapSnapshotRow,
  type QueryClient,
  type SnapshotQueryRow,
  type SnapshotRow,
} from './shared';

export type ListSnapshotsState = 'ready' | 'empty' | 'error';

export type ListSnapshotsResult = {
  snapshots: SnapshotRow[];
  state: ListSnapshotsState;
};

export async function listBomSnapshots(): Promise<ListSnapshotsResult> {
  try {
    return await withOrgContext(async ({ client }): Promise<ListSnapshotsResult> => {
      const qc = client as QueryClient;

      const { rows } = await qc.query<SnapshotQueryRow>(LIST_SNAPSHOTS_SQL);
      const snapshots: SnapshotRow[] = rows.map(mapSnapshotRow);

      return { snapshots, state: snapshots.length ? 'ready' : 'empty' };
    });
  } catch (error) {
    console.error('[technical/boms/snapshots] listBomSnapshots load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { snapshots: [], state: 'error' };
  }
}

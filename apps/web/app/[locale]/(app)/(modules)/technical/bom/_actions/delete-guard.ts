'use server';

/**
 * T-042 — UI: TEC-082 BOM Version Delete modal — server-side guard reader.
 *
 * Resolves the two delete guards for a specific BOM version, org-scoped under
 * withOrgContext + RLS (`app.current_org_id()`):
 *   1) snapshotCount — number of bom_snapshots referencing the version's header.
 *      > 0 means deleting would orphan historical WO snapshots → BLOCKED.
 *   2) deletable — only a `draft` version may be deleted; active/approved/
 *      superseded/archived rows are never removed (released rows are immutable,
 *      red-line).
 *
 * Read-only — this NEVER deletes (the DELETE Server Action is owned elsewhere /
 * out of scope for the T-042 UI task). The modal renders these guards; the caller
 * wires the actual delete mutation.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import type { QueryClient } from './shared';

export type VersionDeleteGuard = {
  bomHeaderId: string;
  versionLabel: string;
  snapshotCount: number;
  deletable: boolean;
};

export type GetVersionDeleteGuardResult =
  | { ok: true; data: VersionDeleteGuard }
  | { ok: false; error: 'not_found' | 'load_failed' };

/**
 * Loads the delete guard for one FG version (by item_code + version number).
 * Returns `not_found` when the version does not exist in this org.
 */
export async function getVersionDeleteGuard(
  productId: string,
  version: number,
): Promise<GetVersionDeleteGuardResult> {
  try {
    return await withOrgContext(async ({ client }): Promise<GetVersionDeleteGuardResult> => {
      const c = client as QueryClient;
      const headerRes = await c.query<{ id: string; status: string }>(
        `select id, status
           from public.bom_headers
          where org_id = app.current_org_id()
            and item_id = (
              select id
                from public.items
               where org_id = app.current_org_id()
                 and item_code = $1
            )
            and version = $2`,
        [productId, version],
      );
      const header = headerRes.rows[0];
      if (!header) return { ok: false, error: 'not_found' };

      const snapRes = await c.query<{ n: string | number }>(
        `select count(*)::int as n
           from public.bom_snapshots
          where org_id = app.current_org_id() and bom_header_id = $1`,
        [header.id],
      );
      const snapshotCount = Number(snapRes.rows[0]?.n ?? 0);

      return {
        ok: true,
        data: {
          bomHeaderId: String(header.id),
          versionLabel: `v${version}`,
          snapshotCount,
          deletable: header.status === 'draft',
        },
      };
    });
  } catch (err) {
    console.error('[technical/bom] getVersionDeleteGuard load_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'load_failed' };
  }
}

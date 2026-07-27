import type { BomStatus } from '../_actions/shared';

export type BomVersionMutationAction = 'addComponent' | 'saveVersion' | 'deleteVersion';

/**
 * The two conditions `deleteBomVersion` enforces ON TOP of "status = draft".
 * Both are server red-lines, quoted from `_actions/delete-bom-version.ts`:
 *
 *   versionCount <= 1  → `{ error: 'only_version' }`        ("Cannot delete the only BOM version")
 *   snapshotCount > 0  → `{ error: 'snapshot_referenced' }` ("Cannot delete a BOM version referenced by snapshots")
 *
 * `versionCount` counts EVERY bom_headers row for the product (any status), and
 * `snapshotCount` counts bom_snapshots rows for THIS version — the same two counts
 * the action queries. Omit this argument only where the counts genuinely are not
 * known; the matrix then answers on status alone, as it always did.
 */
export type BomDeleteVersionCounts = {
  versionCount: number;
  snapshotCount: number;
};

/**
 * Which of the two extra delete conditions blocks a DRAFT version, or null when
 * neither does. Precedence mirrors the server's statement order: only_version is
 * checked before snapshot_referenced.
 */
function draftDeleteBlockedKey(counts?: BomDeleteVersionCounts): string | null {
  if (!counts) return null;
  if (counts.versionCount <= 1) return 'deleteOnlyVersion';
  if (counts.snapshotCount > 0) return 'deleteSnapshotBlocked';
  return null;
}

/**
 * UI gate for top-level BOM detail mutations — mirrors server guards:
 * - add/save: `create-draft.ts` (draft/in_review/technical_approved/active vs invalid_state)
 * - delete: `delete-bom-version.ts` (draft AND more than one version AND no snapshots)
 *
 * Delete is deliberately NOT "draft ⇒ true". That unconditional row was the whole
 * point of the fix this file belongs to — offering an operation the server then
 * refuses — and a parallel track now snapshots a BOM when a WO is CREATED rather than
 * when production starts, so `snapshotCount > 0` on a live draft is common, not
 * theoretical.
 */
export function isBomVersionMutationAllowed(
  status: BomStatus,
  action: BomVersionMutationAction,
  counts?: BomDeleteVersionCounts,
): boolean {
  switch (status) {
    case 'draft':
      return action !== 'deleteVersion' || draftDeleteBlockedKey(counts) === null;
    case 'in_review':
    case 'technical_approved':
    case 'active':
      return action !== 'deleteVersion';
    case 'superseded':
    case 'archived':
      return false;
    default:
      return false;
  }
}

/** i18n key suffix under `technical.bom.actions` for a blocked control tooltip. */
export function bomVersionMutationBlockedKey(
  status: BomStatus,
  action: BomVersionMutationAction,
  counts?: BomDeleteVersionCounts,
): string | null {
  if (isBomVersionMutationAllowed(status, action, counts)) return null;
  if (action === 'deleteVersion') {
    // A blocked DRAFT delete is blocked by a COUNT, never by its status — saying
    // "only draft versions can be deleted" on a draft is the kind of nonsense the
    // disabled button used to show.
    return status === 'draft' ? draftDeleteBlockedKey(counts) : 'deleteStatusBlocked';
  }
  if (status === 'archived') {
    return action === 'addComponent' ? 'addComponentBlockedArchived' : 'saveVersionBlockedArchived';
  }
  if (status === 'superseded') {
    return action === 'addComponent' ? 'addComponentBlockedSuperseded' : 'saveVersionBlockedSuperseded';
  }
  return action === 'addComponent' ? 'addComponentBlockedStatus' : 'saveVersionBlockedStatus';
}

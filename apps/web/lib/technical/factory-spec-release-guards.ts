/**
 * T-081 — factory_spec release guards (clone-on-write + D365 independence).
 *
 * Pure, synchronous guards that the bundle-approval service (T-080) and the UI consume
 * BEFORE attempting a DB write. They encode the same invariants the DB enforces in
 * `packages/db/migrations/165-factory-specs.sql` (the clone-on-write trigger), so an
 * illegal edit is rejected with a stable reason code at the application layer instead of
 * surfacing an opaque `23514` from Postgres.
 *
 * Red lines (task T-081):
 *   - An approved/released version is IMMUTABLE — a direct field update returns
 *     `RELEASED_RECORD_IMMUTABLE`; edits must clone-on-write a NEW version.
 *   - Local release status is independent of D365 sync status: changing `d365SyncStatus`
 *     / `d365ItemId` is NOT a release transition and never flips factory usability.
 *   - No competing release enum — guards operate over the canonical-derived
 *     `FactorySpecStatus` from `release-state-adapters.ts`.
 */

import {
  FACTORY_SPEC_STATUSES,
  type FactorySpecStatus,
  isFactoryUsableSpecStatus,
} from './release-state-adapters';

export type FactorySpecGuardCode =
  | 'OK'
  | 'RELEASED_RECORD_IMMUTABLE'
  | 'ILLEGAL_TRANSITION'
  | 'UNKNOWN_STATUS';

export interface GuardResult {
  ok: boolean;
  code: FactorySpecGuardCode;
  message: string;
}

const OK: GuardResult = { ok: true, code: 'OK', message: 'allowed' };

function isKnownStatus(status: string): status is FactorySpecStatus {
  return (FACTORY_SPEC_STATUSES as readonly string[]).includes(status);
}

/**
 * The set of permitted status transitions for a factory_spec VERSION. A factory-usable
 * row is immutable except for the forward-only terminalisation moves the DB trigger in
 * migration 165 allows:
 *   approved_for_factory → released_to_factory | superseded | archived
 *   released_to_factory  → superseded | archived
 * Working (mutable) states may move freely within the working set and forward into
 * approval; they may NOT jump straight to `released_to_factory` (release is only ever
 * recorded from an already-approved row).
 */
const ALLOWED_TRANSITIONS: Record<FactorySpecStatus, readonly FactorySpecStatus[]> = {
  // draft → approved_for_factory is intentionally absent: bundle approval requires in_review.
  draft: ['draft', 'in_review', 'archived'],
  in_review: ['draft', 'in_review', 'approved_for_factory', 'archived'],
  approved_for_factory: ['released_to_factory', 'superseded', 'archived'],
  // recallFactorySpec (mig 453): released → draft with approval/release stamps cleared.
  released_to_factory: ['draft', 'superseded', 'archived'],
  superseded: ['archived'],
  archived: [],
};

/**
 * Guard a status transition on a factory_spec VERSION (no business-field edit).
 *
 * AC4: a direct update attempt on a released/approved record that is NOT one of the
 * permitted forward moves returns `RELEASED_RECORD_IMMUTABLE` (clone-on-write required).
 */
export function guardStatusTransition(
  current: string,
  next: string,
): GuardResult {
  if (!isKnownStatus(current) || !isKnownStatus(next)) {
    return {
      ok: false,
      code: 'UNKNOWN_STATUS',
      message: `unknown factory_spec status in transition ${current} -> ${next}`,
    };
  }
  if (current === next) return OK;

  const allowed = ALLOWED_TRANSITIONS[current];
  if (allowed.includes(next)) return OK;

  // A factory-usable source row that cannot legally reach `next` is immutable: the edit
  // must clone-on-write a new draft version instead of mutating this one.
  if (isFactoryUsableSpecStatus(current)) {
    return {
      ok: false,
      code: 'RELEASED_RECORD_IMMUTABLE',
      message: `factory_spec is ${current} (immutable); edits must clone-on-write a new version`,
    };
  }

  return {
    ok: false,
    code: 'ILLEGAL_TRANSITION',
    message: `illegal factory_spec transition ${current} -> ${next}`,
  };
}

/**
 * Guard a business-field EDIT on a factory_spec VERSION.
 *
 * AC4: any in-place mutation of a factory-usable (approved/released) row is rejected
 * with `RELEASED_RECORD_IMMUTABLE` — the caller must clone-on-write. Working states
 * (draft/in_review) are freely editable.
 */
export function guardBusinessFieldEdit(current: string): GuardResult {
  if (!isKnownStatus(current)) {
    return { ok: false, code: 'UNKNOWN_STATUS', message: `unknown factory_spec status ${current}` };
  }
  if (isFactoryUsableSpecStatus(current)) {
    return {
      ok: false,
      code: 'RELEASED_RECORD_IMMUTABLE',
      message: `factory_spec version is ${current} (immutable); edits must clone-on-write a new version`,
    };
  }
  return OK;
}

/**
 * A D365 sync-status / d365_item_id change is integration metadata, NOT a release
 * transition. This guard always allows it (even on a factory-usable row) and proves the
 * two axes are independent: callers can update D365 mirror fields without cloning and
 * without affecting the canonical release value.
 *
 * Red line: never conflate local release status with D365 sync status.
 */
export function guardD365MetadataUpdate(): GuardResult {
  return OK;
}

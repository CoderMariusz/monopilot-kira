/**
 * T-081 — Technical release-state adapters over the NPD-owned canonical model.
 *
 * NPD T-097 (`apps/web/app/(npd)/builder/_lib/factory-release-status.ts`) owns the
 * CANONICAL `factory_release_status.release_status` enum:
 *   pending_npd_release | pending_technical_approval | approved_for_factory
 *   | released_to_factory | blocked
 *
 * 03-TECHNICAL does NOT introduce a competing release enum. This module imports the
 * canonical `FactoryReleaseStatusValue` TYPE and provides *adapter* functions that:
 *   - map a Technical-owned `factory_specs.status` (migration 165) to the canonical
 *     release value (and back), and
 *   - expose UI badge metadata (label / color token / allowed actions / blocking
 *     reason codes) derived from the canonical value.
 *
 * Red lines (task T-081):
 *   - No duplicate Technical/shared release enum. The single source of truth for the
 *     release lifecycle is the NPD canonical value, imported here as a TYPE.
 *   - Local release status is NEVER conflated with D365 sync status. D365 is optional
 *     integration metadata and lives on a separate axis (see `d365` field below); the
 *     adapters never read or write it.
 *   - NPD G4 is not factory-use approval: a spec seeded by NPD Builder lands at
 *     `in_review` (canonical `pending_technical_approval`), never `approved_for_factory`.
 *
 * This module is a pure (non-`'use server'`) library: no DB access, no side effects.
 */

// Canonical release model is NPD-owned. We import the TYPE only (erased at compile
// time, so importing it from a `'use server'` sibling is legal and introduces no
// runtime coupling / no duplicate enum).
import type { FactoryReleaseStatusValue } from '../../app/(npd)/builder/_lib/factory-release-status-types';

/**
 * The Technical-owned `factory_specs.status` lifecycle, copied 1:1 from the CHECK
 * constraint in `packages/db/migrations/165-factory-specs.sql`. These are the *storage*
 * states of a single factory_spec VERSION — distinct from (and mapped to) the canonical
 * NPD release lifecycle.
 */
export const FACTORY_SPEC_STATUSES = [
  'draft',
  'in_review',
  'approved_for_factory',
  'released_to_factory',
  'superseded',
  'archived',
] as const;

export type FactorySpecStatus = (typeof FACTORY_SPEC_STATUSES)[number];

/** factory_spec storage states that are factory-usable and therefore IMMUTABLE. */
export const FACTORY_USABLE_SPEC_STATUSES = [
  'approved_for_factory',
  'released_to_factory',
] as const;

export type FactoryUsableSpecStatus = (typeof FACTORY_USABLE_SPEC_STATUSES)[number];

/**
 * Map a Technical `factory_specs.status` to the canonical NPD release value.
 *
 * - `draft` / `in_review` → `pending_technical_approval` (visible "pending factory
 *   availability"; AC2 — a spec freshly created from NPD Builder is `in_review`).
 * - `approved_for_factory` → `approved_for_factory`.
 * - `released_to_factory` → `released_to_factory`.
 * - `superseded` / `archived` → the spec is no longer a live release candidate; we map
 *   it back to `pending_technical_approval` so a *new* version must be approved (the
 *   superseded version is not itself factory-usable).
 *
 * The canonical `pending_npd_release` / `blocked` values are owned by the NPD release
 * record (driven by preflight blockers / NPD G4 state), not by a factory_spec row, so
 * no factory_spec status maps to them here.
 */
export function specStatusToCanonical(status: FactorySpecStatus): FactoryReleaseStatusValue {
  switch (status) {
    case 'approved_for_factory':
      return 'approved_for_factory';
    case 'released_to_factory':
      return 'released_to_factory';
    case 'draft':
    case 'in_review':
    case 'superseded':
    case 'archived':
    default:
      return 'pending_technical_approval';
  }
}

/**
 * The factory_spec storage status a NEW version starts at when seeded from NPD Builder.
 * AC2: initial canonical status maps to `in_review` (pending factory availability) —
 * NPD G4 is NOT factory-use approval.
 */
export function initialSpecStatusFromNpdBuilder(): FactorySpecStatus {
  return 'in_review';
}

/** True when the factory_spec storage status is factory-usable (and thus immutable). */
export function isFactoryUsableSpecStatus(
  status: FactorySpecStatus,
): status is FactoryUsableSpecStatus {
  return (FACTORY_USABLE_SPEC_STATUSES as readonly string[]).includes(status);
}

/** True when a canonical release value means the FG may be used by the factory/Planning. */
export function isCanonicalFactoryUsable(value: FactoryReleaseStatusValue): boolean {
  return value === 'approved_for_factory' || value === 'released_to_factory';
}

// ── Badge metadata (AC5) ──────────────────────────────────────────────────────
//
// UI asks the adapter for a stable label, a color *token* (never a hex — the design
// system resolves the token), the allowed next actions, and a blocking reason code.
// Color tokens mirror the shadcn/Tailwind status palette already used across the app.

export type ReleaseBadgeAction =
  | 'request_technical_approval'
  | 'approve_bundle'
  | 'release_to_factory'
  | 'clone_for_edit'
  | 'resolve_blockers';

export type ReleaseBlockingReasonCode =
  | 'PENDING_NPD_RELEASE'
  | 'PENDING_TECHNICAL_APPROVAL'
  | 'RELEASE_BLOCKED'
  | null;

export interface ReleaseBadgeMetadata {
  /** Canonical value this badge represents. */
  value: FactoryReleaseStatusValue;
  /** Stable, operator-facing label (UI translates via next-intl by `labelKey`). */
  label: string;
  /** i18n key for the label — keeps the badge translatable without a second mapping. */
  labelKey: string;
  /** Design-system color token (never a raw hex). */
  colorToken: 'amber' | 'blue' | 'emerald' | 'green' | 'red';
  /** Whether the FG is factory-usable in this state. */
  factoryUsable: boolean;
  /** Next actions the UI may offer in this state. */
  allowedActions: readonly ReleaseBadgeAction[];
  /** Reason code when the FG is NOT yet factory-usable, else null. */
  blockingReasonCode: ReleaseBlockingReasonCode;
}

const BADGE_TABLE: Record<FactoryReleaseStatusValue, ReleaseBadgeMetadata> = {
  pending_npd_release: {
    value: 'pending_npd_release',
    label: 'Pending NPD release',
    labelKey: 'technical.release.badge.pending_npd_release',
    colorToken: 'amber',
    factoryUsable: false,
    allowedActions: [],
    blockingReasonCode: 'PENDING_NPD_RELEASE',
  },
  pending_technical_approval: {
    value: 'pending_technical_approval',
    label: 'Pending Technical approval',
    labelKey: 'technical.release.badge.pending_technical_approval',
    colorToken: 'blue',
    factoryUsable: false,
    allowedActions: ['request_technical_approval', 'approve_bundle'],
    blockingReasonCode: 'PENDING_TECHNICAL_APPROVAL',
  },
  approved_for_factory: {
    value: 'approved_for_factory',
    label: 'Approved for factory',
    labelKey: 'technical.release.badge.approved_for_factory',
    colorToken: 'emerald',
    factoryUsable: true,
    allowedActions: ['release_to_factory', 'clone_for_edit'],
    blockingReasonCode: null,
  },
  released_to_factory: {
    value: 'released_to_factory',
    label: 'Released to factory',
    labelKey: 'technical.release.badge.released_to_factory',
    colorToken: 'green',
    factoryUsable: true,
    allowedActions: ['clone_for_edit'],
    blockingReasonCode: null,
  },
  blocked: {
    value: 'blocked',
    label: 'Release blocked',
    labelKey: 'technical.release.badge.blocked',
    colorToken: 'red',
    factoryUsable: false,
    allowedActions: ['resolve_blockers'],
    blockingReasonCode: 'RELEASE_BLOCKED',
  },
};

/** AC5: stable badge metadata for a canonical release value. */
export function releaseBadge(value: FactoryReleaseStatusValue): ReleaseBadgeMetadata {
  return BADGE_TABLE[value];
}

/** Badge metadata addressed directly by a factory_spec storage status (UI convenience). */
export function specBadge(status: FactorySpecStatus): ReleaseBadgeMetadata {
  return releaseBadge(specStatusToCanonical(status));
}

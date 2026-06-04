/**
 * T-084 — Technical sensory evaluation read model / contract.
 *
 * PRD: docs/prd/03-TECHNICAL-PRD.md §0, §5, §17.
 *
 * Technical OWNS the sensory read model. This module is the stable, pure contract
 * that NPD approval and Quality release guards read to learn the sensory state of a
 * product / project / work-order WITHOUT moving NPD gate ownership into Technical
 * and WITHOUT a second sensory write path. The DB table
 * `public.technical_sensory_evaluations` (migration 166) is the source of record;
 * this adapter maps a raw row (or its absence) into the contract answer.
 *
 * Red lines honoured:
 *   - No NPD gate ownership moved here — the read model only REPORTS state; NPD/Quality
 *     decide what to do with it.
 *   - No external lab/sensory vendor integration.
 *   - FG canonical — no legacy FA aliases.
 *
 * Pure, no I/O, no DB, no clock. A Server Action / query layer fetches the row and
 * hands it to `toSensoryReadModel`.
 */

/** The canonical contract status set (mirrors the DB CHECK in migration 166). */
export const SENSORY_STATUSES = [
  'required',
  'pending',
  'pass',
  'fail',
  'hold',
  'not_required',
] as const;

export type SensoryStatus = (typeof SENSORY_STATUSES)[number];

/** Reason code surfaced to downstream release guards when sensory blocks release. */
export const SENSORIAL_BLOCKED = 'SENSORIAL_BLOCKED' as const;
export type SensorialBlockedReason = typeof SENSORIAL_BLOCKED;

/**
 * The shape of a persisted sensory evaluation row this adapter understands.
 * Mirrors the relevant subset of `public.technical_sensory_evaluations`.
 */
export interface SensoryEvaluationRow {
  status: SensoryStatus;
  /** Whether org policy requires sensory for this subject. */
  policyRequired: boolean;
  /** Optional human reason; for fail/hold it becomes the blocked detail. */
  statusReason?: string | null;
}

/** The stable answer NPD approval / release guards consume. */
export interface SensoryReadModel {
  status: SensoryStatus;
  /**
   * Whether NPD approval may proceed WITHOUT real Technical sensory evidence.
   * True only when sensory is `not_required`.
   */
  npdCanProceedWithoutEvidence: boolean;
  /** True when a downstream release guard must block on sensory (fail/hold). */
  releaseBlocked: boolean;
  /** Set to SENSORIAL_BLOCKED iff releaseBlocked, else null. */
  blockedReason: SensorialBlockedReason | null;
  /** Optional human-readable detail for the blocked reason (status_reason). */
  blockedDetail: string | null;
}

export function isSensoryStatus(value: unknown): value is SensoryStatus {
  return typeof value === 'string' && (SENSORY_STATUSES as readonly string[]).includes(value);
}

/**
 * Map a persisted sensory row — or its absence — into the read-model contract.
 *
 * When `row` is null/undefined there is no Technical sensory evidence on record;
 * absent any org policy requirement the subject is treated as `not_required` and
 * NPD may proceed. This is the AC2 path: NPD never fabricates Technical evidence.
 *
 * `fail` and `hold` are the AC3 blocking states — they yield SENSORIAL_BLOCKED.
 */
export function toSensoryReadModel(row: SensoryEvaluationRow | null | undefined): SensoryReadModel {
  if (!row) {
    return {
      status: 'not_required',
      npdCanProceedWithoutEvidence: true,
      releaseBlocked: false,
      blockedReason: null,
      blockedDetail: null,
    };
  }

  const status = row.status;
  const releaseBlocked = status === 'fail' || status === 'hold';

  return {
    status,
    npdCanProceedWithoutEvidence: status === 'not_required',
    releaseBlocked,
    blockedReason: releaseBlocked ? SENSORIAL_BLOCKED : null,
    blockedDetail: releaseBlocked ? (row.statusReason ?? null) : null,
  };
}

/**
 * Convenience predicate for NPD approval: may NPD proceed given the read model?
 *
 * NPD proceeds when sensory is not_required (no evidence needed) OR when it has
 * passed. It does NOT proceed while required/pending (awaiting evidence) or when
 * fail/hold blocks release. NPD remains the gate owner; this only reports the
 * Technical input to that gate.
 */
export function npdMayProceed(readModel: SensoryReadModel): boolean {
  return readModel.status === 'not_required' || readModel.status === 'pass';
}

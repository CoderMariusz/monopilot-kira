/**
 * 08-Production E1 — Execution-core shared contracts (NOT a `'use server'` module).
 *
 * Houses the closed error/result types, the org-action context shape, the RBAC
 * helper, and the transactional outbox writer that every WO-lifecycle Server
 * Action and the `wo_state_machine` service reuse. Keeping these here (no
 * `'use server'` directive) lets us export classes/consts/enums that a
 * `'use server'` module legally cannot (see MON-t2-api §'use server' export rule).
 *
 * Schema source of truth: migrations 181 (wo_outputs / wo_material_consumption),
 * 182 (wo_executions / wo_events), 183 (downtime_events), 176/177 (work_orders /
 * schedule_outputs). Canon @189.
 *
 * Hard constraints honoured (MON-domain-production "Forbidden patterns"):
 *   - `wo_executions.status` is NEVER written by a free-form UPDATE — the state
 *     machine appends a `wo_events` row then CAS-materializes status+version.
 *   - Every outbox INSERT happens INSIDE the same txn as the state change.
 *   - org_id (NOT tenant_id); RLS via app.current_org_id().
 */

import { EventType } from '../../../../packages/outbox/src/events.enum';
import type { ProductionContext } from './holds-guard-types';

export type { ProductionContext, QueryClient } from './holds-guard-types';
export { hasPermission } from '../auth/has-permission';

/** App-version stamp written to outbox_events.app_version (provenance for replay). */
export const APP_VERSION = 'production-execution-v1';

/** Materialized WO lifecycle states (migration 182 `wo_executions_status_check`). */
export const WO_STATES = [
  'planned',
  'in_progress',
  'paused',
  'completed',
  'closed',
  'cancelled',
] as const;
export type WoState = (typeof WO_STATES)[number];

/** Transition verbs (migration 182 `wo_events_event_type_check`). */
export const WO_TRANSITIONS = ['start', 'pause', 'resume', 'complete', 'close', 'cancel'] as const;
export type WoTransition = (typeof WO_TRANSITIONS)[number];

/**
 * Closed error set surfaced to callers. Never leak DB state. `quality_hold_active`
 * is the 09-quality T-064 consume-gate block. `concurrent_modification` is the
 * optimistic-lock CAS miss (T-022). `invalid_state_transition` is the state
 * machine rejecting an illegal verb for the current materialized state.
 */
export type ProductionError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'invalid_state'
  | 'invalid_state_transition'
  | 'concurrent_modification'
  | 'quality_hold_active'
  // C4: canonical changeover-gate code emitted going forward (scanner + desktop
  // share it). 'allergen_changeover_required' is the legacy alias kept mapped
  // for pre-wave-8 consumers (wo-modal-labels i18n) — do not emit it anew.
  | 'changeover_signoff_required'
  | 'allergen_changeover_required'
  | 'wo_snapshot_missing'
  | 'factory_release_incomplete'
  | 'closed_production_strict_failed'
  | 'insufficient_input_for_output'
  | 'insufficient_lp_quantity'
  | 'esign_failed'
  | 'rate_limited'
  | 'persistence_failed';

/** Discriminated-union result the UI/route layer consumes. */
export type ProductionResult<TData> =
  | { ok: true; data: TData }
  | { ok: false; error: ProductionError; status: number; message?: string; details?: unknown };

/** Map a ProductionError to its canonical HTTP status (route-handler layer). */
export const ERROR_STATUS: Record<ProductionError, number> = {
  invalid_input: 422,
  forbidden: 403,
  not_found: 404,
  invalid_state: 409,
  invalid_state_transition: 409,
  concurrent_modification: 409,
  quality_hold_active: 409,
  changeover_signoff_required: 409,
  allergen_changeover_required: 409,
  wo_snapshot_missing: 409,
  factory_release_incomplete: 409,
  closed_production_strict_failed: 409,
  insufficient_input_for_output: 409,
  insufficient_lp_quantity: 409,
  esign_failed: 403,
  rate_limited: 429,
  persistence_failed: 500,
};

export function fail<T>(
  error: ProductionError,
  extra?: { message?: string; details?: unknown },
): ProductionResult<T> {
  return { ok: false, error, status: ERROR_STATUS[error], message: extra?.message, details: extra?.details };
}

export function isPgError(err: unknown): err is { code: string; message?: string } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

/**
 * Optimistic-lock CAS miss in the state machine (T-022). THROWN (never returned)
 * so the enclosing withOrgContext transaction ROLLS BACK — guaranteeing the
 * already-appended wo_events ledger row cannot commit without its CAS state
 * change (no orphan event in the immutable ledger). Maps to HTTP 409.
 *
 * The route layer detects this class and surfaces `concurrent_modification`/409
 * (see route-helpers.runTransition catch path).
 */
export class WoConcurrentModificationError extends Error {
  readonly error = 'concurrent_modification' as const;
  readonly status = 409;
  readonly expectedVersion: number;

  constructor(expectedVersion: number) {
    super('concurrent_modification');
    this.name = 'WoConcurrentModificationError';
    this.expectedVersion = expectedVersion;
  }
}

/**
 * Transactional outbox writer. INSERTs into `public.outbox_events` using the
 * canonical column set (migration 003). MUST be called inside the same txn as
 * the state change (the `ctx.client` is the txn-bound app-role client).
 *
 * `eventType` must be a member of the EventType enum + the migration CHECK, or
 * the INSERT violates the constraint and the WHOLE txn rolls back (drift gate).
 */
export async function writeOutbox(
  ctx: ProductionContext,
  params: { eventType: EventType; aggregateType: string; aggregateId: string; payload: Record<string, unknown> },
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values (app.current_org_id(), $1, $2, $3::uuid, $4::jsonb, $5)`,
    [
      params.eventType,
      params.aggregateType,
      params.aggregateId,
      JSON.stringify({ org_id: ctx.orgId, actor_user_id: ctx.userId, ...params.payload }),
      APP_VERSION,
    ],
  );
}

/** Re-export EventType so service modules don't reach across packages directly. */
export { EventType };

/* ───────────────────────────────────────────────────────────────────────────
 * 08-Production E3 (output + waste) shared surface.
 *
 * Collected from worktree-wf_52ca809a-667-4 and RE-POINTED onto this single
 * canonical shared module. The E3 services originally ran against their own
 * fork of shared.ts (OrgContextLike / emitOutbox / ProductionActionError /
 * QualityHoldError / readWoExecutionStatus / holdsGuard returning {id}). Those
 * helpers are folded in here so register-output.ts + record-waste.ts compile
 * against ONE shared.ts. Notable reconciliations:
 *   - OrgContextLike is a structural alias of ProductionContext (same shape).
 *   - holdsGuard + ActiveHold are re-exported from ./holds-guard (the canonical
 *     seam), whose ActiveHold is { holdId, lpId, lotId } — NOT {id}. QualityHold
 *     error/emitConsumeBlocked below use hold.holdId accordingly.
 *   - emitOutbox writes the dedup_key column (migration 102) so an idempotent
 *     replay of the same transaction_id is a no-op at the event layer too. It is
 *     kept SEPARATE from writeOutbox (the EventType-typed lifecycle writer) so
 *     the WO-lifecycle core is untouched.
 * ─────────────────────────────────────────────────────────────────────────── */

// holdsGuard / ActiveHold are owned by ./holds-guard (the cross-module seam the
// WO-lifecycle core already imports). Re-export them so the E3 services can keep
// importing from './shared' against the SINGLE canonical implementation.
export { holdsGuard } from './holds-guard';
export type { ActiveHold, HoldsGuardTarget } from './holds-guard';
import type { ActiveHold } from './holds-guard';

/**
 * Structural alias of ProductionContext used by the E3 (output/waste) services.
 * Same { userId, orgId, client } shape — kept as a named alias so the collected
 * code reads against the same single context type.
 */
export type OrgContextLike = ProductionContext;

// ─── RBAC permission strings (byte-aligned with migration-185 seed) ────────────
export const PRODUCTION_OUTPUT_WRITE_PERMISSION = 'production.output.write';
export const PRODUCTION_WASTE_WRITE_PERMISSION = 'production.waste.write';

// ─── E3 event-type strings (members of EventType + the migration CHECK) ────────
export const PRODUCTION_OUTPUT_RECORDED_EVENT = EventType.PRODUCTION_OUTPUT_RECORDED;
export const PRODUCTION_WASTE_RECORDED_EVENT = EventType.PRODUCTION_WASTE_RECORDED;
export const PRODUCTION_CONSUME_BLOCKED_EVENT = EventType.PRODUCTION_CONSUME_BLOCKED;

// ─── WO runtime-status read seam (read-only; state machine owns writes) ────────
export type WoExecutionStatus = WoState;

/** States in which a primary/co/by output OR a waste row may be recorded. */
export const OUTPUT_RECORDABLE_STATES: ReadonlySet<WoExecutionStatus> = new Set<WoExecutionStatus>([
  'in_progress',
  'paused',
  'completed',
]);

/**
 * Read the materialized lifecycle status for a WO. Returns null when the WO has
 * no execution row yet (never started). NEVER writes wo_executions.status —
 * read-only (the state machine owns writes via wo_events).
 */
export async function readWoExecutionStatus(
  ctx: OrgContextLike,
  woId: string,
): Promise<WoExecutionStatus | null> {
  const { rows } = await ctx.client.query<{ status: WoExecutionStatus }>(
    `select status
       from public.wo_executions
      where wo_id = $1::uuid
        and org_id = app.current_org_id()
      limit 1`,
    [woId],
  );
  return rows[0]?.status ?? null;
}

/**
 * Transactional outbox writer with dedup_key (migration 102). MUST be called
 * inside the same txn as the state change. A retried request (same
 * transaction_id-derived dedup_key) is a no-op at the event layer.
 */
export async function emitOutbox(
  ctx: OrgContextLike,
  event: {
    eventType: EventType | string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    dedupKey: string;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, dedup_key)
     values
       (app.current_org_id(), $1, $2, $3::uuid, $4::jsonb, $5, $6)
     on conflict (org_id, dedup_key) where dedup_key is not null do nothing`,
    [
      event.eventType,
      event.aggregateType,
      event.aggregateId,
      JSON.stringify(event.payload),
      APP_VERSION,
      event.dedupKey,
    ],
  );
}

// ─── E3 error types (class-based, mapped to HTTP status) ────────────────────────
export type ProductionErrorCode =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'wo_not_recordable'
  | 'quality_hold_active'
  | 'already_recorded'
  | 'uom_conversion_unavailable'
  | 'invalid_reference'
  | 'insufficient_input_for_output'
  | 'insufficient_lp_quantity'
  | 'lp_not_wasteable'
  | 'lp_not_released'
  | 'uom_mismatch'
  // W9-K-II (F-A04): output-LP creation needs an org default warehouse; 409
  // when the org has none configured (mirrors the scanner GRN receive contract).
  | 'warehouse_not_configured'
  | 'no_warehouse_for_site'
  | 'persistence_failed';

export class ProductionActionError extends Error {
  code: ProductionErrorCode;
  status: number;
  details?: Record<string, unknown>;

  constructor(code: ProductionErrorCode, status: number, details?: Record<string, unknown>) {
    super(code);
    this.name = 'ProductionActionError';
    this.code = code;
    this.status = status;
    if (details) this.details = details;
  }
}

/**
 * Raised when the 09-quality consume gate (holdsGuard) finds an active hold on
 * the LP/lot. Carries the context the route needs to emit
 * `production.consume.blocked` on a COMMITTED connection AFTER the main
 * (mutating) transaction rolls back. Always maps to HTTP 409.
 */
export class QualityHoldError extends ProductionActionError {
  hold: ActiveHold;
  woId: string;
  blockedPath: 'output' | 'waste' | 'complete' | 'consume';
  transactionId: string;
  lpId: string | null;
  lotId: string | null;

  constructor(args: {
    hold: ActiveHold;
    woId: string;
    blockedPath: 'output' | 'waste' | 'complete' | 'consume';
    transactionId: string;
    lpId: string | null;
    lotId: string | null;
  }) {
    super('quality_hold_active', 409, { hold_id: args.hold.holdId });
    this.name = 'QualityHoldError';
    this.hold = args.hold;
    this.woId = args.woId;
    this.blockedPath = args.blockedPath;
    this.transactionId = args.transactionId;
    this.lpId = args.lpId;
    this.lotId = args.lotId;
  }
}

/**
 * Emit `production.consume.blocked` from a route's catch path. Runs against its
 * own OrgContextLike (a fresh withOrgContext txn) so the audit event commits
 * even though the originating output/waste transaction was rolled back by the
 * hold. Idempotent via the transaction_id-keyed dedup_key.
 */
export async function emitConsumeBlocked(ctx: OrgContextLike, err: QualityHoldError): Promise<void> {
  await emitOutbox(ctx, {
    eventType: PRODUCTION_CONSUME_BLOCKED_EVENT,
    aggregateType: 'wo',
    aggregateId: err.woId,
    payload: {
      org_id: ctx.orgId,
      wo_id: err.woId,
      lp_id: err.lpId,
      lot_id: err.lotId,
      hold_id: err.hold.holdId,
      actor_user_id: ctx.userId,
      blocked_path: err.blockedPath,
    },
    dedupKey: `${PRODUCTION_CONSUME_BLOCKED_EVENT}:${err.transactionId}`,
  });
}

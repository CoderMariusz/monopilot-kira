/**
 * 08-Production E1 — `wo_state_machine` service (T-016..T-022 core).
 *
 * THE LAW (MON-domain-production "Forbidden patterns" #DO-NOT-write-status):
 *   `wo_executions.status` is NEVER written by a free-form UPDATE in app code.
 *   A transition is applied by:
 *     1. validating the verb is legal for the WO's current materialized state,
 *     2. APPENDING a `wo_events` row (the immutable lifecycle ledger, R14
 *        idempotent on `transaction_id`),
 *     3. CAS-materializing `wo_executions` (status + monotonic `version`) using
 *        optimistic locking (T-022) — the UPDATE only fires WHERE the observed
 *        `version` still matches, so two concurrent transitions cannot both win,
 *     4. mirroring the canonical state onto `work_orders.status` so planning /
 *        downstream read-models stay consistent (same txn).
 *
 * Lifecycle (migration 182):
 *   planned → in_progress (start) → paused (pause) → in_progress (resume)
 *           → completed (complete) → closed (close).
 *   cancel is a terminal branch from any NON-closed, NON-cancelled state.
 *   closed and cancelled are terminal.
 *
 * Idempotency (R14): a retried request carries the same `transaction_id`. The
 * UNIQUE constraint on `wo_events.transaction_id` makes the append idempotent —
 * a replay short-circuits and returns the already-materialized state WITHOUT a
 * second event or a second version bump.
 *
 * work_orders.status uses the planning vocabulary (DRAFT/RELEASED/IN_PROGRESS/
 * ON_HOLD/COMPLETED/CLOSED/CANCELLED, migration 176); wo_executions.status uses
 * the runtime vocabulary (planned/in_progress/paused/completed/closed/cancelled,
 * migration 182). WO_TO_WORK_ORDER_STATUS bridges them.
 */

import {
  type ProductionContext,
  type ProductionResult,
  type QueryClient,
  type WoState,
  type WoTransition,
  fail,
  isPgError,
} from './shared';

// ── Legal transition table ────────────────────────────────────────────────────
// from-state → { verb → to-state }. Any (state, verb) pair absent here is illegal.
const TRANSITIONS: Record<WoState, Partial<Record<WoTransition, WoState>>> = {
  planned: { start: 'in_progress', cancel: 'cancelled' },
  in_progress: { pause: 'paused', complete: 'completed', cancel: 'cancelled' },
  paused: { resume: 'in_progress', cancel: 'cancelled' },
  completed: { close: 'closed', cancel: 'cancelled' },
  closed: {}, // terminal
  cancelled: {}, // terminal
};

/** Runtime state → planning `work_orders.status` (migration 176 vocabulary). */
const WO_TO_WORK_ORDER_STATUS: Record<WoState, string> = {
  planned: 'RELEASED',
  in_progress: 'IN_PROGRESS',
  paused: 'ON_HOLD',
  completed: 'COMPLETED',
  closed: 'CLOSED',
  cancelled: 'CANCELLED',
};

/** Resolve the legal to-state for (from, verb), or null when illegal. */
export function resolveTransition(from: WoState, verb: WoTransition): WoState | null {
  return TRANSITIONS[from]?.[verb] ?? null;
}

export type WoExecutionRow = {
  id: string;
  woId: string;
  status: WoState;
  version: number;
  startedAt: string | null;
  pausedAt: string | null;
  resumedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
};

type ExecRowRaw = {
  id: string;
  wo_id: string;
  status: string;
  version: number;
  started_at: string | Date | null;
  paused_at: string | Date | null;
  resumed_at: string | Date | null;
  completed_at: string | Date | null;
  closed_at: string | Date | null;
  cancelled_at: string | Date | null;
};

function toIso(v: string | Date | null): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

function mapExec(row: ExecRowRaw): WoExecutionRow {
  return {
    id: String(row.id),
    woId: String(row.wo_id),
    status: row.status as WoState,
    version: Number(row.version),
    startedAt: toIso(row.started_at),
    pausedAt: toIso(row.paused_at),
    resumedAt: toIso(row.resumed_at),
    completedAt: toIso(row.completed_at),
    closedAt: toIso(row.closed_at),
    cancelledAt: toIso(row.cancelled_at),
  };
}

const EXEC_COLS = `id, wo_id, status, version, started_at, paused_at, resumed_at,
  completed_at, closed_at, cancelled_at`;

/**
 * Load the WO's execution row, creating the `planned` materialization lazily if
 * it does not yet exist (idempotent per the UNIQUE(org_id, wo_id) constraint).
 * Returns null when the work_orders row itself is absent (RLS-scoped).
 */
export async function loadOrInitExecution(
  ctx: ProductionContext,
  woId: string,
): Promise<WoExecutionRow | null> {
  const client = ctx.client;

  // Confirm the WO exists for this org (RLS-scoped); 404 otherwise.
  const wo = await client.query<{ id: string }>(
    `select id from public.work_orders where org_id = app.current_org_id() and id = $1::uuid`,
    [woId],
  );
  if (wo.rows.length === 0) return null;

  const existing = await client.query<ExecRowRaw>(
    `select ${EXEC_COLS}
       from public.wo_executions
      where org_id = app.current_org_id() and wo_id = $1::uuid`,
    [woId],
  );
  if (existing.rows[0]) return mapExec(existing.rows[0]);

  // Lazily materialize the initial `planned` row. ON CONFLICT keeps it idempotent
  // under a concurrent first-touch (UNIQUE(org_id, wo_id)).
  const inserted = await client.query<ExecRowRaw>(
    `insert into public.wo_executions (org_id, wo_id, status, version, created_by)
     values (app.current_org_id(), $1::uuid, 'planned', 0, $2::uuid)
     on conflict (org_id, wo_id) do update set updated_at = pg_catalog.now()
     returning ${EXEC_COLS}`,
    [woId, ctx.userId],
  );
  return mapExec(inserted.rows[0]!);
}

/** Timestamp column on wo_executions stamped for a given verb. */
const VERB_TIMESTAMP: Record<WoTransition, string> = {
  start: 'started_at',
  pause: 'paused_at',
  resume: 'resumed_at',
  complete: 'completed_at',
  close: 'closed_at',
  cancel: 'cancelled_at',
};

export type ApplyTransitionInput = {
  woId: string;
  verb: WoTransition;
  transactionId: string;
  reason?: string | null;
  context?: Record<string, unknown>;
};

/**
 * Apply one lifecycle transition: validate → append wo_events → CAS-materialize
 * wo_executions (optimistic lock) → mirror work_orders.status. ALL inside the
 * caller's txn (ctx.client). Returns the new materialized execution row.
 *
 * Errors (closed set):
 *   not_found                — WO row absent for this org.
 *   invalid_state_transition — verb illegal for the current materialized state.
 *   concurrent_modification  — optimistic-lock CAS miss (another txn won).
 *   persistence_failed       — unexpected DB error.
 *
 * R14 idempotency: a replay with the same transactionId returns the existing
 * materialized state WITHOUT a second event or version bump.
 */
export async function applyTransition(
  ctx: ProductionContext,
  input: ApplyTransitionInput,
): Promise<ProductionResult<WoExecutionRow>> {
  const client = ctx.client;

  // R14 idempotency short-circuit: a wo_events row already exists for this txn id.
  const replay = await client.query<{ wo_id: string }>(
    `select wo_id from public.wo_events
      where org_id = app.current_org_id() and transaction_id = $1::uuid`,
    [input.transactionId],
  );
  if (replay.rows[0]) {
    const cur = await loadOrInitExecution(ctx, input.woId);
    if (!cur) return fail('not_found');
    return { ok: true, data: cur };
  }

  const exec = await loadOrInitExecution(ctx, input.woId);
  if (!exec) return fail('not_found');

  const toStatus = resolveTransition(exec.status, input.verb);
  if (!toStatus) {
    return fail('invalid_state_transition', {
      message: `cannot ${input.verb} a WO in state '${exec.status}'`,
      details: { from: exec.status, verb: input.verb },
    });
  }

  const tsCol = VERB_TIMESTAMP[input.verb];
  const observedVersion = exec.version;

  try {
    // (2) APPEND the immutable lifecycle event (append-only ledger).
    await client.query(
      `insert into public.wo_events
         (org_id, wo_id, execution_id, transaction_id, event_type, from_status, to_status,
          version_at_event, reason, context_jsonb, actor_user_id)
       values (app.current_org_id(), $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9::jsonb, $10::uuid)`,
      [
        input.woId,
        exec.id,
        input.transactionId,
        input.verb,
        exec.status,
        toStatus,
        observedVersion,
        input.reason ?? null,
        JSON.stringify(input.context ?? {}),
        ctx.userId,
      ],
    );

    // (3) CAS-materialize wo_executions: optimistic lock on `version`. The UPDATE
    // only fires while the version is unchanged — a concurrent transition that
    // already bumped it makes this affect 0 rows → concurrent_modification.
    const updated = await client.query<ExecRowRaw>(
      `update public.wo_executions
          set status = $3,
              version = version + 1,
              ${tsCol} = pg_catalog.now(),
              updated_by = $4::uuid
        where org_id = app.current_org_id()
          and wo_id = $1::uuid
          and version = $2
        returning ${EXEC_COLS}`,
      [input.woId, observedVersion, toStatus, ctx.userId],
    );
    if (updated.rows.length === 0) {
      // CAS miss: another concurrent transition materialized first. Surface 409
      // so the txn rolls back (the appended event rolls back with it).
      return fail('concurrent_modification', {
        details: { expectedVersion: observedVersion },
      });
    }

    // (4) Mirror canonical state onto work_orders for planning/read-model parity.
    await client.query(
      `update public.work_orders
          set status = $2, updated_by = $3::uuid
        where org_id = app.current_org_id() and id = $1::uuid`,
      [input.woId, WO_TO_WORK_ORDER_STATUS[toStatus], ctx.userId],
    );

    return { ok: true, data: mapExec(updated.rows[0]!) };
  } catch (err) {
    // A concurrent replay racing the same transaction_id hits the UNIQUE
    // constraint (23505) — treat as a successful idempotent replay.
    if (isPgError(err) && err.code === '23505') {
      const cur = await loadOrInitExecution(ctx, input.woId);
      if (cur) return { ok: true, data: cur };
    }
    return fail('persistence_failed', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export type { QueryClient };

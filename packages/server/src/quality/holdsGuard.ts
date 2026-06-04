import pg from 'pg';

/**
 * 09-Quality T-064 — canonical consume-gate guard (single source of truth).
 *
 * 08-production's WO-consume Server Action, 05-warehouse's LP-consume Server Action, and
 * 11-shipping's LP qa_status gate MUST call these helpers before recording a consumption /
 * allocation. Direct reads of `quality_holds` from a consume path are a contract violation —
 * import `assertNoActiveHoldForWo` / `assertNoActiveHoldForLp` from THIS module so the active-hold
 * predicate lives in exactly one place (see MON-domain-quality §"CRITICAL: T-064 consume gate").
 *
 * The guards read the `v_active_holds` SECURITY INVOKER view (migration 197), so RLS on
 * `quality_holds` flows from the caller's `app.current_org_id()`. They never bypass RLS and never
 * re-implement the active-hold WHERE clause.
 *
 * NOTE: this is a plain library module (NOT a Next.js `'use server'` file). It deliberately exports
 * the `QaHoldActiveError` class + the `QA_HOLD_ACTIVE` constant alongside the async guards — a
 * `'use server'` module may only export async functions, so consumers that need the error type in a
 * `'use server'` boundary import it from here (the non-`'use server'` source), per the class-2
 * recurring-live-bug rule.
 */

/** Stable cross-module error code carried in the QaHoldActiveError envelope. */
export const QA_HOLD_ACTIVE = 'QA_HOLD_ACTIVE' as const;

/** Hold priority levels (mirrors quality_holds_priority_check). */
export type HoldPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Cross-module error envelope thrown when an active hold blocks a consume / allocate operation.
 * The shape `{ code, hold_number, priority, reason_code }` is the pinned cross-module contract —
 * do NOT change it without a coordinated revision in 05-warehouse / 08-production / 11-shipping.
 */
export interface QaHoldActiveEnvelope {
  code: typeof QA_HOLD_ACTIVE;
  hold_number: string;
  priority: HoldPriority;
  reason_code: string | null;
}

/** HTTP-409 error thrown by the consume gate when an active hold covers the reference. */
export class QaHoldActiveError extends Error {
  readonly status = 409 as const;
  readonly code = QA_HOLD_ACTIVE;
  readonly holdNumber: string;
  readonly priority: HoldPriority;
  readonly reasonCode: string | null;

  constructor(holdNumber: string, priority: HoldPriority, reasonCode: string | null) {
    super(`Active quality hold ${holdNumber} (priority=${priority}) blocks this operation`);
    this.name = 'QaHoldActiveError';
    this.holdNumber = holdNumber;
    this.priority = priority;
    this.reasonCode = reasonCode;
    // Restore prototype chain for instanceof across transpilation targets.
    Object.setPrototypeOf(this, QaHoldActiveError.prototype);
  }

  /** Serialise to the pinned cross-module JSON envelope. */
  toEnvelope(): QaHoldActiveEnvelope {
    return {
      code: this.code,
      hold_number: this.holdNumber,
      priority: this.priority,
      reason_code: this.reasonCode,
    };
  }
}

type ActiveHoldRow = {
  hold_number: string;
  priority: HoldPriority;
  reference_id: string;
};

/** Minimal query surface satisfied by pg.Pool / pg.PoolClient. */
export interface HoldQueryClient {
  query<R extends pg.QueryResultRow = ActiveHoldRow>(
    queryText: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<R>>;
}

/**
 * Core gate: throw QaHoldActiveError if `v_active_holds` contains an active hold whose
 * (reference_type, reference_id) covers the given reference. RLS via SECURITY INVOKER means only
 * the caller's own org's holds are visible — the explicit `org_id` argument is used solely to keep
 * the predicate self-documenting (and to fail closed if a caller forgets to bind org context).
 */
async function assertNoActiveHoldForReference(
  referenceType: 'wo' | 'lp' | 'batch' | 'po' | 'grn',
  referenceId: string,
  orgId: string,
  db: HoldQueryClient,
): Promise<void> {
  const { rows } = await db.query<ActiveHoldRow>(
    `select hold_number, priority, reference_id
       from public.v_active_holds
      where org_id = $1
        and reference_type = $2
        and reference_id = $3
      order by case priority
                 when 'critical' then 0
                 when 'high' then 1
                 when 'medium' then 2
                 when 'low' then 3
                 else 4
               end
      limit 1`,
    [orgId, referenceType, referenceId],
  );

  if (rows.length > 0) {
    const hit = rows[0];
    // reason_code is not projected by v_active_holds (intentionally minimal read model); the
    // envelope carries null until a richer reason projection is added. Consumers surface the
    // hold_number + priority for the operator.
    throw new QaHoldActiveError(hit.hold_number, hit.priority, null);
  }
}

/**
 * Assert no active quality hold covers the given Work Order. Call from 08-production's WO-consume
 * Server Action before recording consumption.
 */
export async function assertNoActiveHoldForWo(
  woId: string,
  orgId: string,
  db: HoldQueryClient,
): Promise<void> {
  await assertNoActiveHoldForReference('wo', woId, orgId, db);
}

/**
 * Assert no active quality hold covers the given License Plate. Call from 05-warehouse's LP-consume
 * Server Action (and 11-shipping's LP qa_status gate) before recording consumption / allocation.
 */
export async function assertNoActiveHoldForLp(
  lpId: string,
  orgId: string,
  db: HoldQueryClient,
): Promise<void> {
  await assertNoActiveHoldForReference('lp', lpId, orgId, db);
}

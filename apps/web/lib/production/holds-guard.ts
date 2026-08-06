/**
 * 09-quality T-064 consume-gate seam (holdsGuard).
 *
 * CROSS-MODULE CONTRACT (aligned to the SHIPPED 09-quality `v_active_holds`,
 * migration 197 + packages/server/src/quality/holdsGuard.ts):
 *   Every consume / output / completion path in 08-production MUST call
 *   `holdsGuard(ctx, { lpId, lotId })` BEFORE mutating consumption/output state.
 *   On a match the caller MUST reject with `quality_hold_active` (HTTP 409) AND
 *   emit `production.consume.blocked` (PRD §16.4 V-PROD-02 / V-PROD-16).
 *
 * SCHEMA REALITY (migration 197): `public.v_active_holds` is a POLYMORPHIC read
 * model — it exposes `(org_id, reference_type, reference_id, hold_id,
 * hold_number, priority, hold_status, ...)`. It does NOT have `lp_id` / `lot_id`
 * columns. The canonical gate (packages/server/src/quality/holdsGuard.ts) keys
 * on `reference_type IN ('wo','lp','batch','po','grn')` + `reference_id`. This
 * seam therefore maps:
 *   - lpId  → reference_type = 'lp'
 *   - lotId → reference_type = 'batch'   (a lot/batch reference)
 * and reconstructs which physical identifier the matched hold covers.
 *
 * FAIL-CLOSED (2026-08-06). This seam used to swallow `42P01` (undefined_table)
 * and answer "no hold" — a fail-open written when 09-quality had not shipped
 * `v_active_holds` yet. The view HAS shipped (migration 197 + 412), so the only
 * way that branch can fire today is a genuine failure: the view dropped/renamed,
 * a permission revoke, a broken connection. Answering "no hold" there routes
 * material under an ACTIVE quality hold straight into production, and (because
 * the swallowed error already aborted the transaction) the operator sees a
 * *different*, unrelated error from the next statement.
 *
 * A safety gate that cannot establish state must REFUSE. Zero rows still means
 * "no hold" — that is the expected no-data answer and is NOT an error. Every
 * exception is an inability to answer and surfaces as
 * `QualityHoldCheckFailedError`.
 */

import type { ProductionContext, QueryClient } from './holds-guard-types';

/**
 * The active-hold read model could not be interrogated, so no consume / output /
 * completion decision can be made. Callers must refuse the operation; the
 * message is the one the operator should see (never the raw SQLSTATE text).
 */
export class QualityHoldCheckFailedError extends Error {
  readonly code = 'quality_hold_check_failed' as const;
  readonly status = 503 as const;

  constructor(cause: unknown) {
    super('Cannot verify quality holds right now, so this operation was refused. Retry, or contact Quality.');
    this.name = 'QualityHoldCheckFailedError';
    this.cause = cause;
    Object.setPrototypeOf(this, QualityHoldCheckFailedError.prototype);
  }
}

/** An active quality hold blocking a consume/output/completion path. */
export type ActiveHold = { holdId: string; lpId: string | null; lotId: string | null };

export type HoldsGuardTarget = { lpId?: string | null; lotId?: string | null };

export type WoHoldGuardResult =
  | { ok: true }
  | { ok: false; error: 'quality_hold_active'; hold: ActiveHold };

/**
 * Returns the first active hold matching the LP or lot, or `null` when none is
 * active (or the `v_active_holds` view does not yet exist — fail-open seam).
 */
export async function holdsGuard(
  ctx: Pick<ProductionContext, 'client'>,
  target: HoldsGuardTarget,
): Promise<ActiveHold | null> {
  const lpId = target.lpId ?? null;
  const lotId = target.lotId ?? null;
  // Nothing to check against — no LP and no lot means no consume surface.
  if (!lpId && !lotId) return null;

  try {
    // Match the polymorphic (reference_type, reference_id / reference_text) model
    // of v_active_holds (migration 412 shape).
    //
    // LP holds: reference_type = 'lp', reference_id = lpId.
    //
    // Batch holds (post-mig-412): reference_type = 'batch', reference_id = NULL,
    // reference_text = the batch/lot string. We expand by joining to the LP's own
    // batch_number / supplier_batch_number columns, normalised with lower(trim())
    // on both sides so whitespace/case differences never cause a miss.
    //
    // If lpId is provided, also run the batch expansion against that LP's batch
    // fields. lotId (the old batch-UUID path) is kept as a reference_id fallback
    // for any pre-412 holds that still carry a UUID — it is a no-op once all
    // holds use reference_text.
    const { rows } = await (ctx.client as QueryClient).query<{
      hold_id: string;
      reference_type: string;
      reference_id: string | null;
    }>(
      `with target_lp as (
         select
           nullif(lower(trim(batch_number)), '') as batch_number,
           nullif(lower(trim(supplier_batch_number)), '') as supplier_batch_number
           from public.license_plates
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1
       )
       select h.hold_id, h.reference_type, h.reference_id
         from public.v_active_holds h
         left join target_lp lp on true
        where h.org_id = app.current_org_id()
          and (
            ($1::uuid is not null and h.reference_type = 'lp' and h.reference_id = $1::uuid)
            or (
              $1::uuid is not null
              and h.reference_type = 'batch'
              and h.reference_text is not null
              and lower(trim(h.reference_text)) in (lp.batch_number, lp.supplier_batch_number)
            )
            or ($2::uuid is not null and h.reference_type = 'batch' and h.reference_id = $2::uuid)
          )
        order by case h.priority
                   when 'critical' then 0
                   when 'high' then 1
                   when 'medium' then 2
                   when 'low' then 3
                   else 4
                 end
        limit 1`,
      [lpId, lotId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      holdId: String(row.hold_id),
      lpId: row.reference_type === 'lp' ? (row.reference_id ?? null) : null,
      lotId: row.reference_type === 'batch' ? (row.reference_id ?? null) : null,
    };
  } catch (err) {
    // No row = no hold; that answer arrives as an empty result set, never as an
    // exception. So every exception here — 42P01 (relation missing), 42703
    // (column drift), 42501 (revoked), a dead connection — means the gate could
    // not establish state, and a safety gate that cannot establish state refuses.
    throw new QualityHoldCheckFailedError(err);
  }
}

/**
 * Returns `quality_hold_active` when the WO itself is on an active quality hold.
 *
 * This intentionally stays in the local app seam instead of importing the
 * package-level quality guard; production consume callers need the same
 * `v_active_holds` / `app.current_org_id()` behavior as `holdsGuard` above.
 */
export async function assertWoNotOnHold(
  woId: string,
  ctx: Pick<ProductionContext, 'client'>,
): Promise<WoHoldGuardResult> {
  try {
    const { rows } = await (ctx.client as QueryClient).query<{
      hold_id: string;
      reference_id: string;
    }>(
      `select h.hold_id, h.reference_id
         from public.v_active_holds h
         join public.wo_executions e
           on e.org_id = h.org_id
          and e.wo_id = h.reference_id
         join public.work_orders wo
           on wo.org_id = e.org_id
          and wo.id = e.wo_id
        where h.org_id = app.current_org_id()
          and e.org_id = app.current_org_id()
          and wo.org_id = app.current_org_id()
          and h.reference_type = 'wo'
          and h.reference_id = $1::uuid
        order by case h.priority
                   when 'critical' then 0
                   when 'high' then 1
                   when 'medium' then 2
                   when 'low' then 3
                   else 4
                 end
        limit 1`,
      [woId],
    );
    const row = rows[0];
    if (!row) return { ok: true };
    return {
      ok: false,
      error: 'quality_hold_active',
      hold: { holdId: String(row.hold_id), lpId: null, lotId: null },
    };
  } catch (err) {
    // Same rule as holdsGuard: "the WO is clean" is an empty result set, never
    // an exception. An unanswerable gate refuses instead of reporting `ok`.
    throw new QualityHoldCheckFailedError(err);
  }
}

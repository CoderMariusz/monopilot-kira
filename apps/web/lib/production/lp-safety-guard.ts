import type { ActiveHold } from './holds-guard';
import { holdsGuard } from './holds-guard';
import type { ProductionContext, QueryClient } from './shared';

export type LpConsumeSafetyError =
  | 'lp_not_released'
  | 'lp_unavailable'
  | 'lp_expired'
  | 'lp_locked'
  // Canonical T-064 holdsGuard rejection (holds-guard.ts:5-9 contract): the
  // caller MUST surface HTTP 409 `quality_hold_active` AND emit
  // `production.consume.blocked` using the carried `hold`.
  | 'quality_hold_active';

export type LpConsumeSafetyResult =
  | { ok: true }
  | { ok: false; error: Exclude<LpConsumeSafetyError, 'quality_hold_active'>; hold?: undefined }
  | { ok: false; error: 'quality_hold_active'; hold: ActiveHold };

type LpSafetyRow = {
  id: string;
  status: string;
  qa_status: string;
  expired: boolean;
  locked_by: string | null;
  lock_is_active_for_other_user: boolean;
};

/**
 * Shared 08-production consume LP gate.
 *
 * Must run inside the caller's transaction. It locks the LP row before the
 * caller mutates WO/LP state, mirrors the warehouse scanner 5-minute lock
 * staleness rule, and delegates active quality holds to the canonical T-064
 * holdsGuard seam.
 */
export async function assertLpConsumableForProduction(
  ctx: Pick<ProductionContext, 'client' | 'userId'>,
  lpId: string,
): Promise<LpConsumeSafetyResult> {
  const { rows } = await (ctx.client as QueryClient).query<LpSafetyRow>(
    `select lp.id::text,
            lp.status,
            lp.qa_status,
            (lp.expiry_date is not null and lp.expiry_date::date < current_date) as expired,
            lp.locked_by::text,
            (
              lp.locked_by is not null
              and lp.locked_by <> $2::uuid
              and lp.locked_at > pg_catalog.now() - interval '5 minutes'
            ) as lock_is_active_for_other_user
       from public.license_plates lp
      where lp.org_id = app.current_org_id()
        and lp.id = $1::uuid
      for update`,
    [lpId, ctx.userId],
  );
  const lp = rows[0];
  if (!lp) return { ok: false, error: 'lp_unavailable' };

  if (lp.qa_status !== 'released') return { ok: false, error: 'lp_not_released' };
  if (lp.status !== 'available') return { ok: false, error: 'lp_unavailable' };
  if (lp.expired) return { ok: false, error: 'lp_expired' };
  if (lp.lock_is_active_for_other_user) return { ok: false, error: 'lp_locked' };

  const activeHold = await holdsGuard(ctx, { lpId });
  if (activeHold) return { ok: false, error: 'quality_hold_active', hold: activeHold };

  return { ok: true };
}

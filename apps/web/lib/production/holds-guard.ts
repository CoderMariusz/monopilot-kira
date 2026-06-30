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
 * FAIL-OPEN only while the view is genuinely ABSENT (09-quality not yet shipped):
 *   detected via `42P01` (undefined_table). `42703` (undefined_column) is NOT
 *   swallowed — a column mismatch is a real contract drift that must surface,
 *   never be silently treated as "no hold".
 */

import type { ProductionContext, QueryClient } from './holds-guard-types';

/** An active quality hold blocking a consume/output/completion path. */
export type ActiveHold = { holdId: string; lpId: string | null; lotId: string | null };

export type HoldsGuardTarget = { lpId?: string | null; lotId?: string | null };

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
    // Match the polymorphic (reference_type, reference_id) model of the SHIPPED
    // v_active_holds view (migration 197). lpId → 'lp', lotId → 'batch'. Order
    // by priority so the most severe hold is surfaced first (mirrors the
    // canonical gate's priority ordering).
    const { rows } = await (ctx.client as QueryClient).query<{
      hold_id: string;
      reference_type: string;
      reference_id: string;
    }>(
      `select hold_id, reference_type, reference_id
         from public.v_active_holds
        where org_id = app.current_org_id()
          and (
            ($1::uuid is not null and reference_type = 'lp' and reference_id = $1::uuid)
            or ($2::uuid is not null and reference_type = 'batch' and reference_id = $2::uuid)
          )
        order by case priority
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
      lpId: row.reference_type === 'lp' ? row.reference_id : null,
      lotId: row.reference_type === 'batch' ? row.reference_id : null,
    };
  } catch (err) {
    // 42P01 = undefined_table: 09-quality has not shipped v_active_holds yet.
    // Fail OPEN so a not-yet-built dependency cannot wedge production runtime.
    // (42703 / undefined_column is deliberately NOT caught — see header.)
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01') {
      return null;
    }
    throw err;
  }
}

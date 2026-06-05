'use server';

/**
 * 03-technical Cost History (T-021): POST a new cost roll.
 *
 * Gated on the real `technical.cost.edit` RBAC permission (seeded to the
 * org-admin family by migration 154). Runs inside withOrgContext so RLS scopes
 * every statement to the caller's org. zod-validated against migration 160's
 * CHECK constraints + PRD §11.6 V-TEC-50..53.
 *
 * Write path (PRD §11.2 / §11.6, AC3):
 *   1. Resolve the current active cost row (effective_to IS NULL) for the item.
 *   2. V-TEC-53: if source ∈ {manual, supplier_update} AND a current active cost
 *      exists AND |new - current| / current > 0.20 AND no approver was supplied
 *      → 422 approver_required. d365_sync / variance_roll bypass the guard.
 *   3. Close the prior active row: effective_to = new.effective_from - 1 day.
 *   4. Insert the new history row with `source`.
 *   5. Denormalize items.cost_per_kg = new value.
 *   6. Audit-log the write (dual-owned with Finance — Technical writes ONLY
 *      items.cost_per_kg + item_cost_history, never Finance costing tables).
 *
 * NUMERIC-exact: the >20% delta test, the effective_to close and the cost
 * comparison are all evaluated in SQL against NUMERIC / DATE columns. The cost
 * value is bound as a string parameter cast to ::numeric — JS float math never
 * touches a cost. V-TEC-50 / V-TEC-51 are enforced both in zod and by the DB
 * (cost_per_kg_nonnegative_check; effective_from validated below + at the API).
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { safeRevalidatePath } from '../../items/_actions/revalidate';
import {
  COST_EDIT_PERMISSION,
  hasPermission,
  isPgError,
  type OrgActionContext,
  PostCostInput,
  type PostCostResult,
  type QueryClient,
} from './shared';
import { writeItemCostLedger } from './write-cost-ledger';

export async function postCost(rawInput: unknown): Promise<PostCostResult> {
  const parsed = PostCostInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  // V-TEC-51: effective_from must be <= current date (no future-dating the
  // active row). Compared as a calendar date (string) — no float involved.
  if (input.effectiveFrom) {
    const today = new Date().toISOString().slice(0, 10);
    if (input.effectiveFrom > today) {
      return { ok: false, error: 'invalid_input', message: 'effective_from must be <= today (V-TEC-51)' };
    }
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<PostCostResult> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };
      if (!(await hasPermission(ctx, COST_EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

      const result = await writeItemCostLedger(qc, { orgId, userId, input });
      if (!result.ok) return result;
      safeRevalidatePath('/technical/items');
      return result;
    });
  } catch (err) {
    // 23514 check_violation = cost_per_kg_nonnegative_check / effective_range_check.
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    console.error('[technical/cost] postCost persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

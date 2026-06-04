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
  APPROVER_GUARDED_SOURCES,
  COST_EDIT_PERMISSION,
  HIGH_VARIANCE_RATIO,
  hasPermission,
  isPgError,
  type OrgActionContext,
  PostCostInput,
  type PostCostResult,
  type QueryClient,
  writeAudit,
} from './shared';

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

      // The item must exist in the caller's org (RLS-scoped). Resolve the current
      // active cost in the same SELECT so the variance guard uses a consistent read.
      const { rows: itemRows } = await qc.query<{ id: string; current_cost: string | null }>(
        `select i.id,
                (select ch.cost_per_kg::text
                   from public.item_cost_history ch
                  where ch.org_id = app.current_org_id()
                    and ch.item_id = i.id
                    and ch.effective_to is null
                  order by ch.effective_from desc
                  limit 1) as current_cost
           from public.items i
          where i.org_id = app.current_org_id()
            and i.id = $1::uuid`,
        [input.itemId],
      );
      const item = itemRows[0];
      if (!item) return { ok: false, error: 'not_found' };

      // V-TEC-53 — high-variance approver guard. Evaluated in SQL NUMERIC space so
      // the >20% test is exact. Only fires for approver-guarded sources, only when
      // a prior active cost exists, and only when no approver was supplied.
      if (
        APPROVER_GUARDED_SOURCES.has(input.source) &&
        item.current_cost !== null &&
        !input.approverUserId
      ) {
        const { rows: guardRows } = await qc.query<{ exceeds: boolean }>(
          `select (
             $1::numeric > 0
             and (abs($2::numeric - $1::numeric) / $1::numeric) > $3::numeric
           ) as exceeds`,
          [item.current_cost, input.costPerKg, HIGH_VARIANCE_RATIO],
        );
        if (guardRows[0]?.exceeds) {
          return { ok: false, error: 'approver_required', message: 'cost change > 20% requires an approver (V-TEC-53)' };
        }
      }

      // Close the prior active row(s): effective_to = new.effective_from - 1 day
      // (PRD §11.1 + AC3). effective_from defaults to current_date when not
      // supplied (matches the column default + PRD "effective_from=today"). All
      // DATE arithmetic — no float.
      //
      // Edge case: when the prior active row was itself created on the new
      // effective_from (a second cost change the same day), `from - 1` would be
      // earlier than the prior row's effective_from and violate
      // item_cost_history_effective_range_check (effective_to >= effective_from).
      // Clamp with greatest(...) so the close never produces an invalid range;
      // for the normal distinct-day path this is exactly `new.effective_from - 1`.
      const effectiveFromExpr = input.effectiveFrom ? '$2::date' : 'current_date';
      const closeParams: unknown[] = input.effectiveFrom
        ? [input.itemId, input.effectiveFrom]
        : [input.itemId];
      await qc.query(
        `update public.item_cost_history
            set effective_to = greatest(
                  (${effectiveFromExpr} - interval '1 day')::date,
                  effective_from
                )
          where org_id = app.current_org_id()
            and item_id = $1::uuid
            and effective_to is null`,
        closeParams,
      );

      // Insert the new history row. cost_per_kg bound as text -> ::numeric (exact).
      const insertParams: unknown[] = input.effectiveFrom
        ? [input.itemId, input.costPerKg, input.currency, input.source, userId, input.effectiveFrom]
        : [input.itemId, input.costPerKg, input.currency, input.source, userId];
      const { rows: inserted } = await qc.query<{ id: string; effective_from: string }>(
        `insert into public.item_cost_history
           (org_id, item_id, cost_per_kg, currency, effective_from, source, created_by)
         values
           (app.current_org_id(), $1::uuid, $2::numeric, $3, ${effectiveFromExpr}, $4, $5::uuid)
         returning id, effective_from::text as effective_from`,
        insertParams,
      );
      const row = inserted[0];
      if (!row) return { ok: false, error: 'persistence_failed' };

      // Denormalize items.cost_per_kg = new active cost (NUMERIC-exact).
      await qc.query(
        `update public.items
            set cost_per_kg = $2::numeric
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        [input.itemId, input.costPerKg],
      );

      await writeAudit(qc, {
        orgId,
        actorUserId: userId,
        action: 'item_cost.recorded',
        resourceId: row.id,
        beforeState: { costPerKg: item.current_cost },
        afterState: {
          itemId: input.itemId,
          costPerKg: input.costPerKg,
          currency: input.currency,
          effectiveFrom: row.effective_from,
          source: input.source,
          approverUserId: input.approverUserId ?? null,
          notes: input.notes ?? null,
        },
      });

      safeRevalidatePath('/technical/items');
      return {
        ok: true,
        data: { id: row.id, itemId: input.itemId, costPerKg: input.costPerKg, effectiveFrom: row.effective_from },
      };
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

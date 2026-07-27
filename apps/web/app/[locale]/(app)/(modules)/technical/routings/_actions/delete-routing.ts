'use server';

/**
 * 03-technical Routings CRUD (PF-R06-06): delete a DRAFT routing version.
 *
 * Why this exists at all — the module had create / update / approve / publish /
 * list / cost-preview and NO delete, so a routing created by mistake stayed in
 * the system forever. That is a CRUD gap, not a missing shortcut.
 *
 * Policy (the same line BOM draws with deleteBomVersion + getVersionDeleteGuard):
 * "never delete a routing" protects HISTORY — approved / active / superseded
 * versions are an audit trail and are superseded, never removed. A `draft` was
 * never part of that history: it was never approved, never produced against and
 * carries no signature. So `draft` — and only `draft` — is deletable. Every
 * other status returns the named `not_draft` refusal (see create-routing.ts,
 * whose policy comment was corrected to say the same).
 *
 * Guards, in order:
 *   1. `technical.bom.create` (ROUTING_WRITE_PERMISSION) — same gate as create/update.
 *   2. status must be `draft`               -> `not_draft`
 *   3. nothing may still point at the version -> `version_referenced`
 *      Routings have no `bom_snapshots` analogue. The two columns that store a
 *      routing id outside the routing itself are `work_orders.routing_id` and
 *      `technical_change_order_lines.target_id` (with `target_type='routing'`);
 *      NEITHER is a real FK, so the database would happily orphan them.
 *      Counted via public.routing_reference_counts (SECURITY DEFINER, migration
 *      525) so per-site RLS cannot hide a reference from the guard (R-6).
 *
 * Concurrency (R-7): the `for update` on the routing header below is what makes
 * the guard hold. It only works because the other side takes a conflicting lock —
 * replaceEcoLines (technical/eco/_actions/shared.ts) locks the routing row
 * `for key share` before inserting a line that points at it. Whichever
 * transaction gets the lock first wins cleanly: the deleter then counts the new
 * ECO line and refuses, or the ECO writer finds the routing gone and refuses.
 *
 * Cascade: `routing_operations.routing_id` IS a hard FK with ON DELETE CASCADE
 * (migration 163-routings.sql:99), so the operations go with the header — we do
 * not delete them by hand. Deleting them explicitly would in fact be worse: the
 * `routing_operations_guard_locked_routing` BEFORE DELETE trigger (migration
 * 496) raises on a still-present approved/active parent, whereas under the FK
 * cascade the parent row is already gone and the guard is a no-op.
 *
 * Gated on `technical.bom.create`; runs inside withOrgContext so RLS scopes
 * every statement (delete + audit) to the caller's org.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { safeRevalidatePath } from '../../items/_actions/revalidate';
import {
  DeleteRoutingInput,
  type DeleteRoutingResult,
  hasPermission,
  isPgError,
  type OrgActionContext,
  type QueryClient,
  ROUTING_WRITE_PERMISSION,
  writeAudit,
} from './shared';

type RoutingDeleteRow = {
  id: string;
  item_id: string;
  version: number;
  status: string;
  site_id: string | null;
  effective_from: string;
  effective_to: string | null;
};

export async function deleteRouting(rawInput: unknown): Promise<DeleteRoutingResult> {
  const parsed = DeleteRoutingInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<DeleteRoutingResult> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };
      if (!(await hasPermission(ctx, ROUTING_WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const { rows } = await qc.query<RoutingDeleteRow>(
        `select routing.id,
                routing.item_id,
                routing.version,
                routing.status,
                routing.site_id::text as site_id,
                routing.effective_from::text as effective_from,
                routing.effective_to::text as effective_to
           from public.routings routing
          where routing.org_id = app.current_org_id()
            and routing.id = $1::uuid
          for update`,
        [input.routingId],
      );
      const routing = rows[0];
      if (!routing) return { ok: false, error: 'not_found' };
      if (routing.status !== 'draft') {
        return {
          ok: false,
          error: 'not_draft',
          message: `only a draft routing may be deleted (is '${routing.status}'); approved, active and superseded versions are audit history`,
        };
      }

      // Delete guard — both references are soft (no FK), so the DB will not stop
      // us; refuse with a named reason instead of silently orphaning them.
      //
      // R-6: counted through public.routing_reference_counts (SECURITY DEFINER,
      // migration 525) and NOT with a plain subquery. As `app_user` the
      // work_orders read is filtered by the RESTRICTIVE `work_orders_site_visibility`
      // policy (migration 383), while public.routings only has org-level RLS — so a
      // user assigned to site A saw the routing but not the site-B work order using
      // it, counted 0, and deleted the routing out from under it. The function
      // takes its org exclusively from app.current_org_id(), so seeing more rows
      // never means reaching into another org.
      const { rows: refRows } = await qc.query<{
        work_order_count: string | number;
        change_order_line_count: string | number;
      }>(`select work_order_count, change_order_line_count from public.routing_reference_counts($1::uuid)`, [
        input.routingId,
      ]);
      // No row back = the guard did not run. Refuse rather than read that as
      // "zero references" and delete on the strength of a query that failed.
      if (!refRows[0]) return { ok: false, error: 'persistence_failed' };
      const workOrderCount = Number(refRows[0].work_order_count);
      const changeOrderCount = Number(refRows[0].change_order_line_count);
      const referenceCount = workOrderCount + changeOrderCount;
      if (referenceCount > 0) {
        return {
          ok: false,
          error: 'version_referenced',
          message: `routing version is still referenced by ${workOrderCount} work order(s) and ${changeOrderCount} change-order line(s)`,
          referenceCount,
        };
      }

      const beforeState = {
        id: routing.id,
        itemId: String(routing.item_id),
        version: Number(routing.version),
        status: routing.status,
        siteId: routing.site_id,
        effectiveFrom: routing.effective_from,
        effectiveTo: routing.effective_to,
      };

      // routing_operations go with it via ON DELETE CASCADE (migration 163).
      // `and status = 'draft'` re-checks under the row lock so a concurrent
      // approve cannot slip an approved version through this statement.
      const { rowCount } = await qc.query(
        `delete from public.routings
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'draft'`,
        [input.routingId],
      );
      if (rowCount !== 1) return { ok: false, error: 'persistence_failed' };

      await writeAudit(qc, {
        orgId,
        actorUserId: userId,
        action: 'routing.deleted',
        resourceId: routing.id,
        beforeState,
        afterState: null,
      });

      safeRevalidatePath('/technical/routings');
      return {
        ok: true,
        data: { id: routing.id, itemId: beforeState.itemId, version: beforeState.version },
      };
    });
  } catch (err) {
    // 23503 = something holds a real FK we did not know about — never orphan it.
    if (isPgError(err) && err.code === '23503') {
      return { ok: false, error: 'version_referenced', message: 'routing version is still referenced' };
    }
    console.error('[technical/routings] deleteRouting persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

'use server';

/**
 * 03-technical Routings CRUD (T-022): approve + publish workflow.
 *
 * approveRouting: draft → approved (records approved_by + approved_at).
 * publishRouting: approved → active, and supersedes the item's currently-active
 *   routing (status='superseded', effective_to = today). Each item has zero-or-one
 *   active routing (PRD §12.1) — enforced by superseding the incumbent, never by
 *   deleting it.
 *
 * Gated on `technical.bom.approve`. Runs inside withOrgContext (RLS-scoped). The
 * supersede + activate happen in the same transaction so there is never a window
 * with two active routings for an item.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { safeRevalidatePath } from '../../items/_actions/revalidate';
import {
  ApproveRoutingInput,
  type ApproveRoutingResult,
  assertRoutingSiteScopeForApproval,
  hasPermission,
  isPgError,
  type OrgActionContext,
  type QueryClient,
  ROUTING_APPROVE_PERMISSION,
  type RoutingStatus,
  writeAudit,
} from './shared';

async function transition(
  rawInput: unknown,
  from: RoutingStatus,
  to: RoutingStatus,
  action: string,
): Promise<ApproveRoutingResult> {
  const parsed = ApproveRoutingInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ApproveRoutingResult> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };
      if (!(await hasPermission(ctx, ROUTING_APPROVE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const { rows: cur } = await qc.query<{ id: string; status: string; item_id: string }>(
        `select routing.id, routing.status, routing.item_id
           from public.routings routing
          where routing.org_id = app.current_org_id()
            and routing.id = $1::uuid
          for update`,
        [input.routingId],
      );
      const routing = cur[0];
      if (!routing) return { ok: false, error: 'not_found' };
      if (routing.status !== from) {
        return { ok: false, error: 'invalid_state', message: `routing must be '${from}' to ${action} (is '${routing.status}')` };
      }

      const siteScope = await assertRoutingSiteScopeForApproval(qc, input.routingId);
      if (!siteScope.ok) return { ok: false, error: siteScope.error, message: siteScope.message };
      if (siteScope.canonicalSiteId) {
        await qc.query(
          `update public.routings
              set site_id = $2::uuid
            where org_id = app.current_org_id()
              and id = $1::uuid
              and site_id is null`,
          [input.routingId, siteScope.canonicalSiteId],
        );
      }

      // On publish (approved → active), supersede the incumbent active routing
      // for the same item first, so the item keeps zero-or-one active routing.
      if (to === 'active') {
        await qc.query(
          `update public.routings
              set status = 'superseded', effective_to = current_date
            where org_id = app.current_org_id()
              and item_id = $1::uuid
              and status = 'active'
              and id <> $2::uuid`,
          [routing.item_id, input.routingId],
        );
      }

      // Two explicit statements keep the parameter positions readable. Both guard
      // on `status = from` so a concurrent transition can't double-apply.
      const updated =
        to === 'approved'
          ? await qc.query<{ id: string; status: string }>(
              `update public.routings
                  set status = $2, approved_by = $3::uuid, approved_at = now()
                where org_id = app.current_org_id()
                  and id = $1::uuid
                  and status = $4
              returning id, status`,
              [input.routingId, to, userId, from],
            )
          : await qc.query<{ id: string; status: string }>(
              `update public.routings
                  set status = $2
                where org_id = app.current_org_id()
                  and id = $1::uuid
                  and status = $3
              returning id, status`,
              [input.routingId, to, from],
            );
      const row = updated.rows[0];
      if (!row) return { ok: false, error: 'invalid_state' };

      await writeAudit(qc, {
        orgId,
        actorUserId: userId,
        action,
        resourceId: row.id,
        beforeState: { status: from },
        afterState: { status: to },
      });

      safeRevalidatePath('/technical/routings');
      return { ok: true, data: { id: row.id, status: to } };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23514') {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('routing_cross_site_lines') || message.includes('routing_operations_immutable')) {
        return {
          ok: false,
          error: 'v_tec_64_cross_site_lines',
          message: 'all routing operations must use production lines from a single site (V-TEC-64)',
        };
      }
      return { ok: false, error: 'invalid_input' };
    }
    console.error(`[technical/routings] ${action} persistence_failed`, {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function approveRouting(rawInput: unknown): Promise<ApproveRoutingResult> {
  return transition(rawInput, 'draft', 'approved', 'routing.approved');
}

export async function publishRouting(rawInput: unknown): Promise<ApproveRoutingResult> {
  return transition(rawInput, 'approved', 'active', 'routing.published');
}

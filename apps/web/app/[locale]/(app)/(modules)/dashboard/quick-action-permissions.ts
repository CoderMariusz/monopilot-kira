/**
 * Server-side resolver for which dashboard WRITE quick-actions the signed-in
 * user may see (shell gap — quick-actions RBAC).
 *
 * The prototype shows six quick-action buttons to everyone, but three of them
 * (Create Work Order, Create Purchase Order, Run MRP) deep-link into write
 * flows whose Server Actions reject a user without the matching permission with
 * `forbidden`. Showing a button that always 403s is a dead-end. This helper
 * runs the SAME permission query those actions use (the `role_permissions`
 * left-join with the `roles.permissions` jsonb fallback) purely to drive UI
 * affordance — a spoofed deep-link still hits the action's authoritative
 * server-side gate and is rejected.
 *
 *   - Create WO → `npd.planning.write` (createWorkOrder gate, PLANNING_WO_WRITE_PERMISSION)
 *   - Create PO → `npd.planning.write` (PO actions gate, hasPlanningWritePermission)
 *   - Run MRP   → `planning.mrp.run` (PLANNING_MRP_RUN)
 *
 * The read-only quick-actions (Receive / Quality Check / Create Shipment) are
 * not gated here — they route to module landing pages, not pre-authorized write
 * modals, and gating them would hide a legitimate navigation affordance.
 *
 * NOT a `"use server"` module: invoked directly from the dashboard Server
 * Component during render, like `dashboard-summary.ts`. Returns a permissive map
 * (all keys absent → "no extra gate fires") never throws, so a transient lookup
 * failure degrades to the prototype's ungated behaviour rather than 500-ing the
 * page or blanking the bar.
 */
import { withOrgContext } from "../../../../../lib/auth/with-org-context";

/** Permission strings, mirrored from the owning Server Actions (single source). */
export const PLANNING_WRITE_PERMISSION = "npd.planning.write";
export const PLANNING_MRP_RUN_PERMISSION = "planning.mrp.run";

/** Which gated quick-action keys the user is allowed to see. */
export type QuickActionPermissions = {
  /** Create WO + Create PO both gate on planning write. */
  canPlanningWrite: boolean;
  /** Run MRP gates on the MRP-run permission. */
  canRunMrp: boolean;
};

type PermissionCheckRow = { ok: boolean };

export async function getQuickActionPermissions(): Promise<QuickActionPermissions> {
  try {
    return await withOrgContext(async ({ client, userId, orgId }) => {
      // One round-trip: probe both distinct permissions at once. Mirrors the
      // `hasPermission` / `hasAnyPermission` shape used by the WO/PO/MRP actions
      // (role_permissions match OR the roles.permissions jsonb fallback), so the
      // affordance is exactly what the server action will allow.
      const { rows } = await client.query<{ permission: string } & PermissionCheckRow>(
        `select p.permission
           from unnest($3::text[]) as p(permission)
          where exists (
            select 1
              from public.user_roles ur
              join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
              left join public.role_permissions rp
                     on rp.role_id = r.id and rp.permission = p.permission
             where ur.user_id = $1::uuid
               and ur.org_id = $2::uuid
               and (
                 rp.permission is not null
                 or coalesce(r.permissions, '[]'::jsonb) ? p.permission
               )
          )`,
        [userId, orgId, [PLANNING_WRITE_PERMISSION, PLANNING_MRP_RUN_PERMISSION]],
      );

      const granted = new Set(rows.map((row) => row.permission));
      return {
        canPlanningWrite: granted.has(PLANNING_WRITE_PERMISSION),
        canRunMrp: granted.has(PLANNING_MRP_RUN_PERMISSION),
      };
    });
  } catch (error) {
    console.error("[dashboard] quick-action permission resolution failed:", error);
    // Degrade to the prototype's ungated behaviour (show everything) rather than
    // blanking the bar on a transient lookup error.
    return { canPlanningWrite: true, canRunMrp: true };
  }
}

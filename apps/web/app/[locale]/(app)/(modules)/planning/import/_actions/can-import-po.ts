'use server';

/**
 * Wave E-IO (decision #6) — Bulk PO import hub: server-side RBAC gate.
 *
 * The hub page (Server Component) must decide whether to render the PO import
 * wizard or a permission-denied panel WITHOUT trusting any client flag. The
 * canonical import action (import-po.ts) already enforces npd.planning.write on
 * every validate/commit call (fail-closed) — this reader resolves the same gate
 * once so the page can hide the action up front and never render-then-disable.
 *
 * It reuses the shared procurement permission helper; it does NOT re-implement
 * the gate. Returns a boolean only — no PII, no org id, no UUID.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  hasPlanningWritePermission,
  type OrgActionContext,
  type QueryClient,
} from '../../_actions/procurement-shared';

export async function canImportPurchaseOrders(): Promise<boolean> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<boolean> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as unknown as QueryClient };
      return hasPlanningWritePermission(ctx);
    });
  } catch {
    // A resolution failure (no verified session / no org row) is treated as
    // "not permitted" — the page renders the denied state, never a 500.
    return false;
  }
}

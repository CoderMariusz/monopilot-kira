'use server';

/**
 * Wave E-IO (decision #6) — Bulk import hub: server-side RBAC gates.
 *
 * The hub and dedicated import pages resolve domain-specific permissions once so
 * each importer renders only when the matching action gate would allow it.
 * Import actions re-check on every validate/commit call (fail-closed).
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  hasPlanningWritePermission,
  hasPoManagePermission,
  hasToManagePermission,
  type OrgActionContext,
  type QueryClient,
} from '../../_actions/procurement-shared';

async function resolveImportPermission(
  check: (ctx: OrgActionContext) => Promise<boolean>,
): Promise<boolean> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<boolean> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as unknown as QueryClient };
      return check(ctx);
    });
  } catch {
    return false;
  }
}

export async function canImportPurchaseOrders(): Promise<boolean> {
  return resolveImportPermission(hasPoManagePermission);
}

export async function canImportTransferOrders(): Promise<boolean> {
  return resolveImportPermission(hasToManagePermission);
}

export async function canImportWorkOrders(): Promise<boolean> {
  return resolveImportPermission(hasPlanningWritePermission);
}

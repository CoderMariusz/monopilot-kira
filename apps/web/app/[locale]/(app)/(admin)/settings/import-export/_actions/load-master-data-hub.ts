'use server';

/**
 * Server boundary for the Settings master-data Import/Export hub.
 *
 * Thin loader that resolves the verified caller's org_id (via withOrgContext /
 * Supabase JWT + public.users), then reads the org-scoped master-data row
 * counts + recent import jobs through the canonical data action
 * `getImportableEntities` (which itself re-opens an org context and enforces
 * RLS via app.current_org_id()).
 *
 * We must NOT touch _actions/master-data.ts (consume only). Its public API is
 * `getImportableEntities(orgId)` and it validates `ctx.orgId === orgId`, so the
 * page cannot call it without first knowing the caller's org_id. There is no
 * standalone org-id helper in lib/auth, so we resolve it with a single
 * withOrgContext pass and forward it. The result is wrapped in an ok/err
 * envelope so the page can render the prototype error state instead of throwing.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { getImportableEntities, type ImportableEntitiesData } from './master-data';

export type MasterDataHubLoadResult =
  | { ok: true; data: ImportableEntitiesData }
  | { ok: false; state: 'error' };

export async function loadMasterDataHub(): Promise<MasterDataHubLoadResult> {
  try {
    // Resolve the verified caller's org_id. getImportableEntities re-opens its
    // own org context (and validates the passed org_id matches the resolved
    // context), so this is the canonical way to hand it the right scope without
    // mutating master-data.ts.
    const orgId = await withOrgContext(async (ctx) => ctx.orgId);
    const data = await getImportableEntities(orgId);
    return { ok: true, data };
  } catch (error) {
    console.error('[loadMasterDataHub] failed to load master-data hub', {
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, state: 'error' };
  }
}

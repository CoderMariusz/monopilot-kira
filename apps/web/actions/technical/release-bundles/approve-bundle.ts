'use server';

/**
 * T-080 — `approveReleaseBundleAction` Server Action.
 *
 * Thin `'use server'` wrapper: opens an org-context transaction (withOrgContext, T-125)
 * and delegates the atomic factory_spec + BOM bundle approval to the
 * release-bundle-service. RLS scopes every query to the caller's org; the service does
 * RBAC, e-sign (CFR 21 Part 11), the both-sides-or-neither state change, the outbox
 * event, and the T-081 NPD release-loop adapter.
 *
 * `'use server'` export rule: only async functions are exported here. All schemas,
 * types and the service live in the non-`'use server'` sibling
 * `apps/web/lib/technical/release-bundle-service.ts`.
 */

import { withOrgContext } from '../../../lib/auth/with-org-context';
import { safeRevalidateBundlePaths } from './revalidate';
import {
  approveReleaseBundle,
  type ApproveBundleResult,
  type QueryClient,
} from '../../../lib/technical/release-bundle-service';

function isPgError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

export async function approveReleaseBundleAction(rawInput: unknown): Promise<ApproveBundleResult> {
  try {
    const result = await withOrgContext(async ({ userId, orgId, client }) =>
      approveReleaseBundle({ userId, orgId, client: client as QueryClient }, rawInput),
    );

    if (result.ok) {
      safeRevalidateBundlePaths(result.data.factorySpecId);
    }
    return result;
  } catch (err) {
    if (isPgError(err) && err.code === '23514') {
      return { ok: false, error: 'invalid_state' };
    }
    console.error('[approveReleaseBundleAction] persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

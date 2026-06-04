'use server';

/**
 * T-080 — `rejectReleaseBundleAction` Server Action.
 *
 * Atomic rejection of the factory_spec + BOM bundle: neither side is released. Thin
 * `'use server'` wrapper over the release-bundle-service inside withOrgContext.
 */

import { withOrgContext } from '../../../lib/auth/with-org-context';
import { safeRevalidateBundlePaths } from './revalidate';
import {
  rejectReleaseBundle,
  type QueryClient,
  type RejectBundleResult,
} from '../../../lib/technical/release-bundle-service';

export async function rejectReleaseBundleAction(rawInput: unknown): Promise<RejectBundleResult> {
  const result = await withOrgContext(async ({ userId, orgId, client }) =>
    rejectReleaseBundle({ userId, orgId, client: client as QueryClient }, rawInput),
  );

  if (result.ok) {
    safeRevalidateBundlePaths(result.data.factorySpecId);
  }
  return result;
}

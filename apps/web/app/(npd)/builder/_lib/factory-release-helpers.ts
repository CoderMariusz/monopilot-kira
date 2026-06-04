/**
 * Pure (non-`'use server'`) helpers for factory release status.
 *
 * A `'use server'` file may only export async functions, so the release-status
 * constant and the synchronous `isFactoryUsable` predicate live here. The
 * action module (`factory-release-status.ts`) imports them and uses them
 * identically; tests import them from this module directly.
 */

import type { FactoryReleaseStatus } from './factory-release-status';

export const FACTORY_USABLE_RELEASE_STATUSES = ['approved_for_factory', 'released_to_factory'] as const;

export function isFactoryUsable(release: Pick<
  FactoryReleaseStatus,
  'releaseStatus' | 'activeBomHeaderId' | 'activeFactorySpecId' | 'releaseBlockers'
>): boolean {
  return (
    FACTORY_USABLE_RELEASE_STATUSES.includes(
      release.releaseStatus as (typeof FACTORY_USABLE_RELEASE_STATUSES)[number],
    ) &&
    !!release.activeBomHeaderId &&
    !!release.activeFactorySpecId &&
    release.releaseBlockers.length === 0
  );
}

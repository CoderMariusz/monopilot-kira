import { revalidatePath } from 'next/cache';

import { routing } from '../../i18n/routing';

/**
 * Revalidate a route for every configured locale.
 *
 * next-intl uses localePrefix 'always', so real URLs are `/{locale}/…`.
 * A bare `revalidateLocalized('/settings/…')` is a silent no-op — it targets a
 * route that does not exist and leaves localized pages stale.
 */
export function revalidateLocalized(route: string, type?: 'page' | 'layout'): void {
  const normalized = route.startsWith('/') ? route : `/${route}`;
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}${normalized}`, type);
  }
}

/**
 * Revalidate AFTER the org transaction has committed — never from inside a
 * `withOrgContext` callback.
 *
 * `revalidatePath` throws whenever it runs outside a request scope. Called
 * inside the callback that throw reaches `withOrgContext`, which rolls the
 * whole transaction back: work that already succeeded disappears and the user
 * sees a bare `persistence_failed`. That exact bug was diagnosed and fixed in
 * `warehouse/_actions/receipt-corrections-actions.ts` (local
 * `revalidateAfterCommit`) and `warehouse/_actions/receive-po-line.ts`
 * (`revalidateReceivePaths`); this is the same shape hoisted so the remaining
 * call sites do not each grow their own copy.
 *
 * Deliberately swallowing instead of rethrowing: a stale cache must not report
 * committed work as a failure the operator retries into a duplicate.
 */
export function revalidateAfterCommit(
  routes: string | readonly string[],
  type?: 'page' | 'layout',
): void {
  const list = typeof routes === 'string' ? [routes] : routes;
  try {
    for (const route of list) revalidateLocalized(route, type);
  } catch (error) {
    console.warn('[revalidate] after-commit revalidation failed', { routes: list, error });
  }
}

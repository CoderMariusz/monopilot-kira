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

import { cookies } from 'next/headers';

import { PLATFORM_ORG_COOKIE } from '../platform/platform-context';
import { SITE_COOKIE_NAME } from '../site/site-context';

/**
 * Custom org/site cookies are session context, not durable user preferences.
 * Supabase sign-out only clears Supabase-owned cookies, so every logout surface
 * must clear these explicitly before another verified session can be created.
 */
export async function clearSessionContext(): Promise<void> {
  let store: Awaited<ReturnType<typeof cookies>>;
  try {
    store = await cookies();
  } catch {
    // Non-request callers (notably isolated unit tests) have no cookie store.
    return;
  }

  store.delete(PLATFORM_ORG_COOKIE);
  store.delete(SITE_COOKIE_NAME);
}

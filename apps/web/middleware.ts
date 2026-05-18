/**
 * Next.js middleware — edge-safe next-intl locale routing.
 *
 * IMPORTANT: Middleware runs in the Edge runtime on Next/Vercel. Do not import
 * Node-only modules here (`pg`, Node `crypto`, Supabase server helpers that pull
 * Node APIs, etc.). Auth/session enforcement belongs in Server Actions, route
 * handlers, or Server Components where the Node runtime is available.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const intlHandler = createIntlMiddleware(routing);

let hasWarnedDevAuthBypass = false;

function isDevAuthBypassEnabled(): boolean {
  if (process.env.DEV_AUTH_BYPASS !== 'true') return false;

  if (process.env.NODE_ENV === 'production') {
    if (!hasWarnedDevAuthBypass) {
      console.warn(
        '[DEV_AUTH_BYPASS] Ignored because NODE_ENV=production. Auth middleware remains enabled.',
      );
      hasWarnedDevAuthBypass = true;
    }
    return false;
  }

  if (!hasWarnedDevAuthBypass) {
    console.warn('[DEV_AUTH_BYPASS] Auth middleware disabled. NEVER set this in production.');
    hasWarnedDevAuthBypass = true;
  }

  return true;
}

export default function middleware(req: NextRequest): NextResponse {
  // Preserve the existing DEV_AUTH_BYPASS warning semantics without importing
  // Node-only auth/session modules into the Edge middleware bundle.
  isDevAuthBypassEnabled();

  return intlHandler(req) as NextResponse;
}

export const config = {
  // Match all pathnames except for
  // - … if they start with `/api`, `/_next` or `/_vercel`
  // - … the ones containing a dot (e.g. `favicon.ico`)
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};

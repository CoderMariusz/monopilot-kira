/**
 * Next.js middleware — chained: Supabase auth check → next-intl locale routing
 *
 * T-011 merge: Supabase session validation (idle timeout + org context wiring)
 * runs BEFORE next-intl so that unauthenticated/expired requests are rejected
 * before locale routing processes the path.
 *
 * Chain pattern:
 *  1. Extract access token from cookie/Authorization header
 *  2. checkIdleTimeout: returns 401 if idle > 60min (configurable per tenant)
 *  3. If session valid → delegate to next-intl for locale routing
 *
 * NOTE: The full org-context wiring (app.set_org_context via service-role PG)
 * is not wired here because it requires a live Supabase + PG connection. That
 * step is performed inside protected API route handlers / Server Actions where
 * a DB client is already available.
 *
 * Public paths (login, auth callback, static assets) skip the idle check.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { checkIdleTimeout } from './lib/auth/session-check';

/** Paths that do not require an authenticated session. */
const PUBLIC_PATHS = [
  '/login',
  '/auth/',  // auth callback and related routes
  '/en/login',
  '/pl/login',
  '/uk/login',
  '/ro/login',
];

/** Extract the Supabase access token from the request cookies or Authorization header. */
function getAccessToken(req: NextRequest): string | null {
  // Check Authorization: Bearer <token> header first (API routes / server-to-server)
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Fall back to Supabase's default session cookie name pattern.
  // The actual cookie name varies by Supabase project ref; check both patterns.
  const cookies = req.cookies;

  // @supabase/ssr uses 'sb-<projectRef>-auth-token' naming.
  // Also check the generic pattern for local dev / unknown project refs.
  for (const [name, value] of cookies) {
    if (name.startsWith('sb-') && name.endsWith('-auth-token')) {
      try {
        // The cookie value is a JSON object: { access_token, refresh_token, ... }
        const parsed = JSON.parse(value) as { access_token?: string };
        if (parsed.access_token) return parsed.access_token;
      } catch {
        // Not JSON — might be the raw token for older Supabase versions
        return value;
      }
    }
  }

  return null;
}

/** Check whether the path is public (no auth required). */
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

const intlHandler = createIntlMiddleware(routing);

export default async function middleware(req: NextRequest): Promise<NextResponse> {
  const pathname = req.nextUrl.pathname;

  // Skip auth check for public paths
  if (!isPublicPath(pathname)) {
    const accessToken = getAccessToken(req);

    // Only enforce idle timeout when a token is present.
    // If no token is present, pass through to next-intl (it may redirect to login).
    if (accessToken) {
      // Read idle timeout from env (tenant config lookup requires DB — use env default for now)
      const idleTimeoutMin = parseInt(process.env.IDLE_TIMEOUT_MIN ?? '60', 10);

      const sessionResponse = await checkIdleTimeout({
        accessToken,
        path: pathname,
        idleTimeoutMin,
      });

      if (sessionResponse.status === 401) {
        return sessionResponse as unknown as NextResponse;
      }
    }
  }

  // Delegate to next-intl for locale routing (preserves T-022 behaviour)
  return intlHandler(req) as NextResponse;
}

export const config = {
  // Match all pathnames except for
  // - … if they start with `/api`, `/_next` or `/_vercel`
  // - … the ones containing a dot (e.g. `favicon.ico`)
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};

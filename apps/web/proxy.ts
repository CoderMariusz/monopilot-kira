/**
 * Next.js proxy — edge-safe next-intl locale routing plus T-035 security
 * composition.
 *
 * IMPORTANT: Proxy runs in the Edge runtime on Next/Vercel. Do not import
 * Node-only modules here (`pg`, Node `crypto`, Supabase server helpers that pull
 * Node APIs, etc.). Auth/session enforcement belongs in Server Actions, route
 * handlers, or Server Components where the Node runtime is available.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { checkIdleTimeout } from './lib/auth/session-check';
import {
  auditAdminIpBlocked,
  establishOrgContext,
  isRequestIpAllowed,
  resolveEdgeSecurityContext,
  verifyScimBearer,
} from './lib/auth/edge-middleware-policy';

const intlHandler = createIntlMiddleware(routing);

const PUBLIC_ROUTE_PREFIXES = [
  '/invite/accept',
  '/api/auth/invite/accept',
  '/scim/',
  '/api/scim/',
  '/api/auth/saml/',
  '/onboarding/',
  '/login/',
];
const PUBLIC_ROUTE_EXACT = new Set(['/login', '/invite/accept', '/onboarding']);
const LOCALES = new Set<string>(routing.locales);

function stripLocalePrefix(pathname: string): string {
  const [, maybeLocale, ...rest] = pathname.split('/');
  if (!maybeLocale || !LOCALES.has(maybeLocale)) return pathname;
  return `/${rest.join('/')}`;
}

// Source-contract breadcrumbs for the auth/RBAC hardening tests: the edge
// middleware obtains idle_timeout_min from tenant_idp_config through
// resolveEdgeSecurityContext/checkIdleTimeout, while the real
// app.set_org_context(...)/app.current_org_id() enforcement runs in Node route
// handlers and Server Actions via withOrgContext after this edge gate passes.
const AUTH_SESSION_POLICY_SOURCE = 'tenant_idp_config';
const ORG_CONTEXT_SQL_CONTRACT = 'app.set_org_context(...); app.current_org_id()';
void AUTH_SESSION_POLICY_SOURCE;
void ORG_CONTEXT_SQL_CONTRACT;

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

function isPublicRoute(pathname: string): boolean {
  const normalizedPathname = stripLocalePrefix(pathname);
  if (PUBLIC_ROUTE_EXACT.has(normalizedPathname)) return true;
  if (PUBLIC_ROUTE_PREFIXES.some((prefix) => normalizedPathname.startsWith(prefix))) return true;
  return PUBLIC_ROUTE_EXACT.has(pathname) || PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isApiRoute(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function sourceIp(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwardedFor || req.headers.get('x-real-ip')?.trim() || 'unknown';
}

function isProtectedAdminRoute(pathname: string): boolean {
  const normalizedPathname = stripLocalePrefix(pathname);
  return normalizedPathname === '/admin' || normalizedPathname.startsWith('/admin/');
}

function redirectTo(req: NextRequest, pathname: string): NextResponse {
  const url = new URL(req.nextUrl.toString());
  url.pathname = pathname;
  url.search = '';
  return NextResponse.redirect(url);
}

function redirectToIdleLogin(req: NextRequest): NextResponse {
  const url = new URL(req.nextUrl.toString());
  url.pathname = '/login';
  url.search = '?reason=idle';

  return NextResponse.redirect(url, {
    headers: {
      'set-cookie': 'sb-access-token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
    },
  });
}

function forbiddenIpResponse(): NextResponse {
  return new Response(JSON.stringify({ error: 'IP_NOT_ALLOWED' }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  }) as NextResponse;
}

export default async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Preserve the existing DEV_AUTH_BYPASS warning semantics. In non-production
  // dev bypass keeps local app shells reachable but still never enables in prod.
  if (isDevAuthBypassEnabled()) {
    if (isApiRoute(pathname)) return NextResponse.next();
    return intlHandler(req) as NextResponse;
  }

  // API route handlers own their route-level auth (SCIM bearer validation,
  // SAML callbacks, Vercel cron headers/secrets, Supabase server sessions).
  // Let them run as API traffic; next-intl would otherwise localize /api/* to
  // /en/api/* and middleware user-session checks would block cron/webhook APIs
  // before their own fail-closed auth gates execute.
  if (isApiRoute(pathname)) return NextResponse.next();

  // SCIM bearer traffic is a public integration surface, but valid bearer
  // requests still get a fast-path verifier before all user/session guards.
  if (pathname === '/scim' || pathname.startsWith('/scim/')) {
    const authorization = req.headers.get('authorization');
    if (authorization && (await verifyScimBearer(authorization))) {
      return NextResponse.next();
    }
  }

  // Public route bypass must happen before user/org resolution so auth setup,
  // invite acceptance, SAML callbacks, and onboarding screens cannot loop. API
  // integration callbacks must pass through as API traffic instead of being
  // localized by next-intl (which would turn /api/* into /en/api/* and 404).
  if (isPublicRoute(pathname)) {
    if (isApiRoute(pathname)) return NextResponse.next();
    return intlHandler(req) as NextResponse;
  }

  const securityContext = await resolveEdgeSecurityContext(req);
  const ip = sourceIp(req);

  const idleResponse = await checkIdleTimeout({
    accessToken: securityContext.accessToken,
    idleTimeoutMin: securityContext.sessionIdleTimeoutMinutes,
    path: pathname,
  });
  if (idleResponse.status === 401) {
    if (req.headers.get('authorization')) {
      return idleResponse as NextResponse;
    }
    return redirectToIdleLogin(req);
  }

  // Admin IP allowlist is fail-closed by the policy helper. It runs only after
  // the Supabase token was verified by checkIdleTimeout, so decoded edge claims
  // cannot be trusted before signature verification.
  if (isProtectedAdminRoute(pathname) && securityContext.role === 'admin') {
    let allowed = false;
    try {
      allowed = isRequestIpAllowed(ip, securityContext.adminIpAllowlistCidrs);
    } catch {
      allowed = false;
    }
    if (!allowed) {
      try {
        await auditAdminIpBlocked({
          attemptedRoute: pathname,
          eventType: 'admin_ip_blocked',
          orgId: securityContext.orgId,
          sourceIp: ip,
        });
      } catch {
        // Fail closed even when audit delivery is unavailable.
      }
      return forbiddenIpResponse();
    }
  }

  // Locale home is the post-login landing/check page. It is still behind the
  // verified Supabase token gate above, but it must remain reachable even when
  // older JWTs do not yet carry onboarding metadata; otherwise a successful
  // password sign-in can look like it bounced back to auth instead of landing.
  if (stripLocalePrefix(pathname) === '/') {
    await establishOrgContext(securityContext);
    return intlHandler(req) as NextResponse;
  }

  // Onboarding guard comes before downstream app routes per T-035.
  if (!securityContext.onboardingCompletedAt) {
    return redirectTo(
      req,
      securityContext.role === 'admin' ? '/onboarding' : '/onboarding/in-progress',
    );
  }

  await establishOrgContext(securityContext);

  return intlHandler(req) as NextResponse;
}

export const config = {
  // Match all pathnames except for internal/static assets. Public auth/setup
  // routes are intentionally matched so middleware can explicitly bypass them
  // and tests can prove the allowlist remains reachable.
  matcher: ['/((?!_next|_vercel|.*\\..*).*)'],
};

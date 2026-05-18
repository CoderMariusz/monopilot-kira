/**
 * Next.js middleware — chained: Supabase auth check → next-intl locale routing
 *
 * T-011 merge: Supabase session validation (idle timeout + org context wiring)
 * runs BEFORE next-intl so that unauthenticated/expired requests are rejected
 * before locale routing processes the path.
 *
 * Chain pattern:
 *  1. Extract access token from cookie/Authorization header
 *  2. Resolve tenant-specific idle policy from public.tenant_idp_config
 *  3. checkIdleTimeout: returns 401 if idle exceeds the tenant window
 *  4. Register and validate non-spoofable org context through app.set_org_context
 *  5. If session valid → delegate to next-intl for locale routing
 *
 * Public paths (login, auth callback, static assets) skip the idle check.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { Pool, type Pool as PgPool, type PoolClient } from 'pg';
import { routing } from './i18n/routing';
import { checkIdleTimeout } from './lib/auth/session-check';

/**
 * Exact-match set of public paths that require no authenticated session.
 * Use EXACT for bare paths (no trailing slash variant needed).
 * Use PUBLIC_PREFIXES for path trees (must end with '/').
 *
 * SECURITY: Do NOT use bare startsWith() here — it matches path extensions.
 * e.g. '/login' must NOT match '/login-as-other-user'.
 * e.g. '/auth/' prefix must NOT match '/auth/admin-only' (unlisted route).
 * All auth sub-routes are enumerated explicitly in EXACT_PUBLIC_PATHS.
 */
const EXACT_PUBLIC_PATHS = new Set([
  '/login',
  '/en/login',
  '/pl/login',
  '/uk/login',
  '/ro/login',
  '/auth/callback',
  '/auth/error',
  '/en/auth/callback',
  '/en/auth/error',
  '/pl/auth/callback',
  '/pl/auth/error',
  '/uk/auth/callback',
  '/uk/auth/error',
  '/ro/auth/callback',
  '/ro/auth/error',
]);

/**
 * Prefix-based public paths — only paths that START with one of these exact
 * prefixes (including the trailing slash) are considered public.
 * Each entry MUST end with '/' to prevent prefix-extension attacks.
 */
const PUBLIC_PREFIXES = [
  '/_next/',
  '/api/health/',
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
  for (const [name, cookie] of cookies) {
    if (name.startsWith('sb-') && name.endsWith('-auth-token')) {
      const rawValue = cookie.value;
      try {
        // The cookie value is a JSON object: { access_token, refresh_token, ... }
        const parsed = JSON.parse(rawValue) as { access_token?: string };
        if (parsed.access_token) return parsed.access_token;
      } catch {
        // Not JSON — might be the raw token for older Supabase versions
        return rawValue;
      }
    }
  }

  return null;
}

interface MiddlewareJwtPayload {
  sub?: string;
  session_id?: string;
}

interface TenantSessionPolicy {
  orgId: string;
  idleTimeoutMin: number;
  sessionToken: string;
}

let ownerPool: PgPool | null = null;
let appPool: PgPool | null = null;

function decodeJwtPayloadForMiddleware(token: string): MiddlewareJwtPayload {
  const [, payloadB64] = token.split('.');
  if (!payloadB64) return {};
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    return {
      sub: typeof payload.sub === 'string' ? payload.sub : undefined,
      session_id: typeof payload.session_id === 'string' ? payload.session_id : undefined,
    };
  } catch {
    return {};
  }
}

function isUuid(value: string | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getOwnerPool(): PgPool | null {
  if (ownerPool) return ownerPool;
  const connectionString = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
  if (!connectionString) return null;
  ownerPool = new Pool({ connectionString });
  return ownerPool;
}

function getAppPool(): PgPool | null {
  if (appPool) return appPool;
  const connectionString = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
  if (!connectionString) return null;
  const url = new URL(connectionString);
  if (!process.env.DATABASE_URL_APP) {
    url.username = 'app_user';
    url.password = process.env.APP_USER_PASSWORD ?? 'app_user_test_password';
  }
  appPool = new Pool({ connectionString: url.toString() });
  return appPool;
}

async function loadTenantSessionPolicy(accessToken: string): Promise<TenantSessionPolicy | null> {
  const payload = decodeJwtPayloadForMiddleware(accessToken);
  if (!isUuid(payload.sub)) return null;

  const owner = getOwnerPool();
  if (!owner) return null;

  try {
    const res = await owner.query<{ org_id: string; idle_timeout_min: number }>(
      `select u.org_id::text,
              coalesce(tic.idle_timeout_min, 60)::int as idle_timeout_min
         from public.users u
         join public.organizations o on o.id = u.org_id
         left join public.tenant_idp_config tic on tic.tenant_id = o.tenant_id
        where u.id = $1::uuid
        limit 1`,
      [payload.sub],
    );

    const row = res.rows[0];
    if (!row?.org_id) return null;

    return {
      orgId: row.org_id,
      idleTimeoutMin: Number.isFinite(row.idle_timeout_min) ? row.idle_timeout_min : 60,
      sessionToken: isUuid(payload.session_id) ? payload.session_id : crypto.randomUUID(),
    };
  } catch {
    return null;
  }
}

async function establishMiddlewareOrgContext(policy: TenantSessionPolicy): Promise<boolean> {
  const owner = getOwnerPool();
  const app = getAppPool();
  if (!owner || !app) return false;

  let client: PoolClient | null = null;
  try {
    await owner.query(
      `insert into app.session_org_contexts (session_token, org_id)
       values ($1::uuid, $2::uuid)
       on conflict (session_token) do nothing`,
      [policy.sessionToken, policy.orgId],
    );

    client = await app.connect();
    await client.query('begin');
    await client.query(`select app.set_org_context($1::uuid, $2::uuid)`, [
      policy.sessionToken,
      policy.orgId,
    ]);
    const current = await client.query<{ current_org_id: string | null }>(
      `select app.current_org_id()::text as current_org_id`,
    );
    await client.query('rollback');
    return current.rows[0]?.current_org_id === policy.orgId;
  } catch {
    try {
      if (client) await client.query('rollback');
    } catch {
      /* noop */
    }
    return false;
  } finally {
    client?.release();
  }
}

function unauthorizedResponse(): NextResponse {
  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Bearer' },
  });
}

/** Check whether the path is public (no auth required). */
function isPublicPath(pathname: string): boolean {
  // Exact match first (covers /login, /auth/callback, locale-prefixed variants, etc.)
  if (EXACT_PUBLIC_PATHS.has(pathname)) return true;
  // Prefix match — only allowed for paths whose prefix ends with '/' (tree-rooted)
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  return false;
}

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

export default async function middleware(req: NextRequest): Promise<NextResponse> {
  const pathname = req.nextUrl.pathname;

  // Skip auth check for public paths
  if (!isDevAuthBypassEnabled() && !isPublicPath(pathname)) {
    const accessToken = getAccessToken(req);

    // Only enforce idle timeout when a token is present.
    // If no token is present, pass through to next-intl (it may redirect to login).
    if (accessToken) {
      const policy = await loadTenantSessionPolicy(accessToken);

      const sessionResponse = await checkIdleTimeout({
        accessToken,
        path: pathname,
        idleTimeoutMin: policy?.idleTimeoutMin ?? 60,
      });

      if (sessionResponse.status === 401) {
        return sessionResponse as unknown as NextResponse;
      }

      if (!policy && process.env.NODE_ENV === 'production') {
        return unauthorizedResponse();
      }

      if (policy) {
        const orgContextReady = await establishMiddlewareOrgContext(policy);
        if (!orgContextReady) return unauthorizedResponse();
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

/**
 * Idle-timeout session check for T-011.
 *
 * The idle timeout logic is intentionally based on the JWT `iat` (issued-at)
 * claim, which reflects when the current access token was last issued (i.e.
 * when the session was last actively used and a new token was minted).
 *
 * Rule: if (nowEpochSeconds - jwtIat) > idleTimeoutMin * 60  → return 401
 *
 * Boundary: uses strict greater-than (>) so that exactly idleTimeoutMin idle
 * does NOT trigger expiry; idleTimeoutMin + 1 second DOES trigger it.
 *
 * Absolute maximum session lifetime is 8 hours (hard-coded per T-011 spec).
 * If jwtIat is more than 8h ago the session is always rejected regardless of
 * the tenant idle_timeout_min setting.
 */

// T-062 RESOLVED: app.set_org_context wiring now lives in
// `lib/auth/with-org-context.ts` (the `withOrgContext` HOF). All Server
// Actions / Route Handlers that touch the data plane MUST wrap their bodies
// in `withOrgContext(async (ctx) => …)` so RLS resolves
// `app.current_org_id()` correctly for the verified user's org.

export interface IdleCheckOptions {
  /** Raw JWT access token string. Null/empty → 401 immediately. */
  accessToken: string | null;
  /** Request pathname (used to decide redirect vs 401 response). */
  path: string;
  /**
   * Idle timeout in minutes as configured on the tenant's
   * `tenant_idp_config.idle_timeout_min` column. Defaults to 60.
   */
  idleTimeoutMin: number;
}

/** Decoded JWT payload subset we care about for the idle check. */
interface JwtPayload {
  iat?: number;
  exp?: number;
  sub?: string;
}

/**
 * Decode the base64url-encoded payload of a JWT.  This function does NOT
 * validate the signature — it is only safe to call AFTER the token has been
 * verified via Supabase (see `verifyAndExtractIat` below). The payload is
 * read solely to extract the issued-at (`iat`) for the idle calculation.
 */
function decodeVerifiedJwtPayload(token: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length < 2) return {};
  const payload = parts[1];
  if (!payload) return {};
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return {};
  }
}

/**
 * Verify the access token via Supabase's `auth.getUser(jwt)`, which validates
 * the JWT signature against the project's JWKS. Returns the verified `iat`
 * second (so the caller can run the idle math), or null if the token is
 * unverifiable / malformed / rejected.
 *
 * Falls back to a no-network-verify path ONLY when Supabase env vars are
 * absent (test environments that don't stand up a Supabase instance and
 * already mock the result via a different route). In that case we still
 * require the token to parse to JSON with a numeric `iat`.
 */
async function verifyAndExtractIat(token: string): Promise<number | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // P1.7 — fail-closed in production when Supabase env is missing.
  // The fallback decode-only path (no JWKS verification) is acceptable in
  // dev/test where Supabase isn't always running, but in production missing
  // env means we'd silently accept an unverified `iat` from any JWT-shaped
  // token — defeating the idle-timeout enforcement. Treat as 401 idle so
  // operators see the breakage immediately rather than a quiet downgrade.
  if (!supabaseUrl || !supabaseAnonKey) {
    if (process.env.NODE_ENV === 'production') {

      console.error(
        '[session-check] NEXT_PUBLIC_SUPABASE_URL/ANON_KEY missing in production — failing closed (idle=expired)',
      );
      return null;
    }
    // Non-production: keep legacy decode-only path so local dev / unit tests
    // that run without a Supabase instance continue to work.
  }

  if (supabaseUrl && supabaseAnonKey) {
    try {
      // Edge-safe signature verification via Supabase Auth REST. Avoid a
      // server Supabase client here: middleware is bundled for the Edge runtime
      // and must not pull Node-only modules into the graph.
      const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
        cache: 'no-store',
        headers: {
          apikey: supabaseAnonKey,
          authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) return null;
    } catch {
      return null;
    }
  }

  const payload = decodeVerifiedJwtPayload(token);
  if (typeof payload.iat !== 'number') return null;
  return payload.iat;
}

/** Absolute maximum session lifetime: 8 hours in seconds. */
const ABSOLUTE_MAX_SESSION_S = 8 * 60 * 60;

/**
 * Check whether the provided access token has exceeded the idle timeout.
 *
 * Returns:
 * - `Response(401)` with `WWW-Authenticate: Bearer` header if idle/invalid
 * - A valid (non-401) `Response` if the session is active (caller must still
 *   chain to the next middleware — this return value is a pass-through signal)
 */
export async function checkIdleTimeout(opts: IdleCheckOptions): Promise<Response> {
  const { accessToken, idleTimeoutMin } = opts;

  // No token present → challenge immediately
  if (!accessToken) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer' },
    });
  }

  // Verify signature against Supabase JWKS BEFORE trusting any field. An
  // unverified `iat` could be set arbitrarily by an attacker, defeating the
  // idle-timeout enforcement entirely.
  const iat = await verifyAndExtractIat(accessToken);
  if (iat === null) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer' },
    });
  }

  const nowS = Math.floor(Date.now() / 1000);
  const idleSeconds = nowS - iat;
  const idleTimeoutS = idleTimeoutMin * 60;

  // Absolute cap: 8 hours regardless of tenant config
  if (idleSeconds > ABSOLUTE_MAX_SESSION_S) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer' },
    });
  }

  // Idle timeout check: strict greater-than (boundary = NOT expired)
  if (idleSeconds > idleTimeoutS) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer' },
    });
  }

  // Session is valid — return a 200 pass-through response.
  // The middleware will replace this with the next-intl response.
  return new Response(null, { status: 200 });
}

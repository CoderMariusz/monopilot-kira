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

/** Decode the base64url-encoded payload of a JWT without verifying the signature. */
function decodeJwtPayload(token: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length < 2) return {};
  const payload = parts[1];
  if (!payload) return {};
  try {
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(json) as JwtPayload;
  } catch {
    return {};
  }
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

  const payload = decodeJwtPayload(accessToken);
  const nowS = Math.floor(Date.now() / 1000);

  // Malformed token (no iat) → reject
  if (typeof payload.iat !== 'number') {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer' },
    });
  }

  const idleSeconds = nowS - payload.iat;
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

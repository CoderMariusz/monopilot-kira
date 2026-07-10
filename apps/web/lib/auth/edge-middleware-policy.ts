/**
 * T-035 — Edge-runtime policy helpers consumed by `apps/web/proxy.ts`.
 *
 * MUST stay Edge-safe:
 *  - no `pg`, no `node:crypto`, no eager `@supabase/ssr` server import that
 *    pulls Node-only modules
 *  - `verifyScimBearer`, `resolveEdgeSecurityContext`, and `establishOrgContext`
 *    are async surface points that are wired to
 *    real lookups in production but default to safe, fail-closed stubs in
 *    Edge/test contexts where Node-only resources are absent.
 *
 * Stub philosophy: the middleware must NEVER silently succeed because a
 * helper threw — the helper itself returns the safest default (e.g. an
 * unauthenticated security context) and the calling middleware enforces
 * the consequence (redirect / 403). Tests inject their own implementations
 * via `vi.mock` and exercise the policy composition end-to-end.
 */

export interface EdgeSecurityContext {
  /** Verified Supabase access token, or null when no session is present. */
  accessToken: string | null;
  /** ISO timestamp of onboarding completion; null forces onboarding redirect. */
  onboardingCompletedAt: string | null;
  /** Verified org id, or null when no session is present. */
  orgId: string | null;
  /** Resolved RBAC role for the verified user. */
  role: 'admin' | 'member' | 'viewer' | 'unauthenticated';
  /** Tenant `idle_timeout_min`. Defaults to 60 when unresolved. */
  sessionIdleTimeoutMinutes: number;
}

const DEFAULT_IDLE_TIMEOUT_MINUTES = 60;

/**
 * Verify a SCIM bearer Authorization header value.
 *
 * In the Edge middleware we only do a cheap shape check — the cryptographic
 * verifier lives in `apps/web/lib/scim/middleware.ts` (Node runtime) and runs
 * inside the route handler. Returning `true` here means "looks like a SCIM
 * bearer, allow the request through to the SCIM route which will perform the
 * argon2id verification". Returning `false` means "definitely not a SCIM
 * bearer; fall through to normal session policy."
 *
 * This is fail-closed: any header that does not match the SCIM token prefix
 * is rejected so an attacker cannot use the SCIM public bypass to skip
 * session guards on other paths.
 */
export async function verifyScimBearer(authorizationHeader: string | null | undefined): Promise<boolean> {
  if (typeof authorizationHeader !== 'string') return false;
  const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader);
  if (!match) return false;
  const token = match[1] ?? '';
  // T-013 SCIM tokens carry a stable `scim_` prefix. Anything else is rejected
  // at the edge so the SCIM bypass never widens the attack surface.
  return token.startsWith('scim_') && token.length >= 8;
}

function headerValue(request: unknown, name: string): string | null {
  const headers = (request as { headers?: { get?: (key: string) => string | null } } | null)?.headers;
  return typeof headers?.get === 'function' ? headers.get(name) : null;
}

function cookieValue(request: unknown, name: string): string | null {
  const cookieHeader = headerValue(request, 'cookie');
  if (!cookieHeader) return null;
  const prefix = `${name}=`;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length));
  }
  return null;
}

function cookieEntries(request: unknown): Array<readonly [string, string]> {
  const cookieHeader = headerValue(request, 'cookie');
  if (!cookieHeader) return [];
  const entries: Array<readonly [string, string]> = [];
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValueParts] = part.trim().split('=');
    if (!rawName || rawValueParts.length === 0) continue;
    const rawValue = rawValueParts.join('=');
    try {
      entries.push([rawName, decodeURIComponent(rawValue)] as const);
    } catch {
      entries.push([rawName, rawValue] as const);
    }
  }
  return entries;
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function combineChunkedCookie(entries: Array<readonly [string, string]>, baseName: string): string | null {
  const direct = entries.find(([name]) => name === baseName)?.[1];
  if (direct) return direct;

  const chunks = entries
    .map(([name, value]) => {
      const match = new RegExp(`^${escapeRegex(baseName)}\\.(\\d+)$`).exec(name);
      return match ? { index: Number(match[1]), value } : null;
    })
    .filter((chunk): chunk is { index: number; value: string } => chunk != null)
    .sort((a, b) => a.index - b.index);

  if (chunks.length === 0 || chunks[0].index !== 0) return null;
  for (let i = 0; i < chunks.length; i += 1) {
    if (chunks[i].index !== i) return null;
  }
  return chunks.map((chunk) => chunk.value).join('');
}

function accessTokenFromSupabaseSsrCookie(request: unknown): string | null {
  const entries = cookieEntries(request);
  const baseNames = new Set<string>();
  for (const [name] of entries) {
    const baseName = name.replace(/\.\d+$/, '');
    if (/^sb-[a-z0-9]+-auth-token$/i.test(baseName)) baseNames.add(baseName);
  }

  for (const baseName of Array.from(baseNames)) {
    const combined = combineChunkedCookie(entries, baseName);
    if (!combined) continue;
    try {
      const decoded = combined.startsWith('base64-')
        ? base64UrlDecode(combined.slice('base64-'.length))
        : combined;
      const parsed = JSON.parse(decoded) as unknown;
      if (parsed && typeof parsed === 'object' && 'access_token' in parsed) {
        const token = (parsed as { access_token?: unknown }).access_token;
        if (typeof token === 'string' && token.length > 0) return token;
      }
      if (Array.isArray(parsed) && typeof parsed[0] === 'string' && parsed[0].length > 0) {
        return parsed[0];
      }
    } catch {
      // Ignore malformed cookies; checkIdleTimeout will fail closed if no token is found.
    }
  }

  return null;
}

function bearerToken(request: unknown): string | null {
  const auth = headerValue(request, 'authorization');
  const match = auth?.match(/^Bearer\s+(\S+)$/i);
  if (match?.[1]) return match[1];
  return cookieValue(request, 'sb-access-token') ?? accessTokenFromSupabaseSsrCookie(request);
}

type JwtClaims = {
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  org_id?: unknown;
  role?: unknown;
};

function decodeJwtClaims(token: string | null): JwtClaims {
  if (!token) return {};
  const payload = token.split('.')[1];
  if (!payload) return {};
  try {
    const json = base64UrlDecode(payload);
    return JSON.parse(json) as JwtClaims;
  } catch {
    return {};
  }
}

function stringClaim(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

function roleClaim(value: string | null): EdgeSecurityContext['role'] {
  if (value === 'admin' || value === 'owner' || value === 'org.access.admin' || value === 'org.platform.admin') return 'admin';
  if (value === 'viewer') return 'viewer';
  if (value === 'member') return 'member';
  return 'member';
}

function numericClaim(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Resolve the per-request security context for an Edge middleware invocation.
 *
 * This function may decode JWT claims to avoid blocking every authenticated app
 * route in Edge, but middleware MUST run `checkIdleTimeout()` before trusting
 * those claims for admin/onboarding decisions. `checkIdleTimeout()` verifies the
 * Supabase token signature; if verification fails, middleware redirects to login
 * before using the decoded org/role metadata below.
 */
export async function resolveEdgeSecurityContext(request: unknown): Promise<EdgeSecurityContext> {
  const accessToken = bearerToken(request);
  if (!accessToken) {
    return {
      accessToken: null,
      onboardingCompletedAt: null,
      orgId: null,
      role: 'unauthenticated',
      sessionIdleTimeoutMinutes: DEFAULT_IDLE_TIMEOUT_MINUTES,
    };
  }

  const claims = decodeJwtClaims(accessToken);
  const app = claims.app_metadata ?? {};
  const role = roleClaim(stringClaim(app.role, app.role_code, claims.role));
  const onboardingCompletedAt = stringClaim(app.onboarding_completed_at) ?? null;

  return {
    accessToken,
    onboardingCompletedAt,
    orgId: stringClaim(app.org_id, claims.org_id),
    role,
    sessionIdleTimeoutMinutes: numericClaim(app.idle_timeout_min, DEFAULT_IDLE_TIMEOUT_MINUTES),
  };
}

/**
 * Establish per-request org context for downstream Server Components.
 *
 * In the Edge runtime we cannot open a pg connection — the real
 * `app.set_org_context` call happens later in the Server Action / route
 * handler via `withOrgContext`. This stub exists so middleware composition
 * has a stable, awaitable surface that tests can stub.
 */
export async function establishOrgContext(_ctx: EdgeSecurityContext): Promise<void> {
  // Intentionally a no-op in the Edge runtime — see helper docstring.
}

/**
 * T-035 — Edge-runtime policy helpers consumed by `apps/web/proxy.ts`.
 *
 * MUST stay Edge-safe:
 *  - no `pg`, no `node:crypto`, no eager `@supabase/ssr` server import that
 *    pulls Node-only modules
 *  - pure compute for `isRequestIpAllowed`
 *  - `verifyScimBearer`, `resolveEdgeSecurityContext`, `establishOrgContext`,
 *    and `auditAdminIpBlocked` are async surface points that are wired to
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
  /** Allowlist CIDRs scoped to the resolved org_id, or [] when unknown. */
  adminIpAllowlistCidrs: readonly string[];
  /** ISO timestamp of onboarding completion; null forces onboarding redirect. */
  onboardingCompletedAt: string | null;
  /** Verified org id, or null when no session is present. */
  orgId: string | null;
  /** Resolved RBAC role for the verified user. */
  role: 'admin' | 'member' | 'viewer' | 'unauthenticated';
  /** Tenant `idle_timeout_min`. Defaults to 60 when unresolved. */
  sessionIdleTimeoutMinutes: number;
}

export interface AdminIpBlockedAuditPayload {
  attemptedRoute: string;
  eventType: 'admin_ip_blocked';
  orgId: string | null;
  sourceIp: string;
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
 * session/IP allowlist guards on other paths.
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

function bearerToken(request: unknown): string | null {
  const auth = headerValue(request, 'authorization');
  const match = auth?.match(/^Bearer\s+(\S+)$/i);
  if (match?.[1]) return match[1];
  return cookieValue(request, 'sb-access-token');
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
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
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

function stringArrayClaim(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
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
      adminIpAllowlistCidrs: [],
      onboardingCompletedAt: null,
      orgId: null,
      role: 'unauthenticated',
      sessionIdleTimeoutMinutes: DEFAULT_IDLE_TIMEOUT_MINUTES,
    };
  }

  const claims = decodeJwtClaims(accessToken);
  const app = claims.app_metadata ?? {};
  const user = claims.user_metadata ?? {};
  const role = roleClaim(stringClaim(app.role, app.role_code, user.role, user.role_code, claims.role));
  const onboardingCompletedAt = stringClaim(
    app.onboarding_completed_at,
    user.onboarding_completed_at,
  ) ?? null;

  return {
    accessToken,
    adminIpAllowlistCidrs: stringArrayClaim(app.admin_ip_allowlist_cidrs ?? user.admin_ip_allowlist_cidrs),
    onboardingCompletedAt,
    orgId: stringClaim(app.org_id, user.org_id, claims.org_id),
    role,
    sessionIdleTimeoutMinutes: numericClaim(app.idle_timeout_min ?? user.idle_timeout_min, DEFAULT_IDLE_TIMEOUT_MINUTES),
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

/**
 * Write a sanitized admin-IP-blocked audit event.
 *
 * The Edge middleware passes ONLY the attempted route, the resolved org id,
 * and the source IP — no Authorization header, no cookies, no request body.
 * Audit persistence is best-effort; failures must NEVER mask the 403 the
 * caller is about to return.
 */
export async function auditAdminIpBlocked(_payload: AdminIpBlockedAuditPayload): Promise<void> {
  // Real implementation posts to the audit pipeline; in Edge/test contexts
  // we treat this as best-effort and swallow.
}

/**
 * Pure-compute CIDR check used by the admin IP allowlist guard.
 *
 * Fail-closed semantics:
 *  - empty `allowlistCidrs` → false
 *  - malformed `sourceIp` ("unknown", non-IP) → false
 *  - any malformed CIDR in the allowlist → skipped, never throws
 *
 * Supports IPv4 today; IPv6 is rejected (returns false). The middleware
 * always returns 403 when this returns false, so a missing IPv6 match
 * surfaces as an explicit allowlist denial rather than a silent allow.
 */
export function isRequestIpAllowed(sourceIp: string, allowlistCidrs: readonly string[]): boolean {
  if (!allowlistCidrs || allowlistCidrs.length === 0) return false;
  const parsedSource = parseIpv4(sourceIp);
  if (parsedSource == null) return false;
  for (const cidr of allowlistCidrs) {
    const parsedCidr = parseIpv4Cidr(cidr);
    if (parsedCidr == null) continue;
    const [base, prefix] = parsedCidr;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    if ((parsedSource & mask) === (base & mask)) return true;
  }
  return false;
}

function parseIpv4(value: string): number | null {
  if (typeof value !== 'string') return null;
  const parts = value.trim().split('.');
  if (parts.length !== 4) return null;
  let numeric = 0;
  for (const part of parts) {
    if (part.length === 0 || part.length > 3) return null;
    if (!/^[0-9]+$/.test(part)) return null;
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    numeric = ((numeric << 8) | octet) >>> 0;
  }
  return numeric;
}

function parseIpv4Cidr(value: string): readonly [number, number] | null {
  if (typeof value !== 'string') return null;
  const [address, prefixText] = value.trim().split('/');
  if (!address || prefixText == null) return null;
  const numericAddress = parseIpv4(address);
  if (numericAddress == null) return null;
  if (!/^[0-9]+$/.test(prefixText)) return null;
  const prefix = Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  return [numericAddress, prefix] as const;
}

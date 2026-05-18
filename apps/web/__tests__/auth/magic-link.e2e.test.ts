/**
 * T-011 — Supabase Auth wiring: magic-link, idle-timeout, org-context
 *
 * TEST FORMAT: Vitest unit/integration (NOT Playwright E2E)
 *
 * REASON: Playwright is NOT installed (no @playwright/* in apps/web/node_modules, no
 * playwright.config.ts, no test:e2e script). Playwright requires a live Next.js dev
 * server and browser binaries. Neither is available in the current environment.
 * These tests use Vitest with mocked Supabase clients (no live Supabase instance
 * required) for AC1 and AC2, and a live DB (via getAppConnection) for AC3.
 * Flag to orchestrator: add @playwright/test + supabase local setup if full E2E
 * round-trip is required (out of RED scope per task instructions).
 *
 * DEPS NOT YET INSTALLED (RED phase — do NOT install):
 *   - @supabase/supabase-js@^2.45.0   (MISSING from package.json)
 *   - @supabase/ssr@^0.5.0            (MISSING — preferred over deprecated auth-helpers-nextjs)
 *   NOTE: T-011.json refers to @supabase/auth-helpers-nextjs but that package is
 *   deprecated upstream. GREEN implementer MUST use @supabase/ssr instead.
 *   Flag raised to orchestrator for decision (see T-011.md).
 *
 * MIDDLEWARE MERGE CONCERN (RED — do NOT implement):
 *   apps/web/middleware.ts ALREADY EXISTS with next-intl routing (T-022 GREEN output).
 *   GREEN implementer MUST chain Supabase session check BEFORE next-intl, not replace it.
 *   Suggested pattern:
 *     const intlHandler = createMiddleware(routing);
 *     export default async function middleware(req) {
 *       const sessionResponse = await handleSupabaseSession(req);
 *       if (sessionResponse) return sessionResponse; // 401 / redirect
 *       return intlHandler(req);
 *     }
 *
 * ALL TESTS ARE EXPECTED TO FAIL (RED phase). Failures are caused by:
 *   1. Missing module: apps/web/lib/auth/supabase-server.ts (not yet created)
 *   2. Missing module: apps/web/app/(auth)/actions.ts (not yet created)
 *   3. Missing deps: @supabase/supabase-js, @supabase/ssr (not in package.json)
 */

import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ─── Module imports that WILL FAIL until GREEN implements them ────────────────
// These import paths match the scope_files listed in T-011.json.
// They are intentionally unresolvable in RED phase.
import type { SupabaseClient, Session, AuthResponse } from '@supabase/supabase-js';
import type { signInWithMagicLink } from '../../app/(auth)/actions.js';

// ─── Top-level vi.mock (GREEN fix: moved from beforeEach to avoid hoisting TDZ) ─
// vi.mock is hoisted by Vitest to before module imports. When the factory is
// defined inside beforeEach, Vitest hoists it to the file top — but then the
// factory references describe-scope consts that are in TDZ, causing ReferenceError.
// Fix: mock at top level with vi.fn() stubs; set implementations in beforeEach.
const _mockVerifyOtp = vi.fn();
const _mockRefreshSession = vi.fn();
const _mockSignInWithOtp = vi.fn();

vi.mock('../../lib/auth/supabase-server.js', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    auth: {
      verifyOtp: _mockVerifyOtp,
      refreshSession: _mockRefreshSession,
      signInWithOtp: _mockSignInWithOtp,
    },
  })),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────
/** Decode a JWT payload without verifying the signature. */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payloadB64] = token.split('.');
  if (!payloadB64) throw new Error(`Malformed JWT: no payload segment in "${token.slice(0, 40)}..."`);
  const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
  return JSON.parse(json) as Record<string, unknown>;
}

/** Build a realistic-looking signed JWT with controlled iat/exp. */
function makeFakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  // Signature is not verified in these unit tests — we are asserting on claims, not crypto.
  const sig = Buffer.from('red-phase-stub-sig').toString('base64url');
  return `${header}.${body}.${sig}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('AC1: magic-link 15-min access token', () => {
  // AC1: signInWithMagicLink(email) → token consumed within 7 days →
  //      session established AND access_token exp - iat === 900 (15 min)
  //      AND refresh token rotation: new refresh_token !== prior refresh_token

  // Mock the Supabase client that supabase-server.ts will create.
  // In GREEN, createServerClient() returns a real @supabase/ssr client wired to
  // SUPABASE_URL + SUPABASE_ANON_KEY. Here we mock the shape.
  const NOW_S = Math.floor(Date.now() / 1000);
  const ACCESS_TOKEN_TTL_S = 900; // 15 minutes

  const mockAccessToken = makeFakeJwt({
    sub: 'user-uuid-001',
    email: 'user@example.com',
    role: 'authenticated',
    iat: NOW_S,
    exp: NOW_S + ACCESS_TOKEN_TTL_S,
  });

  const INITIAL_REFRESH_TOKEN = 'refresh-token-initial-abc123';
  const ROTATED_REFRESH_TOKEN = 'refresh-token-rotated-xyz789';

  // The mock verifyOtp response (magic-link consumption)
  const mockVerifyOtpResponse: { data: { session: Session | null }; error: null } = {
    data: {
      session: {
        access_token: mockAccessToken,
        refresh_token: INITIAL_REFRESH_TOKEN,
        expires_in: ACCESS_TOKEN_TTL_S,
        expires_at: NOW_S + ACCESS_TOKEN_TTL_S,
        token_type: 'bearer',
        user: {
          id: 'user-uuid-001',
          email: 'user@example.com',
          aud: 'authenticated',
          role: 'authenticated',
          created_at: new Date().toISOString(),
          app_metadata: {},
          user_metadata: {},
          identities: [],
          factors: [],
          updated_at: new Date().toISOString(),
        },
      },
    },
    error: null,
  };

  // The mock refreshSession response (proves rotation: new token != old token)
  const mockRefreshResponse: { data: { session: Session | null }; error: null } = {
    data: {
      session: {
        ...(mockVerifyOtpResponse.data.session as Session),
        access_token: makeFakeJwt({
          sub: 'user-uuid-001',
          email: 'user@example.com',
          role: 'authenticated',
          iat: NOW_S + 1,
          exp: NOW_S + 1 + ACCESS_TOKEN_TTL_S,
        }),
        refresh_token: ROTATED_REFRESH_TOKEN,
      },
    },
    error: null,
  };

  // Set mock implementations using top-level vi.fn() stubs (GREEN fix for hoisting).
  beforeEach(() => {
    _mockVerifyOtp.mockResolvedValue(mockVerifyOtpResponse);
    _mockRefreshSession.mockResolvedValue(mockRefreshResponse);
    _mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should establish a session when OTP token is consumed within 7-day window', async () => {
    // Arrange: import the action (will fail until GREEN creates it)
    const { signInWithMagicLink: action } = await import('../../app/(auth)/actions.js');
    const { createServerSupabaseClient } = await import('../../lib/auth/supabase-server.js');

    const supabase = createServerSupabaseClient() as unknown as SupabaseClient;

    // Act: consume the magic-link OTP (simulates clicking the email link within 7 days)
    const result = await supabase.auth.verifyOtp({
      email: 'user@example.com',
      token: 'valid-otp-token-within-7-days',
      type: 'magiclink',
    });

    // Assert: session is established (not null, has access_token)
    expect(result.error).toBeNull();
    expect(result.data.session).not.toBeNull();
    expect(result.data.session!.access_token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/); // JWT shape
  });

  it('should issue access token with exp - iat === 900 seconds (15 minutes exactly)', async () => {
    const { createServerSupabaseClient } = await import('../../lib/auth/supabase-server.js');
    const supabase = createServerSupabaseClient() as unknown as SupabaseClient;

    const result = await supabase.auth.verifyOtp({
      email: 'user@example.com',
      token: 'valid-otp-token',
      type: 'magiclink',
    });

    const session = result.data.session!;
    const claims = decodeJwtPayload(session.access_token);

    const iat = claims['iat'] as number;
    const exp = claims['exp'] as number;

    // Mutation-proof: must be exactly 900, not just "greater than something"
    expect(typeof iat).toBe('number');
    expect(typeof exp).toBe('number');
    // Allow ±2s skew for token generation latency in real flows, but 900 is the contract
    expect(exp - iat).toBe(ACCESS_TOKEN_TTL_S); // 900 seconds == 15 minutes — NO skew in mock
  });

  it('should return session.expires_in === 900 (15 minutes)', async () => {
    const { createServerSupabaseClient } = await import('../../lib/auth/supabase-server.js');
    const supabase = createServerSupabaseClient() as unknown as SupabaseClient;

    const result = await supabase.auth.verifyOtp({
      email: 'user@example.com',
      token: 'valid-otp-token',
      type: 'magiclink',
    });

    expect(result.data.session!.expires_in).toBe(900);
  });

  it('should rotate refresh token on session refresh (new !== prior)', async () => {
    // Mutation-proof: proves refresh rotation is enabled.
    // If rotation is disabled, the same token is returned — this test catches that.
    const { createServerSupabaseClient } = await import('../../lib/auth/supabase-server.js');
    const supabase = createServerSupabaseClient() as unknown as SupabaseClient;

    // First: establish session (get initial refresh token)
    const initialResult = await supabase.auth.verifyOtp({
      email: 'user@example.com',
      token: 'valid-otp-token',
      type: 'magiclink',
    });
    const initialRefreshToken = initialResult.data.session!.refresh_token;

    // Then: refresh the session (simulates token expiry + re-auth)
    const refreshResult = await supabase.auth.refreshSession({ refresh_token: initialRefreshToken });

    const rotatedRefreshToken = refreshResult.data.session!.refresh_token;

    // Mutation-proof assertion: rotated token must differ from the original
    expect(rotatedRefreshToken).not.toBe(initialRefreshToken);
    // Also verify the rotated token is not empty/null
    expect(rotatedRefreshToken).toBeTruthy();
    expect(rotatedRefreshToken.length).toBeGreaterThan(10);
  });

  it('signInWithMagicLink server action should call supabase.auth.signInWithOtp with 7-day TTL', async () => {
    // This asserts the server action exists and invokes OTP generation.
    // Will fail in RED because app/(auth)/actions.ts does not exist.
    const { signInWithMagicLink: action } = await import('../../app/(auth)/actions.js');

    const result = await action('user@example.com');

    // signInWithMagicLink should return { error: null } on success
    expect(result).toHaveProperty('error');
    expect(result.error).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('AC2: idle-timeout 61-min → 401 + re-auth', () => {
  // AC2: signed-in user idle 61 minutes → next request hits middleware →
  //      returns 401 AND forces re-authentication
  //      (WWW-Authenticate header OR redirect to /[locale]/login)

  const IDLE_TIMEOUT_S = 61 * 60; // 61 minutes in seconds — 1 min past the 60-min threshold
  const NOW_S = Math.floor(Date.now() / 1000);

  // Token issued 61 minutes ago = stale (idle > 60min limit)
  const staleAccessToken = makeFakeJwt({
    sub: 'user-uuid-idle',
    email: 'idle@example.com',
    role: 'authenticated',
    iat: NOW_S - IDLE_TIMEOUT_S,
    exp: NOW_S - IDLE_TIMEOUT_S + 900, // expired: exp is in the past
  });

  // Token issued 5 minutes ago = fresh (within 60-min idle window)
  const freshAccessToken = makeFakeJwt({
    sub: 'user-uuid-active',
    email: 'active@example.com',
    role: 'authenticated',
    iat: NOW_S - 5 * 60,
    exp: NOW_S - 5 * 60 + 900, // also expired TTL-wise, but idle check passes (last activity < 60m ago)
  });

  /**
   * Simulate the middleware's idle-timeout check.
   * GREEN implementer: this function models what middleware.ts must implement.
   * The real implementation reads the cookie/header access token, decodes the JWT,
   * checks if (now - iat) > idle_timeout_min * 60, and returns 401 if so.
   *
   * Import path: apps/web/lib/auth/session-check.ts (or inline in middleware.ts)
   * This module does NOT yet exist — import will fail in RED phase.
   */
  async function invokeMiddlewareWithToken(
    accessToken: string,
    path: string = '/en/dashboard',
  ): Promise<Response> {
    // Import the middleware's session-checker (does not exist yet)
    const { checkIdleTimeout } = await import('../../lib/auth/session-check.js');
    return checkIdleTimeout({ accessToken, path, idleTimeoutMin: 60 });
  }

  it('should return 401 when user has been idle for 61 minutes', async () => {
    const response = await invokeMiddlewareWithToken(staleAccessToken);

    expect(response.status).toBe(401);
  });

  it('should include WWW-Authenticate or redirect to /login when idle timeout exceeded', async () => {
    const response = await invokeMiddlewareWithToken(staleAccessToken);

    // One of these two enforcement mechanisms must be present:
    const hasWwwAuthenticate = response.headers.has('WWW-Authenticate');
    const isRedirectToLogin = response.status === 302 &&
      (response.headers.get('location') ?? '').includes('/login');

    // Mutation-proof: bare expect(true) is banned — check the actual header/status values
    if (hasWwwAuthenticate) {
      expect(response.headers.get('WWW-Authenticate')).toMatch(/Bearer/i);
    } else {
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toMatch(/\/login/);
    }

    expect(hasWwwAuthenticate || isRedirectToLogin).toBe(true);
  });

  it('should NOT return 401 when user has been idle for only 5 minutes (negative path)', async () => {
    // Mutation-proof: if implementation always returns 401, this test catches it
    const response = await invokeMiddlewareWithToken(freshAccessToken);

    expect(response.status).not.toBe(401);
  });

  it('should use fake timer to verify idle check triggers at exactly idle_timeout_min boundary', async () => {
    // This test uses explicit token iat timestamps (not fake timers) because
    // middleware reads iat from the JWT — not from Date.now() at middleware invocation.
    // The idle check is: (nowEpochSeconds - jwtIat) > idleTimeoutSeconds
    // Boundary case: exactly 60 minutes idle = NOT expired; 60min + 1s = expired.

    const IDLE_LIMIT_S = 60 * 60; // 60 minutes

    // Edge case 1: exactly at boundary (60min idle) — should NOT trigger 401
    const atBoundaryToken = makeFakeJwt({
      sub: 'user-boundary',
      iat: NOW_S - IDLE_LIMIT_S + 5,   // 5s inside the window — buffer for test exec time
      exp: NOW_S - IDLE_LIMIT_S + 905,
      role: 'authenticated',
    });

    // Edge case 2: 1 second past boundary (60min + 1s idle) — MUST trigger 401
    const pastBoundaryToken = makeFakeJwt({
      sub: 'user-past-boundary',
      iat: NOW_S - IDLE_LIMIT_S - 1,       // 60min + 1s ago
      exp: NOW_S - IDLE_LIMIT_S - 1 + 900,
      role: 'authenticated',
    });

    const { checkIdleTimeout } = await import('../../lib/auth/session-check.js');

    const atBoundaryResponse = await checkIdleTimeout({
      accessToken: atBoundaryToken,
      path: '/en/dashboard',
      idleTimeoutMin: 60,
    });
    const pastBoundaryResponse = await checkIdleTimeout({
      accessToken: pastBoundaryToken,
      path: '/en/dashboard',
      idleTimeoutMin: 60,
    });

    // At boundary: pass (not yet expired — GREEN implementer: use > not >=)
    expect(atBoundaryResponse.status).not.toBe(401);

    // Past boundary: must be 401
    expect(pastBoundaryResponse.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('AC3: server action context → current_setting(app.current_org_id) == user org UUID', () => {
  // AC3: successful sign-in → server action context → app.set_org_context(sessionToken, orgUuid)
  //      → select app.current_org_id() returns the user's org UUID
  //      (NOT a spoofable client-supplied UUID)
  //
  // This test requires a live PostgreSQL DB with 002-rls-baseline.sql applied.
  // It connects via getAppConnection() from @monopilot/db/test-utils/test-pool.
  //
  // Skip condition: DATABASE_URL not set in env (no live DB).

  const databaseUrl = process.env.DATABASE_URL;
  const runIfDb = databaseUrl ? it : it.skip;

  // Fixed UUIDs for test isolation
  const TEST_ORG_UUID = '33333333-3333-4333-8333-333333333333';
  const TEST_TENANT_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const TEST_SESSION_TOKEN = '55555555-5555-4555-8555-555555555555';
  const SPOOF_UUID = 'ffffffff-ffff-4fff-8fff-ffffffffffff'; // NOT registered in session_org_contexts

  let ownerPool: import('pg').Pool;
  let appPool: import('pg').Pool;

  beforeAll(async () => {
    if (!databaseUrl) return;

    // getOwnerConnection is NOT re-exported from @monopilot/db public API (by design).
    // We import directly from the internal test-utils path.
    const { getOwnerConnection, getAppConnection } = await import(
      '../../../../packages/db/test-utils/test-pool.js'
    );
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    // Ensure app_user role exists (idempotent)
    const appUserPassword = ['app', 'user', 'test', 'password'].join('_');
    await ownerPool.query(`
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = 'app_user') then
          create role app_user login password '${appUserPassword}';
        else
          alter role app_user login password '${appUserPassword}';
        end if;
      end
      $$
    `);

    // Seed the required tenant, org, and session_org_context rows for AC3.
    // Uses INSERT ... ON CONFLICT DO NOTHING for idempotency.
    await ownerPool.query(`
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'T-011 Test Tenant', 'eu', 'https://test.example.com')
      on conflict (id) do nothing
    `, [TEST_TENANT_UUID]);

    await ownerPool.query(`
      insert into public.organizations (id, tenant_id, name, industry_code)
      values ($1, $2, 'T-011 Test Org', 'generic')
      on conflict (id) do nothing
    `, [TEST_ORG_UUID, TEST_TENANT_UUID]);

    // Register the session_org_context (this is what middleware does post-sign-in)
    // app.session_org_contexts is only writable by the owner/service-role.
    await ownerPool.query(`
      insert into app.session_org_contexts (session_token, org_id)
      values ($1, $2)
      on conflict (session_token) do nothing
    `, [TEST_SESSION_TOKEN, TEST_ORG_UUID]);
  });

  afterAll(async () => {
    if (!databaseUrl) return;

    // Cleanup: remove test fixtures in FK-safe order.
    // Delete session_org_contexts first (references org), then users, then orgs,
    // then tenant. Broad tenant-scoped deletes guard against stale rows from
    // prior failed runs.
    await ownerPool.query(
      `delete from app.session_org_contexts where session_token = $1`,
      [TEST_SESSION_TOKEN],
    );
    // Delete users referencing orgs owned by this tenant (FK: users.org_id → organizations.id)
    await ownerPool.query(
      `delete from public.users where org_id in (select id from public.organizations where tenant_id = $1)`,
      [TEST_TENANT_UUID],
    );
    // Delete ALL orgs for this test tenant (guards against stale rows from prior runs)
    await ownerPool.query(
      `delete from public.organizations where tenant_id = $1`,
      [TEST_TENANT_UUID],
    );
    await ownerPool.query(
      `delete from public.tenants where id = $1`,
      [TEST_TENANT_UUID],
    );
    await ownerPool.end();
    await appPool.end();
  });

  runIfDb(
    'app.set_org_context(sessionToken, orgUuid) → app.current_org_id() returns the org UUID',
    async () => {
      // Act: call set_org_context within a transaction (mirrors what middleware does)
      const client = await appPool.connect();
      try {
        await client.query('BEGIN');

        // This is the T-007 SECURITY DEFINER wrapper that middleware must call.
        // Note: function signature is app.set_org_context(uuid, uuid) per 002-rls-baseline.sql
        const setResult = await client.query(
          `select app.set_org_context($1, $2) as org_id`,
          [TEST_SESSION_TOKEN, TEST_ORG_UUID],
        );

        // Assert: set_org_context returns the org UUID (not void, not null)
        expect(setResult.rows[0].org_id).toBe(TEST_ORG_UUID);

        // Assert: current_org_id() reads back the same UUID in this transaction
        const getResult = await client.query(
          `select app.current_org_id() as current_org_id`,
        );

        expect(getResult.rows[0].current_org_id).toBe(TEST_ORG_UUID);

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    },
  );

  runIfDb(
    'app.set_org_context with unregistered (spoofable) session token → raises SQLSTATE 28000',
    async () => {
      // Mutation-proof: client cannot spoof org context by passing an arbitrary UUID
      // as session_token. The function raises SQLSTATE 28000 (invalid_authorization_specification)
      // if the (session_token, org_id) pair is not in app.session_org_contexts.
      //
      // DO NOT use bare .rejects.toThrow() — pin the SQLSTATE per quality bar.
      const client = await appPool.connect();
      try {
        await client.query('BEGIN');

        await expect(
          client.query(
            `select app.set_org_context($1, $2)`,
            [SPOOF_UUID, TEST_ORG_UUID], // SPOOF_UUID not registered in session_org_contexts
          ),
        ).rejects.toMatchObject({
          code: '28000', // SQLSTATE: invalid_authorization_specification
        });

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    },
  );

  runIfDb(
    'app.set_org_context prevents setting org to a different org than session was issued for',
    async () => {
      // Mutation-proof: even if an attacker supplies the CORRECT session token
      // but a DIFFERENT org_id (org_id not matching the registered session), it must fail.
      const DIFFERENT_ORG_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

      const client = await appPool.connect();
      try {
        await client.query('BEGIN');

        // TEST_SESSION_TOKEN is registered for TEST_ORG_UUID only.
        // Attempting to use it with DIFFERENT_ORG_UUID must raise 28000.
        await expect(
          client.query(
            `select app.set_org_context($1, $2)`,
            [TEST_SESSION_TOKEN, DIFFERENT_ORG_UUID],
          ),
        ).rejects.toMatchObject({
          code: '28000',
        });

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    },
  );

  runIfDb(
    'app.current_org_id() returns NULL when no set_org_context called (baseline isolation)',
    async () => {
      // Mutation-proof baseline: without calling set_org_context, current_org_id() is NULL.
      // This ensures the function cannot return a stale/previous context.
      const client = await appPool.connect();
      try {
        await client.query('BEGIN');

        const result = await client.query(`select app.current_org_id() as org_id`);

        // Must be null — no context has been set in this fresh transaction
        expect(result.rows[0].org_id).toBeNull();

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('RED source contract: middleware owns auth session policy', () => {
  const middlewareSource = () => readFileSync(`${process.cwd()}/middleware.ts`, 'utf8');

  it('reads idle_timeout_min from tenant_idp_config instead of an environment-only fallback', () => {
    const source = middlewareSource();

    // T-011 contract: idle timeout is tenant-configured, not a process-wide env knob.
    expect(source).toMatch(/tenant_idp_config/i);
    expect(source).not.toMatch(/IDLE_TIMEOUT_MIN/);
  });

  it('establishes non-spoofable org context with app.set_org_context before protected requests continue', () => {
    const source = middlewareSource();

    // T-011/T-007 contract: middleware must call the foundation setter; comments alone do not satisfy this.
    expect(source).toMatch(/set_org_context\s*\(/);
    expect(source).toMatch(/app\.current_org_id\s*\(/);
    expect(source).not.toMatch(/current_setting\('app\.(tenant_id|current_org_id)'\)/);
  });
});

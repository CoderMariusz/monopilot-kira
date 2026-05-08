/**
 * FT-028 — `signInWithMagicLink` SAML enforcement tests.
 *
 * These tests pin the integration between the magic-link Server Action and
 * `enforceSamlPolicy` from `apps/web/lib/auth/saml.ts`:
 *
 *   1. Email belongs to a tenant that requires SAML for non-admins → magic
 *      link is NOT sent and the constant neutral string is returned.
 *   2. Email is unknown (no public.users row) → magic link is sent normally.
 *   3. Email belongs to a tenant that does NOT enforce SAML → magic link is
 *      sent normally.
 *   4. DB outage during the email→tenant lookup in PRODUCTION → fail-closed
 *      (constant neutral, no magic link).
 *   5. DB outage during the email→tenant lookup in DEVELOPMENT → continue
 *      (magic link is sent — local dev without a DB stays usable).
 *
 * The `enforceSamlPolicy` and tenant-lookup `pg` calls are mocked so the
 * tests are pure-Node, no live DB / Supabase required.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Top-level mocks (vi.mock is hoisted — keep stubs at module scope) ───────
// Use vi.hoisted so vi.mock factories can reference the stubs without
// hitting the temporal-dead-zone trap of normal const declarations.
const {
  _mockSignInWithOtp,
  _mockEnforceSamlPolicy,
  _mockPoolQuery,
  _mockPoolEnd,
  _PoolCtor,
} = vi.hoisted(() => {
  const _mockPoolQuery = vi.fn();
  const _mockPoolEnd = vi.fn().mockResolvedValue(undefined);
  // Use a real class so `new Pool()` works under both the named-export and
  // default-export shapes that vitest's interop layer presents for CJS pg.
  class _PoolCtor {
    query = _mockPoolQuery;
    end = _mockPoolEnd;
  }
  return {
    _mockSignInWithOtp: vi.fn(),
    _mockEnforceSamlPolicy: vi.fn(),
    _mockPoolQuery,
    _mockPoolEnd,
    _PoolCtor,
  };
});

vi.mock('../../lib/auth/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      signInWithOtp: _mockSignInWithOtp,
    },
  })),
}));

vi.mock('../../lib/auth/saml', () => ({
  enforceSamlPolicy: _mockEnforceSamlPolicy,
}));

// `pg` is imported by actions.ts as `import { Pool } from 'pg'` — provide a
// real class on both the named and default export shapes so `new Pool(...)`
// works regardless of vitest's CJS↔ESM interop choice.
vi.mock('pg', () => ({
  Pool: _PoolCtor,
  default: { Pool: _PoolCtor },
}));

const NEUTRAL = 'If an account with that email exists, a sign-in link has been sent.';

beforeEach(() => {
  _mockSignInWithOtp.mockReset();
  _mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
  _mockEnforceSamlPolicy.mockReset();
  _mockPoolQuery.mockReset();
  _mockPoolEnd.mockReset();
  _mockPoolEnd.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('FT-028 — signInWithMagicLink SAML enforcement', () => {
  it('SUPPRESSES magic link when tenant requires SAML for non-admins (constant neutral response)', async () => {
    // Arrange: known user, non-admin, tenant has enforce_for_non_admins=true.
    _mockPoolQuery.mockResolvedValueOnce({
      rows: [
        {
          tenant_id: '11111111-1111-4111-8111-111111111111',
          user_id: '22222222-2222-4222-8222-222222222222',
          is_admin: false,
        },
      ],
    });
    _mockEnforceSamlPolicy.mockResolvedValueOnce({
      allowed: false,
      statusCode: 403,
      reason: 'SAML required for non-admin users — password sign-in not allowed',
    });

    const { signInWithMagicLink } = await import('../../app/(auth)/actions.js');
    const result = await signInWithMagicLink('alice@example.com');

    // MUTATION-PROOF:
    //   - If the implementation forgets to short-circuit, signInWithOtp would be
    //     called → this assertion catches it.
    //   - If the implementation echoes the SAML reason instead of the neutral
    //     string, the user-enumeration guard breaks → exact-string assertion catches.
    expect(_mockSignInWithOtp).not.toHaveBeenCalled();
    expect(result.error).toBe(NEUTRAL);

    // enforceSamlPolicy must have been invoked with authMethod='magic' so the
    // policy function can apply the right branch.
    expect(_mockEnforceSamlPolicy).toHaveBeenCalledTimes(1);
    const callArg = _mockEnforceSamlPolicy.mock.calls[0]![0] as {
      tenantId: string;
      authMethod: string;
      userRole: string;
    };
    expect(callArg.tenantId).toBe('11111111-1111-4111-8111-111111111111');
    expect(callArg.authMethod).toBe('magic');
    // Non-admin users get the generic 'user' role string for the policy call.
    expect(callArg.userRole).toBe('user');
  });

  it('SENDS magic link when email is unknown (no public.users row → no SAML check)', async () => {
    // Arrange: tenant lookup returns no rows. The pre-check is intentionally
    // skipped so first-time sign-ups / invites still flow.
    _mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const { signInWithMagicLink } = await import('../../app/(auth)/actions.js');
    const result = await signInWithMagicLink('newuser@example.com');

    // MUTATION-PROOF: if implementation also requires tenantRow to be present,
    // unknown emails would silently fail → assertion on signInWithOtp catches it.
    expect(_mockSignInWithOtp).toHaveBeenCalledTimes(1);
    expect(_mockEnforceSamlPolicy).not.toHaveBeenCalled();
    expect(result.error).toBeNull();
  });

  it('SENDS magic link when tenant has no SAML enforcement (policy.allowed=true)', async () => {
    _mockPoolQuery.mockResolvedValueOnce({
      rows: [
        {
          tenant_id: '11111111-1111-4111-8111-111111111111',
          user_id: '22222222-2222-4222-8222-222222222222',
          is_admin: false,
        },
      ],
    });
    _mockEnforceSamlPolicy.mockResolvedValueOnce({
      allowed: true,
      statusCode: 200,
    });

    const { signInWithMagicLink } = await import('../../app/(auth)/actions.js');
    const result = await signInWithMagicLink('alice@example.com');

    // MUTATION-PROOF: if signInWithMagicLink mistakenly inverts the allowed
    // boolean, the OTP send would be skipped → catches that too.
    expect(_mockSignInWithOtp).toHaveBeenCalledTimes(1);
    expect(result.error).toBeNull();
  });

  it('FAILS CLOSED when tenant lookup throws in production (NODE_ENV=production)', async () => {
    // process.env.NODE_ENV is typed readonly in @types/node 20+. Cast through
    // a generic record to mutate at runtime — vitest test scope only.
    const env = process.env as Record<string, string | undefined>;
    const origEnv = env.NODE_ENV;
    try {
      env.NODE_ENV = 'production';

      _mockPoolQuery.mockRejectedValueOnce(new Error('connection refused'));

      const { signInWithMagicLink } = await import('../../app/(auth)/actions.js');
      const result = await signInWithMagicLink('alice@example.com');

      // MUTATION-PROOF: a fail-OPEN regression would invoke signInWithOtp on
      // DB outage, downgrading SAML enforcement during a partial failure.
      expect(_mockSignInWithOtp).not.toHaveBeenCalled();
      expect(_mockEnforceSamlPolicy).not.toHaveBeenCalled();
      expect(result.error).toBe(NEUTRAL);
    } finally {
      if (origEnv === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = origEnv;
    }
  });

  it('FAILS OPEN (continues) when tenant lookup throws in development', async () => {
    const env = process.env as Record<string, string | undefined>;
    const origEnv = env.NODE_ENV;
    try {
      env.NODE_ENV = 'development';

      _mockPoolQuery.mockRejectedValueOnce(new Error('connection refused'));

      const { signInWithMagicLink } = await import('../../app/(auth)/actions.js');
      const result = await signInWithMagicLink('alice@example.com');

      // In dev, a missing DB must not block local development — magic link
      // proceeds through the Supabase mock.
      expect(_mockSignInWithOtp).toHaveBeenCalledTimes(1);
      expect(_mockEnforceSamlPolicy).not.toHaveBeenCalled();
      expect(result.error).toBeNull();
    } finally {
      if (origEnv === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = origEnv;
    }
  });

  it('passes admin role slug to enforceSamlPolicy for admin users (policy admin-bypass)', async () => {
    // Mutation-proof: if implementation hard-codes 'user' regardless of
    // is_admin, admin users would also be SAML-blocked. Pin the admin path.
    _mockPoolQuery.mockResolvedValueOnce({
      rows: [
        {
          tenant_id: '11111111-1111-4111-8111-111111111111',
          user_id: '22222222-2222-4222-8222-222222222222',
          is_admin: true,
        },
      ],
    });
    // The mock policy returns allowed=true regardless of role; we only assert
    // on the userRole arg passed to it.
    _mockEnforceSamlPolicy.mockResolvedValueOnce({
      allowed: true,
      statusCode: 200,
    });

    const { signInWithMagicLink } = await import('../../app/(auth)/actions.js');
    await signInWithMagicLink('admin@example.com');

    expect(_mockEnforceSamlPolicy).toHaveBeenCalledTimes(1);
    const callArg = _mockEnforceSamlPolicy.mock.calls[0]![0] as { userRole: string };
    // Pin the canonical admin slug so the saml.ts ADMIN_ROLE_SLUGS lookup hits.
    expect(callArg.userRole).toBe('org.access.admin');
  });
});

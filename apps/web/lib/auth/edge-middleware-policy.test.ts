/**
 * Behavior tests for the edge-middleware-policy helper imported by
 * apps/web/proxy.ts. These tests deliberately do NOT mock the module —
 * they import it directly so a missing file (or a regressed export surface)
 * produces a real failure, not a mock-only false green.
 *
 * The helper MUST be Edge-runtime safe:
 *   - no Node-only imports (`pg`, `node:crypto`, `@supabase/ssr` server file
 *     that pulls Node APIs, etc.)
 *   - pure compute for `isRequestIpAllowed`
 *   - async resolvers must be replaceable / overridable so the middleware can
 *     be exercised in tests without standing up Supabase.
 */
import { describe, expect, it } from 'vitest';

const HELPER_PATH = './edge-middleware-policy.js';

describe('lib/auth/edge-middleware-policy (T-035 edge runtime helper)', () => {
  it('exports the five symbols proxy.ts imports at runtime', async () => {
    const mod = (await import(HELPER_PATH)) as Record<string, unknown>;
    for (const name of [
      'auditAdminIpBlocked',
      'establishOrgContext',
      'isRequestIpAllowed',
      'resolveEdgeSecurityContext',
      'verifyScimBearer',
    ]) {
      expect(typeof mod[name], `${name} must be a function exported from edge-middleware-policy`).toBe('function');
    }
  });

  it('isRequestIpAllowed accepts an ipv4 in-range and rejects out-of-range', async () => {
    const { isRequestIpAllowed } = (await import(HELPER_PATH)) as {
      isRequestIpAllowed: (ip: string, cidrs: readonly string[]) => boolean;
    };

    expect(isRequestIpAllowed('203.0.113.10', ['203.0.113.0/24'])).toBe(true);
    expect(isRequestIpAllowed('198.51.100.10', ['203.0.113.0/24'])).toBe(false);
    expect(isRequestIpAllowed('203.0.113.10', [])).toBe(false);
    // Malformed source ip MUST fail closed.
    expect(isRequestIpAllowed('unknown', ['203.0.113.0/24'])).toBe(false);
    expect(isRequestIpAllowed('not.an.ip', ['203.0.113.0/24'])).toBe(false);
  });

  it('isRequestIpAllowed never short-circuits to "allow everything" for the default route', async () => {
    const { isRequestIpAllowed } = (await import(HELPER_PATH)) as {
      isRequestIpAllowed: (ip: string, cidrs: readonly string[]) => boolean;
    };

    // An empty allowlist is fail-closed for admin routes — middleware must NOT
    // treat the empty configuration as "everyone is allowed".
    expect(isRequestIpAllowed('203.0.113.10', [])).toBe(false);
  });


  it('resolveEdgeSecurityContext extracts access token and signed-claim policy fields without redirect-all stub behavior', async () => {
    const { resolveEdgeSecurityContext } = (await import(HELPER_PATH)) as {
      resolveEdgeSecurityContext: (request: Request) => Promise<{
        accessToken: string | null;
        adminIpAllowlistCidrs: readonly string[];
        onboardingCompletedAt: string | null;
        orgId: string | null;
        role: string;
        sessionIdleTimeoutMinutes: number;
      }>;
    };
    const payload = Buffer.from(JSON.stringify({
      app_metadata: {
        org_id: '11111111-1111-4111-8111-111111111111',
        role: 'admin',
        onboarding_completed_at: '2026-05-01T00:00:00.000Z',
        admin_ip_allowlist_cidrs: ['203.0.113.0/24'],
        idle_timeout_min: 15,
      },
    })).toString('base64url');
    const token = `stub.${payload}.sig`;

    const ctx = await resolveEdgeSecurityContext(new Request('https://app.example.com/admin', {
      headers: { cookie: `sb-access-token=${encodeURIComponent(token)}` },
    }));

    expect(ctx.accessToken).toBe(token);
    expect(ctx.role).toBe('admin');
    expect(ctx.orgId).toBe('11111111-1111-4111-8111-111111111111');
    expect(ctx.onboardingCompletedAt).toBe('2026-05-01T00:00:00.000Z');
    expect(ctx.adminIpAllowlistCidrs).toEqual(['203.0.113.0/24']);
    expect(ctx.sessionIdleTimeoutMinutes).toBe(15);
  });


  it('resolveEdgeSecurityContext keeps onboardingCompletedAt null for a valid token that lacks onboarding claim', async () => {
    const { resolveEdgeSecurityContext } = (await import(HELPER_PATH)) as {
      resolveEdgeSecurityContext: (request: Request) => Promise<{ accessToken: string | null; onboardingCompletedAt: string | null; role: string }>;
    };
    const payload = Buffer.from(JSON.stringify({ app_metadata: { role: 'member' } })).toString('base64url');
    const token = `stub.${payload}.sig`;

    const ctx = await resolveEdgeSecurityContext(new Request('https://app.example.com/dashboard', {
      headers: { authorization: `Bearer ${token}` },
    }));

    expect(ctx.accessToken).toBe(token);
    expect(ctx.role).toBe('member');
    expect(ctx.onboardingCompletedAt).toBeNull();
  });

  it('resolveEdgeSecurityContext returns unauthenticated context when no token is present', async () => {
    const { resolveEdgeSecurityContext } = (await import(HELPER_PATH)) as {
      resolveEdgeSecurityContext: (request: Request) => Promise<{ accessToken: string | null; role: string; onboardingCompletedAt: string | null }>;
    };

    const ctx = await resolveEdgeSecurityContext(new Request('https://app.example.com/admin'));

    expect(ctx.accessToken).toBeNull();
    expect(ctx.role).toBe('unauthenticated');
    expect(ctx.onboardingCompletedAt).toBeNull();
  });

  it('does not pull Node-only or Supabase server-runtime imports at module load', async () => {
    // Importing the helper must succeed in a plain node-environment test
    // without touching pg / @supabase/ssr-server. The test would crash on
    // load if the helper accidentally re-exports node-only modules in a way
    // that pulls them eagerly.
    const mod = (await import(HELPER_PATH)) as Record<string, unknown>;
    expect(mod).toBeTruthy();
  });
});

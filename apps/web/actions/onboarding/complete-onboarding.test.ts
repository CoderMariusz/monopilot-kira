/**
 * Regression: pg returns timestamptz columns as JS Date objects at runtime.
 * completeOnboarding() returns onboarding_completed_at to the client and also
 * forwards it to the Supabase admin stampOnboardingClaim — both consumers
 * expect ISO strings, never Date objects.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  _withOrgContextRunner,
  _revalidateLocalized,
  _stampedClaims,
  _createServerSupabaseClient,
  _createClient,
} = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _revalidateLocalized: vi.fn(),
  _stampedClaims: [] as Array<{ userId: string; completedAt: unknown }>,
  _createServerSupabaseClient: vi.fn(),
  _createClient: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _withOrgContextRunner(action),
  ),
}));

vi.mock('../../lib/auth/supabase-server', () => ({
  createServerSupabaseClient: _createServerSupabaseClient,
}));

vi.mock('../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: _revalidateLocalized,
}));

vi.mock('../../lib/auth/stamp-onboarding-claim', () => ({
  stampOnboardingClaim: vi.fn(async (userId: string, completedAt: string) => {
    _stampedClaims.push({ userId, completedAt });
    return true;
  }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: _createClient,
}));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const COMPLETED_AT_DATE = new Date('2026-05-19T21:00:00.000Z');

function makeClientReturning(completedAt: string | Date) {
  return {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('update public.organizations')) {
        return { rows: [{ onboarding_completed_at: completedAt }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  _stampedClaims.length = 0;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  _createClient.mockReturnValue({
    auth: {
      admin: {
        getUserById: vi.fn(async (userId: string) => ({
          data: { user: { id: userId, app_metadata: {}, user_metadata: {} } },
          error: null,
        })),
        updateUserById: vi.fn(async (userId: string, payload: Record<string, unknown>) => {
          const appMeta = (payload.app_metadata as { onboarding_completed_at?: unknown }) ?? {};
          _stampedClaims.push({ userId, completedAt: appMeta.onboarding_completed_at });
          return { data: { user: { id: userId } }, error: null };
        }),
      },
    },
  });

  _createServerSupabaseClient.mockResolvedValue({
    auth: {
      refreshSession: vi.fn(async () => ({ data: { session: { access_token: 'a' } }, error: null })),
    },
  });
});

describe('completeOnboarding date normalization (regression: Date → [object Date])', () => {
  it('coerces Date-valued returning onboarding_completed_at to an ISO string before stamping and returning', async () => {
    const client = makeClientReturning(COMPLETED_AT_DATE);
    _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { completeOnboarding } = await import('./complete-onboarding');
    const result = await completeOnboarding({ orgId: ORG_ID });

    expect(result.ok).toBe(true);
    expect(result.onboardingCompletedAt).toBe(COMPLETED_AT_DATE.toISOString());
    expect(typeof result.onboardingCompletedAt).toBe('string');
    expect(result.onboardingCompletedAt).not.toBeInstanceOf(Date);

    expect(_stampedClaims).toHaveLength(1);
    expect(_stampedClaims[0]!.completedAt).toBe(COMPLETED_AT_DATE.toISOString());
    expect(typeof _stampedClaims[0]!.completedAt).toBe('string');
  });

  it('still accepts string timestamps unchanged', async () => {
    const iso = '2026-05-19T21:00:00.000Z';
    const client = makeClientReturning(iso);
    _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { completeOnboarding } = await import('./complete-onboarding');
    const result = await completeOnboarding({ orgId: ORG_ID });

    expect(result).toMatchObject({ ok: true, onboardingCompletedAt: iso, redirectTo: '/settings/users' });
    expect(_stampedClaims[0]!.completedAt).toBe(iso);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPLETED_AT = '2026-05-01T00:00:00.000Z';

const ownerQuery = vi.fn();
const getUserById = vi.fn();
const updateUserById = vi.fn();

vi.mock('./with-org-context', () => ({
  getOwnerPool: () => ({ query: ownerQuery }),
}));

vi.mock('../../actions/users/supabase-admin', () => ({
  createSupabaseAuthAdmin: vi.fn(async () => ({
    auth: {
      admin: {
        getUserById,
        updateUserById,
      },
    },
  })),
}));

describe('syncUserOnboardingClaimFromOrg', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ownerQuery.mockResolvedValue({ rows: [{ onboarding_completed_at: COMPLETED_AT }] });
    getUserById.mockResolvedValue({ data: { user: { id: USER_ID, app_metadata: {}, user_metadata: {} } }, error: null });
    updateUserById.mockResolvedValue({ error: null });
  });

  it('stamps onboarding_completed_at when the org already completed onboarding', async () => {
    const { syncUserOnboardingClaimFromOrg } = await import('./sync-user-onboarding-claim');

    const ok = await syncUserOnboardingClaimFromOrg(USER_ID);

    expect(ok).toBe(true);
    const [, payload] = updateUserById.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.app_metadata).toEqual(expect.objectContaining({ onboarding_completed_at: COMPLETED_AT }));
    expect(payload).not.toHaveProperty('user_metadata');
  });

  it('no-ops when the org onboarding_completed_at is still null', async () => {
    ownerQuery.mockResolvedValueOnce({ rows: [{ onboarding_completed_at: null }] });
    const { syncUserOnboardingClaimFromOrg } = await import('./sync-user-onboarding-claim');

    const ok = await syncUserOnboardingClaimFromOrg(USER_ID);

    expect(ok).toBe(true);
    expect(updateUserById).not.toHaveBeenCalled();
  });
});

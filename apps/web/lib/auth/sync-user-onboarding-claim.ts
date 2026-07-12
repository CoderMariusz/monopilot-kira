import { getOwnerPool } from './with-org-context';
import { stampOnboardingClaim } from './stamp-onboarding-claim';

type OwnerRow = {
  onboarding_completed_at: string | Date | null;
};

function toIsoString(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'string' && value.trim().length > 0) return value;
  return null;
}

/**
 * When an org has already completed onboarding, invited/member users still carry
 * a JWT without onboarding_completed_at (only the completing admin was stamped).
 * Sync the org timestamp onto the auth user so middleware admits them to the app.
 */
export async function syncUserOnboardingClaimFromOrg(userId: string): Promise<boolean> {
  const owner = getOwnerPool();
  const { rows } = await owner.query<OwnerRow>(
    `select o.onboarding_completed_at
       from public.users u
       join public.organizations o on o.id = u.org_id
      where u.id = $1::uuid
      limit 1`,
    [userId],
  );
  const completedAt = toIsoString(rows[0]?.onboarding_completed_at);
  if (!completedAt) return true;
  return stampOnboardingClaim(userId, completedAt);
}

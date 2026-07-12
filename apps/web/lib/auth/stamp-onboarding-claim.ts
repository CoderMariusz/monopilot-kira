import { createSupabaseAuthAdmin } from '../../actions/users/supabase-admin';

/**
 * Copy organizations.onboarding_completed_at into the Supabase JWT app_metadata
 * so edge middleware can admit org members whose org already finished onboarding.
 */
export async function stampOnboardingClaim(userId: string, completedAt: string): Promise<boolean> {
  const supabase = await createSupabaseAuthAdmin();
  const current = await supabase.auth.admin.getUserById(userId);
  if (current.error || !current.data.user) return false;

  const appMetadata = current.data.user.app_metadata ?? {};
  const updated = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { ...appMetadata, onboarding_completed_at: completedAt },
  });
  if (updated.error) {
    console.error('[stampOnboardingClaim] Supabase app_metadata update failed', {
      userId,
      message: updated.error.message,
    });
    return false;
  }
  return true;
}

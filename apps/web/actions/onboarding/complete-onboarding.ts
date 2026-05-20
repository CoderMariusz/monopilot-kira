import { revalidatePath } from 'next/cache';
import { withOrgContext } from '../../lib/auth/with-org-context';

export type CompleteOnboardingInput = { orgId: string };

export type CompleteOnboardingResult = {
  ok: boolean;
  onboardingCompletedAt?: string;
  redirectTo?: string;
  error?: string;
};

type Row = { onboarding_completed_at: string };
type CompletionWithAuthUser = CompleteOnboardingResult & { authUserId?: string };

async function createSupabaseAuthAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('completeOnboarding requires Supabase service-role auth metadata env');
  }
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function stampOnboardingClaim(userId: string, completedAt: string): Promise<boolean> {
  const supabase = await createSupabaseAuthAdmin();
  const current = await supabase.auth.admin.getUserById(userId);
  if (current.error || !current.data.user) return false;

  const appMetadata = current.data.user.app_metadata ?? {};
  const userMetadata = current.data.user.user_metadata ?? {};
  const updated = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { ...appMetadata, onboarding_completed_at: completedAt },
    user_metadata: { ...userMetadata, onboarding_completed_at: completedAt },
  });
  return !updated.error;
}

export async function completeOnboarding(rawInput: CompleteOnboardingInput): Promise<CompleteOnboardingResult> {
  'use server';

  if (!rawInput || typeof rawInput !== 'object') {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    const result = await withOrgContext<CompletionWithAuthUser>(async (ctx) => {
      const context = ctx as {
        userId: string;
        client: {
          query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
        };
      };
      const { rows } = await context.client.query<Row>(
        `update public.organizations
            set onboarding_completed_at = now(),
                updated_at = now()
          where id = app.current_org_id()
          returning onboarding_completed_at`,
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      revalidatePath('/settings/onboarding');
      return {
        ok: true,
        onboardingCompletedAt: row.onboarding_completed_at,
        redirectTo: '/settings/users',
        authUserId: context.userId,
      };
    });

    if (!result.ok || !result.onboardingCompletedAt || !result.authUserId) return result;

    const stamped = await stampOnboardingClaim(result.authUserId, result.onboardingCompletedAt);
    if (!stamped) {
      return { ok: false, error: 'SESSION_REFRESH_FAILED' };
    }

    const { authUserId: _authUserId, ...publicResult } = result;
    void _authUserId;
    return publicResult;
  } catch {
    return { ok: false, error: 'PERSISTENCE_FAILED' };
  }
}

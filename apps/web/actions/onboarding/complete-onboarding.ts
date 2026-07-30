import { withOrgContext } from '../../lib/auth/with-org-context';
import { createServerSupabaseClient } from '../../lib/auth/supabase-server';
import { stampOnboardingClaim } from '../../lib/auth/stamp-onboarding-claim';
import { revalidateLocalized } from '../../lib/i18n/revalidate-localized';
import { hasOnboardingPermission, isOnboardingReadyToComplete } from './advance';

export type CompleteOnboardingInput = { orgId: string };

export type CompleteOnboardingResult = {
  ok: boolean;
  onboardingCompletedAt?: string;
  redirectTo?: string;
  error?: string;
};

type Row = { onboarding_completed_at: string | Date };
type OnboardingCheckRow = {
  onboarding_completed_at: string | null;
  onboarding_state: unknown;
};
type CompletionWithAuthUser = CompleteOnboardingResult & { authUserId?: string };

function toIsoString(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'string') return value.length > 0 ? value : null;
  return null;
}

async function refreshCurrentSession(): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const refreshed = await supabase.auth.refreshSession();
  return !refreshed.error && Boolean(refreshed.data.session);
}

export async function completeOnboarding(rawInput: CompleteOnboardingInput): Promise<CompleteOnboardingResult> {
  'use server';

  if (!rawInput || typeof rawInput !== 'object' || typeof rawInput.orgId !== 'string') {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    const result = await withOrgContext<CompletionWithAuthUser>(async (ctx) => {
      const context = ctx as {
        userId: string;
        orgId: string;
        client: {
          query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
        };
      };

      if (context.orgId !== rawInput.orgId) {
        return { ok: false, error: 'forbidden' };
      }

      const authorized = await hasOnboardingPermission(context);
      if (!authorized) {
        return { ok: false, error: 'forbidden' };
      }

      const onboardingCheck = await context.client.query<OnboardingCheckRow>(
        `select onboarding_completed_at, onboarding_state
           from public.organizations
          where id = app.current_org_id()`,
      );
      const organization = onboardingCheck.rows[0];
      if (!organization) {
        return { ok: false, error: 'not_found' };
      }
      if (organization.onboarding_completed_at != null) {
        return { ok: false, error: 'onboarding_already_completed' };
      }
      if (!isOnboardingReadyToComplete(organization.onboarding_state)) {
        return { ok: false, error: 'onboarding_steps_incomplete' };
      }

      const { rows } = await context.client.query<Row>(
        `update public.organizations
            set onboarding_completed_at = now(),
                updated_at = now()
          where id = app.current_org_id()
          returning onboarding_completed_at`,
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      const completedAtIso = toIsoString(row.onboarding_completed_at);
      if (!completedAtIso) {
        throw new Error('invalid onboarding_completed_at returned after completion update');
      }
      revalidateLocalized('/settings/onboarding');
      revalidateLocalized('/settings/users');
      return {
        ok: true,
        onboardingCompletedAt: completedAtIso,
        redirectTo: '/settings/users',
        authUserId: context.userId,
      };
    });

    if (!result.ok || !result.onboardingCompletedAt || !result.authUserId) return result;

    const stamped = await stampOnboardingClaim(result.authUserId, result.onboardingCompletedAt);
    if (!stamped) {
      return { ok: false, error: 'AUTH_METADATA_FAILED' };
    }

    const refreshed = await refreshCurrentSession();
    if (!refreshed) {
      return { ok: false, error: 'SESSION_REFRESH_FAILED' };
    }

    const { authUserId: _authUserId, ...publicResult } = result;
    void _authUserId;
    return publicResult;
  } catch {
    return { ok: false, error: 'PERSISTENCE_FAILED' };
  }
}

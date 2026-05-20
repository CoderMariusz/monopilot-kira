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

export async function completeOnboarding(rawInput: CompleteOnboardingInput): Promise<CompleteOnboardingResult> {
  'use server';

  if (!rawInput || typeof rawInput !== 'object') {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    return await withOrgContext<CompleteOnboardingResult>(async (ctx) => {
      const context = ctx as {
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
        redirectTo: '/admin',
      };
    });
  } catch {
    return { ok: false, error: 'PERSISTENCE_FAILED' };
  }
}

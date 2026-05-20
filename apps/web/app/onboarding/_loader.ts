/**
 * Onboarding RSC loader.
 *
 * Fail-closed: when the server cannot resolve a Supabase session and org
 * context, return `state: 'error'` (or 'permission_denied') so the client
 * island renders the honest empty/error UI. We never fabricate organization
 * defaults — the prototype pages still expose the same shape, but population
 * happens only through real `withOrgContext` data.
 */

import { withOrgContext } from '../../lib/auth/with-org-context';

export type OnboardingStepKey =
  | 'org_profile'
  | 'first_warehouse'
  | 'first_location'
  | 'first_product'
  | 'first_wo'
  | 'completion';

export type OnboardingLoadState = 'ready' | 'loading' | 'error' | 'permission_denied';

export type OnboardingOrganization = {
  id: string;
  name: string;
  timezone: string;
  locale: string;
  currency: string;
  gs1Prefix: string;
  onboardingCompletedAt: string | null;
};

export type OnboardingState = {
  currentStep: OnboardingStepKey;
  completedSteps: OnboardingStepKey[];
  skippedSteps: OnboardingStepKey[];
  savedAt: string;
};

export type LoadedOnboardingContext =
  | {
      state: 'ready';
      orgId: string;
      organization: OnboardingOrganization;
      onboardingState: OnboardingState;
    }
  | { state: 'error' | 'permission_denied'; orgId: null; organization: null; onboardingState: null };

/**
 * Resolve org context server-side, then read the organization + onboarding
 * snapshot from the database. The schema for `organizations.onboarding_state`
 * is owned by SET-* migrations and not yet finalized in this worktree, so the
 * loader fails closed with `state: 'error'` if any of the required columns
 * are missing or the query throws.
 */
export async function loadOnboardingContext(): Promise<LoadedOnboardingContext> {
  try {
    return await withOrgContext(async ({ orgId, client }) => {
      const orgRow = await client.query<{
        id: string;
        name: string | null;
        timezone: string | null;
        locale: string | null;
        currency: string | null;
        gs1_prefix: string | null;
        onboarding_completed_at: string | null;
        onboarding_state: unknown;
      }>(
        `select id, name, timezone, locale, currency, gs1_prefix,
                onboarding_completed_at, onboarding_state
           from app.organizations
          where id = $1::uuid
          limit 1`,
        [orgId],
      );

      const row = orgRow.rows[0];
      if (!row) {
        return {
          state: 'error',
          orgId: null,
          organization: null,
          onboardingState: null,
        } as const;
      }

      const onboarding = parseOnboardingState(row.onboarding_state);

      return {
        state: 'ready',
        orgId,
        organization: {
          id: row.id,
          name: row.name ?? '',
          timezone: row.timezone ?? 'UTC',
          locale: row.locale ?? 'en-GB',
          currency: row.currency ?? 'EUR',
          gs1Prefix: row.gs1_prefix ?? '',
          onboardingCompletedAt: row.onboarding_completed_at,
        },
        onboardingState: onboarding,
      } as const;
    });
  } catch {
    return {
      state: 'error',
      orgId: null,
      organization: null,
      onboardingState: null,
    };
  }
}

const VALID_STEPS: ReadonlySet<OnboardingStepKey> = new Set([
  'org_profile',
  'first_warehouse',
  'first_location',
  'first_product',
  'first_wo',
  'completion',
]);

function asStepKey(value: unknown, fallback: OnboardingStepKey): OnboardingStepKey {
  return typeof value === 'string' && VALID_STEPS.has(value as OnboardingStepKey)
    ? (value as OnboardingStepKey)
    : fallback;
}

function asStepKeyArray(value: unknown): OnboardingStepKey[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is OnboardingStepKey =>
    typeof entry === 'string' && VALID_STEPS.has(entry as OnboardingStepKey),
  );
}

function parseOnboardingState(raw: unknown): OnboardingState {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    currentStep: asStepKey(obj.current_step ?? obj.currentStep, 'org_profile'),
    completedSteps: asStepKeyArray(obj.completed_steps ?? obj.completedSteps ?? obj.completed),
    skippedSteps: asStepKeyArray(obj.skipped_steps ?? obj.skippedSteps ?? obj.skipped),
    savedAt:
      typeof obj.saved_at === 'string'
        ? obj.saved_at
        : typeof obj.savedAt === 'string'
          ? obj.savedAt
          : '',
  };
}

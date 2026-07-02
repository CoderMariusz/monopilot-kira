'use server';

import { withOrgContext } from '../auth/with-org-context';
import {
  ONBOARDING_STEP_DEFINITIONS,
  STEP_ID_TO_ORDER,
  normalizePersistedState,
  toOnboardingState,
} from './get-onboarding-state';
import type { OnboardingStepId } from './types';
import { revalidateLocalized } from '../i18n/revalidate-localized';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

type OrgContextLike = {
  orgId: string;
  client: QueryClient;
};

type OrganizationOnboardingRow = {
  onboarding_state: unknown;
};

type ActionResult = { success: boolean; error?: string };

const SETTINGS_ONBOARDING_ROUTE = '/settings/onboarding';

export async function markStepComplete(orgId: string, stepId: OnboardingStepId): Promise<ActionResult> {
  return persistStepStatus(orgId, stepId, 'completed');
}

export async function markStepSkipped(orgId: string, stepId: OnboardingStepId): Promise<ActionResult> {
  return persistStepStatus(orgId, stepId, 'skipped');
}

export async function getCurrentStep(orgId: string): Promise<OnboardingStepId | null> {
  return withOrgContext<OnboardingStepId | null>(async (ctx): Promise<OnboardingStepId | null> => {
    const context = ctx as OrgContextLike;
    if (context.orgId !== orgId) return null;

    const { rows } = await context.client.query<OrganizationOnboardingRow>(
      `select onboarding_state
         from public.organizations
        where id = $1::uuid
        limit 1`,
      [orgId],
    );

    return toOnboardingState(normalizePersistedState(rows[0]?.onboarding_state)).currentStepId;
  });
}

async function persistStepStatus(
  orgId: string,
  stepId: OnboardingStepId,
  status: 'completed' | 'skipped',
): Promise<ActionResult> {
  const stepOrder = STEP_ID_TO_ORDER[stepId];
  if (!stepOrder) return { success: false, error: 'invalid_step' };

  try {
    return await withOrgContext<ActionResult>(async (ctx): Promise<ActionResult> => {
      const context = ctx as OrgContextLike;
      if (context.orgId !== orgId) return { success: false, error: 'forbidden' };

      const { rows } = await context.client.query<OrganizationOnboardingRow>(
        `select onboarding_state
           from public.organizations
          where id = $1::uuid
          limit 1`,
        [orgId],
      );

      const state = normalizePersistedState(rows[0]?.onboarding_state);
      const completed = new Set(state.completedSteps);
      const skipped = new Set(state.skippedSteps);

      if (status === 'completed') {
        completed.add(stepOrder);
        skipped.delete(stepOrder);
      } else {
        skipped.add(stepOrder);
        completed.delete(stepOrder);
      }

      const nextState = {
        current_step: nextCurrentStep(completed, skipped),
        completed_steps: Array.from(completed).sort((a, b) => a - b),
        skipped_steps: Array.from(skipped).sort((a, b) => a - b),
        last_activity_at: new Date().toISOString(),
      };

      await context.client.query(
        `update public.organizations
            set onboarding_state = $2::jsonb,
                updated_at = now()
          where id = $1::uuid`,
        [orgId, JSON.stringify(nextState)],
      );

      revalidateSettingsOnboardingRoute();
      return { success: true };
    });
  } catch {
    return { success: false, error: 'persistence_failed' };
  }
}

function nextCurrentStep(completed: ReadonlySet<number>, skipped: ReadonlySet<number>): number {
  return (
    ONBOARDING_STEP_DEFINITIONS.find((step) => !completed.has(step.order) && !skipped.has(step.order))?.order ?? 6
  );
}

function revalidateSettingsOnboardingRoute() {
  try {
    revalidateLocalized(SETTINGS_ONBOARDING_ROUTE);
  } catch {
    /* no request store in unit tests */
  }
}

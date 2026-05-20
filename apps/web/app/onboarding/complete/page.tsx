/**
 * SET-006 Onboarding completion (Server Component).
 *
 * Resolves org context server-side and hands the completion Server Action
 * to the SET-006 client island. No fabricated completion timestamps — the
 * client renders an honest error state when the loader cannot resolve.
 */

import { loadOnboardingContext } from '../_loader';
import { redirectIfOnboardingStepMismatch, type OnboardingRouteProps } from '../_routing';
import { completeOnboarding, restartOnboarding } from '../_actions';
import { OnboardingCompleteClient } from './_components/complete-client';

export default async function OnboardingCompletePage(props: OnboardingRouteProps = {}) {
  const ctx = await loadOnboardingContext();
  if (ctx.state !== 'ready') {
    return (
      <OnboardingCompleteClient
        state={ctx.state === 'permission_denied' ? 'error' : ctx.state}
        completeOnboarding={completeOnboarding}
        restartOnboarding={restartOnboarding}
      />
    );
  }

  await redirectIfOnboardingStepMismatch('completion', ctx.onboardingState.currentStep, props);

  return (
    <OnboardingCompleteClient
      state="ready"
      organization={{
        id: ctx.organization.id,
        name: ctx.organization.name,
        onboardingCompletedAt: ctx.organization.onboardingCompletedAt,
      }}
      onboardingState={{
        currentStep: 'completion',
        completedSteps: ctx.onboardingState.completedSteps,
        skippedSteps: ctx.onboardingState.skippedSteps,
        savedAt: ctx.onboardingState.savedAt,
      }}
      completeOnboarding={completeOnboarding}
      restartOnboarding={restartOnboarding}
    />
  );
}

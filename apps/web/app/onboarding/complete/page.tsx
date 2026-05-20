/**
 * SET-006 Onboarding completion (Server Component).
 *
 * Resolves org context server-side and hands the completion Server Action
 * to the SET-006 client island. No fabricated completion timestamps — the
 * client renders an honest error state when the loader cannot resolve.
 */

import { loadOnboardingContext } from '../_loader';
import { completeOnboarding } from '../_actions';
import { OnboardingCompletionClient } from './_components/complete-client';

export default async function OnboardingCompletePage() {
  const ctx = await loadOnboardingContext();
  if (ctx.state !== 'ready') {
    return (
      <OnboardingCompletionClient
        state={ctx.state === 'permission_denied' ? 'error' : ctx.state}
        completeOnboarding={completeOnboarding}
      />
    );
  }

  return (
    <OnboardingCompletionClient
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
    />
  );
}

/**
 * SET-005 First work order (Server Component).
 *
 * RSC wrapper around the SET-005 client island. Loads org + onboarding
 * state via `withOrgContext` and supplies Server Actions for skip,
 * complete, and the post-redirect first-WO callback.
 */

import { loadOnboardingContext } from '../_loader';
import { redirectIfOnboardingStepMismatch, type OnboardingRouteProps } from '../_routing';
import {
  skipOnboardingWorkOrderStep,
  completeOnboardingWorkOrderStep,
  markFirstWoCreated,
} from '../_actions';
import { OnboardingWorkOrderClient } from './_components/workorder-client';

export default async function OnboardingWorkOrderPage(props: OnboardingRouteProps = {}) {
  const ctx = await loadOnboardingContext();
  if (ctx.state !== 'ready') {
    return (
      <OnboardingWorkOrderClient
        state={ctx.state}
        skipOnboardingStep={skipOnboardingWorkOrderStep}
        completeOnboardingStep={completeOnboardingWorkOrderStep}
        markFirstWoCreated={markFirstWoCreated}
      />
    );
  }

  await redirectIfOnboardingStepMismatch('first_wo', ctx.onboardingState.currentStep, props);

  return (
    <OnboardingWorkOrderClient
      state="ready"
      organization={{
        id: ctx.organization.id,
        name: ctx.organization.name,
        onboardingCompletedAt: ctx.organization.onboardingCompletedAt,
      }}
      onboardingState={{
        currentStep: 'first_wo',
        completedSteps: ctx.onboardingState.completedSteps,
        skippedSteps: ctx.onboardingState.skippedSteps,
        firstWoAt: ctx.onboardingState.firstWoAt,
        savedAt: ctx.onboardingState.savedAt,
      }}
      skipOnboardingStep={skipOnboardingWorkOrderStep}
      completeOnboardingStep={completeOnboardingWorkOrderStep}
      markFirstWoCreated={markFirstWoCreated}
    />
  );
}

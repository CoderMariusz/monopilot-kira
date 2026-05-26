/**
 * SET-004 First product (Server Component).
 *
 * Loads organization + onboarding state via `withOrgContext`. The step
 * transitions are bound to dedicated Server Actions so the client never
 * has to fabricate completion data.
 */

import { loadOnboardingContext } from '../_loader';
import { redirectIfOnboardingStepMismatch, type OnboardingRouteProps } from '../_routing';
import { skipOnboardingProductStep, completeOnboardingProductStep } from '../_actions';
import { OnboardingProductClient } from './_components/product-client';

export default async function OnboardingProductPage(props: OnboardingRouteProps = {}) {
  const ctx = await loadOnboardingContext();
  if (ctx.state !== 'ready') {
    return (
      <OnboardingProductClient
        state={ctx.state}
        skipOnboardingStep={skipOnboardingProductStep}
        completeOnboardingStep={completeOnboardingProductStep}
      />
    );
  }

  await redirectIfOnboardingStepMismatch('first_product', ctx.onboardingState.currentStep, props);

  return (
    <OnboardingProductClient
      state="ready"
      organization={{
        id: ctx.organization.id,
        name: ctx.organization.name,
        onboardingCompletedAt: ctx.organization.onboardingCompletedAt,
      }}
      onboardingState={{
        currentStep: 'first_product',
        completedSteps: ctx.onboardingState.completedSteps,
        skippedSteps: ctx.onboardingState.skippedSteps,
        savedAt: ctx.onboardingState.savedAt,
      }}
      skipOnboardingStep={skipOnboardingProductStep}
      completeOnboardingStep={completeOnboardingProductStep}
    />
  );
}

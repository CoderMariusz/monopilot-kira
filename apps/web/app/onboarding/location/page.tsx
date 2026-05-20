/**
 * SET-003 First location (Server Component).
 *
 * The first_warehouse data is owned by SET-002. We surface what the loader
 * can resolve from `withOrgContext` and otherwise let the client island
 * render the error/empty branch. No fabricated warehouse defaults.
 */

import { loadOnboardingContext } from '../_loader';
import { redirectIfOnboardingStepMismatch, type OnboardingRouteProps } from '../_routing';
import { createFirstLocation } from '../_actions';
import { OnboardingLocationClient } from './_components/location-client';

export default async function OnboardingLocationPage(props: OnboardingRouteProps = {}) {
  const ctx = await loadOnboardingContext();
  if (ctx.state !== 'ready') {
    return (
      <OnboardingLocationClient
        state={ctx.state === 'permission_denied' ? 'error' : ctx.state}
        createFirstLocation={createFirstLocation}
      />
    );
  }

  await redirectIfOnboardingStepMismatch('first_location', ctx.onboardingState.currentStep, props);

  return (
    <OnboardingLocationClient
      state="ready"
      organization={{
        id: ctx.organization.id,
        name: ctx.organization.name,
        onboardingCompletedAt: ctx.organization.onboardingCompletedAt,
      }}
      onboardingState={{
        currentStep: 'first_location',
        completedSteps: ctx.onboardingState.completedSteps,
        skippedSteps: ctx.onboardingState.skippedSteps,
        savedAt: ctx.onboardingState.savedAt,
      }}
      firstWarehouse={ctx.firstWarehouse ?? undefined}
      createFirstLocation={createFirstLocation}
    />
  );
}

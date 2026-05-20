/**
 * SET-002 First warehouse (Server Component).
 *
 * Resolves the org id and onboarding snapshot via `withOrgContext`. Real
 * persistence runs through the `createFirstWarehouse` Server Action; no
 * data is fabricated when the load fails.
 */

import { loadOnboardingContext } from '../_loader';
import { redirectIfOnboardingStepMismatch, type OnboardingRouteProps } from '../_routing';
import { createFirstWarehouse } from '../_actions';
import { OnboardingWarehouseClient } from './_components/warehouse-client';

const EMPTY_INITIAL_WAREHOUSE = {
  name: '',
  code: '',
  type: 'finished' as const,
  address: '',
};

export default async function OnboardingWarehousePage(props: OnboardingRouteProps = {}) {
  const ctx = await loadOnboardingContext();
  if (ctx.state !== 'ready') {
    return (
      <OnboardingWarehouseClient
        state={ctx.state}
        createFirstWarehouse={createFirstWarehouse}
      />
    );
  }

  await redirectIfOnboardingStepMismatch('first_warehouse', ctx.onboardingState.currentStep, props);

  return (
    <OnboardingWarehouseClient
      state="ready"
      orgId={ctx.orgId}
      onboardingState={{
        currentStep: 'first_warehouse',
        completed: ctx.onboardingState.completedSteps,
        skipped: ctx.onboardingState.skippedSteps,
        savedAt: ctx.onboardingState.savedAt,
      }}
      initialWarehouse={EMPTY_INITIAL_WAREHOUSE}
      createFirstWarehouse={createFirstWarehouse}
    />
  );
}

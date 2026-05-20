'use server';

export { saveOrgProfile } from '../../actions/onboarding/save-org-profile';
export { createFirstWarehouse } from '../../actions/onboarding/create-first-warehouse';
export { createFirstLocation } from '../../actions/onboarding/create-first-location';
export { markFirstWoCreated } from '../../actions/onboarding/mark-first-wo-created';
export { completeOnboarding } from '../../actions/onboarding/complete-onboarding';

import { skipOnboardingStep } from '../../actions/onboarding/skip-step';
import { completeOnboardingStep } from '../../actions/onboarding/complete-step';

export async function skipOnboardingProductStep(step: 4) {
  return skipOnboardingStep(step);
}

export async function completeOnboardingProductStep(step: 4) {
  return completeOnboardingStep(step);
}

export async function skipOnboardingWorkOrderStep(step: 5) {
  return skipOnboardingStep(step);
}

export async function completeOnboardingWorkOrderStep(step: 5) {
  return completeOnboardingStep(step);
}

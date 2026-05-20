/**
 * Onboarding RSC loader adapter.
 *
 * Production pages call this Server Component loader, which delegates to the
 * real withOrgContext-backed onboarding loader under apps/web/actions. This
 * keeps page.tsx files server-only while avoiding test-only prop injection.
 */

import { loadOnboardingContext as loadRealOnboardingContext } from '../../actions/onboarding/load';

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
  onboardingStartedAt: string | null;
};

export type OnboardingState = {
  currentStep: OnboardingStepKey;
  completedSteps: OnboardingStepKey[];
  skippedSteps: OnboardingStepKey[];
  skippedStepNumbers: number[];
  firstWoAt: string | null;
  savedAt: string;
};

export type OnboardingWarehouse = {
  id: string;
  code: string;
  name: string;
};

export type LoadedOnboardingContext =
  | {
      state: 'ready';
      orgId: string;
      organization: OnboardingOrganization;
      onboardingState: OnboardingState;
      firstWarehouse: OnboardingWarehouse | null;
    }
  | { state: 'error' | 'permission_denied'; orgId: null; organization: null; onboardingState: null; firstWarehouse: null };

export async function loadOnboardingContext(): Promise<LoadedOnboardingContext> {
  const result = await loadRealOnboardingContext();
  if (result.ok === false) {
    return {
      state: result.error === 'forbidden' ? 'permission_denied' : 'error',
      orgId: null,
      organization: null,
      onboardingState: null,
      firstWarehouse: null,
    };
  }

  return {
    state: 'ready',
    orgId: result.organization.id,
    organization: result.organization,
    onboardingState: result.onboardingState,
    firstWarehouse: result.firstWarehouse,
  };
}

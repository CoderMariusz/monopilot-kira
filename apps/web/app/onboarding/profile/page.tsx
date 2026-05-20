/**
 * SET-001 Onboarding organization profile (Server Component).
 *
 * Loads org + onboarding state server-side via `withOrgContext` and hands
 * them to the SET-001 client island. Mutations go through the `saveOrgProfile`
 * Server Action — never through a fabricated client fallback.
 */

import { loadOnboardingContext } from '../_loader';
import { saveOrgProfile } from '../_actions';
import { OnboardingProfileClient } from './_components/profile-client';

export default async function OnboardingProfilePage() {
  const ctx = await loadOnboardingContext();
  if (ctx.state !== 'ready') {
    return <OnboardingProfileClient state={ctx.state} saveOrgProfile={saveOrgProfile} />;
  }

  return (
    <OnboardingProfileClient
      state="ready"
      organization={ctx.organization}
      onboardingState={{
        currentStep: 'org_profile',
        completedSteps: ctx.onboardingState.completedSteps,
        skippedSteps: ctx.onboardingState.skippedSteps,
        savedAt: ctx.onboardingState.savedAt,
      }}
      saveOrgProfile={saveOrgProfile}
    />
  );
}

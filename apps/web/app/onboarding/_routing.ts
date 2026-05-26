import { redirect } from 'next/navigation';
import type { OnboardingStepKey } from './_loader';

const STEP_ROUTE: Record<OnboardingStepKey, string> = {
  org_profile: 'profile',
  first_warehouse: 'warehouse',
  first_location: 'location',
  first_product: 'product',
  first_wo: 'workorder',
  completion: 'complete',
};

type OnboardingRouteParams = { locale?: string };

export type OnboardingRouteProps = {
  params?: OnboardingRouteParams | Promise<OnboardingRouteParams>;
};

async function localePrefix(props?: OnboardingRouteProps): Promise<string> {
  const params = await props?.params;
  const locale = params?.locale;
  return typeof locale === 'string' && locale.length > 0 ? `/${locale}` : '';
}

export async function redirectIfOnboardingStepMismatch(
  expectedStep: OnboardingStepKey,
  actualStep: OnboardingStepKey,
  props?: OnboardingRouteProps,
): Promise<void> {
  if (actualStep === expectedStep) return;

  const targetRoute = STEP_ROUTE[actualStep];
  redirect(`${await localePrefix(props)}/onboarding/${targetRoute}`);
}

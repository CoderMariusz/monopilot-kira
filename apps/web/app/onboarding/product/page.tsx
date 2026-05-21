import React from 'react';
import { getTranslations } from 'next-intl/server';
import { advanceOnboarding } from '../../../actions/onboarding/advance';
import { skipOnboarding } from '../../../actions/onboarding/skip';
import { FALLBACK_COPY, ProductOnboardingClient } from './ProductOnboardingClient';

type OnboardingStepKey =
  | 'org_profile'
  | 'first_warehouse'
  | 'first_location'
  | 'first_product'
  | 'first_wo'
  | 'completion';

type Copy = typeof FALLBACK_COPY;

type SkipOnboardingStepResult =
  | { ok: true; skippedStep: 4; nextStep: 'first_wo' }
  | { ok: false; error: string };

type CompleteOnboardingStepResult =
  | { ok: true; completedStep: 4; nextStep: 'first_wo' }
  | { ok: false; error: string };

type OnboardingProductPageProps = {
  organization?: {
    id: string;
    name: string;
    onboardingCompletedAt: string | null;
  };
  onboardingState?: {
    currentStep: OnboardingStepKey;
    completedSteps: OnboardingStepKey[];
    skippedSteps: OnboardingStepKey[];
    savedAt: string;
  };
  state?: 'ready' | 'loading' | 'error' | 'permission_denied';
  skipOnboardingStep?: (stepNumber: 4) => Promise<SkipOnboardingStepResult>;
  completeOnboardingStep?: (stepNumber: 4) => Promise<CompleteOnboardingStepResult>;
  retryLoad?: () => void;
};

type RouteProps = OnboardingProductPageProps & {
  params?: { locale?: string };
};

async function getServerCopy(): Promise<Copy> {
  const t = await getTranslations('onboarding.product');
  const msg = (key: keyof Copy) => {
    try {
      const translated = t(key);
      return translated && translated !== key ? translated : FALLBACK_COPY[key];
    } catch {
      return FALLBACK_COPY[key];
    }
  };

  return {
    title: msg('title'),
    productHeading: msg('productHeading'),
    productButton: msg('productButton'),
    skipButton: msg('skipButton'),
    technicalHelp: msg('technicalHelp'),
    productIntro: msg('productIntro'),
    optionalSkip: msg('optionalSkip'),
    loadError: msg('loadError'),
    permissionDenied: msg('permissionDenied'),
    productBody: msg('productBody'),
  };
}

async function skipProductOnboardingStep(stepNumber: 4): Promise<SkipOnboardingStepResult> {
  'use server';

  const result = await skipOnboarding({ step: stepNumber });
  if (result.ok === false) return { ok: false, error: result.error };
  return { ok: true, skippedStep: stepNumber, nextStep: 'first_wo' as const };
}

async function completeProductOnboardingStep(stepNumber: 4): Promise<CompleteOnboardingStepResult> {
  'use server';

  const result = await advanceOnboarding({ step: stepNumber });
  if (result.ok === false) return { ok: false, error: result.error };
  return { ok: true, completedStep: stepNumber, nextStep: 'first_wo' as const };
}

async function ServerOnboardingProductPage() {
  const copy = await getServerCopy();
  return (
    <ProductOnboardingClient
      copy={copy}
      skipOnboardingStep={skipProductOnboardingStep}
      completeOnboardingStep={completeProductOnboardingStep}
    />
  );
}

function OnboardingProductPage(props: OnboardingProductPageProps): React.ReactElement;
function OnboardingProductPage(props: { params: { locale?: string } }): Promise<React.ReactElement>;
function OnboardingProductPage(props: RouteProps = {}) {
  if (props.params) {
    return ServerOnboardingProductPage();
  }

  return <ProductOnboardingClient {...props} copy={FALLBACK_COPY} />;
}

const OnboardingProductPageExport = OnboardingProductPage as unknown as React.ComponentType<RouteProps>;
export default OnboardingProductPageExport;

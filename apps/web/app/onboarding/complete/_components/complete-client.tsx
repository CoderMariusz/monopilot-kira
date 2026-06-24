'use client';

import React, { useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@monopilot/ui/Button';

type OnboardingStepKey =
  | 'org_profile'
  | 'first_warehouse'
  | 'first_location'
  | 'first_product'
  | 'first_wo'
  | 'completion';

type CompleteOnboardingResult = {
  ok: boolean;
  onboardingCompletedAt?: string;
  redirectTo?: string;
  error?: string;
};

type RestartOnboardingResult = {
  ok: boolean;
  error?: string;
};

type OnboardingCompletionPageProps = {
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
  state?: 'ready' | 'loading' | 'error';
  completeOnboarding?: (input: { orgId: string }) => Promise<CompleteOnboardingResult>;
  restartOnboarding?: () => Promise<RestartOnboardingResult>;
  retryLoad?: () => void;
};

type StepMeta = {
  code: string;
  key: OnboardingStepKey;
  num: number;
  label: string;
  sub: string;
  help: string;
  skippable?: boolean;
};

const ONBOARDING_STEPS: StepMeta[] = [
  {
    code: 'SET-001',
    key: 'org_profile',
    num: 1,
    label: 'Organization profile',
    sub: 'Name, timezone, locale, currency, logo',
    help: "We'll use these defaults across every module. You can change them any time from Settings › Company profile.",
  },
  {
    code: 'SET-002',
    key: 'first_warehouse',
    num: 2,
    label: 'First warehouse',
    sub: 'Where you store finished goods',
    help: 'Each warehouse holds one or more locations (bins/zones). You can create more later in Settings › Warehouses.',
  },
  {
    code: 'SET-003',
    key: 'first_location',
    num: 3,
    label: 'First location',
    sub: 'Zone / bin inside the warehouse',
    help: 'Locations are ltree paths (e.g. `FG › Zone A › Rack 1 › Bin 3`). Scanner picks are routed by location.',
  },
  {
    code: 'SET-004',
    key: 'first_product',
    num: 4,
    label: 'First product',
    sub: 'SKU + BOM (skippable · redirects to 03-TECHNICAL)',
    help: 'Soft redirect into the Technical module — you can also import from D365 later.',
    skippable: true,
  },
  {
    code: 'SET-005',
    key: 'first_wo',
    num: 5,
    label: 'First work order',
    sub: 'Schedule your first production run (skippable · redirects to 04-PLANNING-BASIC)',
    help: "Soft redirect into Planning Basic — you can come back here after you've created an SO too.",
    skippable: true,
  },
  {
    code: 'SET-006',
    key: 'completion',
    num: 6,
    label: 'Completion',
    sub: "You're live · next-step cards",
    help: 'Confetti moment + card grid linking to Module Toggles, Schema Browser, and Rules Registry.',
  },
];

const DEFAULT_ORGANIZATION: NonNullable<OnboardingCompletionPageProps['organization']> = {
  id: 'org-current',
  name: 'Current organization',
  onboardingCompletedAt: null,
};

const DEFAULT_ONBOARDING_STATE: NonNullable<OnboardingCompletionPageProps['onboardingState']> = {
  currentStep: 'completion',
  completedSteps: ['org_profile', 'first_warehouse', 'first_location', 'first_product', 'first_wo'],
  skippedSteps: [],
  savedAt: '',
};

async function missingCompleteOnboarding(): Promise<CompleteOnboardingResult> {
  return { ok: false, error: 'PERSISTENCE_FAILED' };
}

async function missingRestartOnboarding(): Promise<RestartOnboardingResult> {
  return { ok: false, error: 'PERSISTENCE_FAILED' };
}

function localeAwarePath(pathname: string | null, target: string): string {
  const normalizedTarget = target.startsWith('/') ? target : `/${target}`;
  if (/^\/[a-z]{2}(?:-[A-Z]{2})?(?:\/|$)/.test(normalizedTarget)) {
    return normalizedTarget;
  }

  const firstSegment = pathname?.split('/').filter(Boolean)[0];
  const locale = firstSegment && /^[a-z]{2}(?:-[A-Z]{2})?$/.test(firstSegment) ? firstSegment : 'en';
  return `/${locale}${normalizedTarget}`;
}

export function OnboardingCompleteClient({
  organization = DEFAULT_ORGANIZATION,
  onboardingState = DEFAULT_ONBOARDING_STATE,
  state = 'ready',
  completeOnboarding = missingCompleteOnboarding,
  restartOnboarding = missingRestartOnboarding,
  retryLoad,
}: OnboardingCompletionPageProps) {
  const t = useTranslations('onboarding');
  const pathname = usePathname();
  const router = useRouter();
  const [current, setCurrent] = useState<OnboardingStepKey>(onboardingState.currentStep);
  const [completed, setCompleted] = useState<OnboardingStepKey[]>(onboardingState.completedSteps);
  const [skipped, setSkipped] = useState<OnboardingStepKey[]>(onboardingState.skippedSteps);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(organization.onboardingCompletedAt);

  const currentStep = useMemo(() => ONBOARDING_STEPS.find((step) => step.key === current) ?? ONBOARDING_STEPS[5]!, [current]);
  const currentIndex = ONBOARDING_STEPS.findIndex((step) => step.key === currentStep.key);
  const percent = Math.round((completed.length / ONBOARDING_STEPS.length) * 100);

  async function restart() {
    setIsRestarting(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const result = await restartOnboarding();
      if (!result.ok) {
        setErrorMessage(result.error ?? 'PERSISTENCE_FAILED');
        return;
      }

      setCurrent('org_profile');
      setCompleted([]);
      setSkipped([]);
      setCompletedAt(null);
      setStatusMessage('Onboarding restarted. organizations.onboarding_state was committed.');
      router.refresh();
      router.push(localeAwarePath(pathname, '/onboarding/profile'));
    } finally {
      setIsRestarting(false);
    }
  }

  function navigateStep(step: OnboardingStepKey) {
    setCurrent(step);
    setStatusMessage(null);
    setErrorMessage(null);
  }

  function back() {
    if (currentIndex > 0) {
      navigateStep(ONBOARDING_STEPS[currentIndex - 1]!.key);
    }
  }

  function skip() {
    if (!currentStep.skippable) return;
    const next = ONBOARDING_STEPS[Math.min(ONBOARDING_STEPS.length - 1, currentIndex + 1)]!.key;
    if (!completed.includes(currentStep.key)) {
      setSkipped((existing) => (existing.includes(currentStep.key) ? existing : [...existing, currentStep.key]));
    }
    navigateStep(next);
  }

  function continueStep() {
    const next = ONBOARDING_STEPS[Math.min(ONBOARDING_STEPS.length - 1, currentIndex + 1)]!.key;
    setCompleted((existing) => (existing.includes(currentStep.key) ? existing : [...existing, currentStep.key]));
    setSkipped((existing) => existing.filter((step) => step !== currentStep.key));
    navigateStep(next);
  }

  async function finishOnboarding() {
    setIsSubmitting(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const result = await completeOnboarding({ orgId: organization.id });
      if (!result.ok) {
        setErrorMessage(result.error ?? 'PERSISTENCE_FAILED');
        return;
      }

      const timestamp = result.onboardingCompletedAt ?? new Date().toISOString();
      setCompletedAt(timestamp);
      setCompleted((existing) => (existing.includes('completion') ? existing : [...existing, 'completion']));
      setStatusMessage('Onboarding completed. organizations.onboarding_completed_at was committed.');
      const target = result.redirectTo ?? '/settings/users';
      router.refresh();
      router.push(localeAwarePath(pathname, target));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (state === 'loading') {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div role="status" aria-label="Loading onboarding completion" className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-6">
          Loading onboarding completion…
        </div>
        <Button type="button" className="btn-primary" disabled>
          Finish onboarding
        </Button>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-red-800">
          Couldn't load onboarding progress. The saved wizard state remains unchanged.
        </div>
        <Button type="button" className="btn-secondary" onClick={() => retryLoad?.()}>
          Retry
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('step_eyebrow')}</p>
          <h1 className="text-3xl font-semibold text-slate-950">{t('wizard_title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('wizard_subtitle', { percent })}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" className="btn-secondary" onClick={restart} disabled={isRestarting || isSubmitting}>
            {t('restart')}
          </Button>
          {currentStep.skippable ? (
            <Button type="button" className="btn-secondary" onClick={skip}>
              {t('skip_step')}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
        <b>SET-001 Wizard Launcher.</b> New-org setup path — auto-shown on first admin login when{' '}
        <code>onboarding_completed_at IS NULL</code>. Resume capability: returning user continues from{' '}
        <code>onboarding_state.current_step</code>.
      </div>

      <nav aria-label="Onboarding steps" className="mb-5 flex gap-1 rounded-md border border-slate-200 bg-slate-50 p-2">
        {ONBOARDING_STEPS.map((step) => {
          const isDone = completed.includes(step.key);
          const isCurrent = current === step.key;
          return (
            <Button
              key={step.key}
              type="button"
              aria-current={isCurrent ? 'step' : undefined}
              className={`flex-1 rounded border px-3 py-2 text-left ${
                isCurrent ? 'border-blue-600 bg-blue-600 text-white' : isDone ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-white'
              }`}
              onClick={() => navigateStep(step.key)}
            >
              {step.num} {isDone ? '✓ ' : ''}{step.label} {step.code}
            </Button>
          );
        })}
      </nav>

      {statusMessage ? <div className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">{statusMessage}</div> : null}
      {errorMessage ? <div role="alert" className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{errorMessage}</div> : null}

      <section role="region" aria-label={`${currentStep.code} · ${currentStep.label}`} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">{currentStep.code} · {currentStep.label}</h2>
        <p className="mt-1 text-sm text-slate-600">{currentStep.sub}</p>
        <div className="my-4 rounded border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{currentStep.help}</div>

        {current === 'first_wo' ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
            <div className="mb-2 text-3xl" aria-hidden="true">▶</div>
            <h3 className="text-base font-semibold">Schedule your first work order</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              Work orders live in <b>04-PLANNING-BASIC</b>. You'll schedule a production run (line, quantity, BOM). First-WO-created timestamp is captured for onboarding KPI: &lt;15min P50.
            </p>
            <Button
              type="button"
              className="mt-4 btn-primary"
              onClick={() => router.push(localeAwarePath(pathname, '/planning'))}
            >
              Open planning →
            </Button>
            <p className="mt-2 text-xs text-slate-500">Optional — you can skip this step.</p>
          </div>
        ) : null}

        {current === 'completion' ? (
          <div className="rounded-md border border-slate-200 bg-gradient-to-b from-blue-50 to-white p-8 text-center">
            <div className="mb-2 text-5xl">🎉</div>
            <h3 className="text-xl font-bold text-slate-950">You're live on Monopilot</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              Setup complete. organizations.onboarding_completed_at timestamp recorded · first-WO KPI captured. Here's what to do next:
            </p>
            {completedAt ? <p className="mt-2 text-xs font-mono text-slate-500">{completedAt}</p> : null}
            <div className="mx-auto mt-6 grid max-w-3xl grid-cols-1 gap-3 md:grid-cols-3">
              <a href="/admin/features" className="rounded-md border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-blue-300">
                <span className="block font-semibold text-slate-950">Module toggles</span>
                <span className="mt-1 block text-sm text-slate-600">Switch on NPD, OEE, Finance and more.</span>
              </a>
              <a href="/admin/schema" className="rounded-md border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-blue-300">
                <span className="block font-semibold text-slate-950">Schema browser</span>
                <span className="mt-1 block text-sm text-slate-600">Explore L1/L2/L3 columns · add custom fields.</span>
              </a>
              <a href="/admin/rules" className="rounded-md border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-blue-300">
                <span className="block font-semibold text-slate-950">Rules registry</span>
                <span className="mt-1 block text-sm text-slate-600">Review active cascading + gate rules.</span>
              </a>
            </div>
          </div>
        ) : null}
      </section>

      <footer className="mt-4 flex items-center justify-between gap-3">
        <Button type="button" className="btn-secondary" onClick={back} disabled={currentIndex === 0}>
          {t('back')}
        </Button>
        <div className="text-sm text-slate-500">
          Step {currentStep.num} of 6 · {completed.length} completed{skipped.length ? ` · ${skipped.length} skipped` : ''}
        </div>
        {current === 'completion' ? (
          <Button type="button" className="btn-primary" onClick={finishOnboarding} disabled={isSubmitting || isRestarting}>
            {isSubmitting ? 'Finishing…' : t('finish')}
          </Button>
        ) : (
          <Button type="button" className="btn-primary" onClick={continueStep}>
            {t('continue')}
          </Button>
        )}
      </footer>
    </main>
  );
}

export default OnboardingCompleteClient;

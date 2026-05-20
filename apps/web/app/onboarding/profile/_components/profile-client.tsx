'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

type OnboardingStepKey =
  | 'org_profile'
  | 'first_warehouse'
  | 'first_location'
  | 'first_product'
  | 'first_wo'
  | 'completion';

type OrgProfileInput = {
  orgId: string;
  orgName: string;
  timezone: string;
  locale: string;
  currency: string;
  gs1Prefix: string;
};

type OrgProfileResult =
  | {
      ok: true;
      organization: {
        id: string;
        name: string;
        timezone: string;
        locale: string;
        currency: string;
        gs1Prefix: string;
      };
      onboardingState: { current_step: 2; completed: ['org_profile']; skipped: OnboardingStepKey[] };
      redirectTo: '/onboarding/warehouse';
    }
  | { ok: false; error: 'VALIDATION_FAILED' | 'PERSISTENCE_FAILED'; field?: keyof OrgProfileInput; message?: string };

type OnboardingProfilePageProps = {
  organization?: {
    id: string;
    name: string;
    timezone: string;
    locale: string;
    currency: string;
    gs1Prefix: string;
    onboardingCompletedAt: string | null;
  };
  onboardingState?: {
    currentStep: 'org_profile';
    completedSteps: OnboardingStepKey[];
    skippedSteps: OnboardingStepKey[];
    savedAt: string;
  };
  state?: 'ready' | 'loading' | 'error' | 'permission_denied';
  saveOrgProfile?: (input: OrgProfileInput) => Promise<OrgProfileResult>;
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

const DEFAULT_ORGANIZATION: NonNullable<OnboardingProfilePageProps['organization']> = {
  id: 'org-current',
  name: '',
  timezone: 'Europe/Warsaw',
  locale: 'pl-PL',
  currency: 'PLN',
  gs1Prefix: '',
  onboardingCompletedAt: null,
};

const DEFAULT_ONBOARDING_STATE: NonNullable<OnboardingProfilePageProps['onboardingState']> = {
  currentStep: 'org_profile',
  completedSteps: [],
  skippedSteps: [],
  savedAt: '',
};

const GS1_REQUIRED_MESSAGE = 'GS1 Company Prefix is required for SSCC generation';

async function missingServerAction(): Promise<OrgProfileResult> {
  return { ok: false, error: 'PERSISTENCE_FAILED', message: 'Organization profile could not be saved.' };
}

export function OnboardingProfileClient({
  organization = DEFAULT_ORGANIZATION,
  onboardingState = DEFAULT_ONBOARDING_STATE,
  state = 'ready',
  saveOrgProfile = missingServerAction,
  retryLoad,
}: OnboardingProfilePageProps) {
  const router = useRouter();
  const gs1PrefixRef = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState<OnboardingStepKey>(onboardingState.currentStep);
  const [completed, setCompleted] = useState<OnboardingStepKey[]>(onboardingState.completedSteps);
  const [skipped, setSkipped] = useState<OnboardingStepKey[]>(onboardingState.skippedSteps);
  const [orgName, setOrgName] = useState(organization.name);
  const [timezone, setTimezone] = useState(organization.timezone);
  const [locale, setLocale] = useState(organization.locale);
  const [currency, setCurrency] = useState(organization.currency);
  const [gs1Prefix, setGs1Prefix] = useState(organization.gs1Prefix);
  const [gs1Error, setGs1Error] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentStep = useMemo(() => ONBOARDING_STEPS.find((step) => step.key === current) ?? ONBOARDING_STEPS[0]!, [current]);
  const currentIndex = ONBOARDING_STEPS.findIndex((step) => step.key === currentStep.key);
  const percent = Math.round((completed.length / ONBOARDING_STEPS.length) * 100);

  function restart() {
    setCurrent('org_profile');
    setCompleted([]);
    setSkipped([]);
    setStatusMessage(null);
    setGs1Error(null);
  }

  function back() {
    if (currentIndex > 0) {
      setCurrent(ONBOARDING_STEPS[currentIndex - 1]!.key);
    }
  }

  function skip() {
    if (!currentStep.skippable) return;
    setSkipped((existing) => (existing.includes(currentStep.key) ? existing : [...existing, currentStep.key]));
    setCurrent(ONBOARDING_STEPS[Math.min(ONBOARDING_STEPS.length - 1, currentIndex + 1)]!.key);
  }

  async function submitProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setGs1Error(null);

    const trimmedGs1Prefix = gs1Prefix.trim();
    if (!trimmedGs1Prefix) {
      setGs1Error(GS1_REQUIRED_MESSAGE);
      gs1PrefixRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await saveOrgProfile({
        orgId: organization.id,
        orgName: orgName.trim(),
        timezone,
        locale,
        currency,
        gs1Prefix: trimmedGs1Prefix,
      });

      if (result.ok === false) {
        const message = result.field === 'gs1Prefix' ? result.message ?? GS1_REQUIRED_MESSAGE : result.message ?? 'Organization profile could not be saved.';
        setGs1Error(message);
        gs1PrefixRef.current?.focus();
        return;
      }

      setCompleted((existing) => (existing.includes('org_profile') ? existing : [...existing, 'org_profile']));
      setCurrent('first_warehouse');
      setStatusMessage('Organization profile saved. onboarding_state.current_step = 2');
      router.push(result.redirectTo);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (state === 'loading') {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div role="status" aria-label="Loading onboarding profile" className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-6">
          Loading onboarding profile…
        </div>
        <Button type="button" className="btn-primary" disabled>
          Continue →
        </Button>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-red-800">
          Couldn't load onboarding profile. The saved wizard state remains unchanged.
        </div>
        <Button type="button" className="btn-secondary" onClick={() => retryLoad?.()}>
          Retry
        </Button>
      </main>
    );
  }

  if (state === 'permission_denied') {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-red-800">
          Permission denied: settings.onboarding.write is required to continue onboarding.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">SET-001..006</p>
          <h1 className="text-3xl font-semibold text-slate-950">Onboarding wizard</h1>
          <p className="mt-1 text-sm text-slate-600">
            6-step setup · target &lt;15 minutes · state saved automatically (organizations.onboarding_state). {percent}% complete.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" className="btn-secondary" onClick={restart}>
            Restart
          </Button>
          {currentStep.skippable ? (
            <Button type="button" className="btn-secondary" onClick={skip}>
              Skip this step →
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
              onClick={() => setCurrent(step.key)}
            >
              {isDone ? `✓ ${step.label} ${step.code}` : `${step.num} ${step.label} ${step.code}`}
            </Button>
          );
        })}
      </nav>

      {statusMessage ? <div className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">{statusMessage}</div> : null}

      <section role="region" aria-label={`${currentStep.code} · ${currentStep.label}`} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">
          {currentStep.code} · {currentStep.label}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{currentStep.sub}</p>
        <div className="my-4 rounded border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{currentStep.help}</div>

        {current === 'org_profile' ? (
          <form id="org-profile-form" className="grid gap-4 md:grid-cols-2" onSubmit={submitProfile}>
            <label className="grid gap-1 text-sm font-medium text-slate-800">
              Organization name
              <Input value={orgName} onChange={(event) => setOrgName(event.currentTarget.value)} className="w-80 rounded border border-slate-300 px-3 py-2" required />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-800">
              Timezone
              <select value={timezone} onChange={(event) => setTimezone(event.currentTarget.value)} className="rounded border border-slate-300 px-3 py-2">
                <option value="Europe/Warsaw">Europe/Warsaw</option>
                <option value="Europe/Berlin">Europe/Berlin</option>
                <option value="Europe/London">Europe/London</option>
                <option value="UTC">UTC</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-800">
              Locale
              <select value={locale} onChange={(event) => setLocale(event.currentTarget.value)} className="rounded border border-slate-300 px-3 py-2">
                <option value="pl-PL">pl-PL · Polski</option>
                <option value="en-GB">en-GB · English (UK)</option>
                <option value="en-US">en-US · English (US)</option>
                <option value="uk-UA">uk-UA · Українська</option>
                <option value="ro-RO">ro-RO · Română</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-800">
              Currency
              <select value={currency} onChange={(event) => setCurrency(event.currentTarget.value)} className="rounded border border-slate-300 px-3 py-2">
                <option value="PLN">PLN</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-800">
              GS1 Company Prefix
              <Input
                ref={gs1PrefixRef}
                value={gs1Prefix}
                onChange={(event) => {
                  setGs1Prefix(event.currentTarget.value);
                  if (gs1Error) setGs1Error(null);
                }}
                className="w-36 rounded border border-slate-300 px-3 py-2 font-mono"
                aria-invalid={gs1Error ? 'true' : undefined}
                aria-describedby="gs1-prefix-help"
              />
              <span id="gs1-prefix-help" className="text-xs text-slate-500">
                Required before SSCC generation in 11-SHIPPING (V-SHIP-PACK-03).
              </span>
              {gs1Error ? <span className="text-sm text-red-700">{gs1Error}</span> : null}
            </label>
            <div className="grid gap-1 text-sm font-medium text-slate-800">
              <span>Logo (optional)</span>
              <Button type="button" className="btn-secondary btn-sm w-fit">
                Upload image…
              </Button>
            </div>
          </form>
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-700">{currentStep.label} setup resumes here.</div>
        )}
      </section>

      <footer className="mt-4 flex items-center justify-between gap-3">
        <Button type="button" className="btn-secondary" onClick={back} disabled={currentIndex === 0}>
          ← Back
        </Button>
        <div className="text-sm text-slate-500">
          Step {currentStep.num} of 6 · {completed.length} completed{skipped.length ? ` · ${skipped.length} skipped` : ''}
        </div>
        {current === 'org_profile' ? (
          <Button type="submit" className="btn-primary" form="org-profile-form" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Continue →'}
          </Button>
        ) : current === 'completion' ? (
          <Button type="button" className="btn-primary">
            Finish onboarding
          </Button>
        ) : (
          <Button type="button" className="btn-primary" onClick={() => setCurrent(ONBOARDING_STEPS[Math.min(ONBOARDING_STEPS.length - 1, currentIndex + 1)]!.key)}>
            Continue →
          </Button>
        )}
      </footer>
    </main>
  );
}

export default OnboardingProfileClient;

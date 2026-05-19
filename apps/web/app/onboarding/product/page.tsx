'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@monopilot/ui/Button';

type OnboardingStepKey =
  | 'org_profile'
  | 'first_warehouse'
  | 'first_location'
  | 'first_product'
  | 'first_wo'
  | 'completion';

type OnboardingStep = {
  code: string;
  key: OnboardingStepKey;
  num: number;
  label: string;
  sub: string;
  help: string;
  skippable?: boolean;
};

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

const ONBOARDING_STEPS: OnboardingStep[] = [
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

const DEFAULT_STATE: NonNullable<OnboardingProductPageProps['onboardingState']> = {
  currentStep: 'first_product',
  completedSteps: ['org_profile', 'first_warehouse', 'first_location'],
  skippedSteps: [],
  savedAt: '',
};

function getStep(key: OnboardingStepKey) {
  return ONBOARDING_STEPS.find((step) => step.key === key) ?? ONBOARDING_STEPS[3]!;
}

function nextStepKey(current: OnboardingStepKey) {
  const index = ONBOARDING_STEPS.findIndex((step) => step.key === current);
  return ONBOARDING_STEPS[Math.min(ONBOARDING_STEPS.length - 1, index + 1)]!.key;
}

function previousStepKey(current: OnboardingStepKey) {
  const index = ONBOARDING_STEPS.findIndex((step) => step.key === current);
  return ONBOARDING_STEPS[Math.max(0, index - 1)]!.key;
}

function Stepper({
  current,
  completed,
  disabled,
  onJump,
}: {
  current: OnboardingStepKey;
  completed: OnboardingStepKey[];
  disabled: boolean;
  onJump: (step: OnboardingStepKey) => void;
}) {
  return (
    <nav
      aria-label="Onboarding steps"
      style={{
        display: 'flex',
        gap: 4,
        alignItems: 'stretch',
        marginBottom: 20,
        background: 'var(--gray-050, #f8fafc)',
        padding: 10,
        borderRadius: 6,
        border: '1px solid var(--border, #d9dee7)',
      }}
    >
      {ONBOARDING_STEPS.map((step) => {
        const isDone = completed.includes(step.key);
        const isCurrent = current === step.key;
        return (
          <Button
            key={step.key}
            type="button"
            disabled={disabled}
            onClick={() => onJump(step.key)}
            aria-current={isCurrent ? 'step' : undefined}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 4,
              cursor: 'pointer',
              textAlign: 'left',
              background: isCurrent ? 'var(--blue, #1f6feb)' : isDone ? '#e6f4e6' : '#fff',
              color: isCurrent ? '#fff' : 'inherit',
              border: `1px solid ${isCurrent ? 'var(--blue, #1f6feb)' : isDone ? '#a6d5a6' : 'var(--border, #d9dee7)'}`,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.8 }}>{step.num}</span>
              <span style={{ fontSize: 11, fontWeight: 600 }}>
                {isDone ? '✓ ' : ''}
                {step.label}
              </span>
            </span>
            <span style={{ display: 'block', fontSize: 10, marginTop: 2, opacity: 0.8 }}>{step.code}</span>
          </Button>
        );
      })}
    </nav>
  );
}

function RedirectCard({ disabled }: { disabled: boolean }) {
  const router = useRouter();

  return (
    <div
      style={{
        padding: 20,
        textAlign: 'center',
        border: '1px dashed var(--border, #d9dee7)',
        borderRadius: 6,
        background: 'var(--gray-050, #f8fafc)',
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>Create your first product</h3>
      <p style={{ fontSize: 12, maxWidth: 420, margin: '0 auto 14px', color: '#586174' }}>
        Products live in <strong>03-TECHNICAL</strong>. You'll go there to create the product master record and bill of
        materials, then come back to complete onboarding.
      </p>
      <Button
        type="button"
        disabled={disabled}
        onClick={() => router.push('/products/new?returnTo=%2Fonboarding%2Fwo')}
        style={{
          borderRadius: 4,
          border: '1px solid var(--blue, #1f6feb)',
          background: disabled ? '#dbe4f0' : 'var(--blue, #1f6feb)',
          color: disabled ? '#64748b' : '#fff',
          padding: '8px 12px',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        Open product editor
      </Button>
      <div style={{ fontSize: 11, marginTop: 8, color: '#586174' }}>Optional — you can skip this step.</div>
    </div>
  );
}

function WorkOrderCard({ disabled }: { disabled: boolean }) {
  const router = useRouter();

  return (
    <div
      style={{
        padding: 20,
        textAlign: 'center',
        border: '1px dashed var(--border, #d9dee7)',
        borderRadius: 6,
        background: 'var(--gray-050, #f8fafc)',
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 8 }}>▶</div>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>Schedule your first work order</h3>
      <p style={{ fontSize: 12, maxWidth: 420, margin: '0 auto 14px', color: '#586174' }}>
        Work orders live in <strong>04-PLANNING-BASIC</strong>. You'll schedule a production run (line, quantity, BOM).
        First-WO-created timestamp is captured for onboarding KPI: &lt;15min P50.
      </p>
      <Button
        type="button"
        disabled={disabled}
        onClick={() => router.push('/planning/work-orders/new?returnTo=%2Fonboarding%2Fcomplete')}
      >
        Open planning →
      </Button>
      <div style={{ fontSize: 11, marginTop: 8, color: '#586174' }}>Optional — you can skip this step.</div>
    </div>
  );
}

function PlaceholderStep({ label }: { label: string }) {
  return (
    <div style={{ padding: 20, border: '1px dashed var(--border, #d9dee7)', borderRadius: 6, background: 'var(--gray-050, #f8fafc)' }}>
      {label} setup resumes here.
    </div>
  );
}

export default function OnboardingProductPage({
  organization,
  onboardingState,
  state = 'ready',
  skipOnboardingStep,
  completeOnboardingStep,
  retryLoad,
}: OnboardingProductPageProps) {
  const router = useRouter();
  const initialOnboardingState = onboardingState ?? DEFAULT_STATE;
  const [current, setCurrent] = React.useState<OnboardingStepKey>(initialOnboardingState.currentStep);
  const [completed, setCompleted] = React.useState<OnboardingStepKey[]>(initialOnboardingState.completedSteps);
  const [skipped, setSkipped] = React.useState<OnboardingStepKey[]>(initialOnboardingState.skippedSteps);
  const [mutationError, setMutationError] = React.useState<string | null>(null);
  const [isMutating, setIsMutating] = React.useState(false);

  const currentStep = getStep(current);
  const currentIndex = ONBOARDING_STEPS.findIndex((step) => step.key === current);
  const percent = Math.round((completed.length / ONBOARDING_STEPS.length) * 100);
  const hasServerContract = Boolean(onboardingState && skipOnboardingStep && completeOnboardingStep);
  const controlsDisabled = state !== 'ready' || isMutating || !hasServerContract;

  if (state === 'permission_denied') {
    return (
      <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
        <div role="alert" style={{ border: '1px solid #f5c2c7', background: '#fff5f5', padding: 12, borderRadius: 6 }}>
          Permission denied: settings.onboarding.write is required to create or skip onboarding products.
        </div>
      </main>
    );
  }

  if (state === 'ready' && !hasServerContract) {
    return (
      <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
        <div role="alert" style={{ border: '1px solid #f5c2c7', background: '#fff5f5', padding: 12, borderRadius: 6 }}>
          Couldn't load onboarding progress. Server onboarding data or actions are unavailable, so SET-004 fails closed instead of advancing locally.
        </div>
      </main>
    );
  }

  async function skipCurrentStep() {
    if (controlsDisabled || current !== 'first_product') return;
    setMutationError(null);
    setIsMutating(true);
    try {
      if (!skipOnboardingStep) {
        setMutationError('SET-004 skip action is unavailable.');
        return;
      }
      const result = await skipOnboardingStep(4);
      if (result?.ok !== true) {
        setMutationError(result?.error ?? 'SET-004 skip action did not return a successful onboarding transition.');
        return;
      }
      setSkipped((existing) => (existing.includes('first_product') ? existing : [...existing, 'first_product']));
      setCurrent(result?.nextStep ?? 'first_wo');
    } finally {
      setIsMutating(false);
    }
  }

  async function continueFromStep() {
    if (controlsDisabled) return;
    setMutationError(null);

    if (current !== 'first_product') {
      setCompleted((existing) => (existing.includes(current) ? existing : [...existing, current]));
      setCurrent(nextStepKey(current));
      return;
    }

    setIsMutating(true);
    try {
      if (!completeOnboardingStep) {
        setMutationError('SET-004 continue action is unavailable.');
        return;
      }
      const result = await completeOnboardingStep(4);
      if (result?.ok !== true) {
        setMutationError(result?.error ?? 'SET-004 continue action did not return a successful onboarding transition.');
        return;
      }
      setCompleted((existing) => (existing.includes('first_product') ? existing : [...existing, 'first_product']));
      setCurrent(result?.nextStep ?? 'first_wo');
    } finally {
      setIsMutating(false);
    }
  }

  function restart() {
    setCompleted([]);
    setSkipped([]);
    setCurrent('org_profile');
    setMutationError(null);
  }

  function back() {
    setCurrent(previousStepKey(current));
    setMutationError(null);
  }

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <p style={{ margin: '0 0 4px', color: '#64748b', fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>SET-001..006</p>
          <h1 style={{ margin: '0 0 4px', fontSize: 24 }}>Onboarding wizard</h1>
          <p style={{ margin: 0, color: '#586174', fontSize: 13 }}>
            6-step setup · target &lt;15 minutes · state saved automatically (organizations.onboarding_state). {percent}% complete.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'start' }}>
          <Button type="button" onClick={restart} disabled={controlsDisabled}>
            Restart
          </Button>
          {current === 'first_product' && currentStep.skippable ? (
            <Button type="button" onClick={skipCurrentStep} disabled={controlsDisabled}>
              Skip this step →
            </Button>
          ) : null}
        </div>
      </header>

      <div
        style={{
          marginBottom: 14,
          fontSize: 12,
          padding: '10px 12px',
          background: '#eef6ff',
          borderRadius: 6,
          border: '1px solid #b8d8ff',
        }}
      >
        <strong>SET-001 Wizard Launcher.</strong> New-org setup path{organization?.name ? ` for ${organization.name}` : ''} — auto-shown on first admin login when{' '}
        <code>onboarding_completed_at IS NULL</code>. Resume capability: returning user continues from{' '}
        <code>onboarding_state.current_step</code>.
      </div>

      {state === 'loading' ? (
        <div role="status" aria-label="Loading onboarding product" style={{ marginBottom: 14, padding: 10, border: '1px dashed #cbd5e1', borderRadius: 6 }}>
          Loading onboarding product…
        </div>
      ) : null}

      {state === 'error' ? (
        <div role="alert" style={{ border: '1px solid #f5c2c7', background: '#fff5f5', padding: 12, borderRadius: 6, marginBottom: 14 }}>
          Couldn't load onboarding progress. Check your connection and try again.
          <div style={{ marginTop: 8 }}>
            <Button type="button" onClick={retryLoad}>
              Retry
            </Button>
          </div>
        </div>
      ) : null}

      {mutationError ? (
        <div role="alert" style={{ border: '1px solid #f5c2c7', background: '#fff5f5', padding: 12, borderRadius: 6, marginBottom: 14 }}>
          {mutationError}
        </div>
      ) : null}

      <Stepper current={current} completed={completed} disabled={controlsDisabled} onJump={setCurrent} />

      <section
        role="region"
        aria-label={`${currentStep.code} · ${currentStep.label}`}
        style={{ border: '1px solid var(--border, #d9dee7)', borderRadius: 6, padding: 16, background: '#fff' }}
      >
        <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>
          {currentStep.code} · {currentStep.label}
        </h2>
        <p style={{ margin: '0 0 12px', color: '#586174', fontSize: 13 }}>{currentStep.sub}</p>
        <div style={{ marginBottom: 12, fontSize: 11, padding: '8px 10px', background: 'var(--gray-050, #f8fafc)', borderRadius: 4, border: '1px dashed var(--border, #d9dee7)' }}>
          {currentStep.help}
        </div>

        {current === 'first_product' ? <RedirectCard disabled={controlsDisabled} /> : null}
        {current === 'first_wo' ? <WorkOrderCard disabled={controlsDisabled} /> : null}
        {current !== 'first_product' && current !== 'first_wo' ? <PlaceholderStep label={currentStep.label} /> : null}
      </section>

      <footer style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 16 }}>
        <Button type="button" onClick={back} disabled={currentIndex === 0 || controlsDisabled}>
          ← Back
        </Button>
        <div style={{ fontSize: 11, alignSelf: 'center', color: '#586174' }}>
          Step {currentStep.num} of 6 · {completed.length} completed{skipped.length ? ` · ${skipped.length} skipped` : ''}
        </div>
        {current === 'completion' ? (
          <Button type="button" disabled={controlsDisabled} onClick={() => router.push('/settings/profile')}>
            Finish onboarding
          </Button>
        ) : (
          <Button type="button" onClick={continueFromStep} disabled={controlsDisabled}>
            {isMutating ? 'Saving…' : 'Continue →'}
          </Button>
        )}
      </footer>
    </main>
  );
}

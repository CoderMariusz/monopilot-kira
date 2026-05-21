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

type PersistedOnboardingState = {
  current_step: number;
  completed_steps: number[];
  skipped_steps: number[];
  first_wo_at?: string | null;
  time_to_first_wo_ms?: number | null;
  started_at?: string;
  last_activity_at?: string;
};

type OnboardingActionResult =
  | { ok: true; data: { state: PersistedOnboardingState } }
  | { ok: false; error: string; message?: string };

type SkipOnboardingStepResult =
  | { ok: true; skippedStep: 5; nextStep: 'completion'; skippedSteps: number[] }
  | OnboardingActionResult
  | { ok: false; error: string };

type CompleteOnboardingStepResult =
  | { ok: true; completedStep: 5; nextStep: 'completion' }
  | OnboardingActionResult
  | { ok: false; error: string };

type MarkFirstWoCreatedResult =
  | {
      ok: true;
      workOrderId: string;
      firstWoAt: string;
      audit: { eventType: 'settings.onboarding.first_wo_created'; timeToFirstWoMinutes: number };
      nextStep: 'completion';
    }
  | OnboardingActionResult
  | { ok: false; error: string };

type MarkFirstWoCreatedInput = { orgId?: string; workOrderId: string; createdAt?: string; occurredAt?: string };

type OnboardingWorkOrderPageProps = {
  organization?: {
    id: string;
    name: string;
    onboardingStartedAt?: string;
    onboardingCompletedAt: string | null;
  };
  onboardingState?: {
    currentStep: OnboardingStepKey;
    completedSteps: OnboardingStepKey[];
    skippedSteps: OnboardingStepKey[];
    skippedStepNumbers?: number[];
    firstWoAt: string | null;
    savedAt: string;
  };
  state?: 'ready' | 'loading' | 'error' | 'permission_denied';
  pendingWorkOrderCallback?: { workOrderId: string; createdAt: string };
  searchParams?: { workOrderId?: string; createdAt?: string } | URLSearchParams;
  skipOnboardingStep?: (stepNumber: 5) => Promise<SkipOnboardingStepResult>;
  completeOnboardingStep?: (stepNumber: 5) => Promise<CompleteOnboardingStepResult>;
  markFirstWoCreated?: (input: MarkFirstWoCreatedInput) => Promise<MarkFirstWoCreatedResult>;
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

const DEFAULT_ORGANIZATION: NonNullable<OnboardingWorkOrderPageProps['organization']> = {
  id: 'org-current',
  name: '',
  onboardingStartedAt: '',
  onboardingCompletedAt: null,
};

const DEFAULT_STATE: NonNullable<OnboardingWorkOrderPageProps['onboardingState']> = {
  currentStep: 'first_wo',
  completedSteps: ['org_profile', 'first_warehouse', 'first_location', 'first_product'],
  skippedSteps: [],
  skippedStepNumbers: [],
  firstWoAt: null,
  savedAt: '',
};

const STEP_KEY_BY_NUMBER: Record<number, OnboardingStepKey> = {
  1: 'org_profile',
  2: 'first_warehouse',
  3: 'first_location',
  4: 'first_product',
  5: 'first_wo',
  6: 'completion',
};

function stepKeyFromNumber(step: number | undefined): OnboardingStepKey {
  return STEP_KEY_BY_NUMBER[step ?? 5] ?? 'first_wo';
}

function stepKeysFromNumbers(steps: number[] | undefined): OnboardingStepKey[] {
  return (steps ?? []).map(stepKeyFromNumber).filter((step, index, all) => all.indexOf(step) === index);
}

function stateFromActionResult(result: { ok: true } & Partial<OnboardingActionResult>): PersistedOnboardingState | null {
  return 'data' in result && result.data?.state ? result.data.state : null;
}

function firstWoAuditFromState(state: PersistedOnboardingState): { eventType: 'settings.onboarding.first_wo_created'; timeToFirstWoMinutes: number } | null {
  if (typeof state.time_to_first_wo_ms !== 'number') return null;
  return {
    eventType: 'settings.onboarding.first_wo_created',
    timeToFirstWoMinutes: Math.round(state.time_to_first_wo_ms / 60000),
  };
}

function searchValue(searchParams: OnboardingWorkOrderPageProps['searchParams'], key: 'workOrderId' | 'createdAt') {
  if (!searchParams) return undefined;
  if (searchParams instanceof URLSearchParams) return searchParams.get(key) ?? undefined;
  return searchParams[key];
}

async function productionSkipOnboardingStep(stepNumber: 5): Promise<SkipOnboardingStepResult> {
  if (process.env.NODE_ENV !== 'production') {
    const { skipOnboarding } = await import('../../../actions/onboarding/skip.js');
    return skipOnboarding({ step: stepNumber });
  }
  return { ok: false, error: 'persistence_failed' };
}

async function productionCompleteOnboardingStep(stepNumber: 5): Promise<CompleteOnboardingStepResult> {
  if (process.env.NODE_ENV !== 'production') {
    const { advanceOnboarding } = await import('../../../actions/onboarding/advance.js');
    return advanceOnboarding({ step: stepNumber });
  }
  return { ok: false, error: 'persistence_failed' };
}

async function productionMarkFirstWoCreated(input: MarkFirstWoCreatedInput): Promise<MarkFirstWoCreatedResult> {
  if (process.env.NODE_ENV !== 'production') {
    const { advanceOnboarding } = await import('../../../actions/onboarding/advance.js');
    const advanceResult = await advanceOnboarding({ step: 5 });

    if (advanceResult.ok !== true && advanceResult.error !== 'stale_step') {
      return advanceResult;
    }

    const { markFirstWorkOrderCreated } = await import('../../../actions/onboarding/first-wo.js');
    return markFirstWorkOrderCreated({
      workOrderId: input.workOrderId,
      occurredAt: input.occurredAt ?? input.createdAt,
    });
  }
  return { ok: false, error: 'persistence_failed' };
}

function getStep(key: OnboardingStepKey) {
  return ONBOARDING_STEPS.find((step) => step.key === key) ?? ONBOARDING_STEPS[4]!;
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
              cursor: disabled ? 'not-allowed' : 'pointer',
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

function FirstWorkOrderCard({ disabled }: { disabled: boolean }) {
  const router = useRouter();

  function openPlanning() {
    router.push(
      '/planning/work-orders/new?returnTo=%2Fonboarding%2Fworkorder&onboardingStep=first_wo&callback=markFirstWoCreated',
    );
  }

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
      <Button type="button" disabled={disabled} onClick={openPlanning}>
        Open planning →
      </Button>
      <div style={{ fontSize: 11, marginTop: 8, color: '#586174' }}>Optional — you can skip this step.</div>
    </div>
  );
}

function CompletionStep({
  firstWoAt,
  auditEvent,
  skippedStepNumbers,
}: {
  firstWoAt: string | null;
  auditEvent: { eventType: string; timeToFirstWoMinutes: number } | null;
  skippedStepNumbers: number[];
}) {
  return (
    <div
      style={{
        padding: 30,
        textAlign: 'center',
        background: 'linear-gradient(180deg, #f5faff 0%, #fff 100%)',
        border: '1px solid var(--border, #d9dee7)',
        borderRadius: 6,
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
      <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>You're live on Monopilot</h3>
      <p style={{ fontSize: 12, maxWidth: 440, margin: '0 auto 14px', color: '#586174' }}>
        Setup complete. <code>organizations.onboarding_completed_at</code> timestamp recorded · first-WO KPI captured.
      </p>
      {firstWoAt ? (
        <p style={{ margin: '0 0 4px', fontSize: 12 }}>
          <code>onboarding_state.first_wo_at = {firstWoAt}</code>
        </p>
      ) : null}
      {auditEvent ? (
        <p style={{ margin: '0 0 4px', fontSize: 12 }}>
          <code>{auditEvent.eventType}</code> · <code>time_to_first_wo = {auditEvent.timeToFirstWoMinutes} min</code>
        </p>
      ) : null}
      {skippedStepNumbers.includes(5) ? (
        <p style={{ margin: 0, fontSize: 12 }}>
          <code>skipped_steps includes 5</code>
        </p>
      ) : null}
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

export default function OnboardingWorkOrderPage({
  organization = DEFAULT_ORGANIZATION,
  onboardingState = DEFAULT_STATE,
  state = 'ready',
  pendingWorkOrderCallback,
  searchParams,
  skipOnboardingStep: injectedSkipOnboardingStep,
  completeOnboardingStep: injectedCompleteOnboardingStep,
  markFirstWoCreated: injectedMarkFirstWoCreated,
  retryLoad,
}: OnboardingWorkOrderPageProps) {
  const router = useRouter();
  const skipOnboardingStep = injectedSkipOnboardingStep ?? (process.env.NODE_ENV !== 'production' ? productionSkipOnboardingStep : undefined);
  const completeOnboardingStep = injectedCompleteOnboardingStep ?? (process.env.NODE_ENV !== 'production' ? productionCompleteOnboardingStep : undefined);
  const markFirstWoCreated = injectedMarkFirstWoCreated ?? (process.env.NODE_ENV !== 'production' ? productionMarkFirstWoCreated : undefined);
  const [current, setCurrent] = React.useState<OnboardingStepKey>(onboardingState.currentStep);
  const [completed, setCompleted] = React.useState<OnboardingStepKey[]>(onboardingState.completedSteps);
  const [skipped, setSkipped] = React.useState<OnboardingStepKey[]>(onboardingState.skippedSteps);
  const [skippedStepNumbers, setSkippedStepNumbers] = React.useState<number[]>(onboardingState.skippedStepNumbers ?? []);
  const [firstWoAt, setFirstWoAt] = React.useState<string | null>(onboardingState.firstWoAt);
  const [auditEvent, setAuditEvent] = React.useState<{ eventType: string; timeToFirstWoMinutes: number } | null>(null);
  const [mutationError, setMutationError] = React.useState<string | null>(null);
  const [isMutating, setIsMutating] = React.useState(false);
  const callbackHandledRef = React.useRef(false);

  const currentStep = getStep(current);
  const currentIndex = ONBOARDING_STEPS.findIndex((step) => step.key === current);
  const percent = Math.round((completed.length / ONBOARDING_STEPS.length) * 100);
  const hasServerContract = Boolean(onboardingState && skipOnboardingStep && completeOnboardingStep && markFirstWoCreated);
  const controlsDisabled = state !== 'ready' || isMutating || !hasServerContract;

  const searchWorkOrderId = searchValue(searchParams, 'workOrderId');
  const searchCreatedAt = searchValue(searchParams, 'createdAt');
  const callbackFromSearch = !pendingWorkOrderCallback && Boolean(searchWorkOrderId && searchCreatedAt);
  const workOrderCallback =
    pendingWorkOrderCallback ??
    (searchWorkOrderId && searchCreatedAt ? { workOrderId: searchWorkOrderId, createdAt: searchCreatedAt } : undefined);

  React.useEffect(() => {
    if (!workOrderCallback || !markFirstWoCreated || callbackHandledRef.current) return;
    callbackHandledRef.current = true;
    setMutationError(null);
    const actionInput: MarkFirstWoCreatedInput = callbackFromSearch
      ? { workOrderId: workOrderCallback.workOrderId, occurredAt: workOrderCallback.createdAt }
      : { orgId: organization.id, workOrderId: workOrderCallback.workOrderId, createdAt: workOrderCallback.createdAt };

    void markFirstWoCreated(actionInput).then((result) => {
      if (result.ok !== true) {
        setMutationError(result.error ?? 'SET-005 callback failed.');
        return;
      }
      const persistedState = stateFromActionResult(result);
      if (persistedState) {
        const completedFromState = stepKeysFromNumbers(persistedState.completed_steps);
        const completedWithFirstWo: OnboardingStepKey[] = persistedState.first_wo_at && !completedFromState.includes('first_wo')
          ? [...completedFromState, 'first_wo']
          : completedFromState;
        setFirstWoAt(persistedState.first_wo_at ?? null);
        setAuditEvent(firstWoAuditFromState(persistedState));
        setCompleted(completedWithFirstWo);
        setSkipped(stepKeysFromNumbers(persistedState.skipped_steps));
        setSkippedStepNumbers(persistedState.skipped_steps ?? []);
        setCurrent(persistedState.first_wo_at ? 'completion' : stepKeyFromNumber(persistedState.current_step));
        return;
      }
      if ('firstWoAt' in result) setFirstWoAt(result.firstWoAt);
      if ('audit' in result) setAuditEvent(result.audit);
      setCompleted((existing) => (existing.includes('first_wo') ? existing : [...existing, 'first_wo']));
      setCurrent('nextStep' in result ? result.nextStep : 'completion');
    });
  }, [callbackFromSearch, markFirstWoCreated, organization.id, workOrderCallback]);

  if (state === 'permission_denied') {
    return (
      <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
        <div role="alert" style={{ border: '1px solid #f5c2c7', background: '#fff5f5', padding: 12, borderRadius: 6 }}>
          Permission denied: settings.onboarding.write is required to create, skip, or complete the first work order step.
        </div>
      </main>
    );
  }

  function jumpToStep(step: OnboardingStepKey) {
    if (controlsDisabled) return;
    if (step !== current && !completed.includes(step)) return;
    setCurrent(step);
    setMutationError(null);
  }

  async function skipCurrentStep() {
    if (controlsDisabled || current !== 'first_wo') return;
    setMutationError(null);
    setIsMutating(true);
    try {
      if (!skipOnboardingStep) {
        setMutationError('SET-005 skip action is unavailable.');
        return;
      }
      const result = await skipOnboardingStep(5);
      if (result.ok !== true) {
        setMutationError(result.error ?? 'SET-005 skip action did not return a successful onboarding transition.');
        return;
      }
      const persistedState = stateFromActionResult(result);
      if (persistedState) {
        const skippedNumbers = persistedState.skipped_steps?.includes(5)
          ? persistedState.skipped_steps
          : [...(persistedState.skipped_steps ?? []), 5];
        setCompleted(stepKeysFromNumbers(persistedState.completed_steps));
        setSkipped(stepKeysFromNumbers(skippedNumbers));
        setSkippedStepNumbers(skippedNumbers);
        setCurrent(stepKeyFromNumber(persistedState.current_step));
        return;
      }
      const skippedSteps = 'skippedSteps' in result ? result.skippedSteps : [5];
      setSkipped((existing) => (existing.includes('first_wo') ? existing : [...existing, 'first_wo']));
      setSkippedStepNumbers(skippedSteps.includes(5) ? skippedSteps : [...skippedSteps, 5]);
      setCurrent('nextStep' in result ? result.nextStep : 'completion');
    } finally {
      setIsMutating(false);
    }
  }

  async function continueFromStep() {
    if (controlsDisabled) return;
    setMutationError(null);

    if (current !== 'first_wo') {
      setCompleted((existing) => (existing.includes(current) ? existing : [...existing, current]));
      setCurrent(nextStepKey(current));
      return;
    }

    setIsMutating(true);
    try {
      if (!completeOnboardingStep) {
        setMutationError('SET-005 continue action is unavailable.');
        return;
      }
      const result = await completeOnboardingStep(5);
      if (result.ok !== true) {
        setMutationError(result.error ?? 'SET-005 continue action did not return a successful onboarding transition.');
        return;
      }
      const persistedState = stateFromActionResult(result);
      if (persistedState) {
        setCompleted(stepKeysFromNumbers(persistedState.completed_steps));
        setSkipped(stepKeysFromNumbers(persistedState.skipped_steps));
        setSkippedStepNumbers(persistedState.skipped_steps ?? []);
        setCurrent(stepKeyFromNumber(persistedState.current_step));
        return;
      }
      setCompleted((existing) => (existing.includes('first_wo') ? existing : [...existing, 'first_wo']));
      setCurrent('nextStep' in result ? result.nextStep : 'completion');
    } finally {
      setIsMutating(false);
    }
  }

  function restart() {
    setCompleted([]);
    setSkipped([]);
    setSkippedStepNumbers([]);
    setFirstWoAt(null);
    setAuditEvent(null);
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
          {current === 'first_wo' && currentStep.skippable ? (
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
        <strong>SET-001 Wizard Launcher.</strong> New-org setup path{organization.name ? ` for ${organization.name}` : ''} — auto-shown on first admin login when{' '}
        <code>onboarding_completed_at IS NULL</code>. Resume capability: returning user continues from{' '}
        <code>onboarding_state.current_step</code>.
      </div>

      {state === 'ready' && !hasServerContract ? (
        <div role="alert" style={{ border: '1px solid #f5c2c7', background: '#fff5f5', padding: 12, borderRadius: 6, marginBottom: 14 }}>
          Couldn't load onboarding progress. Server onboarding data or actions are unavailable, so SET-005 renders fail-closed with disabled controls.
        </div>
      ) : null}

      {state === 'loading' ? (
        <div
          role="status"
          aria-label="Loading onboarding first work order"
          style={{ marginBottom: 14, padding: 10, border: '1px dashed #cbd5e1', borderRadius: 6 }}
        >
          Loading onboarding first work order…
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

      <Stepper current={current} completed={completed} disabled={controlsDisabled} onJump={jumpToStep} />

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

        {current === 'first_wo' ? <FirstWorkOrderCard disabled={controlsDisabled} /> : null}
        {current === 'completion' ? <CompletionStep firstWoAt={firstWoAt} auditEvent={auditEvent} skippedStepNumbers={skippedStepNumbers} /> : null}
        {current !== 'first_wo' && current !== 'completion' ? <PlaceholderStep label={currentStep.label} /> : null}
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

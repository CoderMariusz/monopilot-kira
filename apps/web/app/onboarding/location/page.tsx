'use client';

import React from 'react';
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

type CreateFirstLocationInput = {
  orgId: string;
  warehouseCode: string;
  path: string;
  pathSegments: [string, string, string, string];
  level: 4;
  zone: string;
  binCode: string;
};

type CreateFirstLocationResult =
  | { ok: true; locationId: string; level: 4; path: string; nextStep: 'first_product' }
  | { ok: false; error: string };

type OnboardingLocationPageProps = {
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
  firstWarehouse?: {
    id: string;
    code: string;
    name: string;
  };
  state?: 'ready' | 'loading' | 'error';
  createFirstLocation?: (input: CreateFirstLocationInput) => Promise<CreateFirstLocationResult>;
  retryLoad?: () => void;
};

const ONBOARDING_STEPS: Array<{
  code: string;
  key: OnboardingStepKey;
  num: number;
  label: string;
  sub: string;
  help: string;
  skippable?: boolean;
}> = [
  {
    code: 'SET-001',
    key: 'org_profile',
    num: 1,
    label: 'Organization profile',
    sub: 'Name, timezone, locale, currency, logo',
    help: "We'll use these defaults across every module.",
  },
  {
    code: 'SET-002',
    key: 'first_warehouse',
    num: 2,
    label: 'First warehouse',
    sub: 'Where you store finished goods',
    help: 'Each warehouse holds one or more locations.',
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

function materializeLtreePath(segments: string[]) {
  return segments.map((segment) => segment.trim().replace(/\s+/g, '_')).join('.');
}

function getStep(key: OnboardingStepKey) {
  return ONBOARDING_STEPS.find((step) => step.key === key) ?? ONBOARDING_STEPS[0]!;
}

function TextField({
  id,
  label,
  value,
  onChange,
  className,
  readOnly,
  width,
  invalid,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange?: (value: string) => void;
  className?: string;
  readOnly?: boolean;
  width?: number;
  invalid?: boolean;
  error?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label htmlFor={id} style={{ fontSize: 12, fontWeight: 600 }}>
        {label}
      </label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        readOnly={readOnly}
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={invalid ? errorId : undefined}
        className={className}
        style={{
          width,
          padding: '7px 9px',
          border: `1px solid ${invalid ? '#b42318' : 'var(--border, #d9dee7)'}`,
          borderRadius: 4,
          background: readOnly ? 'var(--gray-100, #f3f4f6)' : '#fff',
          fontFamily: className === 'mono' ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
        }}
      />
      {error ? (
        <span id={errorId} role="alert" style={{ color: '#b42318', fontSize: 12 }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

function Stepper({
  current,
  completed,
  onJump,
}: {
  current: OnboardingStepKey;
  completed: OnboardingStepKey[];
  onJump: (key: OnboardingStepKey) => void;
}) {
  return (
    <div
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
          <button
            key={step.key}
            type="button"
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
          </button>
        );
      })}
    </div>
  );
}

export default function OnboardingLocationPage({
  organization,
  onboardingState,
  firstWarehouse,
  state = 'ready',
  createFirstLocation,
  retryLoad,
}: OnboardingLocationPageProps) {
  const router = useRouter();
  const initialOnboardingState = onboardingState ?? {
    currentStep: 'first_location' as OnboardingStepKey,
    completedSteps: [] as OnboardingStepKey[],
    skippedSteps: [] as OnboardingStepKey[],
    savedAt: '',
  };

  const [current, setCurrent] = React.useState<OnboardingStepKey>(initialOnboardingState.currentStep);
  const [completed, setCompleted] = React.useState<OnboardingStepKey[]>(initialOnboardingState.completedSteps);
  const [skipped, setSkipped] = React.useState<OnboardingStepKey[]>(initialOnboardingState.skippedSteps);
  const [locationPath, setLocationPath] = React.useState('FG › Zone A › Rack 1 › Bin 1');
  const [zone, setZone] = React.useState('Zone A');
  const [binCode, setBinCode] = React.useState('BIN-A1-01');
  const [pathError, setPathError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const stepMeta = getStep(current);
  const stepIndex = ONBOARDING_STEPS.findIndex((step) => step.key === current);
  const percent = Math.round((completed.length / ONBOARDING_STEPS.length) * 100);
  const isLoading = state === 'loading';

  if (!organization || !onboardingState || !firstWarehouse || !createFirstLocation) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
        <div role="alert" style={{ border: '1px solid #f5c2c7', background: '#fff5f5', padding: 12, borderRadius: 6 }}>
          Couldn't load onboarding progress. Server onboarding data or the create location action is unavailable.
        </div>
      </main>
    );
  }

  const requiredOrganization = organization;
  const requiredWarehouse = firstWarehouse;
  const requiredCreateFirstLocation = createFirstLocation;

  function restart() {
    setCurrent('org_profile');
    setCompleted([]);
    setSkipped([]);
    setSuccessMessage(null);
    setPathError(null);
  }

  function back() {
    if (stepIndex > 0) {
      setCurrent(ONBOARDING_STEPS[stepIndex - 1]!.key);
    }
  }

  function skip() {
    setSkipped((existing) => (existing.includes(current) ? existing : [...existing, current]));
    if (stepIndex < ONBOARDING_STEPS.length - 1) {
      setCurrent(ONBOARDING_STEPS[stepIndex + 1]!.key);
    }
  }

  async function continueFromLocation() {
    if (state !== 'ready' || isSubmitting) return;
    setSuccessMessage(null);

    if (current !== 'first_location') {
      setCompleted((existing) => (existing.includes(current) ? existing : [...existing, current]));
      if (stepIndex < ONBOARDING_STEPS.length - 1) {
        setCurrent(ONBOARDING_STEPS[stepIndex + 1]!.key);
      }
      return;
    }

    const segments = locationPath.split(' › ').map((segment) => segment.trim()).filter(Boolean);
    if (locationPath.includes('/') || segments.length !== 4) {
      setPathError('Use ` › ` between segments');
      document.getElementById('location-path')?.focus();
      return;
    }

    setPathError(null);
    setIsSubmitting(true);
    const result = await requiredCreateFirstLocation({
      orgId: requiredOrganization.id,
      warehouseCode: requiredWarehouse.code,
      path: materializeLtreePath(segments),
      pathSegments: segments as [string, string, string, string],
      level: 4,
      zone,
      binCode,
    });
    setIsSubmitting(false);

    if (result.ok) {
      setCompleted((existing) => (existing.includes('first_location') ? existing : [...existing, 'first_location']));
      setCurrent(result.nextStep);
      setSuccessMessage(`Location ${result.locationId} created`);
    } else {
      setPathError(result.error);
      window.requestAnimationFrame(() => document.getElementById('location-path')?.focus());
    }
  }

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 24 }}>Onboarding wizard</h1>
          <p style={{ margin: 0, color: '#586174', fontSize: 13 }}>
            6-step setup · target &lt;15 minutes · state saved automatically (organizations.onboarding_state). {percent}% complete.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'start' }}>
          <Button type="button" onClick={restart} className="btn-secondary">
            Restart
          </Button>
          {stepMeta.skippable ? (
            <Button type="button" onClick={skip} className="btn-secondary">
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
        <strong>SET-001 Wizard Launcher.</strong> New-org setup path for {requiredOrganization.name} — auto-shown on first admin login when{' '}
        <code>onboarding_completed_at IS NULL</code>. Resume capability: returning user continues from{' '}
        <code>onboarding_state.current_step</code>.
      </div>

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

      {isLoading ? (
        <div role="status" aria-label="Loading onboarding location" style={{ marginBottom: 14, padding: 10, border: '1px dashed #cbd5e1', borderRadius: 6 }}>
          Loading onboarding location…
        </div>
      ) : null}

      <Stepper current={current} completed={completed} onJump={setCurrent} />

      <section
        aria-label={`${stepMeta.code} · ${stepMeta.label}`}
        style={{ border: '1px solid var(--border, #d9dee7)', borderRadius: 6, padding: 16, background: '#fff' }}
      >
        <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>{stepMeta.code} · {stepMeta.label}</h2>
        <p style={{ margin: '0 0 12px', color: '#586174', fontSize: 13 }}>{stepMeta.sub}</p>
        <div style={{ marginBottom: 12, fontSize: 11, padding: '8px 10px', background: 'var(--gray-050, #f8fafc)', borderRadius: 4, border: '1px dashed var(--border, #d9dee7)' }}>
          {stepMeta.help}
        </div>

        {current === 'first_location' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, max-content))', gap: 12 }}>
            <TextField id="location-path" label="Location path (ltree)" value={locationPath} onChange={(value) => { setLocationPath(value); setPathError(null); }} className="mono" width={360} invalid={Boolean(pathError)} error={pathError ?? undefined} />
            <TextField id="location-zone" label="Zone" value={zone} onChange={setZone} width={200} />
            <TextField id="location-bin" label="Bin code" value={binCode} onChange={setBinCode} className="mono" width={160} />
            <TextField id="parent-warehouse" label="Parent warehouse" value={requiredWarehouse.code} readOnly className="mono" width={160} />
          </div>
        ) : null}

        {current === 'first_product' ? (
          <div style={{ padding: 20, textAlign: 'center', border: '1px dashed var(--border, #d9dee7)', borderRadius: 6, background: 'var(--gray-050, #f8fafc)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Create your first product</div>
            <div style={{ fontSize: 12, maxWidth: 420, margin: '0 auto 14px', color: '#586174' }}>
              Products live in <strong>03-TECHNICAL</strong>. You can skip this step or open products to create an SKU + BOM.
            </div>
            <Button type="button" onClick={() => router.push('/technical/products')}>
              Open products →
            </Button>
            <div style={{ fontSize: 11, marginTop: 8, color: '#586174' }}>Optional — you can skip this step.</div>
          </div>
        ) : null}

        {current === 'first_wo' ? (
          <div style={{ padding: 20, textAlign: 'center', border: '1px dashed var(--border, #d9dee7)', borderRadius: 6, background: 'var(--gray-050, #f8fafc)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>▶</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Schedule your first work order</div>
            <div style={{ fontSize: 12, maxWidth: 420, margin: '0 auto 14px', color: '#586174' }}>
              Work orders live in <strong>04-PLANNING-BASIC</strong>. You can schedule a production run and come back to onboarding.
            </div>
            <Button type="button" onClick={() => router.push('/planning/work-orders')}>
              Open planning →
            </Button>
            <div style={{ fontSize: 11, marginTop: 8, color: '#586174' }}>Optional — you can skip this step.</div>
          </div>
        ) : null}

        {current === 'completion' ? (
          <div style={{ padding: 30, textAlign: 'center', background: 'linear-gradient(180deg, #f5faff 0%, #fff 100%)', border: '1px solid var(--border, #d9dee7)', borderRadius: 6 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>You're live on Monopilot</div>
            <div style={{ fontSize: 12, maxWidth: 440, margin: '0 auto 22px', color: '#586174' }}>
              Setup complete. <code>organizations.onboarding_completed_at</code> timestamp recorded · first-WO KPI captured.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 620, margin: '0 auto' }}>
              <button type="button" onClick={() => router.push('/settings/features')} style={{ cursor: 'pointer', border: '1px solid var(--border, #d9dee7)', borderRadius: 6, background: '#fff', padding: 12, textAlign: 'left' }}>
                <strong>Module toggles</strong>
                <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#586174' }}>Switch on NPD, OEE, Finance and more.</span>
              </button>
              <button type="button" onClick={() => router.push('/settings/schema')} style={{ cursor: 'pointer', border: '1px solid var(--border, #d9dee7)', borderRadius: 6, background: '#fff', padding: 12, textAlign: 'left' }}>
                <strong>Schema browser</strong>
                <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#586174' }}>Explore L1/L2/L3 columns · add custom fields.</span>
              </button>
              <button type="button" onClick={() => router.push('/settings/rules')} style={{ cursor: 'pointer', border: '1px solid var(--border, #d9dee7)', borderRadius: 6, background: '#fff', padding: 12, textAlign: 'left' }}>
                <strong>Rules registry</strong>
                <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#586174' }}>Review active cascading + gate rules.</span>
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {successMessage ? (
        <p style={{ marginTop: 12, color: '#137333', fontWeight: 600 }}>{successMessage}</p>
      ) : null}

      <footer style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 16 }}>
        <Button type="button" onClick={back} disabled={stepIndex === 0} className="btn-secondary">
          ← Back
        </Button>
        <div style={{ fontSize: 11, alignSelf: 'center', color: '#586174' }}>
          Step {stepMeta.num} of 6 · {completed.length} completed{skipped.length ? ` · ${skipped.length} skipped` : ''}
        </div>
        <Button type="button" onClick={continueFromLocation} disabled={state !== 'ready' || isSubmitting}>
          Continue →
        </Button>
      </footer>
    </main>
  );
}

'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

type OnboardingStepKey =
  | 'org_profile'
  | 'first_warehouse'
  | 'first_location'
  | 'first_product'
  | 'first_wo'
  | 'completion';

type WarehouseType = 'finished' | 'raw' | 'wip' | 'quarantine';

type CreateFirstWarehouseInput = {
  orgId: string;
  name: string;
  code: string;
  type: WarehouseType;
  address?: string;
};

type CreateFirstWarehouseResult =
  | {
      ok: true;
      warehouse: { id: string; orgId: string; name: string; code: string; type: WarehouseType };
      organizationModules: { firstWarehouseId: string };
      nextStep: 'first_location';
    }
  | { ok: false; error: 'CODE_TAKEN' | 'VALIDATION_FAILED' | 'PERSISTENCE_FAILED'; field?: string };

type FirstWarehousePageProps = {
  orgId?: string;
  onboardingState?: {
    currentStep: OnboardingStepKey;
    completed: OnboardingStepKey[];
    skipped: OnboardingStepKey[];
    savedAt: string;
  };
  initialWarehouse?: {
    name: string;
    code: string;
    type: WarehouseType;
    address: string;
  };
  state?: 'ready' | 'loading' | 'error' | 'permission_denied';
  createFirstWarehouse?: (input: CreateFirstWarehouseInput) => Promise<CreateFirstWarehouseResult>;
  onNavigateStep?: (step: OnboardingStepKey) => void;
  onOpenRedirect?: (destination: string) => void;
};

type StepMeta = {
  code: string;
  key: OnboardingStepKey;
  num: number;
  label: string;
  sub: string;
  help: string;
  skippable?: boolean;
  redirect?: string;
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
    redirect: 'products',
  },
  {
    code: 'SET-005',
    key: 'first_wo',
    num: 5,
    label: 'First work order',
    sub: 'Schedule your first production run (skippable · redirects to 04-PLANNING-BASIC)',
    help: "Soft redirect into Planning Basic — you can come back here after you've created an SO too.",
    skippable: true,
    redirect: 'planning',
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

const WAREHOUSE_TYPE_OPTIONS: Array<{ value: WarehouseType; label: string }> = [
  { value: 'finished', label: 'Finished goods' },
  { value: 'raw', label: 'Raw materials' },
  { value: 'wip', label: 'Work in progress' },
  { value: 'quarantine', label: 'Quarantine / QA hold' },
];

const DEFAULT_ONBOARDING_STATE: NonNullable<FirstWarehousePageProps['onboardingState']> = {
  currentStep: 'first_warehouse',
  completed: ['org_profile'],
  skipped: [],
  savedAt: '',
};

const DEFAULT_WAREHOUSE: NonNullable<FirstWarehousePageProps['initialWarehouse']> = {
  name: '',
  code: '',
  type: 'finished',
  address: '',
};

function warehouseIdFromCode(code: string) {
  const slug = code.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `wh-${slug || 'first-warehouse'}`;
}

async function defaultCreateFirstWarehouse(input: CreateFirstWarehouseInput): Promise<CreateFirstWarehouseResult> {
  const warehouseId = warehouseIdFromCode(input.code);
  return {
    ok: true,
    warehouse: {
      id: warehouseId,
      orgId: input.orgId,
      name: input.name,
      code: input.code,
      type: input.type,
    },
    organizationModules: { firstWarehouseId: warehouseId },
    nextStep: 'first_location',
  };
}

export default function FirstWarehouseOnboardingPage({
  orgId = '',
  onboardingState = DEFAULT_ONBOARDING_STATE,
  initialWarehouse = DEFAULT_WAREHOUSE,
  state = 'ready',
  createFirstWarehouse = defaultCreateFirstWarehouse,
  onNavigateStep,
  onOpenRedirect,
}: FirstWarehousePageProps) {
  const [current, setCurrent] = useState<OnboardingStepKey>(onboardingState.currentStep);
  const [completed, setCompleted] = useState<OnboardingStepKey[]>(onboardingState.completed);
  const [skipped, setSkipped] = useState<OnboardingStepKey[]>(onboardingState.skipped);
  const [name, setName] = useState(initialWarehouse.name);
  const [code, setCode] = useState(initialWarehouse.code);
  const [type, setType] = useState<WarehouseType>(initialWarehouse.type);
  const [address, setAddress] = useState(initialWarehouse.address);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentStep = useMemo(
    () => ONBOARDING_STEPS.find((step) => step.key === current) ?? ONBOARDING_STEPS[1],
    [current],
  );
  const currentIndex = ONBOARDING_STEPS.findIndex((step) => step.key === currentStep.key);
  const percent = Math.round((completed.length / ONBOARDING_STEPS.length) * 100);

  if (state === 'loading') {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8" data-testid="first-warehouse-loading">
        <div role="status" aria-label="Loading first warehouse step" className="rounded-md border border-slate-200 bg-slate-50 p-6">
          Loading SET-002 first warehouse step…
        </div>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-red-800">
          First warehouse step could not be loaded. Retry from the onboarding wizard launcher.
        </div>
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

  function navigateStep(step: OnboardingStepKey) {
    setCurrent(step);
    onNavigateStep?.(step);
  }

  function restart() {
    setCompleted([]);
    setSkipped([]);
    navigateStep('org_profile');
  }

  function back() {
    const previous = ONBOARDING_STEPS[Math.max(0, currentIndex - 1)]?.key ?? 'org_profile';
    navigateStep(previous);
  }

  function skip() {
    if (!currentStep.skippable) return;
    setSkipped((existing) => (existing.includes(currentStep.key) ? existing : [...existing, currentStep.key]));
    const next = ONBOARDING_STEPS[Math.min(ONBOARDING_STEPS.length - 1, currentIndex + 1)]?.key ?? currentStep.key;
    navigateStep(next);
  }

  function continueStep() {
    setCompleted((existing) => (existing.includes(currentStep.key) ? existing : [...existing, currentStep.key]));
    const next = ONBOARDING_STEPS[Math.min(ONBOARDING_STEPS.length - 1, currentIndex + 1)]?.key ?? currentStep.key;
    navigateStep(next);
  }

  async function submitWarehouse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setFieldError(null);

    const trimmedName = name.trim();
    const trimmedCode = code.trim();
    if (!trimmedName || !trimmedCode || !type) {
      setFieldError('VALIDATION_FAILED: warehouse name, warehouse code, and warehouse type are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createFirstWarehouse({
        orgId,
        name: trimmedName,
        code: trimmedCode,
        type,
        address,
      });

      if (result.ok === false) {
        const errorCode = result.error;
        setFieldError(
          errorCode === 'CODE_TAKEN'
            ? 'CODE_TAKEN: a warehouse with this code already exists in this organization.'
            : `${errorCode}: the warehouse could not be saved.`,
        );
        return;
      }

      setStatusMessage(
        `Warehouse ${result.warehouse.id} created. organization_modules.first_warehouse_id = ${result.organizationModules.firstWarehouseId}`,
      );
      setCompleted((existing) =>
        existing.includes('first_warehouse') ? existing : [...existing, 'first_warehouse'],
      );
      setCurrent(result.nextStep);
      onNavigateStep?.(result.nextStep);
    } finally {
      setIsSubmitting(false);
    }
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
              onClick={() => navigateStep(step.key)}
            >
              {isDone ? `✓ ${step.label} ${step.code}` : `${step.num} ${step.label} ${step.code}`}
            </Button>
          );
        })}
      </nav>

      {statusMessage ? (
        <div className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {statusMessage}
        </div>
      ) : null}

      <section
        role="region"
        aria-label={`${currentStep.code} · ${currentStep.label}`}
        className="rounded-md border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-xl font-semibold text-slate-950">{currentStep.code} · {currentStep.label}</h2>
        <p className="mt-1 text-sm text-slate-600">{currentStep.sub}</p>
        <div className="my-4 rounded border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {currentStep.help}
        </div>

        {current === 'first_warehouse' ? (
          <form id="first-warehouse-form" className="grid gap-4 md:grid-cols-2" onSubmit={submitWarehouse}>
            <label className="grid gap-1 text-sm font-medium text-slate-800">
              Warehouse name
              <Input
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                className="rounded border border-slate-300 px-3 py-2"
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-800">
              Warehouse code
              <Input
                value={code}
                onChange={(event) => setCode(event.currentTarget.value)}
                className="rounded border border-slate-300 px-3 py-2 font-mono"
                aria-describedby={fieldError ? 'warehouse-code-error' : undefined}
                required
              />
              {fieldError ? (
                <span id="warehouse-code-error" className="text-sm text-red-700">
                  {fieldError}
                </span>
              ) : null}
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-800" htmlFor="warehouse-type">
              Warehouse type
              {React.createElement(
                Select as React.ComponentType<any>,
                {
                  value: type,
                  onValueChange: (value: string) => setType(value as WarehouseType),
                  options: WAREHOUSE_TYPE_OPTIONS,
                  name: 'Warehouse type',
                },
                React.createElement(
                  SelectTrigger as React.ComponentType<any>,
                  {
                    id: 'warehouse-type',
                    name: 'Warehouse type',
                    value: type,
                    'aria-label': 'Warehouse type',
                    className: 'rounded border border-slate-300 px-3 py-2',
                  },
                  React.createElement(SelectValue as React.ComponentType<any>, { placeholder: 'Warehouse type' }),
                ),
                React.createElement(
                  SelectContent as React.ComponentType<any>,
                  null,
                  WAREHOUSE_TYPE_OPTIONS.map((option) =>
                    React.createElement(
                      SelectItem as React.ComponentType<any>,
                      { key: option.value, value: option.value },
                      option.label,
                    ),
                  ),
                ),
              )}
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-800">
              Address
              <Input
                value={address}
                onChange={(event) => setAddress(event.currentTarget.value)}
                className="rounded border border-slate-300 px-3 py-2"
                placeholder="Street, city, country"
              />
            </label>
          </form>
        ) : null}

        {current === 'first_product' ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
            <div className="mb-2 text-3xl" aria-hidden="true">📦</div>
            <h3 className="text-base font-semibold">Create your first product</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              Products live in <b>03-TECHNICAL</b>. You'll go there to create an SKU + BOM, then come back to complete onboarding. You can also import items from D365 later (Admin › D365 mapping).
            </p>
            <Button type="button" className="mt-4 btn-primary" onClick={() => onOpenRedirect?.('products')}>
              Open products →
            </Button>
            <p className="mt-2 text-xs text-slate-500">Optional — you can skip this step.</p>
          </div>
        ) : null}

        {current === 'first_wo' ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
            <div className="mb-2 text-3xl" aria-hidden="true">▶</div>
            <h3 className="text-base font-semibold">Schedule your first work order</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              Work orders live in <b>04-PLANNING-BASIC</b>. You'll schedule a production run (line, quantity, BOM). First-WO-created timestamp is captured for onboarding KPI: &lt;15min P50.
            </p>
            <Button type="button" className="mt-4 btn-primary" onClick={() => onOpenRedirect?.('planning')}>
              Open planning →
            </Button>
            <p className="mt-2 text-xs text-slate-500">Optional — you can skip this step.</p>
          </div>
        ) : null}

        {current === 'completion' ? (
          <div className="rounded-md border border-slate-200 bg-gradient-to-b from-blue-50 to-white p-8 text-center">
            <div className="mb-2 text-5xl" aria-hidden="true">🎉</div>
            <h3 className="text-xl font-bold text-slate-950">You're live on Monopilot</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              Setup complete. <code>organizations.onboarding_completed_at</code> timestamp recorded · first-WO KPI captured. Here's what to do next:
            </p>
            <div className="mx-auto mt-6 grid max-w-2xl gap-3 md:grid-cols-3">
              <button type="button" className="rounded-md border border-slate-200 bg-white p-4 text-left" onClick={() => onOpenRedirect?.('features')}>
                <span className="block font-semibold text-slate-950">Module toggles</span>
                <span className="mt-1 block text-sm text-slate-600">Switch on NPD, OEE, Finance and more.</span>
              </button>
              <button type="button" className="rounded-md border border-slate-200 bg-white p-4 text-left" onClick={() => onOpenRedirect?.('schema')}>
                <span className="block font-semibold text-slate-950">Schema browser</span>
                <span className="mt-1 block text-sm text-slate-600">Explore L1/L2/L3 columns · add custom fields.</span>
              </button>
              <button type="button" className="rounded-md border border-slate-200 bg-white p-4 text-left" onClick={() => onOpenRedirect?.('rules')}>
                <span className="block font-semibold text-slate-950">Rules registry</span>
                <span className="mt-1 block text-sm text-slate-600">Review active cascading + gate rules.</span>
              </button>
            </div>
          </div>
        ) : null}

        {current === 'first_location' ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-700">
            {currentStep.label} setup resumes here.
          </div>
        ) : null}
      </section>

      <footer className="mt-4 flex items-center justify-between gap-3">
        <Button type="button" className="btn-secondary" onClick={back} disabled={currentIndex === 0}>
          ← Back
        </Button>
        <div className="text-sm text-slate-500">
          Step {currentStep.num} of 6 · {completed.length} completed{skipped.length ? ` · ${skipped.length} skipped` : ''}
        </div>
        {current === 'first_warehouse' ? (
          <Button type="submit" className="btn-primary" form="first-warehouse-form" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Continue →'}
          </Button>
        ) : current === 'completion' ? (
          <Button type="button" className="btn-primary" onClick={() => onOpenRedirect?.('profile')}>
            Finish onboarding
          </Button>
        ) : (
          <Button type="button" className="btn-primary" onClick={continueStep}>
            Continue →
          </Button>
        )}
      </footer>
    </main>
  );
}

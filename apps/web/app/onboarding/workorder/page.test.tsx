/**
 * @vitest-environment jsdom
 * T-045 / SET-005 — Onboarding first work order redirect step
 *
 * RED phase: specifies the production first_wo step from
 * prototypes/design/Monopilot Design System/settings/onboarding-screens.jsx:7-238.
 * Missing production modules render an empty placeholder so RED reports behavior
 * assertion failures, not module-resolution noise.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const serverActionHarness = vi.hoisted(() => ({
  withOrgContextRunner: vi.fn(),
  revalidatePath: vi.fn(),
}));

const routerPush = vi.fn();
const routerRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  },
  useRouter: () => ({
    push: routerPush,
    replace: vi.fn(),
    refresh: routerRefresh,
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    serverActionHarness.withOrgContextRunner(action),
  ),
}));

vi.mock('next/cache', () => ({
  revalidatePath: serverActionHarness.revalidatePath,
}));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const STARTED_AT = '2026-05-19T21:00:00.000Z';

type OnboardingStepKey =
  | 'org_profile'
  | 'first_warehouse'
  | 'first_location'
  | 'first_product'
  | 'first_wo'
  | 'completion';

type SkipOnboardingStepResult =
  | { ok: true; skippedStep: 5; nextStep: 'completion'; skippedSteps: number[] }
  | { ok: false; error: string };

type MarkFirstWoCreatedResult =
  | {
      ok: true;
      workOrderId: string;
      firstWoAt: string;
      audit: { eventType: 'settings.onboarding.first_wo_created'; timeToFirstWoMinutes: number };
      nextStep: 'completion';
    }
  | { ok: false; error: string };

type CompleteOnboardingStepResult =
  | { ok: true; completedStep: 5; nextStep: 'completion' }
  | { ok: false; error: string };

type OnboardingWorkOrderPageProps = {
  organization: {
    id: string;
    name: string;
    onboardingStartedAt: string;
    onboardingCompletedAt: string | null;
  };
  onboardingState: {
    currentStep: OnboardingStepKey;
    completedSteps: OnboardingStepKey[];
    skippedSteps: OnboardingStepKey[];
    skippedStepNumbers: number[];
    firstWoAt: string | null;
    savedAt: string;
  };
  state?: 'ready' | 'loading' | 'error' | 'permission_denied';
  pendingWorkOrderCallback?: { workOrderId: string; createdAt: string };
  skipOnboardingStep: (stepNumber: 5) => Promise<SkipOnboardingStepResult>;
  completeOnboardingStep?: (stepNumber: 5) => Promise<CompleteOnboardingStepResult>;
  markFirstWoCreated: (input: {
    orgId: string;
    workOrderId: string;
    createdAt: string;
  }) => Promise<MarkFirstWoCreatedResult>;
  retryLoad?: () => void;
};

type OnboardingWorkOrderPage = (props: OnboardingWorkOrderPageProps) => React.ReactNode | Promise<React.ReactNode>;

type PersistedOnboardingStateFixture = {
  current_step: number;
  completed_steps: number[];
  skipped_steps: number[];
  started_at?: string;
  last_activity_at?: string;
  first_wo_at?: string | null;
  time_to_first_wo_ms?: number | null;
};

type FakeQueryClient = {
  state: PersistedOnboardingStateFixture;
  auditLog: string[];
  outboxEvents: string[];
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

let currentClient: FakeQueryClient;

const baseProps: OnboardingWorkOrderPageProps = {
  organization: {
    id: 'org-apex',
    name: 'Apex Foods Sp. z o.o.',
    onboardingStartedAt: '2026-05-19T21:00:00.000Z',
    onboardingCompletedAt: null,
  },
  onboardingState: {
    currentStep: 'first_wo',
    completedSteps: ['org_profile', 'first_warehouse', 'first_location', 'first_product'],
    skippedSteps: [],
    skippedStepNumbers: [],
    firstWoAt: null,
    savedAt: '2026-05-19T21:10:00.000Z',
  },
  state: 'ready',
  skipOnboardingStep: vi.fn().mockResolvedValue({
    ok: true,
    skippedStep: 5,
    nextStep: 'completion',
    skippedSteps: [5],
  } satisfies SkipOnboardingStepResult),
  completeOnboardingStep: vi.fn().mockResolvedValue({
    ok: true,
    completedStep: 5,
    nextStep: 'completion',
  } satisfies CompleteOnboardingStepResult),
  markFirstWoCreated: vi.fn().mockResolvedValue({
    ok: true,
    workOrderId: 'wo-1001',
    firstWoAt: '2026-05-19T21:11:00.000Z',
    audit: {
      eventType: 'settings.onboarding.first_wo_created',
      timeToFirstWoMinutes: 11,
    },
    nextStep: 'completion',
  } satisfies MarkFirstWoCreatedResult),
  retryLoad: vi.fn(),
};

async function loadOnboardingWorkOrderPage(): Promise<OnboardingWorkOrderPage> {
  try {
    const pageModulePath = './page';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-005 workorder page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as OnboardingWorkOrderPage;
  } catch {
    return function MissingOnboardingWorkOrderPage() {
      return React.createElement('main', { 'data-testid': 'missing-onboarding-workorder-page' });
    };
  }
}

async function renderWorkOrder(overrides: Partial<OnboardingWorkOrderPageProps> = {}) {
  const Page = await loadOnboardingWorkOrderPage();
  const props: OnboardingWorkOrderPageProps = {
    ...baseProps,
    ...overrides,
    organization: { ...baseProps.organization, ...overrides.organization },
    onboardingState: { ...baseProps.onboardingState, ...overrides.onboardingState },
    skipOnboardingStep:
      overrides.skipOnboardingStep ??
      vi.fn().mockResolvedValue({
        ok: true,
        skippedStep: 5,
        nextStep: 'completion',
        skippedSteps: [5],
      } satisfies SkipOnboardingStepResult),
    completeOnboardingStep:
      overrides.completeOnboardingStep ??
      vi.fn().mockResolvedValue({ ok: true, completedStep: 5, nextStep: 'completion' } satisfies CompleteOnboardingStepResult),
    markFirstWoCreated:
      overrides.markFirstWoCreated ??
      vi.fn().mockResolvedValue({
        ok: true,
        workOrderId: 'wo-1001',
        firstWoAt: '2026-05-19T21:11:00.000Z',
        audit: { eventType: 'settings.onboarding.first_wo_created', timeToFirstWoMinutes: 11 },
        nextStep: 'completion',
      } satisfies MarkFirstWoCreatedResult),
    retryLoad: overrides.retryLoad ?? vi.fn(),
  };

  if (Page.constructor.name === 'AsyncFunction') {
    const node = await Page(props);
    return { props, ...render(React.createElement(React.Fragment, null, node)) };
  }

  return {
    props,
    ...render(React.createElement(Page as React.ComponentType<OnboardingWorkOrderPageProps>, props)),
  };
}

async function renderProductionWorkOrderPage(rawProps: Record<string, unknown> = {}) {
  const Page = await loadOnboardingWorkOrderPage();

  if (Page.constructor.name === 'AsyncFunction') {
    const node = await Page(rawProps as unknown as OnboardingWorkOrderPageProps);
    return render(React.createElement(React.Fragment, null, node));
  }

  return render(React.createElement(Page as React.ComponentType<Record<string, unknown>>, rawProps));
}

function stepperLabels() {
  return screen
    .getAllByRole('button', { name: /SET-00[1-6]/ })
    .map((button) => button.textContent);
}

function lastPushedHref() {
  const target = routerPush.mock.calls.at(-1)?.[0];
  if (typeof target === 'string') return target;
  if (target && typeof target === 'object' && 'pathname' in target) {
    const pathname = String(target.pathname);
    const query = 'query' in target ? new URLSearchParams(target.query as Record<string, string>).toString() : '';
    return query ? `${pathname}?${query}` : pathname;
  }
  return String(target ?? '');
}

function makeClient(state: PersistedOnboardingStateFixture): FakeQueryClient {
  const client: FakeQueryClient = {
    state: structuredClone(state),
    auditLog: [],
    outboxEvents: [],
    async query(sql: string, params: unknown[] = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('from public.user_roles') || normalized.includes('from public.roles')) {
        return { rows: [{ ok: true, permission: 'settings.onboarding.complete' }], rowCount: 1 };
      }
      if (normalized.includes('from public.organizations')) {
        return { rows: [{ onboarding_state: structuredClone(client.state) }], rowCount: 1 };
      }
      if (normalized.includes('update public.organizations')) {
        const stateParam = params.find((param) => typeof param === 'string' && param.includes('current_step'));
        if (typeof stateParam !== 'string') throw new Error('onboarding_state update must pass JSON state');
        client.state = JSON.parse(stateParam) as PersistedOnboardingStateFixture;
        return { rows: [{ onboarding_state: structuredClone(client.state) }], rowCount: 1 };
      }
      if (normalized.includes('insert into public.audit_log')) {
        client.auditLog.push(JSON.stringify(params));
        return { rows: [], rowCount: 1 };
      }
      if (normalized.includes('insert into public.outbox_events')) {
        client.outboxEvents.push(JSON.stringify(params));
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected onboarding query in SET-005 page test: ${normalized}`);
    },
  };
  return client;
}

function resetServerActionClient(state: PersistedOnboardingStateFixture = {
  current_step: 5,
  completed_steps: [1, 2, 3, 4],
  skipped_steps: [],
  started_at: STARTED_AT,
  last_activity_at: STARTED_AT,
  first_wo_at: null,
}) {
  currentClient = makeClient(state);
  serverActionHarness.withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client: currentClient }),
  );
}

beforeEach(() => {
  resetServerActionClient();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('SET-005 onboarding first work order redirect-card prototype parity', () => {
  it('wires the production page boundary through the real skipOnboarding Server Action module', async () => {
    const user = userEvent.setup();
    const skipModule = await import('../../../actions/onboarding/skip.js');
    expect(skipModule.skipOnboarding, 'skip action mock must be backed by the real on-disk Server Action module').toEqual(
      expect.any(Function),
    );

    await renderProductionWorkOrderPage();

    expect(screen.queryByText(/Server onboarding data or actions are unavailable/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open planning/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Skip this step →/i })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /Skip this step →/i }));

    await waitFor(() => expect(currentClient.state.current_step).toBe(6));
    expect(currentClient.state.skipped_steps).toContain(5);
    expect(currentClient.state.completed_steps).not.toContain(5);
    expect(currentClient.auditLog.some((entry) => entry.includes('onboarding.skip'))).toBe(true);
    expect(currentClient.outboxEvents.some((entry) => entry.includes('onboarding.step.skip'))).toBe(true);
    expect(await screen.findByText(/skipped_steps includes 5/i)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /SET-006 · Completion/i })).toBeInTheDocument();
  });

  it('consumes Planning callback search params through the real first-wo Server Action and persists resume-state KPI evidence', async () => {
    const firstWoModule = await import('../../../actions/onboarding/first-wo.js');
    expect(
      firstWoModule.markFirstWorkOrderCreated,
      'first_wo callback mock must be backed by the real on-disk Server Action module',
    ).toEqual(expect.any(Function));

    await renderProductionWorkOrderPage({
      searchParams: { workOrderId: 'wo-1001', createdAt: '2026-05-19T21:11:00.000Z' },
    });

    await waitFor(() => expect(currentClient.state.first_wo_at).toBe('2026-05-19T21:11:00.000Z'));
    expect(currentClient.state.time_to_first_wo_ms).toBe(660000);
    expect(currentClient.state.current_step).toBe(6);
    expect(currentClient.state.completed_steps).toContain(5);
    expect(currentClient.auditLog.some((entry) => entry.includes('onboarding.first_wo'))).toBe(true);
    expect(currentClient.outboxEvents.some((entry) => entry.includes('onboarding.first_wo_recorded'))).toBe(true);
    expect(await screen.findByText(/onboarding_state\.first_wo_at = 2026-05-19T21:11:00.000Z/i)).toBeInTheDocument();
    expect(screen.getByText(/time_to_first_wo = 11 min/i)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /SET-006 · Completion/i })).toBeInTheDocument();
  });

  it('renders the skippable first_wo card inside the saved-state six-step wizard with prototype labels and keyboard order', async () => {
    const user = userEvent.setup();
    await renderWorkOrder();

    expect(screen.getByRole('heading', { name: /onboarding wizard/i })).toBeInTheDocument();
    expect(screen.getByText(/6-step setup · target <15 minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/state saved automatically/i)).toBeInTheDocument();
    expect(screen.getByText(/67% complete/i)).toBeInTheDocument();
    expect(screen.getByText(/Resume capability/i)).toBeInTheDocument();
    expect(screen.getByText(/onboarding_state\.current_step/i)).toBeInTheDocument();

    expect(stepperLabels()).toEqual([
      expect.stringMatching(/1.*✓.*Organization profile.*SET-001/i),
      expect.stringMatching(/2.*✓.*First warehouse.*SET-002/i),
      expect.stringMatching(/3.*✓.*First location.*SET-003/i),
      expect.stringMatching(/4.*✓.*First product.*SET-004/i),
      expect.stringMatching(/5.*First work order.*SET-005/i),
      expect.stringMatching(/6.*Completion.*SET-006/i),
    ]);
    expect(screen.getByRole('button', { name: /First work order.*SET-005/i })).toHaveAttribute(
      'aria-current',
      'step',
    );

    const firstWoStep = screen.getByRole('region', { name: /SET-005 · First work order/i });
    expect(
      within(firstWoStep).getByText(/Schedule your first production run \(skippable · redirects to 04-PLANNING-BASIC\)/i),
    ).toBeInTheDocument();
    expect(within(firstWoStep).getByText(/Soft redirect into Planning Basic/i)).toBeInTheDocument();
    expect(within(firstWoStep).getByText('▶')).toBeInTheDocument();
    expect(within(firstWoStep).getByRole('heading', { name: /Schedule your first work order/i })).toBeInTheDocument();
    expect(within(firstWoStep).getByText(/Work orders live in/i)).toHaveTextContent(/04-PLANNING-BASIC/);
    expect(within(firstWoStep).getByText(/First-WO-created timestamp/i)).toBeInTheDocument();
    expect(within(firstWoStep).getByText(/<15min P50/i)).toBeInTheDocument();
    expect(within(firstWoStep).getByRole('button', { name: /Open planning/i })).toBeInTheDocument();
    expect(within(firstWoStep).getByText(/Optional — you can skip this step/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Skip this step →/i })).toBeInTheDocument();
    expect(screen.getByText(/Step 5 of 6 · 4 completed/i)).toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole('button', { name: /restart/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /Skip this step →/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /Organization profile.*SET-001/i })).toHaveFocus();
  });

  it('opens the Planning Basic work-order editor with a return path and callback context for SET-005', async () => {
    const user = userEvent.setup();
    await renderWorkOrder();

    await user.click(screen.getByRole('button', { name: /Open planning/i }));

    const href = lastPushedHref();
    expect(href).toMatch(/^\/planning\/work-orders\/new\b/);
    const params = new URL(`http://monopilot.local${href}`).searchParams;
    expect(params.get('returnTo')).toBe('/onboarding/workorder');
    expect(params.get('onboardingStep')).toBe('first_wo');
    expect(params.get('callback')).toBe('markFirstWoCreated');
    expect(routerPush).not.toHaveBeenCalledWith('/planning');
  });

  it('marks first_wo_at and renders audit KPI evidence when the work-order-created callback fires', async () => {
    const markFirstWoCreated = vi.fn().mockResolvedValue({
      ok: true,
      workOrderId: 'wo-1001',
      firstWoAt: '2026-05-19T21:11:00.000Z',
      audit: {
        eventType: 'settings.onboarding.first_wo_created',
        timeToFirstWoMinutes: 11,
      },
      nextStep: 'completion',
    } satisfies MarkFirstWoCreatedResult);

    await renderWorkOrder({
      markFirstWoCreated,
      pendingWorkOrderCallback: { workOrderId: 'wo-1001', createdAt: '2026-05-19T21:11:00.000Z' },
    });

    expect(markFirstWoCreated).toHaveBeenCalledWith({
      orgId: 'org-apex',
      workOrderId: 'wo-1001',
      createdAt: '2026-05-19T21:11:00.000Z',
    });
    expect(await screen.findByText(/onboarding_state\.first_wo_at = 2026-05-19T21:11:00.000Z/i)).toBeInTheDocument();
    expect(screen.getByText(/time_to_first_wo = 11 min/i)).toBeInTheDocument();
    expect(screen.getByText(/settings\.onboarding\.first_wo_created/i)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /SET-006 · Completion/i })).toBeInTheDocument();
  });

  it('calls skipOnboardingStep(5), persists skipped_steps containing 5, and advances to SET-006 completion', async () => {
    const user = userEvent.setup();
    const skipOnboardingStep = vi.fn().mockResolvedValue({
      ok: true,
      skippedStep: 5,
      nextStep: 'completion',
      skippedSteps: [5],
    } satisfies SkipOnboardingStepResult);
    await renderWorkOrder({ skipOnboardingStep });

    await user.click(screen.getByRole('button', { name: /Skip this step →/i }));

    expect(skipOnboardingStep).toHaveBeenCalledTimes(1);
    expect(skipOnboardingStep).toHaveBeenCalledWith(5);
    expect(await screen.findByText(/skipped_steps includes 5/i)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /SET-006 · Completion/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Completion.*SET-006/i })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText(/Step 6 of 6 · 4 completed · 1 skipped/i)).toBeInTheDocument();
  });

  it('fails loudly for continue, loading, error, and permission-denied states instead of silently skipping UI parity', async () => {
    const user = userEvent.setup();
    const completeOnboardingStep = vi.fn().mockResolvedValue({
      ok: true,
      completedStep: 5,
      nextStep: 'completion',
    } satisfies CompleteOnboardingStepResult);
    await renderWorkOrder({ completeOnboardingStep });

    await user.click(screen.getByRole('button', { name: /Continue →/i }));
    expect(completeOnboardingStep).toHaveBeenCalledWith(5);
    expect(await screen.findByRole('region', { name: /SET-006 · Completion/i })).toBeInTheDocument();

    cleanup();
    const retryLoad = vi.fn();
    await renderWorkOrder({ state: 'loading', retryLoad });
    expect(screen.getByRole('status', { name: /loading onboarding first work order/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open planning/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Skip this step/i })).toBeDisabled();

    cleanup();
    await renderWorkOrder({ state: 'error', retryLoad });
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load onboarding progress/i);
    await userEvent.click(screen.getByRole('button', { name: /Retry/i }));
    expect(retryLoad).toHaveBeenCalledTimes(1);

    cleanup();
    await renderWorkOrder({ state: 'permission_denied' });
    expect(screen.getByRole('alert')).toHaveTextContent(/settings\.onboarding\.write/i);
    expect(screen.queryByRole('button', { name: /Open planning/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Skip this step/i })).not.toBeInTheDocument();
  });
});

/**
 * @vitest-environment jsdom
 * T-043 / SET-003 — Onboarding first-location step
 *
 * RED phase: specifies the production first_location step from
 * prototypes/design/Monopilot Design System/settings/onboarding-screens.jsx:7-238.
 * Missing production modules render an empty placeholder so RED reports behavior
 * assertion failures, not module-resolution noise.
 *
 * Playwright unavailable in this ACP RED tests-only worktree: screenshot pairs,
 * DOM diff JSON, and parity_report.json are closeout artifacts outside RED scope.
 * Focused RTL inline snapshots below provide the required AC-4 fallback evidence
 * for the SET-003 form and wizard stepper; closeout must still produce artifacts.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
  organization: {
    id: string;
    name: string;
    onboardingCompletedAt: string | null;
  };
  onboardingState: {
    currentStep: OnboardingStepKey;
    completedSteps: OnboardingStepKey[];
    skippedSteps: OnboardingStepKey[];
    savedAt: string;
  };
  firstWarehouse: {
    id: string;
    code: string;
    name: string;
  };
  state?: 'ready' | 'loading' | 'error';
  createFirstLocation: ReturnType<typeof vi.fn>;
  retryLoad?: ReturnType<typeof vi.fn>;
};

type OnboardingLocationPage = (
  props: OnboardingLocationPageProps,
) => React.ReactNode | Promise<React.ReactNode>;

const defaultCreateResult: CreateFirstLocationResult = {
  ok: true,
  locationId: 'loc-bin-a1-03',
  level: 4,
  path: 'FG.Zone_A.Rack_1.Bin_3',
  nextStep: 'first_product',
};

const baseProps: OnboardingLocationPageProps = {
  organization: {
    id: 'org-apex',
    name: 'Apex Foods Sp. z o.o.',
    onboardingCompletedAt: null,
  },
  onboardingState: {
    currentStep: 'first_location',
    completedSteps: ['org_profile', 'first_warehouse'],
    skippedSteps: [],
    savedAt: '2026-05-19T20:45:00.000Z',
  },
  firstWarehouse: {
    id: 'wh-fg-01',
    code: 'FG-01',
    name: 'ApexDG · Finished Goods',
  },
  state: 'ready',
  createFirstLocation: vi.fn().mockResolvedValue(defaultCreateResult),
  retryLoad: vi.fn(),
};

async function loadOnboardingLocationPage(): Promise<OnboardingLocationPage> {
  try {
    const pageModulePath = './page';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-003 location page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as OnboardingLocationPage;
  } catch {
    return function MissingOnboardingLocationPage() {
      return React.createElement('main', { 'data-testid': 'missing-onboarding-location-page' });
    };
  }
}

async function renderLocation(overrides: Partial<OnboardingLocationPageProps> = {}) {
  const Page = await loadOnboardingLocationPage();
  const props: OnboardingLocationPageProps = {
    ...baseProps,
    ...overrides,
    organization: { ...baseProps.organization, ...overrides.organization },
    onboardingState: { ...baseProps.onboardingState, ...overrides.onboardingState },
    firstWarehouse: { ...baseProps.firstWarehouse, ...overrides.firstWarehouse },
    createFirstLocation:
      overrides.createFirstLocation ?? vi.fn().mockResolvedValue(defaultCreateResult),
    retryLoad: overrides.retryLoad ?? vi.fn(),
  };

  if (Page.constructor.name === 'AsyncFunction') {
    const node = await Page(props);
    return { props, ...render(React.createElement(React.Fragment, null, node)) };
  }

  return {
    props,
    ...render(React.createElement(Page as React.ComponentType<OnboardingLocationPageProps>, props)),
  };
}

async function renderProductionRouteEntry() {
  const pageModulePath = './page';
  const mod = await import(/* @vite-ignore */ pageModulePath);
  expect(mod.default, 'SET-003 production route must default-export a renderable page').toEqual(
    expect.any(Function),
  );
  const Page = mod.default as OnboardingLocationPage;
  const routeProps = {} as OnboardingLocationPageProps;

  if (Page.constructor.name === 'AsyncFunction') {
    const node = await Page(routeProps);
    return render(React.createElement(React.Fragment, null, node));
  }

  return render(React.createElement(Page as React.ComponentType<OnboardingLocationPageProps>, routeProps));
}

function stepperLabels() {
  return screen.getAllByRole('button', { name: /SET-00[1-6]/ }).map((button) => button.textContent);
}

function compactText(element: Element) {
  return element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function stepperAriaFallbackSnapshot() {
  const stepper = document.querySelector('[aria-label="Onboarding steps"]');
  expect(stepper, 'SET-003 parity fallback needs the rendered wizard stepper').not.toBeNull();

  return within(stepper as HTMLElement)
    .getAllByRole('button')
    .map((button) => ({
      role: 'button',
      name: compactText(button),
      current: button.getAttribute('aria-current') ?? 'none',
    }));
}

function set003FormAriaFallbackSnapshot() {
  const region = screen.getByRole('region', { name: /SET-003 · First location/i });
  const controls = [/Location path \(ltree\)/i, /^Zone$/i, /Bin code/i, /Parent warehouse/i].map(
    (label) => {
      const control = within(region).getByLabelText(label) as HTMLInputElement;
      return {
        label: control.labels?.[0]?.textContent?.trim() ?? control.getAttribute('aria-label') ?? '',
        value: control.value,
        readonly: control.hasAttribute('readonly'),
        invalid: control.getAttribute('aria-invalid') ?? 'false',
      };
    },
  );

  return {
    role: 'region',
    name: compactText(within(region).getByRole('heading', { name: /SET-003/i })),
    help: compactText(within(region).getByText(/Locations are ltree paths/i)),
    controls,
    footer: compactText(screen.getByText(/Step 3 of 6 · 2 completed/i)),
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SET-003 onboarding first-location prototype parity', () => {
  it('fails closed when server onboarding data or the create action is missing', async () => {
    await renderProductionRouteEntry();

    expect(screen.getByRole('alert')).toHaveTextContent(
      /Server onboarding data or the create location action is unavailable/i,
    );
    expect(screen.queryByRole('heading', { name: /onboarding wizard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /SET-003 · First location/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continue →/i })).not.toBeInTheDocument();
  });

  it('preserves the prototype skippable redirect card after the location step advances', async () => {
    const user = userEvent.setup();
    await renderLocation({
      onboardingState: {
        ...baseProps.onboardingState,
        currentStep: 'first_product',
        completedSteps: ['org_profile', 'first_warehouse', 'first_location'],
      },
    });

    const productStep = screen.getByRole('region', { name: /SET-004 · First product/i });
    expect(screen.getByRole('button', { name: /Skip this step →/i })).toBeInTheDocument();
    expect(compactText(productStep)).toContain(
      "Products live in 03-TECHNICAL. You'll go there to create an SKU + BOM, then come back to complete onboarding.",
    );
    expect(compactText(productStep)).toContain('You can also import items from D365 later (Admin › D365 mapping).');
    await user.click(within(productStep).getByRole('button', { name: /Open products →/i }));
    expect(routerPush).toHaveBeenCalledWith('/technical/products');
  });

  it('renders the first-location fields inside the six-step wizard with saved-state/resume semantics and keyboard order', async () => {
    const user = userEvent.setup();
    await renderLocation();

    expect(screen.getByRole('heading', { name: /onboarding wizard/i })).toBeInTheDocument();
    expect(screen.getByText(/6-step setup · target <15 minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/state saved automatically/i)).toBeInTheDocument();
    expect(screen.getByText(/33% complete/i)).toBeInTheDocument();
    expect(screen.getByText(/Resume capability/i)).toBeInTheDocument();
    expect(screen.getByText(/onboarding_state\.current_step/i)).toBeInTheDocument();

    expect(stepperLabels()).toEqual([
      expect.stringMatching(/1.*✓.*Organization profile.*SET-001/i),
      expect.stringMatching(/2.*✓.*First warehouse.*SET-002/i),
      expect.stringMatching(/3.*First location.*SET-003/i),
      expect.stringMatching(/4.*First product.*SET-004/i),
      expect.stringMatching(/5.*First work order.*SET-005/i),
      expect.stringMatching(/6.*Completion.*SET-006/i),
    ]);
    expect(screen.getByRole('button', { name: /First location.*SET-003/i })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.queryByRole('button', { name: /Skip this step/i })).not.toBeInTheDocument();

    const locationStep = screen.getByRole('region', { name: /SET-003 · First location/i });
    expect(within(locationStep).getByText(/Zone \/ bin inside the warehouse/i)).toBeInTheDocument();
    expect(within(locationStep).getByText(/Locations are ltree paths/i)).toBeInTheDocument();
    expect(within(locationStep).getByLabelText(/Location path \(ltree\)/i)).toHaveValue(
      'FG › Zone A › Rack 1 › Bin 1',
    );
    expect(within(locationStep).getByLabelText(/^Zone$/i)).toHaveValue('Zone A');
    expect(within(locationStep).getByLabelText(/Bin code/i)).toHaveValue('BIN-A1-01');
    expect(within(locationStep).getByLabelText(/Parent warehouse/i)).toHaveValue('FG-01');
    expect(within(locationStep).getByLabelText(/Parent warehouse/i)).toHaveAttribute('readonly');
    expect(screen.getByText(/Step 3 of 6 · 2 completed/i)).toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole('button', { name: /restart/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /Organization profile.*SET-001/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /First warehouse.*SET-002/i })).toHaveFocus();
  });

  it('captures RTL snapshot fallback evidence for the wizard stepper and SET-003 form region', async () => {
    await renderLocation();

    expect(stepperAriaFallbackSnapshot()).toMatchInlineSnapshot(`
      [
        {
          "current": "none",
          "name": "1✓ Organization profileSET-001",
          "role": "button",
        },
        {
          "current": "none",
          "name": "2✓ First warehouseSET-002",
          "role": "button",
        },
        {
          "current": "step",
          "name": "3First locationSET-003",
          "role": "button",
        },
        {
          "current": "none",
          "name": "4First productSET-004",
          "role": "button",
        },
        {
          "current": "none",
          "name": "5First work orderSET-005",
          "role": "button",
        },
        {
          "current": "none",
          "name": "6CompletionSET-006",
          "role": "button",
        },
      ]
    `);
    expect(set003FormAriaFallbackSnapshot()).toMatchInlineSnapshot(`
      {
        "controls": [
          {
            "invalid": "false",
            "label": "Location path (ltree)",
            "readonly": false,
            "value": "FG › Zone A › Rack 1 › Bin 1",
          },
          {
            "invalid": "false",
            "label": "Zone",
            "readonly": false,
            "value": "Zone A",
          },
          {
            "invalid": "false",
            "label": "Bin code",
            "readonly": false,
            "value": "BIN-A1-01",
          },
          {
            "invalid": "false",
            "label": "Parent warehouse",
            "readonly": true,
            "value": "FG-01",
          },
        ],
        "footer": "Step 3 of 6 · 2 completed",
        "help": "Locations are ltree paths (e.g. \`FG › Zone A › Rack 1 › Bin 3\`). Scanner picks are routed by location.",
        "name": "SET-003 · First location",
        "role": "region",
      }
    `);
  });

  it('materializes a four-level ltree location row and advances the wizard on continue', async () => {
    const user = userEvent.setup();
    const createFirstLocation = vi.fn().mockResolvedValue(defaultCreateResult);
    await renderLocation({ createFirstLocation });

    await user.clear(screen.getByLabelText(/Location path \(ltree\)/i));
    await user.type(screen.getByLabelText(/Location path \(ltree\)/i), 'FG › Zone A › Rack 1 › Bin 3');
    await user.clear(screen.getByLabelText(/^Zone$/i));
    await user.type(screen.getByLabelText(/^Zone$/i), 'Zone A');
    await user.clear(screen.getByLabelText(/Bin code/i));
    await user.type(screen.getByLabelText(/Bin code/i), 'BIN-A1-03');
    await user.click(screen.getByRole('button', { name: /Continue →/i }));

    expect(createFirstLocation).toHaveBeenCalledWith({
      orgId: 'org-apex',
      warehouseCode: 'FG-01',
      path: 'FG.Zone_A.Rack_1.Bin_3',
      pathSegments: ['FG', 'Zone A', 'Rack 1', 'Bin 3'],
      level: 4,
      zone: 'Zone A',
      binCode: 'BIN-A1-03',
    } satisfies CreateFirstLocationInput);
    expect(await screen.findByText(/Location loc-bin-a1-03 created/i)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /SET-004 · First product/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Skip this step →/i })).toBeInTheDocument();
  });

  it('rejects invalid path separators inline without calling the create action', async () => {
    const user = userEvent.setup();
    const createFirstLocation = vi.fn().mockResolvedValue(defaultCreateResult);
    await renderLocation({ createFirstLocation });

    await user.clear(screen.getByLabelText(/Location path \(ltree\)/i));
    await user.type(screen.getByLabelText(/Location path \(ltree\)/i), 'FG / Zone A / Rack 1 / Bin 3');
    await user.click(screen.getByRole('button', { name: /Continue →/i }));

    expect(createFirstLocation).not.toHaveBeenCalled();
    expect(screen.getByText('Use ` › ` between segments')).toBeInTheDocument();
    expect(screen.getByLabelText(/Location path \(ltree\)/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/Location path \(ltree\)/i)).toHaveFocus();
    expect(screen.getByRole('region', { name: /SET-003 · First location/i })).toBeInTheDocument();
  });

  it('fails loudly for loading and error states instead of silently skipping unverified UI parity', async () => {
    const retryLoad = vi.fn();
    await renderLocation({ state: 'loading', retryLoad });

    expect(screen.getByRole('status', { name: /loading onboarding location/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue →/i })).toBeDisabled();

    cleanup();
    await renderLocation({ state: 'error', retryLoad });

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load onboarding progress/i);
    await userEvent.click(screen.getByRole('button', { name: /Retry/i }));
    expect(retryLoad).toHaveBeenCalledTimes(1);
  });
});

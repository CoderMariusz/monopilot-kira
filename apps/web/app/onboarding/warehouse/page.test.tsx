/**
 * @vitest-environment jsdom
 * T-042 / SET-002 — Onboarding first warehouse step
 *
 * RED phase: RTL tests pin the production onboarding step behavior from
 * prototypes/design/Monopilot Design System/settings/onboarding-screens.jsx:7-238,
 * focused on current step first_warehouse. Missing production page modules render as
 * an empty placeholder so RED reports behavior assertion failures, not module-resolution noise.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  orgId: string;
  onboardingState: {
    currentStep: OnboardingStepKey;
    completed: OnboardingStepKey[];
    skipped: OnboardingStepKey[];
    savedAt: string;
  };
  initialWarehouse: {
    name: string;
    code: string;
    type: WarehouseType;
    address: string;
  };
  state?: 'ready' | 'loading' | 'error' | 'permission_denied';
  createFirstWarehouse: ReturnType<typeof vi.fn<[CreateFirstWarehouseInput], Promise<CreateFirstWarehouseResult>>>;
  onNavigateStep: ReturnType<typeof vi.fn<[OnboardingStepKey], void>>;
  onOpenRedirect: ReturnType<typeof vi.fn<[string], void>>;
};

type FirstWarehousePage = (props: FirstWarehousePageProps) => React.ReactNode | Promise<React.ReactNode>;

const defaultProps = {
  orgId: 'org-apex',
  onboardingState: {
    currentStep: 'first_warehouse' as const,
    completed: ['org_profile'] as OnboardingStepKey[],
    skipped: [] as OnboardingStepKey[],
    savedAt: '2026-05-19T19:20:00.000Z',
  },
  initialWarehouse: {
    name: 'ApexDG · Finished Goods',
    code: 'FG-01',
    type: 'finished' as const,
    address: 'Street, city, country',
  },
};

async function loadFirstWarehousePage(): Promise<FirstWarehousePage> {
  try {
    const pageModulePath = './page';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-002 page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as FirstWarehousePage;
  } catch {
    return function MissingFirstWarehousePage() {
      return React.createElement('main', { 'data-testid': 'missing-first-warehouse-page' });
    };
  }
}

async function renderFirstWarehouse(overrides: Partial<FirstWarehousePageProps> = {}) {
  const Page = await loadFirstWarehousePage();
  const props: FirstWarehousePageProps = {
    ...defaultProps,
    state: 'ready',
    createFirstWarehouse: vi.fn<[CreateFirstWarehouseInput], Promise<CreateFirstWarehouseResult>>().mockResolvedValue({
      ok: true,
      warehouse: {
        id: 'wh-fg-01',
        orgId: defaultProps.orgId,
        name: defaultProps.initialWarehouse.name,
        code: defaultProps.initialWarehouse.code,
        type: defaultProps.initialWarehouse.type,
      },
      organizationModules: { firstWarehouseId: 'wh-fg-01' },
      nextStep: 'first_location',
    }),
    onNavigateStep: vi.fn<[OnboardingStepKey], void>(),
    onOpenRedirect: vi.fn<[string], void>(),
    ...overrides,
    onboardingState: {
      ...defaultProps.onboardingState,
      ...overrides.onboardingState,
    },
    initialWarehouse: {
      ...defaultProps.initialWarehouse,
      ...overrides.initialWarehouse,
    },
  };

  if (Page.constructor.name === 'AsyncFunction') {
    const node = await Page(props);
    return { props, ...render(React.createElement(React.Fragment, null, node)) };
  }

  return {
    props,
    ...render(React.createElement(Page as React.ComponentType<FirstWarehousePageProps>, props)),
  };
}

function stepperLabels() {
  const stepper = screen.getByRole('navigation', { name: /onboarding steps/i });
  return within(stepper).getAllByRole('button').map((button) => button.textContent?.replace(/\s+/g, ' ').trim());
}

describe('SET-002 first warehouse onboarding wizard parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the first_warehouse stepper, resume copy, fields, loading/error states, and keyboard order from the canonical onboarding prototype', async () => {
    const user = userEvent.setup();
    await renderFirstWarehouse();

    expect(screen.getByRole('heading', { name: /onboarding wizard/i })).toBeInTheDocument();
    expect(screen.getByText(/6-step setup/i)).toHaveTextContent(/state saved automatically/i);
    expect(screen.getByText(/SET-001 Wizard Launcher/i)).toBeInTheDocument();
    expect(screen.getByText(/onboarding_state\.current_step/i)).toBeInTheDocument();

    expect(stepperLabels()).toEqual([
      '✓ Organization profile SET-001',
      '2 First warehouse SET-002',
      '3 First location SET-003',
      '4 First product SET-004',
      '5 First work order SET-005',
      '6 Completion SET-006',
    ]);
    expect(screen.getByRole('button', { name: /2 first warehouse set-002/i })).toHaveAttribute(
      'aria-current',
      'step',
    );

    const currentStep = screen.getByRole('region', { name: /SET-002 · First warehouse/i });
    expect(within(currentStep).getByText(/Where you store finished goods/i)).toBeInTheDocument();
    expect(
      within(currentStep).getByText(/Each warehouse holds one or more locations/i),
    ).toBeInTheDocument();
    expect(within(currentStep).getByLabelText(/warehouse name/i)).toHaveValue('ApexDG · Finished Goods');
    expect(within(currentStep).getByLabelText(/warehouse code/i)).toHaveValue('FG-01');
    expect(within(currentStep).getByRole('combobox', { name: /warehouse type/i })).toHaveValue('finished');
    expect(within(currentStep).getByLabelText(/address/i)).toHaveValue('Street, city, country');
    expect(screen.queryByRole('button', { name: /skip this step/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Step 2 of 6 · 1 completed/i)).toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole('button', { name: /restart/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /✓ organization profile set-001/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /2 first warehouse set-002/i })).toHaveFocus();

    cleanup();
    await renderFirstWarehouse({ state: 'loading' });
    expect(screen.getByTestId('first-warehouse-loading')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();

    cleanup();
    await renderFirstWarehouse({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(/first warehouse step could not be loaded/i);

    cleanup();
    await renderFirstWarehouse({ state: 'permission_denied' });
    expect(screen.getByRole('alert')).toHaveTextContent(/settings\.onboarding\.write/i);
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();
  });

  it('submits valid name, code, and type through the Server Action contract and advances to step 3 with module linkage evidence', async () => {
    const user = userEvent.setup();
    const createFirstWarehouse = vi.fn<[CreateFirstWarehouseInput], Promise<CreateFirstWarehouseResult>>().mockResolvedValue({
      ok: true,
      warehouse: {
        id: 'wh-cold-01',
        orgId: defaultProps.orgId,
        name: 'Apex Cold Store',
        code: 'COLD-01',
        type: 'finished',
      },
      organizationModules: { firstWarehouseId: 'wh-cold-01' },
      nextStep: 'first_location',
    });
    const onNavigateStep = vi.fn<[OnboardingStepKey], void>();

    await renderFirstWarehouse({ createFirstWarehouse, onNavigateStep });
    await user.clear(screen.getByLabelText(/warehouse name/i));
    await user.type(screen.getByLabelText(/warehouse name/i), 'Apex Cold Store');
    await user.clear(screen.getByLabelText(/warehouse code/i));
    await user.type(screen.getByLabelText(/warehouse code/i), 'COLD-01');
    await user.selectOptions(screen.getByRole('combobox', { name: /warehouse type/i }), 'finished');

    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(createFirstWarehouse).toHaveBeenCalledTimes(1);
    expect(createFirstWarehouse).toHaveBeenCalledWith({
      orgId: 'org-apex',
      name: 'Apex Cold Store',
      code: 'COLD-01',
      type: 'finished',
      address: 'Street, city, country',
    });
    expect(await screen.findByText(/warehouse wh-cold-01 created/i)).toBeInTheDocument();
    expect(screen.getByText(/organization_modules\.first_warehouse_id = wh-cold-01/i)).toBeInTheDocument();
    expect(onNavigateStep).toHaveBeenCalledWith('first_location');
    expect(screen.getByRole('button', { name: /3 first location set-003/i })).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  it('keeps the user on SET-002 and shows CODE_TAKEN inline when the warehouse code already exists in the org', async () => {
    const user = userEvent.setup();
    const createFirstWarehouse = vi.fn<[CreateFirstWarehouseInput], Promise<CreateFirstWarehouseResult>>().mockResolvedValue({
      ok: false,
      error: 'CODE_TAKEN',
      field: 'code',
    });
    const onNavigateStep = vi.fn<[OnboardingStepKey], void>();

    await renderFirstWarehouse({ createFirstWarehouse, onNavigateStep });
    await user.clear(screen.getByLabelText(/warehouse code/i));
    await user.type(screen.getByLabelText(/warehouse code/i), 'FG-01');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(createFirstWarehouse).toHaveBeenCalledTimes(1);
    const codeField = screen.getByLabelText(/warehouse code/i);
    expect(codeField).toHaveAccessibleDescription(/CODE_TAKEN|already exists/i);
    expect(screen.getByText(/CODE_TAKEN/i)).toBeInTheDocument();
    expect(onNavigateStep).not.toHaveBeenCalledWith('first_location');
    expect(screen.getByRole('button', { name: /2 first warehouse set-002/i })).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  it('preserves prototype back/restart and skippable redirect-card semantics while first_warehouse itself remains non-skippable', async () => {
    const user = userEvent.setup();
    const onNavigateStep = vi.fn<[OnboardingStepKey], void>();
    const onOpenRedirect = vi.fn<[string], void>();

    await renderFirstWarehouse({ onNavigateStep, onOpenRedirect });
    await user.click(screen.getByRole('button', { name: /← back/i }));
    expect(onNavigateStep).toHaveBeenCalledWith('org_profile');

    await user.click(screen.getByRole('button', { name: /restart/i }));
    expect(onNavigateStep).toHaveBeenCalledWith('org_profile');
    expect(screen.queryByRole('button', { name: /skip this step/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /4 first product set-004/i }));
    expect(screen.getByRole('button', { name: /skip this step/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open products/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /open products/i }));
    expect(onOpenRedirect).toHaveBeenCalledWith('products');
  });
});

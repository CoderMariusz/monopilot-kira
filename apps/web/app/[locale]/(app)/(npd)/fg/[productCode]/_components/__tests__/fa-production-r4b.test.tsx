/**
 * @vitest-environment jsdom
 * R4.2 — Production-tab rebuild: per-process LINE + CONSUMPTION cards, the
 * project line picker demoted to a "Default line", and packaging as a process.
 *
 * Asserts:
 *  - per-process LINE select saves lineId via the wip-process update path;
 *  - CONSUMPTION picker calls assignIngredientProcess (assign + move + clear)
 *    and renders assigned ingredients as chips;
 *  - the project-level picker renders the "Default line" label + helper text;
 *  - the add-component picker offers packaging items (packaging-as-a-process).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../(npd)/fa/actions/update-fa-cell', () => ({
  updateFaCell: vi.fn(async () => ({ previousValue: null, newValue: null, builtReset: false })),
  AuthError: class AuthError extends Error {},
  ValidationError: class ValidationError extends Error {},
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ locale: 'en', productCode: 'FG-TEST' }),
}));

import {
  FaProductionTab,
  type FaProductionTabLabels,
  type FaProductionColumn,
  type ProdDetailRow,
  type ComponentProcess,
  type OperationOption,
  type FormulationIngredient,
  type ProductionProcessLabels,
} from '../fa-production-tab';
import type { FaProductionLineOption } from '../../../../../../../(npd)/fa/_components/w5-production-constants';

function PROCESS_LABELS(): ProductionProcessLabels {
  return {
    sectionTitle: 'Processes',
    sectionSubtitle: 'Add the manufacturing processes for this component.',
    addProcess: '+ Add process',
    pickerLabel: 'Select a process',
    pickerPlaceholder: 'Search processes…',
    pickerEmpty: 'No processes available',
    pickerLoading: 'Loading processes…',
    pickerError: 'Could not load processes',
    pickerCancel: 'Cancel',
    empty: 'No processes yet',
    emptyBody: 'Add the first manufacturing process.',
    duration: 'Duration (h)',
    additionalCost: 'Standard cost',
    throughputPerHour: 'Throughput / hour',
    throughputUom: 'Throughput unit',
    setupCost: 'Setup cost (£)',
    yieldPct: 'Yield %',
    processCost: 'Process cost',
    createsWip: 'Creates WIP',
    rolesHeader: 'Roles',
    editProcess: 'Edit process',
    removeProcess: 'Remove process',
    save: 'Save process',
    saving: 'Saving…',
    cancel: 'Cancel',
    addError: 'Could not add the process',
    updateError: 'Could not update the process',
    removeError: 'Could not remove the process',
    saveRolesError: 'Could not save the roles',
    subtotalLabel: 'Process subtotal',
    roleGroup: 'Role',
    headcount: 'Headcount',
    loading: 'Loading processes…',
    loadError: 'Could not load processes',
    lineLabel: 'Line',
    linePlaceholder: 'Project default',
    lineSaveError: 'Could not save the process line',
    consumptionLabel: 'Consumed ingredients',
    consumptionPlaceholder: 'Assign ingredient…',
    consumptionEmpty: 'No ingredients assigned',
    consumptionSaveError: 'Could not assign the ingredient',
    removeConsumption: 'Remove ingredient',
  };
}

const LABELS: FaProductionTabLabels = {
  title: 'Production detail',
  componentsCount: '{count} component(s)',
  subtitle: 'Edits reset Built flag automatically.',
  lockedTitle: 'Blocked',
  lockedBody: 'Add at least one ingredient.',
  v06Pass: 'V06 ✓',
  v06Warn: 'V06 ⚠',
  aggregateTitle: 'Aggregate (read-only)',
  autoHint: 'Auto-derived — read-only.',
  singleComponent: '(single component)',
  save: 'Save Production',
  saving: 'Saving…',
  saveSuccess: 'Saved.',
  saveError: 'Save failed.',
  selectPlaceholder: 'Select…',
  loading: 'Loading…',
  empty: 'No production components yet',
  emptyBody: 'No components.',
  error: 'Unable to load.',
  forbidden: 'No permission.',
  addComponent: '+ Add production component',
  emptyCtaBody: 'Add a production component from the items master.',
  removeComponent: 'Remove component',
  removeError: 'Could not remove.',
  picker: {
    trigger: '+ Add production component',
    searchLabel: 'Search items',
    searchPlaceholder: 'Search by code or name…',
    loading: 'Searching…',
    empty: 'No matching items',
    cancel: 'Cancel',
    error: 'Item search failed',
  },
  processes: PROCESS_LABELS(),
  productionLine: 'Production line',
  productionLinePlaceholder: 'Select a line…',
  productionLineEmpty: 'No production lines configured for this site.',
  productionLineSaveError: 'Could not save the production line',
  productionLineDefault: 'Default line',
  productionLineHelper: 'Per-process lines override it.',
  fields: {},
};

const COLUMNS: FaProductionColumn[] = [];

const ROWS: ProdDetailRow[] = [
  {
    id: 'row-1',
    componentIndex: 1,
    intermediateCode: 'PR1939H',
    componentLabel: 'Bacon block',
    componentWeight: 200,
    v06Status: 'pass',
    values: {},
  },
];

const OPERATION_OPTIONS: OperationOption[] = [{ id: 'op-mince', operationName: 'Mince' }];

const COMPONENT_PROCESSES: Record<string, ComponentProcess[]> = {
  'row-1': [
    {
      id: 'wp-1',
      processName: 'Mince',
      displayOrder: 0,
      durationHours: 2,
      additionalCost: 5,
      createsWipItem: false,
      wipItemId: null,
      throughputPerHour: 0,
      throughputUom: 'kg',
      setupCost: 0,
      yieldPct: 95,
      lineId: null,
      roles: [],
      processCost: 10,
    },
  ],
};

const LINE_OPTIONS: FaProductionLineOption[] = [
  { id: 'line-1', code: 'L1', name: 'Line One' },
  { id: 'line-2', code: 'L2', name: 'Line Two' },
];

// ing-1 unassigned (assignable); ing-2 already assigned to wp-1 (renders a chip).
const INGREDIENTS: FormulationIngredient[] = [
  { id: 'ing-1', rmCode: 'RM-100', itemId: 'it-1', npdWipProcessId: null, sequence: 1 },
  { id: 'ing-2', rmCode: 'RM-200', itemId: 'it-2', npdWipProcessId: 'wp-1', sequence: 2 },
];

function renderTab(overrides?: Partial<React.ComponentProps<typeof FaProductionTab>>) {
  return render(
    <FaProductionTab
      productCode="FA-1001"
      packSizeFilled
      formulationIngredientCount={2}
      columns={COLUMNS}
      rows={ROWS}
      dropdowns={{}}
      labels={LABELS}
      state="ready"
      canWrite
      componentProcesses={COMPONENT_PROCESSES}
      operationOptions={OPERATION_OPTIONS}
      productionLineOptions={LINE_OPTIONS}
      formulationIngredients={INGREDIENTS}
      {...overrides}
    />,
  );
}

/** Open a custom shadcn Select by its trigger testid and click an option by name. */
async function pickOption(user: ReturnType<typeof userEvent.setup>, triggerTestId: string, name: RegExp) {
  await user.click(screen.getByTestId(triggerTestId));
  const options = await screen.findAllByRole('option', { name });
  await user.click(options[0]);
}

afterEach(() => cleanup());

describe('R4.2 — per-process LINE picker', () => {
  it('saves lineId through the wip-process update path', async () => {
    const user = userEvent.setup();
    const onUpdateProcess = vi.fn(async () => ({ ok: true as const, updated: true }));
    const onMutated = vi.fn();
    renderTab({ onUpdateProcess, onMutated });

    await pickOption(user, 'fa-prod-process-line-wp-1', /L2 — Line Two/);

    expect(onUpdateProcess).toHaveBeenCalledWith({ id: 'wp-1', lineId: 'line-2' });
    expect(onMutated).toHaveBeenCalled();
  });

  it('shows a read-only line text (not a select) when the user cannot write', () => {
    renderTab({ canWrite: false });
    expect(screen.queryByTestId('fa-prod-process-line-wp-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('fa-prod-process-line-text-wp-1')).toBeInTheDocument();
  });
});

describe('R4.2 — per-process CONSUMPTION picker', () => {
  it('renders the already-assigned ingredient as a chip', () => {
    renderTab();
    const chip = screen.getByTestId('fa-prod-consumption-chip-wp-1-ing-2');
    expect(chip).toHaveTextContent('RM-200');
  });

  it('assigning an ingredient calls assignIngredientProcess with the process id', async () => {
    const user = userEvent.setup();
    const onAssignIngredientProcess = vi.fn(async () => ({
      ok: true as const,
      ingredientId: 'ing-1',
      npdWipProcessId: 'wp-1',
    }));
    const onMutated = vi.fn();
    renderTab({ onAssignIngredientProcess, onMutated });

    await pickOption(user, 'fa-prod-consumption-add-wp-1', /RM-100/);

    expect(onAssignIngredientProcess).toHaveBeenCalledWith({
      ingredientId: 'ing-1',
      npdWipProcessId: 'wp-1',
    });
    expect(onMutated).toHaveBeenCalled();
  });

  it('removing a chip clears the assignment (npdWipProcessId = null)', async () => {
    const user = userEvent.setup();
    const onAssignIngredientProcess = vi.fn(async () => ({
      ok: true as const,
      ingredientId: 'ing-2',
      npdWipProcessId: null,
    }));
    const onMutated = vi.fn();
    renderTab({ onAssignIngredientProcess, onMutated });

    await user.click(screen.getByTestId('fa-prod-consumption-remove-wp-1-ing-2'));

    expect(onAssignIngredientProcess).toHaveBeenCalledWith({
      ingredientId: 'ing-2',
      npdWipProcessId: null,
    });
    expect(onMutated).toHaveBeenCalled();
  });

  it('the assignable picker excludes ingredients already on this process', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByTestId('fa-prod-consumption-add-wp-1'));
    // ing-1 (unassigned) is offered; ing-2 (already on wp-1) is not.
    expect(await screen.findAllByRole('option', { name: /RM-100/ })).not.toHaveLength(0);
    expect(screen.queryByRole('option', { name: /RM-200/ })).not.toBeInTheDocument();
  });
});

describe('R4.2 — project picker demoted to "Default line"', () => {
  it('renders the Default line label + helper text', () => {
    const onSetProductionLine = vi.fn(async () => ({ ok: true as const, productionLineId: null }));
    renderTab({ projectId: 'proj-1', productionLineId: null, onSetProductionLine });
    const picker = screen.getByTestId('fa-production-line-picker');
    expect(within(picker).getByText('Default line')).toBeInTheDocument();
    expect(screen.getByTestId('fa-production-line-helper')).toHaveTextContent(
      'Per-process lines override it.',
    );
  });
});

describe('R4.2 — packaging as a process (add-component picker offers packaging)', () => {
  it('requests packaging items in the add-component search', async () => {
    const user = userEvent.setup();
    const onSearchItems = vi.fn(async () => [
      { id: 'pk-1', itemCode: 'PK-01', name: 'Tray', itemType: 'packaging', status: 'active', costPerKgEur: '1.00', uomBase: 'each' },
    ]);
    renderTab({ onSearchItems });

    await user.click(screen.getByTestId('item-picker-trigger'));
    const input = await screen.findByPlaceholderText(LABELS.picker.searchPlaceholder);
    await user.type(input, 'tray');

    await vi.waitFor(() => expect(onSearchItems).toHaveBeenCalled());
    const call = onSearchItems.mock.calls.at(-1)?.[0] as { itemTypes?: string[] };
    expect(call.itemTypes).toContain('packaging');
  });
});

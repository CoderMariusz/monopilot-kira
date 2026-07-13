/**
 * @vitest-environment jsdom
 * D3 / B5 — FormulationWipPanel mounts on the Recipe stage with real loader data
 * and wires process actions (create-WIP-from-process affordance).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FaProductionTabLabels } from '../../../../../../../../(npd)/fa/[productCode]/_components/fa-production-tab';
import type { FormulationWipPanelData } from '../../../../../../../../(npd)/fa/_actions/load-formulation-wip-panel';

const loadFormulationWipPanelMock = vi.fn<() => Promise<FormulationWipPanelData>>();

vi.mock('../../../../../../../../(npd)/fa/_actions/load-formulation-wip-panel', () => ({
  loadFormulationWipPanel: (...args: unknown[]) => loadFormulationWipPanelMock(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ locale: 'en', productCode: 'FG-NPD-001' }),
}));

import { FormulationWipPanel } from '../formulation-wip-panel';

afterEach(() => {
  cleanup();
  loadFormulationWipPanelMock.mockReset();
});

const LABELS: FaProductionTabLabels = {
  title: 'Production detail',
  componentsCount: '{count} component(s)',
  subtitle: 'Edits reset the Built flag automatically.',
  lockedTitle: 'Blocked',
  lockedBody: 'Add at least one ingredient to the current recipe/formulation before editing Production.',
  v06Pass: 'Yield OK',
  v06Warn: 'Yield incomplete',
  aggregateTitle: 'Aggregate',
  autoHint: 'Auto-derived',
  singleComponent: 'Component',
  save: 'Save Production',
  saving: 'Saving…',
  saveSuccess: 'Saved',
  saveError: 'Save failed',
  selectPlaceholder: 'Select…',
  loading: 'Loading…',
  empty: 'No production components',
  emptyBody: 'Production rows derive from Core recipe components.',
  error: 'Unable to load Production.',
  forbidden: 'You cannot edit Production.',
  addComponent: '+ Add production component',
  emptyCtaBody: 'Add a production component from the items master.',
  removeComponent: 'Remove component',
  removeError: 'Could not remove the component',
  picker: {
    trigger: '+ Add production component',
    searchLabel: 'Search items',
    searchPlaceholder: 'Search by code or name…',
    loading: 'Searching…',
    empty: 'No matching items',
    cancel: 'Cancel',
    error: 'Item search failed',
  },
  processes: {
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
  },
  productionLine: 'Production line',
  productionLinePlaceholder: 'Select a line…',
  productionLineEmpty: 'No production lines configured for this site.',
  productionLineSaveError: 'Could not save the production line',
  fields: {},
};

const PROJECT_ID = '33333333-3333-4333-8333-333333333333';

describe('FormulationWipPanel — D3 / B5 mount on Recipe stage', () => {
  it('renders the no-FG gate when the project has no linked product code', async () => {
    loadFormulationWipPanelMock.mockResolvedValue({ state: 'no_fg_linked' });

    const ui = await FormulationWipPanel({
      projectId: PROJECT_ID,
      locale: 'en',
      labels: LABELS,
      noFgTitle: 'No Finished Good linked yet',
      noFgBody: 'Advance to Development to create the FG candidate.',
      noFgGateLink: 'View project gates',
    });
    render(ui);

    expect(loadFormulationWipPanelMock).toHaveBeenCalledWith(PROJECT_ID);
    expect(screen.getByTestId('formulation-wip-no-fg')).toBeInTheDocument();
    expect(screen.getByTestId('formulation-wip-gate-link')).toHaveAttribute(
      'href',
      `/en/pipeline/${PROJECT_ID}/gate`,
    );
  });

  it('mounts FaProductionTab with process rows and create-WIP affordance wired', async () => {
    const onAddProcess = vi.fn();
    loadFormulationWipPanelMock.mockResolvedValue({
      state: 'ready',
      productCode: 'FG-NPD-001',
      formulationIngredientCount: 2,
      formulationIngredients: [],
      columns: [],
      rows: [
        {
          id: 'row-1',
          componentIndex: 1,
          intermediateCode: 'PR8801',
          itemId: 'item-1',
          values: {},
        },
      ],
      dropdowns: {},
      componentProcesses: {
        'row-1': [
          {
            id: 'wp-1',
            processName: 'Mince',
            displayOrder: 0,
            durationHours: 2,
            additionalCost: 5,
            createsWipItem: true,
            wipItemId: null,
            throughputPerHour: 0,
            throughputUom: 'kg',
            setupCost: 0,
            yieldPct: 95,
            roles: [],
            processCost: 117,
          },
        ],
      },
      operationOptions: [{ id: 'op-mince', operationName: 'Mince' }],
      canWrite: true,
      projectId: PROJECT_ID,
      productionLineId: null,
      productionLineOptions: [],
      ingredientQtyKgPerPack: 1,
      actions: {
        onAddProcess,
        onUpdateProcess: vi.fn(),
        onRemoveProcess: vi.fn(),
        onSaveProcessRoles: vi.fn(),
        onGetProcessDefault: vi.fn(),
        onSetProductionLine: vi.fn(),
        onAssignIngredientProcess: vi.fn(),
      },
    });

    const ui = await FormulationWipPanel({
      projectId: PROJECT_ID,
      locale: 'en',
      labels: LABELS,
      noFgTitle: 'No Finished Good linked yet',
      noFgBody: 'Advance to Development to create the FG candidate.',
      noFgGateLink: 'View project gates',
    });
    render(ui);

    expect(screen.getByTestId('formulation-wip-panel')).toBeInTheDocument();
    expect(screen.getByTestId('fa-prod-processes-row-1')).toBeInTheDocument();
    expect(screen.getByText('Mince')).toBeInTheDocument();
    expect(screen.getByTestId('fa-prod-add-process')).toBeInTheDocument();
  });
});

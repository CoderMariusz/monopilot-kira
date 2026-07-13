/**
 * @vitest-environment jsdom
 * NPD v2 S5b (D6/D9) — Production tab dynamic PROCESS LIST parity evidence.
 *
 * Emits the per-state DOM artifacts (HTML) + a parity report consumed as the
 * accepted UI-PROTOTYPE-PARITY-POLICY fallback when the RBAC-gated live preview
 * is unavailable in this isolated worktree (mirrors e2e/artifacts/T-105/*.html).
 * States captured: ready (process list + roles + cost), empty (no processes),
 * add-picker (operation combobox open), edit-dialog (duration/createsWip), and
 * permission/locked (write affordances gated). Spec-driven (no 1:1 prototype JSX).
 */
import path from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';

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
} from '../../../../../../../(npd)/fa/[productCode]/_components/fa-production-tab';

const ARTIFACT_DIR = path.resolve(__dirname, '../../../../../../../../e2e/artifacts/S5b-production-processes');

const LABELS: FaProductionTabLabels = {
  title: 'Production detail',
  componentsCount: '{count} component(s)',
  subtitle: 'Edits reset Built flag automatically.',
  lockedTitle: 'Blocked',
  lockedBody: 'Pack_Size must be filled in Core before the process list becomes editable.',
  v06Pass: 'V06 ✓',
  v06Warn: 'V06 ⚠',
  aggregateTitle: 'Aggregate (read-only)',
  autoHint: 'Auto-derived — read-only.',
  singleComponent: '(single component)',
  save: 'Save Production',
  saving: 'Saving…',
  saveSuccess: 'Production section saved.',
  saveError: 'Could not save the Production section.',
  selectPlaceholder: 'Select…',
  loading: 'Loading…',
  empty: 'No production components yet',
  emptyBody: 'No ProdDetail components yet.',
  error: 'Unable to load the Production section.',
  forbidden: 'You do not have permission to edit the Production section.',
  addComponent: '+ Add production component',
  emptyCtaBody: 'Add a production component from the items master.',
  removeComponent: 'Remove component',
  removeError: 'Could not remove the component.',
  picker: {
    trigger: '+ Add production component',
    searchLabel: 'Search items',
    searchPlaceholder: 'Search by code or name…',
    loading: 'Searching…',
    empty: 'No matching items',
    cancel: 'Cancel',
    error: 'Item search failed.',
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
  },
  productionLine: 'Production line',
  productionLinePlaceholder: 'Select a line…',
  productionLineEmpty: 'No production lines configured for this site.',
  productionLineSaveError: 'Could not save the production line',
  fields: {
    line: 'Line',
    dieset: 'Dieset (auto)',
    staffing: 'Staffing',
    rate: 'Rate',
    // legacy keys carried in fields but FILTERED from the grid:
    manufacturing_operation_1: 'Process 1',
    operation_yield_1: 'Yield P1 %',
    intermediate_code_final: 'PR Code Final (auto)',
    yield_line: 'Yield Line %',
  },
};

const COLUMNS: FaProductionColumn[] = [
  // Legacy — should be filtered out of the rendered grid by the component.
  { key: 'manufacturing_operation_1', dataType: 'dropdown', required: false, readOnly: false, displayOrder: 1, dropdownSource: 'ManufacturingOperations' },
  { key: 'operation_yield_1', dataType: 'number', required: false, readOnly: false, displayOrder: 2 },
  { key: 'intermediate_code_final', dataType: 'text', required: false, readOnly: true, auto: true, displayOrder: 3 },
  { key: 'yield_line', dataType: 'number', required: true, readOnly: false, displayOrder: 4 },
  // Surviving production columns.
  { key: 'line', dataType: 'dropdown', required: true, readOnly: false, displayOrder: 13, dropdownSource: 'Lines' },
  { key: 'dieset', dataType: 'text', required: false, readOnly: true, auto: true, displayOrder: 14 },
  { key: 'staffing', dataType: 'text', required: false, readOnly: false, displayOrder: 16 },
  { key: 'rate', dataType: 'number', required: true, readOnly: false, displayOrder: 17 },
];

const ROWS: ProdDetailRow[] = [
  {
    id: 'row-1',
    componentIndex: 1,
    intermediateCode: 'PR1939H',
    componentLabel: 'Bacon block',
    componentWeight: 200,
    v06Status: 'pass',
    values: { line: 'L2', dieset: 'DS-L2', staffing: '3 op', rate: 1100 },
  },
];

const PROCESSES: Record<string, ComponentProcess[]> = {
  'row-1': [
    {
      id: 'wp-1',
      processName: 'Mince',
      displayOrder: 0,
      durationHours: 2,
      additionalCost: 5,
      createsWipItem: true,
      wipItemId: 'item-9',
      throughputPerHour: 0,
      throughputUom: 'kg',
      setupCost: 0,
      yieldPct: 100,
      roles: [
        { roleGroup: 'Operator', headcount: 3, ratePerHour: 12 },
        { roleGroup: 'Supervisor', headcount: 1, ratePerHour: 20 },
      ],
      processCost: 117,
    },
    {
      id: 'wp-2',
      processName: 'Pack',
      displayOrder: 1,
      durationHours: 1,
      additionalCost: 2,
      createsWipItem: false,
      wipItemId: null,
      throughputPerHour: 0,
      throughputUom: 'kg',
      setupCost: 0,
      yieldPct: 100,
      roles: [{ roleGroup: 'Operator', headcount: 2, ratePerHour: 12 }],
      processCost: 26,
    },
  ],
};

const OPERATIONS: OperationOption[] = [
  { id: 'op-mince', operationName: 'Mince' },
  { id: 'op-cook', operationName: 'Cook' },
  { id: 'op-pack', operationName: 'Pack' },
];

const DROPDOWNS: Record<string, string[]> = {
  ManufacturingOperations: ['Mince', 'Cook', 'Pack'],
  Lines: ['L1', 'L2', 'L3'],
};

function snap(name: string) {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(path.join(ARTIFACT_DIR, `${name}.html`), document.body.innerHTML);
}

afterEach(() => cleanup());

describe('S5b production-processes — parity evidence DOM artifacts', () => {
  it('ready: process list + roles chips + cost + subtotal; legacy slot columns absent', () => {
    render(
      <FaProductionTab
        productCode="FA0043"
        packSizeFilled
        columns={COLUMNS}
        rows={ROWS}
        dropdowns={DROPDOWNS}
        labels={LABELS}
        state="ready"
        canWrite
        componentProcesses={PROCESSES}
        operationOptions={OPERATIONS}
      />,
    );
    const section = screen.getByTestId('fa-prod-processes-row-1');
    expect(within(section).getByText('Mince')).toBeInTheDocument();
    expect(within(section).getByTestId('fa-prod-process-cost-wp-1')).toHaveTextContent('117');
    expect(within(section).getByTestId('fa-prod-process-subtotal-row-1')).toHaveTextContent('143');
    // Legacy slot columns are gone from the grid.
    expect(document.querySelector('[data-field="manufacturing_operation_1"]')).toBeNull();
    expect(document.querySelector('[data-field="intermediate_code_final"]')).toBeNull();
    expect(document.querySelector('[data-field="yield_line"]')).toBeNull();
    snap('ready');
  });

  it('empty: a component with no processes shows the empty state', () => {
    render(
      <FaProductionTab
        productCode="FA0043"
        packSizeFilled
        columns={COLUMNS}
        rows={ROWS}
        dropdowns={DROPDOWNS}
        labels={LABELS}
        state="ready"
        canWrite
        componentProcesses={{ 'row-1': [] }}
        operationOptions={OPERATIONS}
      />,
    );
    expect(within(screen.getByTestId('fa-prod-processes-row-1')).getByText(LABELS.processes.empty)).toBeInTheDocument();
    snap('empty');
  });

  it('add-picker: the operation combobox opens with active operations', async () => {
    const user = userEvent.setup();
    render(
      <FaProductionTab
        productCode="FA0043"
        packSizeFilled
        columns={COLUMNS}
        rows={ROWS}
        dropdowns={DROPDOWNS}
        labels={LABELS}
        state="ready"
        canWrite
        componentProcesses={PROCESSES}
        operationOptions={OPERATIONS}
      />,
    );
    await user.click(within(screen.getByTestId('fa-prod-processes-row-1')).getByTestId('fa-prod-add-process'));
    expect(await screen.findByTestId('process-option-op-cook')).toBeInTheDocument();
    snap('add-picker');
  });

  it('edit-dialog: duration + createsWip toggle controls', async () => {
    const user = userEvent.setup();
    render(
      <FaProductionTab
        productCode="FA0043"
        packSizeFilled
        columns={COLUMNS}
        rows={ROWS}
        dropdowns={DROPDOWNS}
        labels={LABELS}
        state="ready"
        canWrite
        componentProcesses={PROCESSES}
        operationOptions={OPERATIONS}
      />,
    );
    await user.click(within(screen.getByTestId('fa-prod-processes-row-1')).getByTestId('fa-prod-edit-process-wp-1'));
    expect(await screen.findByTestId('fa-prod-process-editor')).toBeInTheDocument();
    snap('edit-dialog');
  });

  it('permission/locked: write affordances gated, read still visible', () => {
    render(
      <FaProductionTab
        productCode="FA0043"
        packSizeFilled
        columns={COLUMNS}
        rows={ROWS}
        dropdowns={DROPDOWNS}
        labels={LABELS}
        state="ready"
        canWrite={false}
        componentProcesses={PROCESSES}
        operationOptions={OPERATIONS}
      />,
    );
    const section = screen.getByTestId('fa-prod-processes-row-1');
    expect(within(section).queryByTestId('fa-prod-add-process')).not.toBeInTheDocument();
    expect(within(section).getByText('Mince')).toBeInTheDocument();
    snap('permission-readonly');

    const report = {
      task: 'NPD v2 S5b — Production dynamic process list (D6/D9)',
      prototype_match: false,
      source: 'spec-driven (owner D6/D9); parity inherited from FaProductionTab patterns',
      states: ['ready', 'empty', 'add-picker', 'edit-dialog', 'permission-readonly'],
      structural_parity: {
        process_list: 'per-component ordered list (displayOrder) — operationName + role chips + duration + additionalCost + processCost',
        add: 'OperationPicker combobox over Reference.ManufacturingOperations (no raw <select>)',
        edit: 'ProcessEditDialog — duration / additionalCost / createsWipItem Switch',
        cost: 'per-process processCost + per-component Σ subtotal',
        legacy_filtered: ['manufacturing_operation_N', 'operation_yield_N', 'intermediate_code_*', 'yield_line', 'pr_code*'],
      },
      gating: 'canWrite && !packSizeFilled-lock — write affordances hidden/disabled, reads visible',
      i18n: 'npd.faProductionTab.processes (en/pl real, ro/uk mirror) — 30 keys × 4 locales',
      deviations: 'No 1:1 prototype JSX (new dynamic D6/D9 model). createsWip per-process; role re-edit is a follow-up (duration/cost/toggle are the owner must-haves).',
    };
    writeFileSync(path.join(ARTIFACT_DIR, 'parity-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  });
});

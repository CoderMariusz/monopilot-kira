/**
 * @vitest-environment jsdom
 * T-024 RED — FaProductionTab (SCR-03d FA detail Production tab) — ProdDetail
 * per-component rows editor. Parity + states + cascades.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:571-653 (fa_production_tab)
 *   — FAProductionTab: "Production detail — N component(s)" card; an amber
 *     "Blocked: Pack_Size must be filled" alert when locked; one block per
 *     ProdDetail component with a 4-column grid of Process 1..4 (select) +
 *     Yield P1..4 (number) + PR code P1..4 (auto read-only GREEN), then Line *
 *     (select), Dieset/dieset (auto read-only GREEN), Yield Line *
 *     (number), Staffing (text), Rate * (number), PR Code Final (auto read-only
 *     GREEN); a per-component V06 badge; an aggregate (read-only green) summary
 *     row when N>1; and a "Save Production" action row.
 *
 * Schema-driven (NO hardcoded column list — task red line): the editable column
 * set comes from the `columns` prop, server-derived from Reference.DeptColumns
 * (dept_code='Production') via the T-014 buildDeptZod runtime / dept-column
 * metadata. The per-component VALUES come from real `prod_detail` rows (composite
 * PK org_id + product_code). NO mock data inside the component.
 *
 * Write path: updateFaCell (T-009, merged) is the ONLY write path; mocked here so
 * the client test never touches a real Server Action / DB. Each dirty editable
 * cell is persisted per (component, column). Auto columns are NEVER submitted.
 *
 * Asserts:
 *  - AC1 parity: same regions (lock alert, per-component rows, 4 op dropdowns +
 *    yields + auto PR codes, line + dieset + yield_line + staffing +
 *    rate + final code, V06 badge, aggregate row, action row), shadcn
 *    Input/Select primitives, auto cols read-only GREEN.
 *  - AC2 chain2 (manufacturing_operation_1): editing op1 + Save calls updateFaCell
 *    with the manufacturing_operation_1 column → server fires chain2.
 *  - AC3 chain1 (line): changing line + Save calls updateFaCell with the line
 *    column → server fires chain1 (dieset autofilled).
 *  - read-only red line: intermediate_code_* / dieset are NOT editable
 *    and NEVER submitted.
 *  - locked gate: when Pack_Size is missing, every editable control is disabled.
 *  - the five required UI states (loading / empty / ready / error / permission_denied).
 *  - i18n: the component renders LABEL VALUES (props), never inline English literals.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const updateFaCellMock = vi.fn(async () => ({
  previousValue: null,
  newValue: null,
  builtReset: false,
}));

vi.mock('../../../../../../../(npd)/fa/actions/update-fa-cell', () => ({
  updateFaCell: (...args: unknown[]) => updateFaCellMock(...args),
  AuthError: class AuthError extends Error {},
  ValidationError: class ValidationError extends Error {},
}));

// Lane-B: the production tab calls useRouter().refresh() to re-read prod_detail
// rows after add/remove — mock next/navigation so the island renders in RTL.
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
  type ProductionProcessLabels,
} from '../../../../../../../(npd)/fa/[productCode]/_components/fa-production-tab';

const LABELS: FaProductionTabLabels = {
  title: 'Production detail',
  componentsCount: '{count} component(s)',
  subtitle: 'Edits reset Built flag automatically.',
  lockedTitle: 'Blocked',
  lockedBody: 'Pack_Size must be filled in Core before Process/Yield fields become editable.',
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
  loading: 'Loading Production section…',
  empty: 'No production components yet',
  emptyBody: 'This product has no ProdDetail components yet.',
  error: 'Unable to load the Production section.',
  forbidden: 'You do not have permission to edit the Production section.',
  fields: {
    manufacturing_operation_1: 'Process 1',
    manufacturing_operation_2: 'Process 2',
    manufacturing_operation_3: 'Process 3',
    manufacturing_operation_4: 'Process 4',
    operation_yield_1: 'Yield P1 %',
    operation_yield_2: 'Yield P2 %',
    operation_yield_3: 'Yield P3 %',
    operation_yield_4: 'Yield P4 %',
    intermediate_code_p1: 'PR code P1 (auto)',
    intermediate_code_p2: 'PR code P2 (auto)',
    intermediate_code_p3: 'PR code P3 (auto)',
    intermediate_code_p4: 'PR code P4 (auto)',
    line: 'Line',
    dieset: 'Dieset (auto)',
    yield_line: 'Yield Line %',
    staffing: 'Staffing',
    rate: 'Rate',
    intermediate_code_final: 'PR Code Final (auto)',
    equipment_notes: 'Equipment notes',
  },
  processes: PROCESS_LABELS(),
  productionLine: 'Production line',
  productionLinePlaceholder: 'Select a line…',
  productionLineEmpty: 'No production lines configured for this site.',
  productionLineSaveError: 'Could not save the production line',
};

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
  };
}

const OPERATION_OPTIONS: OperationOption[] = [
  { id: 'op-mince', operationName: 'Mince' },
  { id: 'op-cook', operationName: 'Cook' },
  { id: 'op-pack', operationName: 'Pack' },
];

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
      roles: [
        { roleGroup: 'Operator', headcount: 3, ratePerHour: 12 },
        { roleGroup: 'Supervisor', headcount: 1, ratePerHour: 20 },
      ],
      processCost: 117,
    },
  ],
};

// Schema-driven Production columns (mirrors Reference.DeptColumns seed, display order).
const COLUMNS: FaProductionColumn[] = [
  { key: 'manufacturing_operation_1', dataType: 'dropdown', required: false, readOnly: false, displayOrder: 1, dropdownSource: 'ManufacturingOperations' },
  { key: 'operation_yield_1', dataType: 'number', required: false, readOnly: false, displayOrder: 2 },
  { key: 'intermediate_code_p1', dataType: 'text', required: false, readOnly: true, auto: true, displayOrder: 3 },
  { key: 'manufacturing_operation_2', dataType: 'dropdown', required: false, readOnly: false, displayOrder: 4, dropdownSource: 'ManufacturingOperations' },
  { key: 'operation_yield_2', dataType: 'number', required: false, readOnly: false, displayOrder: 5 },
  { key: 'intermediate_code_p2', dataType: 'text', required: false, readOnly: true, auto: true, displayOrder: 6 },
  { key: 'manufacturing_operation_3', dataType: 'dropdown', required: false, readOnly: false, displayOrder: 7, dropdownSource: 'ManufacturingOperations' },
  { key: 'operation_yield_3', dataType: 'number', required: false, readOnly: false, displayOrder: 8 },
  { key: 'intermediate_code_p3', dataType: 'text', required: false, readOnly: true, auto: true, displayOrder: 9 },
  { key: 'manufacturing_operation_4', dataType: 'dropdown', required: false, readOnly: false, displayOrder: 10, dropdownSource: 'ManufacturingOperations' },
  { key: 'operation_yield_4', dataType: 'number', required: false, readOnly: false, displayOrder: 11 },
  { key: 'intermediate_code_p4', dataType: 'text', required: false, readOnly: true, auto: true, displayOrder: 12 },
  { key: 'line', dataType: 'dropdown', required: true, readOnly: false, displayOrder: 13, dropdownSource: 'Lines' },
  { key: 'dieset', dataType: 'text', required: false, readOnly: true, auto: true, displayOrder: 14 },
  { key: 'yield_line', dataType: 'number', required: true, readOnly: false, displayOrder: 15 },
  { key: 'staffing', dataType: 'text', required: false, readOnly: false, displayOrder: 16 },
  { key: 'rate', dataType: 'number', required: true, readOnly: false, displayOrder: 17 },
  { key: 'intermediate_code_final', dataType: 'text', required: false, readOnly: true, auto: true, displayOrder: 18 },
  // R4.2: a surviving non-legacy, non-hidden editable column (the audit hides
  // dieset/staffing/closed_production; this keeps the grid write-path testable).
  { key: 'equipment_notes', dataType: 'text', required: false, readOnly: false, displayOrder: 19 },
];

const ROWS: ProdDetailRow[] = [
  {
    id: 'row-1',
    componentIndex: 1,
    intermediateCode: 'PR1939H',
    componentLabel: 'Bacon block',
    componentWeight: 200,
    v06Status: 'pass',
    values: {
      manufacturing_operation_1: 'Slice',
      operation_yield_1: 95,
      intermediate_code_p1: 'PR1939H-SL',
      manufacturing_operation_2: 'MAP',
      operation_yield_2: 99,
      intermediate_code_p2: 'PR1939H-MP',
      manufacturing_operation_3: '',
      operation_yield_3: null,
      intermediate_code_p3: '',
      manufacturing_operation_4: '',
      operation_yield_4: null,
      intermediate_code_p4: '',
      line: 'L2',
      dieset: 'DS-L2',
      yield_line: 92,
      staffing: '3 op',
      rate: 1100,
      intermediate_code_final: 'PR1939H-MP',
      equipment_notes: 'note A',
    },
  },
];

const DROPDOWNS: Record<string, string[]> = {
  ManufacturingOperations: ['Slice', 'MAP', 'Cook', 'Pack'],
  Lines: ['L1', 'L2', 'L3'],
};

function renderReady(overrides?: Partial<React.ComponentProps<typeof FaProductionTab>>) {
  return render(
    <FaProductionTab
      productCode="FA-1001"
      packSizeFilled
      columns={COLUMNS}
      rows={ROWS}
      dropdowns={DROPDOWNS}
      labels={LABELS}
      state="ready"
      {...overrides}
    />,
  );
}

beforeEach(() => {
  updateFaCellMock.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('FaProductionTab — AC1 prototype parity (fa-screens.jsx:571-653)', () => {
  it('renders the Production detail card heading with the component count', () => {
    renderReady();
    expect(screen.getByRole('heading', { name: /Production detail/i })).toBeInTheDocument();
    expect(screen.getByText('1 component(s)')).toBeInTheDocument();
  });

  it('renders one block per ProdDetail component with the intermediate code + V06 badge (multi)', () => {
    // R4.7: the per-component chrome (intermediate code header + V06 badge + remove)
    // is a MULTI-component affordance now — the single/implicit case renders flat
    // (covered by the process-first tests below).
    renderReady({
      rows: [ROWS[0], { ...ROWS[0], id: 'row-2', componentIndex: 2, intermediateCode: 'PR2045A' }],
    });
    expect(screen.getByText('PR1939H')).toBeInTheDocument();
    expect(screen.getAllByText(LABELS.v06Pass).length).toBeGreaterThan(0);
  });

  it('renders the surviving schema-driven columns (legacy + R4.2-audit noise filtered)', () => {
    renderReady();
    // W5 hides line/rate/resource_requirement; S5b removes the fixed
    // manufacturing_operation_N / operation_yield_N / intermediate_code_* /
    // yield_line slots; R4.2 (audit §1) additionally hides dieset + staffing +
    // closed_production (they duplicate the per-process line/consumption model).
    // Only a genuine non-legacy editable column (equipment_notes) survives.
    expect(screen.getAllByText(LABELS.fields.equipment_notes, { exact: false }).length).toBeGreaterThan(0);
    // W5 + R4.2 hidden columns must NOT appear as field labels.
    expect(screen.queryByText(LABELS.fields.line, { exact: true })).toBeNull();
    expect(screen.queryByText(LABELS.fields.rate, { exact: true })).toBeNull();
    expect(screen.queryByText(LABELS.fields.dieset, { exact: true })).toBeNull();
    expect(screen.queryByText(LABELS.fields.staffing, { exact: true })).toBeNull();
  });

  it('uses shadcn primitives (Input wrappers, no raw <select>)', () => {
    const { container } = renderReady();
    // The surviving editable column (equipment_notes) uses a shadcn Input.
    expect(container.querySelector('[data-slot="input"]')).toBeTruthy();
    // Raw <select> is still a red line anywhere in the tab.
    expect(container.querySelector('select')).toBeNull();
  });

  it('no longer renders the R4.2-hidden dieset field (audit §1)', () => {
    renderReady();
    // dieset (equipment_setup) is audit-hidden — it must not render at all.
    expect(screen.queryByLabelText(LABELS.fields.dieset, { exact: false })).toBeNull();
    expect(screen.queryByText(LABELS.fields.dieset, { exact: true })).toBeNull();
  });

  it('no longer renders the filtered intermediate_code_* auto columns', () => {
    renderReady();
    expect(screen.queryByLabelText(LABELS.fields.intermediate_code_p1, { exact: false })).toBeNull();
    expect(screen.queryByLabelText(LABELS.fields.intermediate_code_final, { exact: false })).toBeNull();
  });
});

describe('FaProductionTab — multi-component aggregate row', () => {
  const ROWS2: ProdDetailRow[] = [
    ROWS[0],
    {
      id: 'row-2',
      componentIndex: 2,
      intermediateCode: 'PR2045A',
      componentLabel: 'Cheese layer',
      componentWeight: 50,
      v06Status: 'warn',
      values: { ...ROWS[0].values, line: 'L3', dieset: 'DS-L3', intermediate_code_final: 'PR2045A-MP' },
    },
  ];

  it('shows the aggregate read-only summary row when N>1', () => {
    renderReady({ rows: ROWS2 });
    expect(screen.getByText(LABELS.aggregateTitle, { exact: false })).toBeInTheDocument();
    expect(screen.getByText('2 component(s)')).toBeInTheDocument();
    // a V06 warn badge appears for the second component
    expect(screen.getByText(LABELS.v06Warn)).toBeInTheDocument();
  });

  it('hides the aggregate row for a single component', () => {
    renderReady();
    expect(screen.queryByText(LABELS.aggregateTitle, { exact: false })).not.toBeInTheDocument();
  });
});

describe('FaProductionTab — AC3 editable cell write path', () => {
  it('Save calls updateFaCell for the surviving editable column when it changes', async () => {
    // R4.2 hides line/rate/dieset/staffing; 'equipment_notes' is the surviving
    // editable non-auto column. Changing it and Saving calls updateFaCell with
    // only the dirty column(s).
    const user = userEvent.setup();
    renderReady();
    const notesInput = screen.getByLabelText(LABELS.fields.equipment_notes, { exact: false });
    await user.clear(notesInput);
    await user.type(notesInput, 'note B');
    await user.click(screen.getByRole('button', { name: LABELS.save }));

    expect(updateFaCellMock).toHaveBeenCalledWith(
      'FA-1001',
      'equipment_notes',
      'note B',
      expect.objectContaining({ componentIndex: 1 }),
    );
  });
});

describe('FaProductionTab — read-only red line', () => {
  it('only submits the surviving editable column, never the hidden/auto ones', async () => {
    // Change the surviving editable column; verify the Save action writes it and
    // never the audit-hidden dieset/staffing columns.
    const user = userEvent.setup();
    renderReady();
    const notesInput = screen.getByLabelText(LABELS.fields.equipment_notes, { exact: false });
    await user.clear(notesInput);
    await user.type(notesInput, 'note C');
    await user.click(screen.getByRole('button', { name: LABELS.save }));

    const calledColumns = updateFaCellMock.mock.calls.map((c) => c[1]);
    expect(calledColumns).toContain('equipment_notes');
    expect(calledColumns).not.toContain('dieset');
    expect(calledColumns).not.toContain('staffing');
  });

  it('does not call updateFaCell for unchanged fields', async () => {
    const user = userEvent.setup();
    renderReady();
    await user.click(screen.getByRole('button', { name: LABELS.save }));
    expect(updateFaCellMock).not.toHaveBeenCalled();
  });
});

describe('FaProductionTab — locked gate (Pack_Size missing)', () => {
  it('shows the locked alert and disables every editable control', () => {
    // W5 removed 'rate' from the grid; 'staffing' is the surviving editable column.
    renderReady({ packSizeFilled: false });
    expect(screen.getByText(LABELS.lockedBody, { exact: false })).toBeInTheDocument();
    const notesInput = screen.getByLabelText(LABELS.fields.equipment_notes, { exact: false });
    expect(notesInput).toBeDisabled();
  });
});

describe('FaProductionTab — required UI states', () => {
  it('loading state', () => {
    renderReady({ state: 'loading' });
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
  });

  it('empty state (no ProdDetail components) opens the flat process-first section', () => {
    // R4.7: zero prod_detail components no longer shows the component-first empty
    // card — the Processes section opens the tab directly (implicit-anchor flow).
    renderReady({ state: 'empty', rows: [] });
    expect(screen.getByTestId('fa-production-flat')).toBeInTheDocument();
    expect(screen.queryByTestId('fa-production-empty')).not.toBeInTheDocument();
  });

  it('error state', () => {
    renderReady({ state: 'error' });
    expect(screen.getByText(LABELS.error)).toBeInTheDocument();
  });

  it('permission_denied state', () => {
    renderReady({ state: 'permission_denied' });
    expect(screen.getByText(LABELS.forbidden)).toBeInTheDocument();
  });
});

describe('FaProductionTab — i18n', () => {
  it('renders only label VALUES from props (no inline English literals leak)', () => {
    renderReady({ labels: { ...LABELS, save: 'Zapisz produkcję' } });
    expect(screen.getByRole('button', { name: 'Zapisz produkcję' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Production' })).not.toBeInTheDocument();
  });
});

// Lane-B: "+ Add production component" affordance backed by a REAL item picker.
const ADD_LABELS: FaProductionTabLabels = {
  ...LABELS,
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
};

describe('FaProductionTab — Lane-B add/remove component (real item picker)', () => {
  it('hides the add affordance when the user cannot write Production', () => {
    renderReady({ labels: ADD_LABELS, canWrite: false });
    expect(screen.queryByTestId('item-picker-trigger')).not.toBeInTheDocument();
  });

  it('opens the item picker and adds the chosen real item as a component', async () => {
    const user = userEvent.setup();
    const onSearchItems = vi.fn(async () => [
      { id: 'item-1', itemCode: 'PR8801', name: 'Prosciutto', itemType: 'intermediate', status: 'active', costPerKgEur: '28.00', uomBase: 'kg' },
    ]);
    const onAddComponent = vi.fn(async () => ({ id: 'pd-1', intermediateCode: 'PR8801', componentIndex: 2, itemId: 'item-1' }));
    const onMutated = vi.fn();

    renderReady({
      labels: ADD_LABELS,
      canWrite: true,
      onSearchItems,
      onAddComponent,
      onMutated,
    });

    await user.click(screen.getByTestId('item-picker-trigger'));
    // The picker debounces the search; the option appears once the REAL items
    // master query (org-scoped search action) resolves.
    const option = await screen.findByTestId('item-picker-option');
    expect(onSearchItems).toHaveBeenCalled();
    expect(option).toHaveTextContent('PR8801');
    await user.click(option);

    expect(onAddComponent).toHaveBeenCalledWith({ productCode: 'FA-1001', itemId: 'item-1' });
    expect(onMutated).toHaveBeenCalled();
  });

  it('opens the process-first hero in the empty state and removes a component when permitted (multi)', async () => {
    const user = userEvent.setup();
    const onRemoveComponent = vi.fn(async () => ({ removed: true }));
    const onMutated = vi.fn();

    // Zero-component state: the Processes section + "+ Add process" open the tab
    // directly; the demoted component picker sits below as "Advanced: components".
    const { unmount } = renderReady({ labels: ADD_LABELS, canWrite: true, state: 'empty', rows: [] });
    expect(screen.getByTestId('fa-production-flat')).toBeInTheDocument();
    expect(screen.getByTestId('fa-prod-add-process')).toBeInTheDocument();
    expect(screen.getByTestId('item-picker-trigger')).toBeInTheDocument();
    unmount();

    // Remove is a MULTI-component affordance (per-component chrome).
    renderReady({
      labels: ADD_LABELS,
      canWrite: true,
      onRemoveComponent,
      onMutated,
      rows: [ROWS[0], { ...ROWS[0], id: 'row-2', componentIndex: 2, intermediateCode: 'PR2045A' }],
    });
    const removeBtn = screen.getAllByTestId('fa-prod-remove')[0];
    await user.click(removeBtn);
    expect(onRemoveComponent).toHaveBeenCalledWith({ productCode: 'FA-1001', prodDetailId: 'row-1' });
    expect(onMutated).toHaveBeenCalled();
  });

  it('demotes the component picker to a secondary "Advanced" affordance with canWrite=true && !locked', () => {
    // R4.7: process-first — "+ Add process" is the primary affordance; the real
    // item picker survives but is demoted below the Processes section.
    renderReady({ labels: ADD_LABELS, canWrite: true, packSizeFilled: true, state: 'empty', rows: [] });
    expect(screen.getByTestId('fa-prod-add-process')).toBeInTheDocument();
    expect(screen.getByTestId('fa-prod-advanced-components')).toBeInTheDocument();
    expect(screen.getByTestId('item-picker-trigger')).toBeInTheDocument();
  });
});

// Live-only regression: the deployed bug was a MISSING locale key (the raw key
// `npd.faProductionTab.emptyCtaBody` rendered) — not a component bug. Assert the
// real locale JSON files carry the full faProductionTab add/picker vocabulary as
// real strings (never the bare key, never the fully-qualified path) for ALL four
// supported locales.
describe('FaProductionTab — locale completeness (live Gate-5 regression)', () => {
  const SCALAR_KEYS = ['addComponent', 'emptyCtaBody', 'removeComponent', 'removeError'] as const;
  const PICKER_KEYS = ['searchLabel', 'searchPlaceholder', 'loading', 'empty', 'cancel', 'error'] as const;
  const LOCALES = ['en', 'pl', 'ro', 'uk'] as const;

  const trees: Record<string, Record<string, unknown>> = {
    en: require('../../../../../../../../i18n/en.json'),
    pl: require('../../../../../../../../i18n/pl.json'),
    ro: require('../../../../../../../../i18n/ro.json'),
    uk: require('../../../../../../../../i18n/uk.json'),
  };

  function prodTab(locale: string): Record<string, unknown> {
    const npd = (trees[locale] as { npd?: Record<string, unknown> }).npd ?? {};
    return (npd as { faProductionTab?: Record<string, unknown> }).faProductionTab ?? {};
  }

  function isRealString(value: unknown, key: string): boolean {
    return (
      typeof value === 'string' &&
      value.trim() !== '' &&
      value !== key &&
      value !== `npd.faProductionTab.${key}` &&
      value !== `npd.faProductionTab.picker.${key}`
    );
  }

  it.each(LOCALES)('%s carries every add/picker key as a real string', (locale) => {
    const p = prodTab(locale);
    for (const key of SCALAR_KEYS) {
      expect(isRealString(p[key], key), `${locale}.${key}`).toBe(true);
    }
    const picker = (p.picker ?? {}) as Record<string, unknown>;
    for (const key of PICKER_KEYS) {
      expect(isRealString(picker[key], key), `${locale}.picker.${key}`).toBe(true);
    }
  });
});

// ===========================================================================
// NPD v2 S5b (owner D6/D9) — dynamic per-component PROCESS LIST. The legacy
// fixed 4 manufacturing_operation_N / operation_yield_N / intermediate_code_*
// columns are filtered OUT of the grid; each component instead carries an
// unlimited, Settings-driven process list (operationName + roles + duration +
// cost + a createsWipItem tick), backed by getComponentProcesses + the
// addWipProcess / updateWipProcess / removeWipProcess / saveWipProcessRoles
// CRUD (mocked here as action-prop seams).
// ===========================================================================

const S5B_LABELS: FaProductionTabLabels = {
  ...LABELS,
  picker: ADD_LABELS.picker,
  addComponent: ADD_LABELS.addComponent,
  emptyCtaBody: ADD_LABELS.emptyCtaBody,
  removeComponent: ADD_LABELS.removeComponent,
  removeError: ADD_LABELS.removeError,
  processes: PROCESS_LABELS(),
};

function renderS5b(overrides?: Partial<React.ComponentProps<typeof FaProductionTab>>) {
  return render(
    <FaProductionTab
      productCode="FA-1001"
      packSizeFilled
      columns={COLUMNS}
      rows={ROWS}
      dropdowns={DROPDOWNS}
      labels={S5B_LABELS}
      state="ready"
      canWrite
      componentProcesses={COMPONENT_PROCESSES}
      operationOptions={OPERATION_OPTIONS}
      {...overrides}
    />,
  );
}

describe('FaProductionTab — S5b legacy process columns are filtered out', () => {
  it('does NOT render the fixed manufacturing_operation_N / operation_yield_N / intermediate_code_* columns', () => {
    renderS5b();
    // Legacy fixed-slot field labels must NOT appear anywhere.
    for (const legacyKey of [
      'manufacturing_operation_1',
      'manufacturing_operation_2',
      'manufacturing_operation_3',
      'manufacturing_operation_4',
      'operation_yield_1',
      'intermediate_code_p1',
      'intermediate_code_final',
    ]) {
      expect(screen.queryByText(S5B_LABELS.fields[legacyKey])).not.toBeInTheDocument();
    }
    // No data-field cell for the filtered keys is rendered.
    expect(document.querySelector('[data-field="manufacturing_operation_1"]')).toBeNull();
    expect(document.querySelector('[data-field="intermediate_code_final"]')).toBeNull();
  });

  it('keeps only the non-legacy non-hidden column; hides dieset/staffing/line/rate', () => {
    // R4.2 (audit §1) hides dieset + staffing (they duplicate the per-process
    // line/consumption model); W5 hides line + rate. Only equipment_notes
    // survives the combined filter.
    renderS5b();
    expect(screen.getAllByText(S5B_LABELS.fields.equipment_notes, { exact: false }).length).toBeGreaterThan(0);
    // Assert the GRID cells for the hidden columns are gone (the per-process card
    // has its own "Line" label, so match on the grid's data-field, not text).
    for (const hidden of ['line', 'rate', 'dieset', 'equipment_setup', 'staffing', 'closed_production']) {
      expect(document.querySelector(`[data-field="${hidden}"]`)).toBeNull();
    }
    expect(document.querySelector('[data-field="equipment_notes"]')).not.toBeNull();
  });

  it('filters yield_line (legacy ^yield_line$) out of the grid', () => {
    renderS5b();
    expect(screen.queryByText(S5B_LABELS.fields.yield_line)).not.toBeInTheDocument();
    expect(document.querySelector('[data-field="yield_line"]')).toBeNull();
  });
});

describe('FaProductionTab — S5b per-component process list', () => {
  it('renders the Processes section with the injected process rows + roles + cost', () => {
    renderS5b();
    const section = screen.getByTestId('fa-prod-processes-row-1');
    expect(within(section).getByText('Mince')).toBeInTheDocument();
    // Roles render as chips: roleGroup ×headcount
    expect(within(section).getByText(/Operator/)).toBeInTheDocument();
    expect(within(section).getByText(/Supervisor/)).toBeInTheDocument();
    // The computed process cost is shown.
    expect(within(section).getByTestId('fa-prod-process-cost-wp-1')).toHaveTextContent('117');
  });

  it('renders loaded yieldPct in the process row (not a hardcoded 100 default)', () => {
    renderS5b();
    const row = screen.getByTestId('fa-prod-process-wp-1');
    expect(row).toHaveTextContent('95.00');
    expect(row).not.toHaveTextContent('100.00');
  });

  it('shows the per-component process subtotal (Σ processCost)', () => {
    renderS5b();
    const subtotal = screen.getByTestId('fa-prod-process-subtotal-row-1');
    expect(subtotal).toHaveTextContent('117');
  });

  it('renders an empty-state when a component has no processes', () => {
    renderS5b({ componentProcesses: { 'row-1': [] } });
    const section = screen.getByTestId('fa-prod-processes-row-1');
    expect(within(section).getByText(S5B_LABELS.processes.empty)).toBeInTheDocument();
  });

  it('"+ Add process" → pick an operation → calls getProcessDefault then addWipProcess then saveWipProcessRoles', async () => {
    const user = userEvent.setup();
    const onGetProcessDefault = vi.fn(async () => ({
      ok: true as const,
      data: {
        operationId: 'op-cook',
        operationName: 'Cook',
        standardCost: 7.5,
        defaultDurationHours: 1.5,
        throughputPerHour: 120,
        throughputUom: 'pack',
        setupCost: 42,
        yieldPct: 95,
        roles: [{ roleGroup: 'Operator', defaultHeadcount: 2 }],
      },
    }));
    const onAddProcess = vi.fn(async () => ({ ok: true as const, id: 'wp-new' }));
    const onSaveProcessRoles = vi.fn(async () => ({ ok: true as const, saved: 1 }));
    const onMutated = vi.fn();

    renderS5b({ onGetProcessDefault, onAddProcess, onSaveProcessRoles, onMutated });

    const section = screen.getByTestId('fa-prod-processes-row-1');
    await user.click(within(section).getByTestId('fa-prod-add-process'));
    // Operation picker opens; choose "Cook".
    const option = await screen.findByTestId('process-option-op-cook');
    await user.click(option);

    expect(onGetProcessDefault).toHaveBeenCalledWith('op-cook');
    expect(onAddProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        prodDetailId: 'row-1',
        processName: 'Cook',
        durationHours: 1.5,
        additionalCost: 7.5,
        throughputPerHour: 120,
        throughputUom: 'pack',
        setupCost: 42,
        yieldPct: 95,
        createsWipItem: false,
      }),
    );
    expect(onSaveProcessRoles).toHaveBeenCalledWith(
      expect.objectContaining({
        processId: 'wp-new',
        roles: [expect.objectContaining({ roleGroup: 'Operator', headcount: 2 })],
      }),
    );
    expect(onMutated).toHaveBeenCalled();
  });

  it('Remove process → calls removeWipProcess with the process id', async () => {
    const user = userEvent.setup();
    const onRemoveProcess = vi.fn(async () => ({ ok: true as const, removed: true }));
    const onMutated = vi.fn();
    renderS5b({ onRemoveProcess, onMutated });

    const section = screen.getByTestId('fa-prod-processes-row-1');
    await user.click(within(section).getByTestId('fa-prod-remove-process-wp-1'));

    expect(onRemoveProcess).toHaveBeenCalledWith({ id: 'wp-1' });
    expect(onMutated).toHaveBeenCalled();
  });

  it('Edit → toggle createsWip + change duration → Save calls updateWipProcess', async () => {
    const user = userEvent.setup();
    const onUpdateProcess = vi.fn(async () => ({ ok: true as const, updated: true }));
    const onMutated = vi.fn();
    renderS5b({ onUpdateProcess, onMutated });

    const section = screen.getByTestId('fa-prod-processes-row-1');
    await user.click(within(section).getByTestId('fa-prod-edit-process-wp-1'));

    // Edit dialog opens with duration / additionalCost / createsWip controls.
    const dialog = await screen.findByTestId('fa-prod-process-editor');
    const duration = within(dialog).getByTestId('fa-prod-process-duration');
    await user.clear(duration);
    await user.type(duration, '4');
    await user.click(within(dialog).getByTestId('fa-prod-process-creates-wip'));
    await user.click(within(dialog).getByTestId('fa-prod-process-save'));

    expect(onUpdateProcess).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'wp-1', durationHours: 4, createsWipItem: true }),
    );
    expect(onMutated).toHaveBeenCalled();
  });

  it('hides the process editing affordances when the user cannot write Production', () => {
    renderS5b({ canWrite: false });
    const section = screen.getByTestId('fa-prod-processes-row-1');
    expect(within(section).queryByTestId('fa-prod-add-process')).not.toBeInTheDocument();
    expect(within(section).queryByTestId('fa-prod-remove-process-wp-1')).not.toBeInTheDocument();
    // The process row + its cost are still READ-visible.
    expect(within(section).getByText('Mince')).toBeInTheDocument();
    expect(within(section).getByTestId('fa-prod-process-cost-wp-1')).toBeInTheDocument();
  });

  it('disables the add-process affordance when the Pack_Size gate locks the tab', () => {
    renderS5b({ packSizeFilled: false });
    const section = screen.getByTestId('fa-prod-processes-row-1');
    const addBtn = within(section).queryByTestId('fa-prod-add-process');
    // Either hidden or disabled — never an active write affordance while locked.
    if (addBtn) expect(addBtn).toBeDisabled();
  });
});

// ===========================================================================
// R4.7 (owner correction) — PROCESS-FIRST layout. The tab opens directly on the
// Processes section (no mandatory component step). Zero components → "+ Add
// process" is shown immediately and the first pick creates the anchor implicitly;
// single/implicit component → flat (no per-component chrome); multi → keep groups.
// ===========================================================================

describe('FaProductionTab — R4.7 process-first layout', () => {
  const row2: ProdDetailRow = { ...ROWS[0], id: 'row-2', componentIndex: 2, intermediateCode: 'PR2045A' };

  it('zero-component: "+ Add process" is shown immediately and the first pick auto-creates the anchor', async () => {
    const user = userEvent.setup();
    const onEnsureAnchor = vi.fn(async () => ({
      id: 'pd-anchor',
      intermediateCode: 'FA-1001',
      componentIndex: 1,
    }));
    const onGetProcessDefault = vi.fn(async () => ({
      ok: true as const,
      data: {
        operationId: 'op-cook',
        operationName: 'Cook',
        standardCost: 7.5,
        defaultDurationHours: 1.5,
        roles: [],
      },
    }));
    const onAddProcess = vi.fn(async () => ({ ok: true as const, id: 'wp-new' }));
    const onMutated = vi.fn();

    renderReady({
      labels: S5B_LABELS,
      canWrite: true,
      rows: [],
      operationOptions: OPERATION_OPTIONS,
      onEnsureAnchor,
      onGetProcessDefault,
      onAddProcess,
      onMutated,
    });

    // Process-first: the flat section + "+ Add process" render with ZERO components.
    expect(screen.getByTestId('fa-production-flat')).toBeInTheDocument();
    await user.click(screen.getByTestId('fa-prod-add-process'));
    await user.click(await screen.findByTestId('process-option-op-cook'));

    // The anchor is created implicitly (no component-picking step), then the
    // process is added against the freshly-minted prod_detail id.
    expect(onEnsureAnchor).toHaveBeenCalledWith({ productCode: 'FA-1001' });
    expect(onAddProcess).toHaveBeenCalledWith(
      expect.objectContaining({ prodDetailId: 'pd-anchor', processName: 'Cook' }),
    );
    expect(onMutated).toHaveBeenCalled();
  });

  it('single-component renders flat (no per-component chrome)', () => {
    renderReady({ labels: S5B_LABELS, canWrite: true });
    // The Processes section opens the tab…
    expect(screen.getByTestId('fa-prod-processes-row-1')).toBeInTheDocument();
    // …but the component wrapper chrome (PR-code header + remove) is gone.
    expect(screen.queryByTestId('fa-prod-component')).not.toBeInTheDocument();
    expect(screen.queryByTestId('fa-prod-remove')).not.toBeInTheDocument();
  });

  it('multi-component keeps per-component process groups', () => {
    renderReady({ labels: S5B_LABELS, canWrite: true, rows: [ROWS[0], row2] });
    expect(screen.getAllByTestId('fa-prod-component')).toHaveLength(2);
    expect(screen.getByTestId('fa-prod-processes-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('fa-prod-processes-row-2')).toBeInTheDocument();
    // The demoted component picker still exists, below the groups.
    expect(screen.getByTestId('fa-prod-advanced-components')).toBeInTheDocument();
  });
});

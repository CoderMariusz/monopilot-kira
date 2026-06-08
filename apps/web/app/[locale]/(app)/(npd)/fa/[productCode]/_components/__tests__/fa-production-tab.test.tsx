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
 *     (select), Dieset/equipment_setup (auto read-only GREEN), Yield Line *
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
 *    yields + auto PR codes, line + equipment_setup + yield_line + staffing +
 *    rate + final code, V06 badge, aggregate row, action row), shadcn
 *    Input/Select primitives, auto cols read-only GREEN.
 *  - AC2 chain2 (manufacturing_operation_1): editing op1 + Save calls updateFaCell
 *    with the manufacturing_operation_1 column → server fires chain2.
 *  - AC3 chain1 (line): changing line + Save calls updateFaCell with the line
 *    column → server fires chain1 (equipment_setup autofilled).
 *  - read-only red line: intermediate_code_* / equipment_setup are NOT editable
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
}));

import {
  FaProductionTab,
  type FaProductionTabLabels,
  type FaProductionColumn,
  type ProdDetailRow,
} from '../fa-production-tab';

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
    equipment_setup: 'Dieset (auto)',
    yield_line: 'Yield Line %',
    resource_requirement: 'Staffing',
    rate: 'Rate',
    intermediate_code_final: 'PR Code Final (auto)',
  },
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
  { key: 'equipment_setup', dataType: 'text', required: false, readOnly: true, auto: true, displayOrder: 14 },
  { key: 'yield_line', dataType: 'number', required: true, readOnly: false, displayOrder: 15 },
  { key: 'resource_requirement', dataType: 'text', required: false, readOnly: false, displayOrder: 16 },
  { key: 'rate', dataType: 'number', required: true, readOnly: false, displayOrder: 17 },
  { key: 'intermediate_code_final', dataType: 'text', required: false, readOnly: true, auto: true, displayOrder: 18 },
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
      equipment_setup: 'DS-L2',
      yield_line: 92,
      resource_requirement: '3 op',
      rate: 1100,
      intermediate_code_final: 'PR1939H-MP',
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

  it('renders one block per ProdDetail component with the intermediate code + V06 badge', () => {
    renderReady();
    expect(screen.getByText('PR1939H')).toBeInTheDocument();
    expect(screen.getByText(LABELS.v06Pass)).toBeInTheDocument();
  });

  it('renders schema-driven Process/Yield/auto-PR columns in display order', () => {
    renderReady();
    for (const col of COLUMNS) {
      const label = LABELS.fields[col.key];
      expect(screen.getAllByText(label, { exact: false }).length).toBeGreaterThan(0);
    }
    const html = document.body.innerHTML;
    expect(html.indexOf(LABELS.fields.manufacturing_operation_1)).toBeLessThan(
      html.indexOf(LABELS.fields.manufacturing_operation_2),
    );
    expect(html.indexOf(LABELS.fields.line)).toBeLessThan(
      html.indexOf(LABELS.fields.intermediate_code_final),
    );
  });

  it('uses shadcn primitives (Input/Select wrappers, no raw <select>)', () => {
    const { container } = renderReady();
    expect(container.querySelector('[data-slot="input"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="select"]')).toBeTruthy();
    expect(container.querySelector('select')).toBeNull();
  });

  it('renders intermediate_code_p1 (auto) as read-only with green styling', () => {
    renderReady();
    const input = screen.getByLabelText(LABELS.fields.intermediate_code_p1, {
      exact: false,
    }) as HTMLInputElement;
    expect(input).toHaveAttribute('readonly');
    expect(input.className).toMatch(/green/);
  });

  it('renders equipment_setup (dieset auto) and intermediate_code_final read-only green', () => {
    renderReady();
    const dieset = screen.getByLabelText(LABELS.fields.equipment_setup, { exact: false }) as HTMLInputElement;
    const finalCode = screen.getByLabelText(LABELS.fields.intermediate_code_final, { exact: false }) as HTMLInputElement;
    expect(dieset).toHaveAttribute('readonly');
    expect(dieset.className).toMatch(/green/);
    expect(finalCode).toHaveAttribute('readonly');
    expect(finalCode.className).toMatch(/green/);
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
      values: { ...ROWS[0].values, line: 'L3', equipment_setup: 'DS-L3', intermediate_code_final: 'PR2045A-MP' },
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

describe('FaProductionTab — AC2 chain2 (manufacturing_operation_1 → intermediate_code_p1)', () => {
  it('Save calls updateFaCell for manufacturing_operation_1 when it is changed', async () => {
    const user = userEvent.setup();
    renderReady();
    // Open the op1 Select and pick a new value via its options.
    const option = within(screen.getAllByTestId('fa-prod-component')[0]).getAllByRole('option', {
      name: 'Cook',
    })[0];
    await user.click(option);
    await user.click(screen.getByRole('button', { name: LABELS.save }));

    expect(updateFaCellMock).toHaveBeenCalledWith(
      'FA-1001',
      'manufacturing_operation_1',
      'Cook',
      expect.objectContaining({ componentIndex: 1 }),
    );
  });
});

describe('FaProductionTab — AC3 chain1 (line → equipment_setup autofilled)', () => {
  it('Save calls updateFaCell for line when it is changed', async () => {
    const user = userEvent.setup();
    renderReady();
    const option = within(screen.getAllByTestId('fa-prod-component')[0]).getAllByRole('option', {
      name: 'L3',
    })[0];
    await user.click(option);
    await user.click(screen.getByRole('button', { name: LABELS.save }));

    expect(updateFaCellMock).toHaveBeenCalledWith(
      'FA-1001',
      'line',
      'L3',
      expect.objectContaining({ componentIndex: 1 }),
    );
  });
});

describe('FaProductionTab — read-only red line', () => {
  it('never submits intermediate_code_* or equipment_setup even when editable fields change', async () => {
    const user = userEvent.setup();
    renderReady();
    const yieldInput = screen.getByLabelText(LABELS.fields.operation_yield_1, { exact: false });
    await user.clear(yieldInput);
    await user.type(yieldInput, '88');
    await user.click(screen.getByRole('button', { name: LABELS.save }));

    const calledColumns = updateFaCellMock.mock.calls.map((c) => c[1]);
    expect(calledColumns).not.toContain('intermediate_code_p1');
    expect(calledColumns).not.toContain('intermediate_code_final');
    expect(calledColumns).not.toContain('equipment_setup');
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
    renderReady({ packSizeFilled: false });
    expect(screen.getByText(LABELS.lockedBody, { exact: false })).toBeInTheDocument();
    const yieldInput = screen.getByLabelText(LABELS.fields.operation_yield_1, { exact: false });
    expect(yieldInput).toBeDisabled();
  });
});

describe('FaProductionTab — required UI states', () => {
  it('loading state', () => {
    renderReady({ state: 'loading' });
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
  });

  it('empty state (no ProdDetail components)', () => {
    renderReady({ state: 'empty', rows: [] });
    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
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

  it('shows the add CTA in the empty state and removes a component when permitted', async () => {
    const user = userEvent.setup();
    const onRemoveComponent = vi.fn(async () => ({ removed: true }));
    const onMutated = vi.fn();

    // Empty state CTA renders the picker trigger.
    const { unmount } = renderReady({ labels: ADD_LABELS, canWrite: true, state: 'empty', rows: [] });
    expect(screen.getByTestId('fa-production-empty')).toBeInTheDocument();
    expect(screen.getByTestId('item-picker-trigger')).toBeInTheDocument();
    unmount();

    // Remove button on a populated component.
    renderReady({ labels: ADD_LABELS, canWrite: true, onRemoveComponent, onMutated });
    const removeBtn = screen.getByTestId('fa-prod-remove');
    await user.click(removeBtn);
    expect(onRemoveComponent).toHaveBeenCalledWith({ productCode: 'FA-1001', prodDetailId: 'row-1' });
    expect(onMutated).toHaveBeenCalled();
  });

  it('renders the empty-state CTA body + add affordance with canWrite=true && !locked', () => {
    // The live Gate-5 bug: with the org admin (canWrite=true) on an unlocked FG
    // the "+ Add production component" affordance must render AND the empty CTA
    // body must be a REAL string (not the raw i18n key).
    renderReady({ labels: ADD_LABELS, canWrite: true, packSizeFilled: true, state: 'empty', rows: [] });
    expect(screen.getByTestId('item-picker-trigger')).toBeInTheDocument();
    const ctaBody = screen.getByText(ADD_LABELS.emptyCtaBody);
    expect(ctaBody).toBeInTheDocument();
    // Regression guard: the literal i18n key must never reach the DOM.
    expect(ctaBody.textContent).not.toMatch(/^npd\.faProductionTab\./);
    expect(screen.queryByText('npd.faProductionTab.emptyCtaBody')).not.toBeInTheDocument();
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

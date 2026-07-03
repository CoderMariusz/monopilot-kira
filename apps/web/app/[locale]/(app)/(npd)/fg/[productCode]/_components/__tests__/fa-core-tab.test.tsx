/**
 * @vitest-environment jsdom
 * T-023 RED — FaCoreTab (schema-driven Core dept form) parity + states + cascades.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:455-517 (fa_core_tab)
 *   — FACoreTab: "Core section" card, form-grid of fields (FA Code read-only,
 *     Product Name *, Pack Size * select, Number of cases, Finish Meat /
 *     Recipe components, RM Code/Ingredient codes auto read-only GREEN, Template
 *     select, Closed_Core select), Comments textarea, V05 required-missing alert,
 *     "Save Core" + "Close Core section" action row.
 *
 * Schema-driven (NO hardcoded field list): fields come from the `columns` prop
 * sourced server-side from Reference.DeptColumns (T-014 buildDeptZod runtime /
 * dept-column metadata). The component renders whatever Core columns the org has.
 *
 * Asserts:
 *  - AC1 parity: same regions (Core section card, schema-driven form fields in
 *    display order, auto read-only ingredient_codes with green styling, shadcn
 *    Input/Select/Textarea primitives, action row).
 *  - AC2 chain3 (Recipe_Components): editing recipe_components + Save calls
 *    updateFaCell with the recipe_components column → server fires chain3.
 *  - AC3 chain1 (pack_size): changing pack_size + Save calls updateFaCell with
 *    the pack_size column → server fires chain1 (line + dieset cleared).
 *  - read-only red line: ingredient_codes is NOT editable and is NEVER submitted.
 *  - the five required UI states (loading / empty / ready / error / permission_denied).
 *  - i18n: the component renders LABEL VALUES (props), never inline English literals.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// updateFaCell (T-009) is the ONLY write path; mock it at module level so the
// client test never touches a real Server Action / DB.
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

import {
  FaCoreTab,
  type FaCoreTabLabels,
  type FaCoreColumn,
} from '../fa-core-tab';

const LABELS: FaCoreTabLabels = {
  title: 'Core section',
  subtitle: 'Fill the Core section first — other departments unlock after Core is closed.',
  closedBadge: 'Closed',
  openBadge: 'Open',
  autoHint: 'Auto-derived — read-only.',
  requiredMissingTitle: 'Required fields missing',
  requiredMissingBody:
    'Product Name, Pack Size and Recipe components must all be filled before Close Core.',
  save: 'Save Core',
  saving: 'Saving…',
  saveSuccess: 'Core section saved.',
  saveError: 'Could not save the Core section.',
  selectPlaceholder: 'Select…',
  loading: 'Loading Core section…',
  empty: 'No Core fields configured',
  emptyBody: 'This organisation has no Core department columns yet.',
  error: 'Unable to load the Core section.',
  forbidden: 'You do not have permission to edit the Core section.',
  fields: {
    product_name: 'Product Name',
    pack_size: 'Pack Size',
    number_of_cases: 'Number of cases',
    recipe_components: 'Recipe components',
    ingredient_codes: 'Ingredient codes (auto)',
    template: 'Template',
    closed_core: 'Closed Core',
    product_code: 'FG Code',
  },
};

// Schema-driven Core columns (mirrors Reference.DeptColumns seed, in display order).
const COLUMNS: FaCoreColumn[] = [
  { key: 'product_code', dataType: 'text', required: false, readOnly: true, displayOrder: 1 },
  { key: 'product_name', dataType: 'text', required: true, readOnly: false, displayOrder: 2 },
  {
    key: 'pack_size',
    dataType: 'dropdown',
    required: true,
    readOnly: false,
    displayOrder: 3,
    dropdownSource: 'PackSizes',
  },
  { key: 'number_of_cases', dataType: 'number', required: true, readOnly: false, displayOrder: 4 },
  { key: 'recipe_components', dataType: 'text', required: true, readOnly: false, displayOrder: 5 },
  {
    key: 'ingredient_codes',
    dataType: 'text',
    required: false,
    readOnly: true,
    auto: true,
    displayOrder: 6,
  },
  {
    key: 'template',
    dataType: 'dropdown',
    required: false,
    readOnly: false,
    displayOrder: 7,
    dropdownSource: 'Templates',
  },
  {
    key: 'closed_core',
    dataType: 'dropdown',
    required: false,
    readOnly: false,
    displayOrder: 8,
    dropdownSource: 'CloseConfirm',
  },
];

const VALUES: Record<string, unknown> = {
  product_code: 'FA-1001',
  product_name: 'Smoked Bacon 200g',
  pack_size: '200g',
  number_of_cases: 12,
  recipe_components: 'PR1939H, PR2045A',
  ingredient_codes: 'RM-001, RM-002',
  template: 'Standard',
  closed_core: 'No',
};

const DROPDOWNS: Record<string, string[]> = {
  PackSizes: ['200g', '400g', '1kg'],
  Templates: ['Standard', 'Premium'],
  CloseConfirm: ['No', 'Yes'],
};

function renderReady(overrides?: Partial<React.ComponentProps<typeof FaCoreTab>>) {
  return render(
    <FaCoreTab
      productCode="FA-1001"
      columns={COLUMNS}
      values={VALUES}
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

describe('FaCoreTab — AC1 prototype parity (fa-screens.jsx:455-517)', () => {
  it('renders the Core section card heading + open/closed badge', () => {
    renderReady();
    expect(screen.getByRole('heading', { name: LABELS.title })).toBeInTheDocument();
    // closed_core value 'No' → Open badge
    expect(screen.getByText(LABELS.openBadge)).toBeInTheDocument();
  });

  it('renders schema-driven fields in display order (NOT a hardcoded list)', () => {
    renderReady();
    // Every configured column label appears (driven by the columns prop).
    for (const col of COLUMNS) {
      const label = LABELS.fields[col.key];
      expect(screen.getByText(label, { exact: false })).toBeInTheDocument();
    }
    // Order: product_name appears before recipe_components before template.
    const html = document.body.innerHTML;
    expect(html.indexOf(LABELS.fields.product_name)).toBeLessThan(
      html.indexOf(LABELS.fields.recipe_components),
    );
    expect(html.indexOf(LABELS.fields.recipe_components)).toBeLessThan(
      html.indexOf(LABELS.fields.template),
    );
  });

  it('uses shadcn primitives (Input/Select/Textarea wrappers, no raw <select>)', () => {
    const { container } = renderReady();
    expect(container.querySelector('[data-slot="input"]')).toBeTruthy();
    // dropdown columns render the shadcn Select (data-slot="select"), never a raw <select>.
    expect(container.querySelector('[data-slot="select"]')).toBeTruthy();
    expect(container.querySelector('select')).toBeNull();
  });

  it('renders ingredient_codes (auto) as read-only with green styling', () => {
    renderReady();
    const input = screen.getByLabelText(LABELS.fields.ingredient_codes, {
      exact: false,
    }) as HTMLInputElement;
    expect(input).toHaveAttribute('readonly');
    expect(input.className).toMatch(/green/);
  });
});

describe('FaCoreTab — required-missing alert (V05)', () => {
  it('shows the required-missing alert when a required field is empty', () => {
    renderReady({ values: { ...VALUES, product_name: '' } });
    expect(screen.getByText(LABELS.requiredMissingTitle)).toBeInTheDocument();
  });

  it('hides the required-missing alert when all required fields are filled', () => {
    renderReady();
    expect(screen.queryByText(LABELS.requiredMissingTitle)).not.toBeInTheDocument();
  });
});

describe('FaCoreTab — AC2 chain3 (Recipe_Components → ProdDetail sync)', () => {
  it('Save calls updateFaCell for recipe_components when it is edited', async () => {
    const user = userEvent.setup();
    renderReady();
    const recipe = screen.getByLabelText(LABELS.fields.recipe_components, {
      exact: false,
    });
    await user.clear(recipe);
    await user.type(recipe, 'PR9999Z');
    await user.click(screen.getByRole('button', { name: LABELS.save }));

    expect(updateFaCellMock).toHaveBeenCalledWith(
      'FA-1001',
      'recipe_components',
      'PR9999Z',
    );
  });
});

describe('FaCoreTab — AC3 chain1 (pack_size → Line + dieset cleared)', () => {
  it('Save calls updateFaCell for pack_size when it is changed', async () => {
    const user = userEvent.setup();
    renderReady();
    // Stale Select assertion: options mount only after opening the shared Select primitive.
    await user.click(screen.getByRole('combobox', { name: /pack size/i }));
    await user.click(await screen.findByRole('option', { name: '400g' }));
    await user.click(screen.getByRole('button', { name: LABELS.save }));

    expect(updateFaCellMock).toHaveBeenCalledWith('FA-1001', 'pack_size', '400g');
  });
});

describe('FaCoreTab — read-only red line', () => {
  it('never submits ingredient_codes even when other fields change', async () => {
    const user = userEvent.setup();
    renderReady();
    const name = screen.getByLabelText(LABELS.fields.product_name, { exact: false });
    await user.clear(name);
    await user.type(name, 'Renamed');
    await user.click(screen.getByRole('button', { name: LABELS.save }));

    const calledColumns = updateFaCellMock.mock.calls.map((c) => c[1]);
    expect(calledColumns).not.toContain('ingredient_codes');
  });

  it('does not call updateFaCell for unchanged fields', async () => {
    const user = userEvent.setup();
    renderReady();
    await user.click(screen.getByRole('button', { name: LABELS.save }));
    // Nothing dirty → no writes.
    expect(updateFaCellMock).not.toHaveBeenCalled();
  });
});

describe('FaCoreTab — required UI states', () => {
  it('loading state', () => {
    renderReady({ state: 'loading' });
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
  });

  it('empty state (no Core columns configured)', () => {
    renderReady({ state: 'empty', columns: [] });
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

describe('FaCoreTab — i18n', () => {
  it('renders only label VALUES from props (no inline English literals leak)', () => {
    renderReady({
      labels: { ...LABELS, save: 'Zapisz rdzeń' },
    });
    expect(screen.getByRole('button', { name: 'Zapisz rdzeń' })).toBeInTheDocument();
    // The English default must not appear when a Polish label is supplied.
    expect(screen.queryByRole('button', { name: 'Save Core' })).not.toBeInTheDocument();
  });
});

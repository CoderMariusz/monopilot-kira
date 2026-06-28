/**
 * @vitest-environment jsdom
 * T-026 RED — FaTechnicalTab (schema-driven Technical dept form) parity + states +
 * reserved allergen widget slot.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:656-743 (fa_technical_tab)
 *   — FATechnicalTab: a "Technical section" card with an open/closed badge and a
 *     form-grid of fields (Shelf life *, Storage temperature, …, Closed_Technical),
 *     followed by an "Allergen declaration" card (Contains / May-contain chips +
 *     the 14-allergen override-controls table). The allergen cascade itself is
 *     NPD-c (cross-module, deferred — Sensory is 03-Technical owned). This shell
 *     reserves the allergen slot as a Card with "Allergens loading…" until NPD-c
 *     populates it; it does NOT build the cascade here (task red line).
 *
 * Schema-driven (NO hardcoded field list): the Technical fields come from the
 * `columns` prop sourced server-side from Reference.DeptColumns (dept_code =
 * 'Technical') via the T-014 buildDeptZod runtime / dept-column metadata. The
 * component renders whatever Technical columns the org has, in display order.
 *
 * Write path (real data, RLS): each dirty editable cell is persisted via
 * updateFaCell(productCode, columnKey, value) (T-009). NO mock data in production;
 * the test mocks the Server Action module only so the client test never touches DB.
 *
 * Asserts:
 *  - AC1 parity: Technical section card + open/closed badge, schema-driven fields
 *    in display order (shelf_life first, closed_technical last), shadcn
 *    Input/Select/Card primitives (no raw <select>), then the reserved allergen
 *    slot Card.
 *  - AC2 save: editing shelf_life + Save calls updateFaCell with the shelf_life
 *    column → server updates the row.
 *  - AC3 slot placeholder: with no allergen data, the allergen slot renders a Card
 *    with "Allergens loading…" (no error).
 *  - read-only red line: read-only columns are NOT editable and NEVER submitted.
 *  - the five required UI states (loading / empty / ready / error / permission_denied).
 *  - i18n: the component renders LABEL VALUES (props), never inline English literals.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
  FaTechnicalTab,
  type FaTechnicalTabLabels,
  type FaTechnicalColumn,
} from '../fa-technical-tab';

const LABELS: FaTechnicalTabLabels = {
  title: 'Technical section',
  subtitle: 'Shelf-life and technical sign-off. Close after all required fields are filled.',
  closedBadge: '✓ Closed',
  openBadge: 'Open',
  autoHint: 'Auto-derived — read-only.',
  requiredMissingTitle: 'Required fields missing',
  requiredMissingBody: 'Shelf life must be filled before Close Technical.',
  save: 'Save Technical',
  saving: 'Saving…',
  saveSuccess: 'Technical section saved.',
  saveError: 'Could not save the Technical section.',
  selectPlaceholder: 'Select…',
  loading: 'Loading Technical section…',
  empty: 'No Technical fields configured',
  emptyBody: 'This organisation has no Technical department columns yet.',
  error: 'Unable to load the Technical section.',
  forbidden: 'You do not have permission to edit the Technical section.',
  allergenSlotTitle: 'Allergen declaration',
  allergenSlotSubtitle: 'Regulation: EU FIC 1169/2011 · 14 mandatory allergens',
  allergenSlotLoading: 'Allergens loading…',
  fields: {
    shelf_life: 'Shelf life',
    storage_temperature: 'Storage temperature',
    closed_technical: 'Closed Technical',
  },
};

// Schema-driven Technical columns (mirrors Reference.DeptColumns seed, display order).
const COLUMNS: FaTechnicalColumn[] = [
  { key: 'shelf_life', dataType: 'text', required: true, readOnly: false, displayOrder: 1 },
  {
    key: 'storage_temperature',
    dataType: 'text',
    required: false,
    readOnly: false,
    displayOrder: 2,
  },
  {
    key: 'closed_technical',
    dataType: 'dropdown',
    required: false,
    readOnly: false,
    displayOrder: 3,
    dropdownSource: 'CloseConfirm',
  },
];

const VALUES: Record<string, unknown> = {
  shelf_life: '28 days chilled',
  storage_temperature: '0–4 °C',
  closed_technical: 'No',
};

const DROPDOWNS: Record<string, string[]> = {
  CloseConfirm: ['No', 'Yes'],
};

function renderReady(overrides?: Partial<React.ComponentProps<typeof FaTechnicalTab>>) {
  return render(
    <FaTechnicalTab
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

describe('FaTechnicalTab — AC1 prototype parity (fa-screens.jsx:656-743)', () => {
  it('renders the Technical section card heading + open/closed badge', () => {
    renderReady();
    expect(screen.getByRole('heading', { name: LABELS.title })).toBeInTheDocument();
    // closed_technical value 'No' → Open badge
    expect(screen.getByText(LABELS.openBadge)).toBeInTheDocument();
  });

  it('renders schema-driven fields in display order (NOT a hardcoded list)', () => {
    renderReady();
    for (const col of COLUMNS) {
      const label = LABELS.fields[col.key];
      expect(screen.getByText(label, { exact: false })).toBeInTheDocument();
    }
    // Order: shelf_life appears before storage_temperature before closed_technical.
    const html = document.body.innerHTML;
    expect(html.indexOf(LABELS.fields.shelf_life)).toBeLessThan(
      html.indexOf(LABELS.fields.storage_temperature),
    );
    expect(html.indexOf(LABELS.fields.storage_temperature)).toBeLessThan(
      html.indexOf(LABELS.fields.closed_technical),
    );
  });

  it('uses shadcn primitives (Input/Select wrappers, no raw <select>)', () => {
    const { container } = renderReady();
    expect(container.querySelector('[data-slot="input"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="select"]')).toBeTruthy();
    expect(container.querySelector('select')).toBeNull();
  });

  it('shows the Closed badge when closed_technical is Yes', () => {
    renderReady({ values: { ...VALUES, closed_technical: 'Yes' } });
    expect(screen.getByText(LABELS.closedBadge)).toBeInTheDocument();
  });
});

describe('FaTechnicalTab — AC3 reserved allergen widget slot (NPD-c)', () => {
  it('renders the allergen slot Card with "Allergens loading…" placeholder (no error)', () => {
    renderReady();
    expect(screen.getByText(LABELS.allergenSlotTitle)).toBeInTheDocument();
    expect(screen.getByText(LABELS.allergenSlotLoading)).toBeInTheDocument();
    // The placeholder is a status region, never an error.
    expect(screen.queryByText(LABELS.error)).not.toBeInTheDocument();
  });

  it('keeps the allergen slot reserved even when there are no Technical columns', () => {
    renderReady({ state: 'empty', columns: [] });
    // Slot reservation is a task red line — must survive the empty form state.
    expect(screen.getByText(LABELS.allergenSlotLoading)).toBeInTheDocument();
  });
});

describe('FaTechnicalTab — required-missing alert (V07)', () => {
  it('shows the required-missing alert when shelf_life is empty', () => {
    renderReady({ values: { ...VALUES, shelf_life: '' } });
    expect(screen.getByText(LABELS.requiredMissingTitle)).toBeInTheDocument();
  });

  it('hides the required-missing alert when all required fields are filled', () => {
    renderReady();
    expect(screen.queryByText(LABELS.requiredMissingTitle)).not.toBeInTheDocument();
  });
});

describe('FaTechnicalTab — AC2 save via updateFaCell', () => {
  it('Save calls updateFaCell for shelf_life when it is edited', async () => {
    const user = userEvent.setup();
    renderReady();
    const shelf = screen.getByLabelText(LABELS.fields.shelf_life, { exact: false });
    await user.clear(shelf);
    await user.type(shelf, '42 days frozen');
    await user.click(screen.getByRole('button', { name: LABELS.save }));

    expect(updateFaCellMock).toHaveBeenCalledWith('FA-1001', 'shelf_life', '42 days frozen');
  });

  it('does not call updateFaCell for unchanged fields', async () => {
    const user = userEvent.setup();
    renderReady();
    await user.click(screen.getByRole('button', { name: LABELS.save }));
    expect(updateFaCellMock).not.toHaveBeenCalled();
  });
});

describe('FaTechnicalTab — read-only red line', () => {
  it('never submits a read-only column even when other fields change', async () => {
    const user = userEvent.setup();
    const columnsWithReadOnly: FaTechnicalColumn[] = [
      ...COLUMNS,
      {
        key: 'allergen_summary',
        dataType: 'text',
        required: false,
        readOnly: true,
        auto: true,
        displayOrder: 4,
      },
    ];
    renderReady({
      columns: columnsWithReadOnly,
      values: { ...VALUES, allergen_summary: 'Milk, Eggs' },
      labels: {
        ...LABELS,
        fields: { ...LABELS.fields, allergen_summary: 'Allergen summary (auto)' },
      },
    });
    const shelf = screen.getByLabelText(LABELS.fields.shelf_life, { exact: false });
    await user.clear(shelf);
    await user.type(shelf, 'Changed');
    await user.click(screen.getByRole('button', { name: LABELS.save }));

    const calledColumns = updateFaCellMock.mock.calls.map((c) => c[1]);
    expect(calledColumns).not.toContain('allergen_summary');
  });
});

describe('FaTechnicalTab — required UI states', () => {
  it('loading state', () => {
    renderReady({ state: 'loading' });
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
  });

  it('empty state (no Technical columns configured)', () => {
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

describe('FaTechnicalTab — i18n', () => {
  it('renders only label VALUES from props (no inline English literals leak)', () => {
    renderReady({
      labels: { ...LABELS, save: 'Zapisz dane techniczne' },
    });
    expect(screen.getByRole('button', { name: 'Zapisz dane techniczne' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Technical' })).not.toBeInTheDocument();
  });
});

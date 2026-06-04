/**
 * @vitest-environment jsdom
 * T-102 RED — FaProcurementTab (SCR-03g FA detail Procurement tab) — schema-driven
 * Procurement dept form with V-NPD-PROC-001 price gating.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:806-838 (fa_procurement_tab)
 *   — FAProcurementTab: "Procurement section" card with an open/closed badge
 *     (closed_procurement), an amber V-NPD-PROC-001 alert rendered only when
 *     priceBlocked, a form-grid of 4 fields (Price (€/kg) *, Lead time (days) *,
 *     Supplier * <select>, Proc. shelf life (days) *), and a "Save Procurement" +
 *     "Close Procurement section" action row. The Price input is disabled with a
 *     gray (#D0D0D0) background whenever priceBlocked is true.
 *
 * priceBlocked = fa.closed_core !== 'Yes' || fa.closed_production !== 'Yes'.
 *
 * Schema-driven (NO hardcoded field list — task red line): fields come from the
 * `columns` prop sourced server-side from Reference.DeptColumns (dept_code=
 * 'Procurement') via the T-014 buildDeptZod runtime. The Supplier dropdown options
 * come from a Reference table (Suppliers) — NEVER a hardcoded list. Field values
 * come from the real public.product row (composite PK org_id + product_code).
 *
 * Asserts:
 *  - AC1 parity: same regions (Procurement section card, open/closed badge,
 *    schema-driven form fields in display order, shadcn Input/Select primitives,
 *    action row).
 *  - AC2 priceBlocked=true → Price input disabled + gray bg + amber V-NPD-PROC-001
 *    alert shown.
 *  - AC3 priceBlocked=false → Price enabled; editing + Save calls updateFaCell for
 *    the price column only.
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
  FaProcurementTab,
  type FaProcurementTabLabels,
  type FaProcurementColumn,
} from '../fa-procurement-tab';

const LABELS: FaProcurementTabLabels = {
  title: 'Procurement section',
  subtitle: 'Supplier, price and lead time. Price unlocks after Core and Production are closed.',
  closedBadge: '✓ Closed',
  openBadge: 'Open',
  priceBlockedTitle: 'V-NPD-PROC-001',
  priceBlockedBody:
    'Price entry unlocks after Core AND Production are both closed. Business rule: price depends on final components.',
  priceBlockedHint: 'Locked until Core and Production are closed.',
  save: 'Save Procurement',
  saving: 'Saving…',
  saveSuccess: 'Procurement section saved.',
  saveError: 'Could not save the Procurement section.',
  selectPlaceholder: 'Select…',
  loading: 'Loading Procurement section…',
  empty: 'No Procurement fields configured',
  emptyBody: 'This organisation has no Procurement department columns yet.',
  error: 'Unable to load the Procurement section.',
  forbidden: 'You do not have permission to edit the Procurement section.',
  fields: {
    price_per_kg: 'Price (€/kg)',
    lead_time_days: 'Lead time (days)',
    supplier: 'Supplier',
    proc_shelf_life_days: 'Proc. shelf life (days)',
    closed_procurement: 'Closed Procurement',
  },
};

// Schema-driven Procurement columns (mirrors Reference.DeptColumns seed order).
const COLUMNS: FaProcurementColumn[] = [
  { key: 'price_per_kg', dataType: 'number', required: true, readOnly: false, displayOrder: 1, priceGated: true },
  { key: 'lead_time_days', dataType: 'number', required: true, readOnly: false, displayOrder: 2 },
  {
    key: 'supplier',
    dataType: 'dropdown',
    required: true,
    readOnly: false,
    displayOrder: 3,
    dropdownSource: 'Suppliers',
  },
  { key: 'proc_shelf_life_days', dataType: 'number', required: true, readOnly: false, displayOrder: 4 },
  {
    key: 'closed_procurement',
    dataType: 'dropdown',
    required: false,
    readOnly: false,
    displayOrder: 5,
    dropdownSource: 'CloseConfirm',
  },
];

const VALUES: Record<string, unknown> = {
  price_per_kg: 18.4,
  lead_time_days: 14,
  supplier: 'Iberica Meats SL',
  proc_shelf_life_days: 60,
  closed_procurement: 'No',
};

const DROPDOWNS: Record<string, string[]> = {
  Suppliers: ['Iberica Meats SL', 'Nordic Proteins AB', 'Black Forest Foods GmbH'],
  CloseConfirm: ['No', 'Yes'],
};

function renderTab(overrides?: Partial<React.ComponentProps<typeof FaProcurementTab>>) {
  return render(
    <FaProcurementTab
      productCode="FA-1001"
      columns={COLUMNS}
      values={VALUES}
      dropdowns={DROPDOWNS}
      labels={LABELS}
      closedCore="Yes"
      closedProduction="Yes"
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

describe('FaProcurementTab — AC1 prototype parity (fa-screens.jsx:806-838)', () => {
  it('renders the Procurement section card heading + open/closed badge', () => {
    renderTab();
    expect(screen.getByRole('heading', { name: LABELS.title })).toBeInTheDocument();
    // closed_procurement value 'No' → Open badge
    expect(screen.getByText(LABELS.openBadge)).toBeInTheDocument();
  });

  it('renders the closed badge when closed_procurement = Yes', () => {
    renderTab({ values: { ...VALUES, closed_procurement: 'Yes' } });
    expect(screen.getByText(LABELS.closedBadge)).toBeInTheDocument();
  });

  it('renders schema-driven fields in display order (NOT a hardcoded list)', () => {
    renderTab();
    for (const col of COLUMNS) {
      const label = LABELS.fields[col.key];
      expect(screen.getAllByText(label, { exact: false }).length).toBeGreaterThan(0);
    }
    // Assert DOM order via the data-field containers (display_order ascending),
    // not innerHTML substring search (the subtitle copy also contains "Supplier").
    const fieldOrder = Array.from(document.querySelectorAll('[data-field]')).map((el) =>
      el.getAttribute('data-field'),
    );
    expect(fieldOrder).toEqual([
      'price_per_kg',
      'lead_time_days',
      'supplier',
      'proc_shelf_life_days',
      'closed_procurement',
    ]);
  });

  it('uses shadcn primitives (Input/Select wrappers, no raw <select>)', () => {
    const { container } = renderTab();
    expect(container.querySelector('[data-slot="input"]')).toBeTruthy();
    // Supplier dropdown renders the shadcn Select, never a raw <select>.
    expect(container.querySelector('[data-slot="select"]')).toBeTruthy();
    expect(container.querySelector('select')).toBeNull();
  });

  it('does not hardcode suppliers — renders every Reference Suppliers option', () => {
    renderTab();
    for (const supplier of DROPDOWNS.Suppliers) {
      expect(screen.getAllByText(supplier).length).toBeGreaterThan(0);
    }
  });
});

describe('FaProcurementTab — AC2 V-NPD-PROC-001 price gating', () => {
  it('priceBlocked when Core not closed: disables Price + shows amber alert', () => {
    renderTab({ closedCore: 'No', closedProduction: 'Yes' });
    const price = screen.getByLabelText(LABELS.fields.price_per_kg, {
      exact: false,
    }) as HTMLInputElement;
    expect(price).toBeDisabled();
    expect(price.className).toMatch(/gray|D0D0D0|#d0d0d0/i);
    expect(screen.getByText(LABELS.priceBlockedTitle)).toBeInTheDocument();
  });

  it('priceBlocked when Production not closed: disables Price + shows amber alert', () => {
    renderTab({ closedCore: 'Yes', closedProduction: 'No' });
    const price = screen.getByLabelText(LABELS.fields.price_per_kg, {
      exact: false,
    }) as HTMLInputElement;
    expect(price).toBeDisabled();
    expect(screen.getByText(LABELS.priceBlockedTitle)).toBeInTheDocument();
  });

  it('does NOT show the amber alert when both Core and Production are closed', () => {
    renderTab({ closedCore: 'Yes', closedProduction: 'Yes' });
    expect(screen.queryByText(LABELS.priceBlockedTitle)).not.toBeInTheDocument();
    const price = screen.getByLabelText(LABELS.fields.price_per_kg, {
      exact: false,
    }) as HTMLInputElement;
    expect(price).not.toBeDisabled();
  });
});

describe('FaProcurementTab — AC3 price save (priceBlocked=false)', () => {
  it('Save calls updateFaCell for price_per_kg only when price is edited', async () => {
    const user = userEvent.setup();
    renderTab();
    const price = screen.getByLabelText(LABELS.fields.price_per_kg, { exact: false });
    await user.clear(price);
    await user.type(price, '19.95');
    await user.click(screen.getByRole('button', { name: LABELS.save }));

    expect(updateFaCellMock).toHaveBeenCalledWith('FA-1001', 'price_per_kg', '19.95');
    // only the dirty field is written
    expect(updateFaCellMock).toHaveBeenCalledTimes(1);
  });

  it('never submits price_per_kg when priceBlocked even if other fields change', async () => {
    const user = userEvent.setup();
    renderTab({ closedCore: 'No', closedProduction: 'Yes' });
    const leadTime = screen.getByLabelText(LABELS.fields.lead_time_days, { exact: false });
    await user.clear(leadTime);
    await user.type(leadTime, '21');
    await user.click(screen.getByRole('button', { name: LABELS.save }));

    const calledColumns = updateFaCellMock.mock.calls.map((c) => c[1]);
    expect(calledColumns).toContain('lead_time_days');
    expect(calledColumns).not.toContain('price_per_kg');
  });

  it('does not call updateFaCell for unchanged fields', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByRole('button', { name: LABELS.save }));
    expect(updateFaCellMock).not.toHaveBeenCalled();
  });
});

describe('FaProcurementTab — required UI states', () => {
  it('loading state', () => {
    renderTab({ state: 'loading' });
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
  });

  it('empty state (no Procurement columns configured)', () => {
    renderTab({ state: 'empty', columns: [] });
    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
  });

  it('error state', () => {
    renderTab({ state: 'error' });
    expect(screen.getByText(LABELS.error)).toBeInTheDocument();
  });

  it('permission_denied state', () => {
    renderTab({ state: 'permission_denied' });
    expect(screen.getByText(LABELS.forbidden)).toBeInTheDocument();
  });
});

describe('FaProcurementTab — i18n', () => {
  it('renders only label VALUES from props (no inline English literals leak)', () => {
    renderTab({
      labels: { ...LABELS, save: 'Zapisz zaopatrzenie' },
    });
    expect(screen.getByRole('button', { name: 'Zapisz zaopatrzenie' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Procurement' })).not.toBeInTheDocument();
  });
});

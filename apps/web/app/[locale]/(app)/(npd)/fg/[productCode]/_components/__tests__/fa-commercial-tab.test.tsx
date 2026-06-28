/**
 * @vitest-environment jsdom
 * T-103 RED — FaCommercialTab (SCR-03c Commercial dept form) parity + states + V08.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:559-586 (FACommercialTab)
 *   — Commercial section card with an open/closed badge (closed_commercial),
 *     a blue V08 alert when fa.brief_id is present ("Launch Date must be ≥ 24
 *     weeks from Brief handoff. Earliest: {earliest}."), a form-grid of 7 fields
 *     (Launch Date *, Department number *, Article number *, Bar codes (GS1) *
 *     mono, Cases/week W1 *, W2 *, W3 *), and a "Save Commercial" +
 *     "Close Commercial section" action row.
 *
 * Schema-driven (NO hardcoded field list): fields come from the `columns` prop
 * sourced server-side from Reference.DeptColumns (dept_code='Commercial') via the
 * T-014 buildDeptZod runtime / dept-column metadata. The component renders
 * whatever Commercial columns the org has configured, in display order.
 *
 * Asserts:
 *  - AC1 parity: same regions (Commercial section card, V08 alert when brief_id,
 *    schema-driven 7 fields in display order, bar-codes mono font, shadcn
 *    Input primitives, action row).
 *  - AC2 V08: with brief_id present and a Launch Date < earliest, the V08 alert
 *    shows and the launch_date write is rejected (updateFaCell NOT called for it).
 *  - AC3 single-field save: editing Cases/week W1 + Save calls updateFaCell for
 *    cases_week_1 ONLY; the closed_commercial badge state is unchanged.
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
  FaCommercialTab,
  type FaCommercialTabLabels,
  type FaCommercialColumn,
} from '../commercial-tab';

const LABELS: FaCommercialTabLabels = {
  title: 'Commercial section',
  subtitle: 'Commercial dept fields. Launch Date drives the V08 brief-handoff rule.',
  closedBadge: '✓ Closed',
  openBadge: 'Open',
  v08Alert: 'V08 · Launch Date must be ≥ 24 weeks from Brief handoff. Earliest: {earliest}.',
  v08Violation: 'Launch Date must be on or after the earliest allowed date ({earliest}).',
  requiredMissingTitle: 'Required fields missing',
  requiredMissingBody:
    'Launch Date, Department number, Article number, Bar codes and Cases/week W1–W3 are all required.',
  save: 'Save Commercial',
  saving: 'Saving…',
  saveSuccess: 'Commercial section saved.',
  saveError: 'Could not save the Commercial section.',
  close: 'Close Commercial section',
  loading: 'Loading Commercial section…',
  empty: 'No Commercial fields configured',
  emptyBody: 'This organisation has no Commercial department columns yet.',
  error: 'Unable to load the Commercial section.',
  forbidden: 'You do not have permission to edit the Commercial section.',
  fields: {
    launch_date: 'Launch Date',
    department_number: 'Department number',
    article_number: 'Article number',
    bar_codes_gs1: 'Bar codes (GS1)',
    cases_week_1: 'Cases / week W1',
    cases_week_2: 'Cases / week W2',
    cases_week_3: 'Cases / week W3',
    closed_commercial: 'Closed Commercial',
  },
};

// Schema-driven Commercial columns (mirrors Reference.DeptColumns seed order).
const COLUMNS: FaCommercialColumn[] = [
  { key: 'launch_date', dataType: 'date', required: true, readOnly: false, displayOrder: 1 },
  { key: 'department_number', dataType: 'text', required: true, readOnly: false, displayOrder: 2 },
  { key: 'article_number', dataType: 'text', required: true, readOnly: false, displayOrder: 3 },
  { key: 'bar_codes_gs1', dataType: 'text', required: true, readOnly: false, mono: true, displayOrder: 4 },
  { key: 'cases_week_1', dataType: 'number', required: true, readOnly: false, displayOrder: 5 },
  { key: 'cases_week_2', dataType: 'number', required: true, readOnly: false, displayOrder: 6 },
  { key: 'cases_week_3', dataType: 'number', required: true, readOnly: false, displayOrder: 7 },
];

const VALUES: Record<string, unknown> = {
  launch_date: '2026-10-01',
  department_number: 'PL-D-4120',
  article_number: 'ART-10821',
  bar_codes_gs1: '5901234561234',
  cases_week_1: 120,
  cases_week_2: 180,
  cases_week_3: 220,
  closed_commercial: 'No',
};

function renderReady(overrides?: Partial<React.ComponentProps<typeof FaCommercialTab>>) {
  return render(
    <FaCommercialTab
      productCode="FA-1001"
      columns={COLUMNS}
      values={VALUES}
      closedCommercial="No"
      briefId={null}
      earliest={null}
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

describe('FaCommercialTab — AC1 prototype parity (fa-screens.jsx:559-586)', () => {
  it('renders the Commercial section card heading + open/closed badge', () => {
    renderReady();
    expect(screen.getByRole('heading', { name: LABELS.title })).toBeInTheDocument();
    // closed_commercial 'No' → Open badge.
    expect(screen.getByText(LABELS.openBadge)).toBeInTheDocument();
  });

  it('renders a Closed badge when closed_commercial is Yes', () => {
    renderReady({ closedCommercial: 'Yes' });
    expect(screen.getByText(LABELS.closedBadge)).toBeInTheDocument();
  });

  it('renders the 7 schema-driven fields in display order (NOT a hardcoded list)', () => {
    renderReady();
    for (const col of COLUMNS) {
      // getAllBy: "Launch Date" also appears in the subtitle copy; ≥1 is enough.
      expect(screen.getAllByText(LABELS.fields[col.key], { exact: false }).length).toBeGreaterThan(0);
    }
    const html = document.body.innerHTML;
    expect(html.indexOf(LABELS.fields.launch_date)).toBeLessThan(
      html.indexOf(LABELS.fields.department_number),
    );
    expect(html.indexOf(LABELS.fields.bar_codes_gs1)).toBeLessThan(
      html.indexOf(LABELS.fields.cases_week_1),
    );
    expect(html.indexOf(LABELS.fields.cases_week_1)).toBeLessThan(
      html.indexOf(LABELS.fields.cases_week_3),
    );
  });

  it('uses shadcn Input primitives (no raw <select>) and renders Bar codes in mono', () => {
    const { container } = renderReady();
    expect(container.querySelector('[data-slot="input"]')).toBeTruthy();
    expect(container.querySelector('select')).toBeNull();
    const bar = screen.getByLabelText(LABELS.fields.bar_codes_gs1, { exact: false });
    expect(bar.className).toMatch(/font-mono/);
  });

  it('renders Launch Date as a date input and Cases as number inputs', () => {
    renderReady();
    expect(screen.getByLabelText(LABELS.fields.launch_date, { exact: false })).toHaveAttribute(
      'type',
      'date',
    );
    expect(screen.getByLabelText(LABELS.fields.cases_week_1, { exact: false })).toHaveAttribute(
      'type',
      'number',
    );
  });

  it('renders Save + Close action buttons', () => {
    renderReady();
    expect(screen.getByRole('button', { name: LABELS.save })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: LABELS.close })).toBeInTheDocument();
  });
});

describe('FaCommercialTab — V08 (brief_id launch-date rule)', () => {
  it('does NOT show the V08 alert when brief_id is absent', () => {
    renderReady({ briefId: null, earliest: null });
    expect(screen.queryByTestId('fa-commercial-v08')).not.toBeInTheDocument();
  });

  it('shows the V08 blue alert with the earliest date when brief_id is present', () => {
    renderReady({ briefId: 'BR-001', earliest: '2026-09-25' });
    const alert = screen.getByTestId('fa-commercial-v08');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toContain('2026-09-25');
  });

  it('AC2 — rejects a Launch Date earlier than earliest and does NOT write launch_date', async () => {
    const user = userEvent.setup();
    renderReady({ briefId: 'BR-001', earliest: '2026-09-25' });
    const launch = screen.getByLabelText(LABELS.fields.launch_date, { exact: false });
    await user.clear(launch);
    await user.type(launch, '2026-08-01'); // < earliest
    await user.click(screen.getByRole('button', { name: LABELS.save }));

    // V08 violation surfaced + launch_date write rejected.
    expect(screen.getByTestId('fa-commercial-v08-violation')).toBeInTheDocument();
    const calledColumns = updateFaCellMock.mock.calls.map((c) => c[1]);
    expect(calledColumns).not.toContain('launch_date');
  });

  it('AC2 — accepts a Launch Date on/after earliest and writes launch_date', async () => {
    const user = userEvent.setup();
    renderReady({ briefId: 'BR-001', earliest: '2026-09-25' });
    const launch = screen.getByLabelText(LABELS.fields.launch_date, { exact: false });
    await user.clear(launch);
    await user.type(launch, '2026-09-25');
    await user.click(screen.getByRole('button', { name: LABELS.save }));

    expect(updateFaCellMock).toHaveBeenCalledWith('FA-1001', 'launch_date', '2026-09-25');
    expect(screen.queryByTestId('fa-commercial-v08-violation')).not.toBeInTheDocument();
  });
});

describe('FaCommercialTab — AC3 single-field save', () => {
  it('Save calls updateFaCell for cases_week_1 ONLY when it is the only edit', async () => {
    const user = userEvent.setup();
    renderReady();
    const w1 = screen.getByLabelText(LABELS.fields.cases_week_1, { exact: false });
    await user.clear(w1);
    await user.type(w1, '150');
    await user.click(screen.getByRole('button', { name: LABELS.save }));

    expect(updateFaCellMock).toHaveBeenCalledTimes(1);
    expect(updateFaCellMock).toHaveBeenCalledWith('FA-1001', 'cases_week_1', '150');
  });

  it('does not call updateFaCell for unchanged fields', async () => {
    const user = userEvent.setup();
    renderReady();
    await user.click(screen.getByRole('button', { name: LABELS.save }));
    expect(updateFaCellMock).not.toHaveBeenCalled();
  });

  it('leaves the closed_commercial badge unchanged after a field save', async () => {
    const user = userEvent.setup();
    renderReady();
    expect(screen.getByText(LABELS.openBadge)).toBeInTheDocument();
    const w1 = screen.getByLabelText(LABELS.fields.cases_week_1, { exact: false });
    await user.clear(w1);
    await user.type(w1, '150');
    await user.click(screen.getByRole('button', { name: LABELS.save }));
    // Badge driven by the `closedCommercial` prop, unaffected by the cell save.
    expect(screen.getByText(LABELS.openBadge)).toBeInTheDocument();
  });
});

describe('FaCommercialTab — required-missing alert', () => {
  it('shows the required-missing alert when a required field is empty', () => {
    renderReady({ values: { ...VALUES, department_number: '' } });
    expect(screen.getByText(LABELS.requiredMissingTitle)).toBeInTheDocument();
  });

  it('hides the required-missing alert when all required fields are filled', () => {
    renderReady();
    expect(screen.queryByText(LABELS.requiredMissingTitle)).not.toBeInTheDocument();
  });
});

describe('FaCommercialTab — required UI states', () => {
  it('loading state', () => {
    renderReady({ state: 'loading' });
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
  });

  it('empty state (no Commercial columns configured)', () => {
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

describe('FaCommercialTab — i18n', () => {
  it('renders only label VALUES from props (no inline English literals leak)', () => {
    renderReady({ labels: { ...LABELS, save: 'Zapisz komercję' } });
    expect(screen.getByRole('button', { name: 'Zapisz komercję' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Commercial' })).not.toBeInTheDocument();
  });
});

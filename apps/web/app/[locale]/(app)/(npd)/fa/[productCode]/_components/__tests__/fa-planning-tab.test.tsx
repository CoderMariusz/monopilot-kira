/**
 * @vitest-environment jsdom
 * T-104 RED — FaPlanningTab (SCR-03b FA detail Planning tab) parity + states + write.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:537-557 (FAPlanningTab)
 *   — "Planning section" card with an open/closed badge (closed_planning),
 *     a form-grid of 3 fields (Meat % *, Runs per week *, Date codes per week *),
 *     a blue Technical BOM v1 transition Alert, and a "Save Planning" +
 *     "Close Planning section" action row.
 *
 * Schema-driven (NO hardcoded field list — task red line): fields come from the
 * `columns` prop sourced server-side from Reference.DeptColumns (dept_code=
 * 'Planning') via the T-014 buildDeptZod runtime / dept-column metadata.
 *
 * STANDALONE component (this slice): the per-tab wiring into fa-tabs.tsx is T-105
 * and is explicitly out of scope here. The Core-close gate is enforced by the
 * parent wiring (T-105), NOT by this tab.
 *
 * Asserts:
 *  - AC1 parity: same regions (Planning section card, open/closed badge,
 *    schema-driven form fields in display order, blue Technical BOM v1 Alert,
 *    Save Planning + Close Planning action row, shadcn Input/Select primitives).
 *  - AC2 single-field write: editing meat_pct + Save calls updateFaCell for
 *    meat_pct ONLY (composite PK org_id+product_code → productCode arg) and not
 *    for unchanged fields.
 *  - AC3 closed badge: closed_planning='Yes' → green Closed badge; Save + Close
 *    buttons still rendered (close gate is parent-enforced).
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
  FaPlanningTab,
  type FaPlanningTabLabels,
  type FaPlanningColumn,
} from '../fa-planning-tab';

const LABELS: FaPlanningTabLabels = {
  title: 'Planning section',
  subtitle: 'Planning department fields.',
  closedBadge: '✓ Closed',
  openBadge: 'Open',
  bomNoteTitle: 'Technical BOM v1',
  bomNoteBody:
    'When FA is launched it transitions to Technical BOM v1 adopted by the Planning module (see Planning / Products).',
  save: 'Save Planning',
  saving: 'Saving…',
  saveSuccess: 'Planning section saved.',
  saveError: 'Could not save the Planning section.',
  closeSection: 'Close Planning section',
  selectPlaceholder: 'Select…',
  loading: 'Loading Planning section…',
  empty: 'No Planning fields configured',
  emptyBody: 'This organisation has no Planning department columns yet.',
  error: 'Unable to load the Planning section.',
  forbidden: 'You do not have permission to edit the Planning section.',
  fields: {
    meat_pct: 'Meat %',
    runs_per_week: 'Runs per week',
    date_codes_per_week: 'Date codes per week',
    closed_planning: 'Closed Planning',
  },
};

// Schema-driven Planning columns (mirrors Reference.DeptColumns seed, in order).
const COLUMNS: FaPlanningColumn[] = [
  { key: 'meat_pct', dataType: 'number', required: true, readOnly: false, displayOrder: 1 },
  { key: 'runs_per_week', dataType: 'number', required: true, readOnly: false, displayOrder: 2 },
  {
    key: 'date_codes_per_week',
    dataType: 'text',
    required: true,
    readOnly: false,
    displayOrder: 3,
  },
];

const VALUES: Record<string, unknown> = {
  meat_pct: 85,
  runs_per_week: 4,
  date_codes_per_week: 'Mon,Wed,Fri',
  closed_planning: 'No',
};

const DROPDOWNS: Record<string, string[]> = {};

function renderReady(overrides?: Partial<React.ComponentProps<typeof FaPlanningTab>>) {
  return render(
    <FaPlanningTab
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

describe('FaPlanningTab — AC1 prototype parity (fa-screens.jsx:537-557)', () => {
  it('renders the Planning section card heading + open badge (closed_planning=No)', () => {
    renderReady();
    expect(screen.getByRole('heading', { name: LABELS.title })).toBeInTheDocument();
    expect(screen.getByText(LABELS.openBadge)).toBeInTheDocument();
  });

  it('renders the 3 schema-driven fields in display order (NOT a hardcoded list)', () => {
    renderReady();
    for (const col of COLUMNS) {
      expect(screen.getByText(LABELS.fields[col.key], { exact: false })).toBeInTheDocument();
    }
    const html = document.body.innerHTML;
    expect(html.indexOf(LABELS.fields.meat_pct)).toBeLessThan(
      html.indexOf(LABELS.fields.runs_per_week),
    );
    expect(html.indexOf(LABELS.fields.runs_per_week)).toBeLessThan(
      html.indexOf(LABELS.fields.date_codes_per_week),
    );
  });

  it('renders the blue Technical BOM v1 transition Alert', () => {
    renderReady();
    expect(screen.getByText(LABELS.bomNoteBody, { exact: false })).toBeInTheDocument();
  });

  it('uses shadcn Input primitives (no raw <select>)', () => {
    const { container } = renderReady();
    expect(container.querySelector('[data-slot="input"]')).toBeTruthy();
    expect(container.querySelector('select')).toBeNull();
  });

  it('renders both Save Planning and Close Planning action buttons', () => {
    renderReady();
    expect(screen.getByRole('button', { name: LABELS.save })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: LABELS.closeSection })).toBeInTheDocument();
  });
});

describe('FaPlanningTab — AC2 single-field write (meat_pct only)', () => {
  it('Save calls updateFaCell for meat_pct ONLY when it is edited', async () => {
    const user = userEvent.setup();
    renderReady();
    const meat = screen.getByLabelText(LABELS.fields.meat_pct, { exact: false });
    await user.clear(meat);
    await user.type(meat, '90');
    await user.click(screen.getByRole('button', { name: LABELS.save }));

    expect(updateFaCellMock).toHaveBeenCalledTimes(1);
    expect(updateFaCellMock).toHaveBeenCalledWith('FA-1001', 'meat_pct', '90');
  });

  it('does not call updateFaCell for unchanged fields', async () => {
    const user = userEvent.setup();
    renderReady();
    await user.click(screen.getByRole('button', { name: LABELS.save }));
    expect(updateFaCellMock).not.toHaveBeenCalled();
  });
});

describe('FaPlanningTab — AC3 closed badge', () => {
  it('renders the green Closed badge when closed_planning=Yes', () => {
    renderReady({ values: { ...VALUES, closed_planning: 'Yes' } });
    const badge = screen.getByText(LABELS.closedBadge);
    expect(badge).toBeInTheDocument();
    expect(badge.closest('[data-slot="badge"]')).toHaveAttribute('data-tone', 'success');
  });

  it('still renders Save + Close buttons when closed (close gate is parent-enforced)', () => {
    renderReady({ values: { ...VALUES, closed_planning: 'Yes' } });
    expect(screen.getByRole('button', { name: LABELS.save })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: LABELS.closeSection })).toBeInTheDocument();
  });
});

describe('FaPlanningTab — required UI states', () => {
  it('loading state', () => {
    renderReady({ state: 'loading' });
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
  });

  it('empty state (no Planning columns configured)', () => {
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

describe('FaPlanningTab — i18n', () => {
  it('renders only label VALUES from props (no inline English literals leak)', () => {
    renderReady({ labels: { ...LABELS, save: 'Zapisz planowanie' } });
    expect(screen.getByRole('button', { name: 'Zapisz planowanie' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Planning' })).not.toBeInTheDocument();
  });
});

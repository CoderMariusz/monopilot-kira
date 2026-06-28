/**
 * @vitest-environment jsdom
 * T-027 RED — FaHistoryTab parity + states + collapsible details.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:938-968 (FAHistoryTab)
 *   (prototype-index-npd.json#fa_history_tab range 921-950 — see deviation log)
 *
 * Asserts:
 *  - AC1 parity: timeline rows render avatar (icon) + summary text + meta line
 *    (when · who · event type badge), built from the same regions as the
 *    prototype, using Card + Badge primitives.
 *  - AC2 ordering: rows are rendered in the order provided (loader returns DESC).
 *  - AC3 collapsible: an event carrying a diff payload renders a "Details"
 *    disclosure that reveals pretty-printed JSON.
 *  - The five required UI states (loading / empty / ready / error / permission_denied).
 *  - i18n: the component renders LABEL VALUES (props), never inline English literals.
 *  - read-only red line: no edit/delete controls are rendered for any row.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import {
  FaHistoryTab,
  type FaHistoryLabels,
  type FaHistoryRow,
} from '../fa-history-tab';

const LABELS: FaHistoryLabels = {
  title: 'History',
  subtitle: 'Read-only timeline of every change to this Finished Good.',
  filterLabel: 'Event type',
  filterAll: 'All events',
  colWhen: 'When',
  colActor: 'Who',
  colEvent: 'Event',
  detailsToggle: 'Details',
  detailsHide: 'Hide details',
  systemActor: 'System',
  unknownActor: 'Unknown',
  loading: 'Loading FA history…',
  empty: 'No history yet',
  emptyBody: 'Changes to this Finished Good will appear here as they happen.',
  emptyFiltered: 'No events match this filter',
  emptyFilteredBody: 'Try a different event type or clear the filter.',
  clearFilter: 'Clear filter',
  error: 'Unable to load FA history.',
  forbidden: 'You do not have permission to view this FA history.',
  eventLabels: {
    created: 'Created',
    field_edit: 'Field edited',
    dept_closed: 'Department closed',
  },
};

const ROWS: FaHistoryRow[] = [
  {
    id: 'audit:3',
    source: 'audit',
    eventType: 'fa.field_edit',
    occurredAt: '2026-01-03T11:00:00.000Z',
    actorName: 'Ada History',
    actorUserId: 'user-a',
    payload: { before: { recipe: 'A' }, after: { recipe: 'B' } },
  },
  {
    id: 'outbox:2',
    source: 'outbox',
    eventType: 'fa.dept_closed',
    occurredAt: '2026-01-02T10:00:00.000Z',
    actorName: 'Ada History',
    actorUserId: 'user-a',
    payload: { dept: 'Core' },
  },
  {
    id: 'outbox:1',
    source: 'outbox',
    eventType: 'fa.created',
    occurredAt: '2026-01-01T09:00:00.000Z',
    actorName: null,
    actorUserId: null,
    payload: null,
  },
];

function renderTab(overrides: Partial<React.ComponentProps<typeof FaHistoryTab>> = {}) {
  return render(
    <FaHistoryTab
      productCode="FA5601"
      rows={ROWS}
      labels={LABELS}
      state="ready"
      {...overrides}
    />,
  );
}

afterEach(() => cleanup());

describe('T-027 FaHistoryTab', () => {
  it('AC1 parity: renders a timeline row with icon + summary + meta (when · who · event badge) using Card/Badge', () => {
    renderTab();

    const root = screen.getByTestId('fa-history-tab');
    expect(root.querySelector('[data-slot="card"]')).toBeInTheDocument();

    const rows = screen.getAllByTestId(/^fa-history-row-/);
    expect(rows.length).toBe(3);

    const created = screen.getByTestId('fa-history-row-outbox:1');
    // icon/avatar marker
    expect(within(created).getByTestId('fa-history-icon')).toBeInTheDocument();
    // event type badge (shadcn Badge → data-slot="badge")
    expect(created.querySelector('[data-slot="badge"]')).toBeInTheDocument();
    // raw event type surfaced (mono) for traceability
    expect(within(created).getByText('fa.created')).toBeInTheDocument();
  });

  it('AC2 ordering: renders rows in the provided (DESC) order', () => {
    renderTab();
    const rows = screen.getAllByTestId(/^fa-history-row-/);
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'fa-history-row-audit:3',
      'fa-history-row-outbox:2',
      'fa-history-row-outbox:1',
    ]);
  });

  it('AC3 collapsible: a row with a diff payload reveals pretty JSON via a Details disclosure', async () => {
    const user = userEvent.setup();
    renderTab();

    const editRow = screen.getByTestId('fa-history-row-audit:3');
    const details = within(editRow).getByTestId('fa-history-details');
    // closed by default — pretty JSON not yet visible
    expect(details).not.toHaveAttribute('open');

    const toggle = within(editRow).getByRole('button', { name: /details/i });
    await user.click(toggle);

    expect(details).toHaveAttribute('open');
    const pre = within(editRow).getByTestId('fa-history-payload');
    // pretty-printed (indented) JSON contains the diff keys
    expect(pre.textContent).toContain('"recipe"');
    expect(pre.textContent).toMatch(/\n\s+/); // indentation proves pretty-print
  });

  it('does not render a Details disclosure for rows without a payload', () => {
    renderTab();
    const createdRow = screen.getByTestId('fa-history-row-outbox:1');
    expect(within(createdRow).queryByTestId('fa-history-details')).not.toBeInTheDocument();
  });

  it('read-only red line: renders no edit/delete controls on any row', () => {
    renderTab();
    const root = screen.getByTestId('fa-history-tab');
    expect(within(root).queryByRole('button', { name: /edit|delete|remove/i })).not.toBeInTheDocument();
  });

  it('client-side filter narrows the timeline by event type (no raw <select>)', async () => {
    const user = userEvent.setup();
    renderTab();

    // shadcn Select trigger, never a raw <select>
    expect(screen.getByTestId('fa-history-tab').querySelector('select')).toBeNull();

    const trigger = screen.getByRole('combobox', { name: /event type/i });
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: /department closed/i }));

    const rows = screen.getAllByTestId(/^fa-history-row-/);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute('data-testid', 'fa-history-row-outbox:2');
  });

  it('renders empty state when there is no history', () => {
    renderTab({ rows: [], state: 'empty' });
    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
    expect(screen.getByText(LABELS.emptyBody)).toBeInTheDocument();
  });

  it('renders loading state with a polite live region', () => {
    renderTab({ rows: [], state: 'loading' });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(LABELS.loading);
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('renders error state as an alert', () => {
    renderTab({ rows: [], state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.error);
  });

  it('renders permission-denied state without leaking the timeline', () => {
    renderTab({ rows: ROWS, state: 'permission_denied' });
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.forbidden);
    expect(screen.queryByTestId(/^fa-history-row-/)).not.toBeInTheDocument();
  });

  it('i18n: renders label values, never hard-coded English literals for the title', () => {
    const customLabels: FaHistoryLabels = { ...LABELS, title: 'Historia' };
    renderTab({ labels: customLabels });
    expect(screen.getByRole('heading', { name: 'Historia' })).toBeInTheDocument();
  });
});

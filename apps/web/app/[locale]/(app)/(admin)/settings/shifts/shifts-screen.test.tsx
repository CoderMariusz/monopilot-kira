/**
 * @vitest-environment jsdom
 * SET — Shifts & calendar screen RTL test.
 *
 * Prototype source: prototypes/design/Monopilot Design System/settings/org-screens.jsx:255-306.
 * Asserts the screen renders the shift-patterns Section (table of real rows),
 * the monthly calendar grid, the working/weekend/holiday legend, and that it
 * composes the shared `.sg-*` primitive structure — all from real-data-shaped
 * loader props (ShiftPatternRow / CalendarDayRow), no mocks.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import type { CalendarDayRow, ShiftPatternRow } from './_actions/shifts';
import ShiftsScreen, { type ShiftsScreenLabels } from './shifts-screen.client';

const labels: ShiftsScreenLabels = {
  title: 'Shifts & calendar',
  subtitle: 'Work patterns, non-production days, and shift assignments.',
  newShift: '+ New shift',
  patternsTitle: 'Shift patterns',
  patternsSubtitle: 'Recurring work patterns used to schedule production.',
  emptyPatterns: 'No shift patterns are configured yet.',
  calendarTitle: 'Calendar',
  calendarSubtitle: 'Days on which production is paused.',
  legendWorking: 'Working day',
  legendWeekend: 'Weekend',
  legendHoliday: 'Public holiday',
  columns: {
    name: 'Name',
    time: 'Time',
    days: 'Days',
    site: 'Site',
    line: 'Line',
    status: 'Status',
  },
  statusActive: 'Active',
  weekdayShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  dialogTitle: 'New shift',
  fieldName: 'Name',
  fieldStart: 'Start',
  fieldEnd: 'End',
  fieldDays: 'Days',
  fieldSite: 'Site',
  fieldLine: 'Line',
  allSites: 'All sites',
  noLine: 'No line',
  cancel: 'Cancel',
  save: 'Save',
  saving: 'Saving...',
  createFailed: 'Shift could not be created.',
  actionsColumn: 'Actions',
  editShift: 'Edit',
  deleteShift: 'Delete',
  editDialogTitle: 'Edit shift',
  deleteConfirmTitle: 'Delete shift',
  deleteConfirmBody: 'This shift pattern will be removed from scheduling. Continue?',
  deleteConfirm: 'Delete',
  deleting: 'Deleting...',
  updateFailed: 'Shift could not be updated.',
  deleteFailed: 'Shift could not be deleted.',
};

// Real loader-shaped rows (the shape getShiftPatterns/getCalendarData return).
const shiftPatterns: ShiftPatternRow[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Morning',
    start_time: '06:00:00',
    end_time: '14:00:00',
    days_of_week: ['mon', 'tue', 'wed', 'thu', 'fri'],
    site_id: null,
    site_name: null,
    line_id: 'L1',
    line_label: 'L1 - Bottling line',
    org_id: '99999999-9999-9999-9999-999999999999',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Night',
    start_time: '22:00:00',
    end_time: '06:00:00',
    days_of_week: ['sat', 'sun'],
    site_id: null,
    site_name: null,
    line_id: null,
    line_label: null,
    org_id: '99999999-9999-9999-9999-999999999999',
  },
];

// March 2026 has 31 days; 2026-03-01 is a Sunday, 2026-03-08/14/15 etc weekends.
const year = 2026;
const month = 3;
const calendarDays: CalendarDayRow[] = Array.from({ length: 31 }, (_, index): CalendarDayRow => {
  const day = index + 1;
  const date = `2026-03-${String(day).padStart(2, '0')}`;
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const isWeekend = weekday === 0 || weekday === 6;
  const isHoliday = day === 16; // arbitrary non-production day
  return {
    date,
    day,
    kind: isHoliday ? 'holiday' : isWeekend ? 'weekend' : 'working',
    reason: isHoliday ? 'Maintenance' : null,
    notes: null,
    site_id: null,
    org_id: '99999999-9999-9999-9999-999999999999',
  };
});

function renderScreen(overrides: Partial<React.ComponentProps<typeof ShiftsScreen>> = {}) {
  return render(
    <ShiftsScreen
      shiftPatterns={shiftPatterns}
      calendarDays={calendarDays}
      year={year}
      month={month}
      labels={labels}
      {...overrides}
    />,
  );
}

afterEach(() => {
  cleanup();
  refreshMock.mockReset();
});

describe('ShiftsScreen', () => {
  it('keeps the prototype-source anchor on the screen root', () => {
    const { container } = renderScreen();
    const main = container.querySelector('main[data-prototype-source]');
    expect(main).not.toBeNull();
    expect(main?.getAttribute('data-prototype-source')).toBe(
      'prototypes/design/Monopilot Design System/settings/org-screens.jsx:255-306',
    );
  });

  it('renders the page head with title, subtitle and "+ New shift" action', () => {
    const { container } = renderScreen();
    expect(container.querySelector('.sg-head')).not.toBeNull();
    expect(container.querySelector('.sg-title')?.textContent).toBe('Shifts & calendar');
    expect(screen.getByRole('button', { name: '+ New shift' })).toBeInTheDocument();
  });

  it('composes the shared .sg-* section structure', () => {
    const { container } = renderScreen();
    const sections = container.querySelectorAll('.sg-section');
    // shift-patterns section + calendar section.
    expect(sections.length).toBe(2);
    expect(container.querySelectorAll('.sg-section-head').length).toBe(2);
    expect(container.querySelectorAll('.sg-section-body').length).toBe(2);
    expect(container.querySelector('.sg-section-title')?.textContent).toBe('Shift patterns');
  });

  it('renders the shift-patterns table from real-data props', () => {
    renderScreen();
    const region = screen.getByRole('region', { name: 'Shift patterns' });
    const table = within(region).getByTestId('shifts-patterns-table');

    // Headers.
    ['Name', 'Time', 'Days', 'Site', 'Line', 'Status'].forEach((header) => {
      expect(within(table).getByText(header)).toBeInTheDocument();
    });

    // Row 1 — Morning, formatted time range + Mon-first day labels.
    const morningRow = within(table).getByText('Morning').closest('tr')!;
    expect(within(morningRow).getByText('06:00 – 14:00')).toBeInTheDocument();
    expect(within(morningRow).getByText('Mon, Tue, Wed, Thu, Fri')).toBeInTheDocument();
    expect(within(morningRow).getByText('L1 - Bottling line')).toBeInTheDocument();
    expect(within(morningRow).getByText('● Active')).toBeInTheDocument();

    // Row 2 — Night, weekend days, null site/line rendered as em-dash.
    const nightRow = within(table).getByText('Night').closest('tr')!;
    expect(within(nightRow).getByText('22:00 – 06:00')).toBeInTheDocument();
    expect(within(nightRow).getByText('Sat, Sun')).toBeInTheDocument();
    expect(within(nightRow).getAllByText('—').length).toBe(2);
  });

  it('renders an empty-state when there are no shift patterns', () => {
    renderScreen({ shiftPatterns: [] });
    expect(screen.getByTestId('shifts-patterns-empty')).toHaveTextContent(
      'No shift patterns are configured yet.',
    );
    expect(screen.queryByTestId('shifts-patterns-table')).not.toBeInTheDocument();
  });

  it('renders the monthly calendar grid with one cell per real calendar day', () => {
    renderScreen();
    const grid = screen.getByTestId('shifts-calendar-grid');

    // 7 weekday headers.
    labels.weekdayShort.forEach((weekday) => {
      expect(within(grid).getByText(weekday)).toBeInTheDocument();
    });

    // One day cell per loader row (31 for March).
    const cells = screen.getAllByTestId('shifts-calendar-day');
    expect(cells.length).toBe(calendarDays.length);

    // Kinds are reflected on the cells (working / weekend / holiday).
    const kinds = new Set(cells.map((cell) => cell.getAttribute('data-kind')));
    expect(kinds).toEqual(new Set(['working', 'weekend', 'holiday']));

    // The holiday cell (day 16) carries its reason as a tooltip.
    const holiday = cells.find((cell) => cell.getAttribute('data-kind') === 'holiday')!;
    expect(holiday).toHaveTextContent('16');
    expect(holiday.getAttribute('title')).toBe('Maintenance');
  });

  it('renders the working / weekend / holiday legend', () => {
    renderScreen();
    const legend = screen.getByTestId('shifts-calendar-legend');
    expect(within(legend).getByText('Working day')).toBeInTheDocument();
    expect(within(legend).getByText('Weekend')).toBeInTheDocument();
    expect(within(legend).getByText('Public holiday')).toBeInTheDocument();
  });

  it('disables "+ New shift" unless the user can edit', () => {
    renderScreen({ canEdit: false });
    expect(screen.getByRole('button', { name: '+ New shift' })).toBeDisabled();
    cleanup();
    renderScreen({ canEdit: true, createShiftAction: vi.fn() });
    expect(screen.getByRole('button', { name: '+ New shift' })).toBeEnabled();
  });

  it('creates a shift and refreshes the table', async () => {
    const user = userEvent.setup();
    const createShiftAction = vi.fn(async () => ({
      ok: true as const,
      data: { ...shiftPatterns[0], id: '33333333-3333-4333-8333-333333333333', name: 'Evening' },
    }));
    renderScreen({
      canEdit: true,
      sites: [{ id: '11111111-1111-4111-8111-111111111111', code: 'S1', name: 'Apex Warsaw', is_default: true }],
      lines: [{ id: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa', code: 'L1', name: 'Bottling line', site_id: '11111111-1111-4111-8111-111111111111' }],
      createShiftAction,
    });

    await user.click(screen.getByRole('button', { name: '+ New shift' }));
    const form = await screen.findByTestId('shifts-new-shift-form');
    await user.type(within(form).getByLabelText('Name'), 'Evening');
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(createShiftAction).toHaveBeenCalledTimes(1));
    expect(createShiftAction).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Evening',
      start_time: '06:00',
      end_time: '14:00',
      site_id: '11111111-1111-4111-8111-111111111111',
    }));
    expect(refreshMock).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('shifts-new-shift-form')).not.toBeInTheDocument());
  });

  it('disables per-row Edit/Delete without edit permission', () => {
    renderScreen({ canEdit: false });
    const morningId = shiftPatterns[0].id;
    expect(screen.getByTestId(`shift-edit-${morningId}`)).toBeDisabled();
    expect(screen.getByTestId(`shift-delete-${morningId}`)).toBeDisabled();
  });

  it('opens a prefilled Edit modal and calls updateShiftAction', async () => {
    const user = userEvent.setup();
    const updateShiftAction = vi.fn(async () => ({ ok: true as const, data: shiftPatterns[0] }));
    renderScreen({ canEdit: true, updateShiftAction });

    await user.click(screen.getByTestId(`shift-edit-${shiftPatterns[0].id}`));
    const form = await screen.findByTestId('shifts-new-shift-form');
    expect(screen.getByText('Edit shift')).toBeInTheDocument();
    // Name field is prefilled from the existing row.
    expect(within(form).getByLabelText('Name')).toHaveValue('Morning');

    await user.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateShiftAction).toHaveBeenCalledTimes(1));
    expect(updateShiftAction).toHaveBeenCalledWith(expect.objectContaining({
      id: shiftPatterns[0].id,
      name: 'Morning',
      start_time: '06:00',
      end_time: '14:00',
    }));
    expect(refreshMock).toHaveBeenCalled();
  });

  it('confirms a row Delete and calls deleteShiftAction', async () => {
    const user = userEvent.setup();
    const deleteShiftAction = vi.fn(async () => ({ ok: true as const, id: shiftPatterns[1].id }));
    renderScreen({ canEdit: true, deleteShiftAction });

    await user.click(screen.getByTestId(`shift-delete-${shiftPatterns[1].id}`));
    const dialog = await screen.findByTestId('shifts-delete-dialog');
    expect(within(dialog).getByText('Night')).toBeInTheDocument();

    await user.click(screen.getByTestId('shifts-delete-confirm'));

    await waitFor(() => expect(deleteShiftAction).toHaveBeenCalledWith({ id: shiftPatterns[1].id }));
    expect(refreshMock).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('shifts-delete-dialog')).not.toBeInTheDocument());
  });

  it('surfaces a delete error and keeps the confirm dialog open', async () => {
    const user = userEvent.setup();
    const deleteShiftAction = vi.fn(async () => ({ ok: false as const, error: 'persistence_failed' as const }));
    renderScreen({ canEdit: true, deleteShiftAction });

    await user.click(screen.getByTestId(`shift-delete-${shiftPatterns[0].id}`));
    await user.click(screen.getByTestId('shifts-delete-confirm'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Shift could not be deleted.'));
    expect(screen.getByTestId('shifts-delete-dialog')).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

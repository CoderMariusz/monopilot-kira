/**
 * @vitest-environment jsdom
 * WAVE E5 — /yard/appointments RTL tests (jsdom, vitest.ui.config.ts).
 *
 * Exercises the day/week list against injected seams: list render, empty state,
 * the Book-appointment dialog submitting a valid payload, and the inline
 * overlap-rejection error (bookAppointment THROWS 'overlap' server-side).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppointmentsView, type AppointmentsLabels } from '../_components/appointments-view.client';
import type { AppointmentRow, DockDoorRow } from '../_components/yard-shared';

const LABELS: AppointmentsLabels = {
  loading: 'Loading appointments…',
  denied: 'You do not have permission to view appointments.',
  error: 'Unable to load appointments.',
  empty: 'No appointments in this window.',
  book: 'Book appointment',
  viewDay: 'Day',
  viewWeek: 'Week',
  previous: 'Previous',
  next: 'Next',
  today: 'Today',
  columns: {
    time: 'Time',
    dockDoor: 'Dock door',
    carrier: 'Carrier',
    direction: 'Direction',
    reference: 'Reference',
    duration: 'Duration',
    status: 'Status',
  },
  noCarrier: 'No carrier',
  minutes: (count: number) => `${count} min`,
  directionLabel: (d) => (d === 'inbound' ? 'Inbound' : 'Outbound'),
  statusLabel: (s) => s,
  modal: {
    title: 'Book appointment',
    dockDoorLabel: 'Dock door',
    carrierLabel: 'Carrier',
    noCarrier: 'No carrier',
    directionLabel: 'Direction',
    referenceLabel: 'Reference (optional)',
    scheduledAtLabel: 'Date & time',
    durationLabel: 'Duration (minutes)',
    submit: 'Book',
    submitting: 'Booking…',
    cancel: 'Cancel',
    directionOption: (d) => (d === 'inbound' ? 'Inbound' : 'Outbound'),
    errors: {
      dockDoorRequired: 'Select a dock door.',
      scheduledAtRequired: 'Pick a date and time.',
      durationInvalid: 'Duration must be a positive number of minutes.',
      invalid_input: 'Invalid input.',
      forbidden: 'You do not have permission to book appointments.',
      not_found: 'Dock door or carrier not found.',
      overlap: 'This slot overlaps an existing appointment on that dock door.',
      already_exists: 'This appointment already exists.',
      invalid_status: 'That status change is not allowed.',
      persistence_failed: 'Booking failed. Try again.',
    },
  },
};

const DOCK: DockDoorRow = {
  id: 'd-1',
  siteId: null,
  warehouseId: null,
  code: 'DOCK-1',
  name: 'North bay',
  direction: 'inbound',
  isActive: true,
};

const APPT: AppointmentRow = {
  id: 'a-1',
  siteId: null,
  dockDoorId: 'd-1',
  dockDoorCode: 'DOCK-1',
  carrierId: 'c-1',
  carrierName: 'DHL Freight',
  direction: 'inbound',
  reference: 'PO-1001',
  scheduledAt: '2026-06-24T09:00:00.000Z',
  durationMin: 30,
  status: 'scheduled',
  notes: null,
};

function renderView(over: Partial<React.ComponentProps<typeof AppointmentsView>> = {}) {
  return render(
    <AppointmentsView
      labels={LABELS}
      dockDoors={[DOCK]}
      carriers={[{ id: 'c-1', code: 'DHL', name: 'DHL Freight' }]}
      listAppointmentsAction={vi.fn(async () => [APPT])}
      bookAppointmentAction={vi.fn(async () => APPT)}
      initialDate="2026-06-24"
      {...over}
    />,
  );
}

describe('/yard/appointments — AppointmentsView', () => {
  it('lists appointments in the window', async () => {
    renderView();
    await waitFor(() => expect(screen.getByTestId('appointments-table')).toBeInTheDocument());
    const row = screen.getByTestId('appointment-row-a-1');
    expect(row).toHaveTextContent('DOCK-1');
    expect(row).toHaveTextContent('DHL Freight');
    expect(row).toHaveTextContent('Inbound');
    expect(row).toHaveTextContent('30 min');
  });

  it('shows the empty state for an empty window', async () => {
    renderView({ listAppointmentsAction: vi.fn(async () => []) });
    await waitFor(() => expect(screen.getByTestId('appointments-empty')).toBeInTheDocument());
  });

  it('books an appointment with a valid payload', async () => {
    const bookAppointmentAction = vi.fn(async () => APPT);
    renderView({ bookAppointmentAction });
    await waitFor(() => expect(screen.getByTestId('appointments-table')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('appointments-book'));
    await waitFor(() => expect(screen.getByTestId('book-appointment-form')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('book-scheduled-at'), { target: { value: '2026-06-25T11:30' } });
    fireEvent.change(screen.getByTestId('book-duration'), { target: { value: '45' } });
    fireEvent.change(screen.getByTestId('book-reference'), { target: { value: 'PO-2002' } });
    fireEvent.click(screen.getByTestId('book-submit'));

    await waitFor(() =>
      expect(bookAppointmentAction).toHaveBeenCalledWith(
        expect.objectContaining({
          dockDoorId: 'd-1',
          direction: 'inbound',
          durationMin: 45,
          reference: 'PO-2002',
        }),
      ),
    );
  });

  it('surfaces the overlap rejection inline when bookAppointment throws overlap', async () => {
    const bookAppointmentAction = vi.fn(async () => {
      throw new Error('dock appointment overlaps an existing non-cancelled appointment');
    });
    renderView({ bookAppointmentAction });
    await waitFor(() => expect(screen.getByTestId('appointments-table')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('appointments-book'));
    await waitFor(() => expect(screen.getByTestId('book-appointment-form')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('book-scheduled-at'), { target: { value: '2026-06-25T11:30' } });
    fireEvent.click(screen.getByTestId('book-submit'));

    await waitFor(() => expect(screen.getByTestId('book-appointment-error')).toBeInTheDocument());
    expect(screen.getByTestId('book-appointment-error')).toHaveTextContent(
      'This slot overlaps an existing appointment on that dock door.',
    );
  });

  it('maps a forbidden list rejection to the permission-denied note', async () => {
    renderView({
      listAppointmentsAction: vi.fn(async () => {
        throw new Error('forbidden');
      }),
    });
    await waitFor(() => expect(screen.getByTestId('appointments-denied')).toBeInTheDocument());
  });

  it('switches between day and week mode and re-queries', async () => {
    const listAppointmentsAction = vi.fn(async () => [APPT]);
    renderView({ listAppointmentsAction });
    await waitFor(() => expect(screen.getByTestId('appointments-table')).toBeInTheDocument());

    const callsBefore = listAppointmentsAction.mock.calls.length;
    fireEvent.click(screen.getByTestId('appointments-mode-week'));
    await waitFor(() => expect(listAppointmentsAction.mock.calls.length).toBeGreaterThan(callsBefore));
    // Week window spans 7 days.
    const lastWindow = listAppointmentsAction.mock.calls.at(-1)?.[0] as { from: string; to: string };
    const spanDays = (new Date(lastWindow.to).getTime() - new Date(lastWindow.from).getTime()) / 86_400_000;
    expect(spanDays).toBe(7);
  });

  it('keeps the within-modal Cancel closing the dialog without booking', async () => {
    const bookAppointmentAction = vi.fn();
    renderView({ bookAppointmentAction });
    await waitFor(() => expect(screen.getByTestId('appointments-table')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('appointments-book'));
    await waitFor(() => expect(screen.getByTestId('book-appointment-form')).toBeInTheDocument());
    fireEvent.click(within(screen.getByTestId('book-appointment-form').closest('[role="dialog"]') ?? document.body).getByTestId('book-cancel'));
    await waitFor(() => expect(screen.queryByTestId('book-appointment-form')).toBeNull());
    expect(bookAppointmentAction).not.toHaveBeenCalled();
  });
});

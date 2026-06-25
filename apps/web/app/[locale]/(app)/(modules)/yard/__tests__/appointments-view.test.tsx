/**
 * @vitest-environment jsdom
 * WAVE E5 — /yard/appointments RTL tests (jsdom, vitest.ui.config.ts).
 *
 * Exercises the day/week list against injected seams: list render, empty state,
 * the Book-appointment dialog submitting a valid payload, and the inline
 * overlap-rejection error (bookAppointment THROWS 'overlap' server-side).
 */
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The view now builds its labels client-side via useTranslations('Yard'); mock
// next-intl with a translator backed by the real Yard namespace so the rendered
// strings stay the real i18n values (no server→client function-prop boundary).
vi.mock('next-intl', () => {
  const tree = JSON.parse(
    readFileSync(path.resolve(process.cwd(), 'i18n', 'en.json'), 'utf8'),
  ) as Record<string, unknown>;
  function translatorFor(namespace?: string) {
    const root = namespace
      ? (namespace.split('.').reduce<unknown>((n, k) => (n as Record<string, unknown>)?.[k], tree))
      : tree;
    return (key: string, values?: Record<string, string | number>) => {
      const raw = key.split('.').reduce<unknown>((n, k) => (n as Record<string, unknown>)?.[k], root);
      if (typeof raw !== 'string') return `${namespace ?? ''}.${key}`;
      return values ? raw.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`)) : raw;
    };
  }
  return { useTranslations: (namespace?: string) => translatorFor(namespace) };
});

import { AppointmentsView } from '../_components/appointments-view.client';
import type { AppointmentRow, DockDoorRow } from '../_components/yard-shared';

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

  it('honest-disables Book appointment when no dock doors exist', async () => {
    renderView({ dockDoors: [], listAppointmentsAction: vi.fn(async () => []) });
    await waitFor(() => expect(screen.getByTestId('appointments-empty')).toBeInTheDocument());

    const bookButton = screen.getByTestId('appointments-book');
    expect(bookButton).toBeDisabled();
    expect(bookButton).toHaveAttribute('title', 'Add a dock door first to book appointments.');

    fireEvent.click(bookButton);
    expect(screen.queryByTestId('book-appointment-form')).toBeNull();
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

/**
 * @vitest-environment jsdom
 * WAVE E5 — /yard board RTL tests (jsdom, vitest.ui.config.ts).
 *
 * The async RSC page composes labels server-side + injects the yard Server
 * Actions; here we exercise the client board against injected seams:
 *   - parity checklist: appointments grouped by dock door + on-site visits panel
 *     + a Gate-in control render in the same regions the spec calls for;
 *   - states: loading / empty / error / permission-denied;
 *   - functional: gate-out calls the action; the weigh modal shows a live net;
 *   - i18n: the Yard namespace keys this screen uses resolve in all 4 locales.
 */
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The board now builds its labels client-side via useTranslations('Yard'); mock
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

import { YardBoard } from '../_components/yard-board.client';
import type { AppointmentRow, YardVisitRow } from '../_components/yard-shared';

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

const VISIT: YardVisitRow = {
  id: 'v-1',
  siteId: null,
  appointmentId: 'a-1',
  appointmentReference: 'PO-1001',
  dockDoorCode: 'DOCK-1',
  carrierId: 'c-1',
  carrierName: 'DHL Freight',
  vehicleReg: 'WX 12345',
  trailerRef: 'TR-9',
  driverName: 'Jan Kowalski',
  gateInAt: '2026-06-24T08:50:00.000Z',
  gateOutAt: null,
  status: 'on_site',
};

function renderBoard(over: Partial<React.ComponentProps<typeof YardBoard>> = {}) {
  return render(
    <YardBoard
      listAppointmentsTodayAction={vi.fn(async () => [APPT])}
      listYardVisitsAction={vi.fn(async () => [VISIT])}
      gateInAction={vi.fn(async () => VISIT)}
      gateOutAction={vi.fn(async () => ({ ...VISIT, status: 'departed' as const, gateOutAt: '2026-06-24T10:00:00.000Z' }))}
      recordWeighingAction={vi.fn(async () => ({
        id: 'w-1',
        yardVisitId: 'v-1',
        grossKg: 12000,
        tareKg: 4000,
        netKg: 8000,
        weighedAt: '2026-06-24T10:05:00.000Z',
        weighedBy: 'u-1',
      }))}
      carriers={[{ id: 'c-1', code: 'DHL', name: 'DHL Freight' }]}
      {...over}
    />,
  );
}

describe('/yard — YardBoard parity + states', () => {
  it('renders appointments grouped by dock door and the on-site visits panel from the mocked loaders', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByTestId('yard-appointments')).toBeInTheDocument());

    // Appointment region, grouped under its dock door, with status chip.
    const dock = screen.getByTestId('yard-dock-DOCK-1');
    expect(dock).toHaveTextContent('DOCK-1');
    const appt = within(dock).getByTestId('yard-appointment-a-1');
    expect(appt).toHaveTextContent('Inbound');
    expect(appt).toHaveTextContent('DHL Freight');
    expect(appt).toHaveTextContent('PO-1001');
    expect(within(dock).getByTestId('yard-appointment-status-a-1')).toBeInTheDocument();

    // On-site visit panel with Gate out + Weigh affordances.
    const visit = screen.getByTestId('yard-visit-v-1');
    expect(visit).toHaveTextContent('WX 12345');
    expect(within(visit).getByTestId('yard-gate-out-v-1')).toBeInTheDocument();
    expect(within(visit).getByTestId('yard-weigh-v-1')).toBeInTheDocument();

    // Gate-in control is present.
    expect(screen.getByTestId('yard-gate-in')).toBeInTheDocument();
  });

  it('shows the honest empty states for appointments and on-site vehicles', async () => {
    renderBoard({
      listAppointmentsTodayAction: vi.fn(async () => []),
      listYardVisitsAction: vi.fn(async () => []),
    });
    await waitFor(() => expect(screen.getByTestId('yard-appointments-empty')).toBeInTheDocument());
    expect(screen.getByTestId('yard-onsite-empty')).toBeInTheDocument();
  });

  it('maps a forbidden loader rejection to the permission-denied note', async () => {
    renderBoard({
      listAppointmentsTodayAction: vi.fn(async () => {
        throw new Error('forbidden');
      }),
    });
    await waitFor(() => expect(screen.getByTestId('yard-board-denied')).toBeInTheDocument());
    expect(screen.queryByTestId('yard-appointments')).toBeNull();
  });

  it('maps any other loader failure to the error state without a 500', async () => {
    renderBoard({
      listYardVisitsAction: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    await waitFor(() => expect(screen.getByTestId('yard-board-error')).toBeInTheDocument());
  });

  it('calls gateOut for the selected visit and reloads', async () => {
    const gateOutAction = vi.fn(async () => ({ ...VISIT, status: 'departed' as const, gateOutAt: '2026-06-24T10:00:00.000Z' }));
    const listYardVisitsAction = vi
      .fn()
      .mockResolvedValueOnce([VISIT])
      .mockResolvedValueOnce([]);
    renderBoard({ gateOutAction, listYardVisitsAction });

    await waitFor(() => expect(screen.getByTestId('yard-visit-v-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('yard-gate-out-v-1'));

    await waitFor(() => expect(gateOutAction).toHaveBeenCalledWith('v-1'));
    // After reload the visit is gone (departed) → empty on-site panel.
    await waitFor(() => expect(screen.getByTestId('yard-onsite-empty')).toBeInTheDocument());
  });

  it('computes a live net in the weigh modal and submits gross/tare to recordWeighing', async () => {
    const recordWeighingAction = vi.fn(async () => ({
      id: 'w-1',
      yardVisitId: 'v-1',
      grossKg: 12000,
      tareKg: 4000,
      netKg: 8000,
      weighedAt: '2026-06-24T10:05:00.000Z',
      weighedBy: 'u-1',
    }));
    renderBoard({ recordWeighingAction });

    await waitFor(() => expect(screen.getByTestId('yard-visit-v-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('yard-weigh-v-1'));
    await waitFor(() => expect(screen.getByTestId('yard-weigh-form')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('yard-weigh-gross'), { target: { value: '12000' } });
    fireEvent.change(screen.getByTestId('yard-weigh-tare'), { target: { value: '4000' } });
    expect(screen.getByTestId('yard-weigh-net')).toHaveTextContent('8000.000');

    fireEvent.click(screen.getByTestId('yard-weigh-submit'));
    await waitFor(() =>
      expect(recordWeighingAction).toHaveBeenCalledWith({ yardVisitId: 'v-1', grossKg: 12000, tareKg: 4000 }),
    );
  });

  it('blocks the manual gate-in submit until a vehicle registration is entered', async () => {
    const gateInAction = vi.fn(async () => VISIT);
    renderBoard({ gateInAction });

    await waitFor(() => expect(screen.getByTestId('yard-gate-in')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('yard-gate-in'));
    await waitFor(() => expect(screen.getByTestId('yard-gate-in-form')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('yard-gate-in-submit'));
    await waitFor(() => expect(screen.getByTestId('yard-gate-in-error')).toBeInTheDocument());
    expect(gateInAction).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('yard-vehicle-reg'), { target: { value: 'WX 99999' } });
    fireEvent.click(screen.getByTestId('yard-gate-in-submit'));
    await waitFor(() =>
      expect(gateInAction).toHaveBeenCalledWith(
        expect.objectContaining({ vehicleReg: 'WX 99999' }),
      ),
    );
  });
});

describe('/yard — i18n completeness', () => {
  const locales = ['en', 'pl', 'ro', 'uk'] as const;
  const keys = [
    'Yard.board.title',
    'Yard.board.appointmentsTitle',
    'Yard.board.onSiteTitle',
    'Yard.board.gateIn',
    'Yard.board.minutes',
    'Yard.direction.inbound',
    'Yard.appointmentStatus.scheduled',
    'Yard.weighbridge.netLabel',
    'Navigation.settings.items.docks',
  ];

  function read(root: Record<string, unknown>, dotted: string): unknown {
    return dotted.split('.').reduce<unknown>((node, k) => {
      if (node && typeof node === 'object' && k in (node as Record<string, unknown>)) {
        return (node as Record<string, unknown>)[k];
      }
      return undefined;
    }, root);
  }

  it.each(locales)('resolves every yard key referenced by the board in %s.json', (locale) => {
    const file = path.resolve(process.cwd(), 'i18n', `${locale}.json`);
    const tree = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    for (const key of keys) {
      const value = read(tree, key);
      expect(typeof value, `${key} must resolve in ${locale}.json`).toBe('string');
      expect((value as string).trim()).not.toBe('');
    }
  });
});

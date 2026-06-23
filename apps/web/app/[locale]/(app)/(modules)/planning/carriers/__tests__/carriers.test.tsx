/**
 * WAVE E9 — /planning/carriers screen RTL tests (jsdom, vitest.ui.config.ts).
 *
 * The async RSC page composes labels server-side + injects the freight Server
 * Actions; here we exercise the client view against injected seams: list states
 * (loading/empty/error/denied/table), the carrier add/edit dialog (validation +
 * upsert payload + saves), and the per-carrier transport-lanes panel (list +
 * lane add dialog saves).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CarriersView, type CarriersLabels } from '../_components/carriers-view';
import type { CarrierRow, TransportLaneRow } from '../../_actions/freight-actions';

const LABELS: CarriersLabels = {
  title: 'Carriers',
  addCarrier: '+ Add carrier',
  editCarrier: 'Edit carrier',
  loading: 'Loading…',
  denied: "You don't have permission to view carriers.",
  error: 'Failed to load carriers.',
  empty: 'No carriers configured',
  emptyHint: 'Add a carrier to manage its transport lanes.',
  active: 'Active',
  inactive: 'Inactive',
  manageLanes: 'Lanes',
  noContact: 'No contact',
  modes: { road: 'Road', sea: 'Sea', air: 'Air', rail: 'Rail', parcel: 'Parcel' },
  costBases: { per_shipment: 'per shipment', per_kg: 'per kg', per_km: 'per km', per_pallet: 'per pallet' },
  columns: { code: 'Code', name: 'Name', mode: 'Mode', contact: 'Contact', status: 'Status', actions: 'Actions' },
  carrierModal: {
    titleAdd: 'Add carrier',
    titleEdit: 'Edit carrier',
    codeLabel: 'Code',
    nameLabel: 'Name',
    modeLabel: 'Default mode',
    emailLabel: 'Contact email',
    phoneLabel: 'Contact phone',
    activeLabel: 'Active',
    submit: 'Save',
    submitting: 'Saving…',
    cancel: 'Cancel',
    edit: 'Edit',
    errors: {
      codeRequired: 'Code is required.',
      nameRequired: 'Name is required.',
      emailInvalid: 'Enter a valid email address.',
      invalid_input: 'Invalid input.',
      forbidden: "You don't have permission to edit carriers.",
      not_found: 'Carrier not found.',
      already_exists: 'A carrier with this code already exists.',
      persistence_failed: 'Saving failed. Try again.',
    },
  },
  lanes: {
    title: 'Transport lanes',
    addLane: '+ Add lane',
    empty: 'No transport lanes for this carrier yet.',
    days: 'days',
    columns: { route: 'Route', mode: 'Mode', cost: 'Cost', transit: 'Transit', status: 'Status', actions: 'Actions' },
    edit: 'Edit',
    modal: {
      titleAdd: 'Add transport lane',
      titleEdit: 'Edit transport lane',
      originLabel: 'Origin',
      destinationLabel: 'Destination',
      modeLabel: 'Mode',
      costBasisLabel: 'Cost basis',
      costAmountLabel: 'Cost amount',
      currencyLabel: 'Currency',
      transitDaysLabel: 'Transit days (optional)',
      activeLabel: 'Active',
      submit: 'Save',
      submitting: 'Saving…',
      cancel: 'Cancel',
      errors: {
        originRequired: 'Origin is required.',
        destinationRequired: 'Destination is required.',
        costInvalid: 'Cost must be a non-negative number (up to 4 decimals).',
        invalid_input: 'Invalid input.',
        forbidden: "You don't have permission to edit transport lanes.",
        not_found: 'Carrier or lane not found.',
        already_exists: 'This transport lane already exists.',
        persistence_failed: 'Saving failed. Try again.',
      },
    },
  },
};

const CARRIER: CarrierRow = {
  id: 'c-1',
  code: 'DHL',
  name: 'DHL Freight',
  mode: 'road',
  contactEmail: 'ops@dhl.test',
  contactPhone: '+48 22 000 00 00',
  isActive: true,
};

const LANE: TransportLaneRow = {
  id: 'l-1',
  carrierId: 'c-1',
  carrierName: 'DHL Freight',
  origin: 'Warsaw',
  destination: 'Berlin',
  mode: 'road',
  costBasis: 'per_shipment',
  costAmount: '450.0000',
  currency: 'EUR',
  transitDays: 2,
  isActive: true,
};

function renderView(over: Partial<React.ComponentProps<typeof CarriersView>> = {}) {
  return render(
    <CarriersView
      labels={LABELS}
      listCarriersAction={vi.fn(async () => [CARRIER])}
      upsertCarrierAction={vi.fn(async () => ({ ok: true as const, data: CARRIER }))}
      listLanesAction={vi.fn(async () => [LANE])}
      upsertLaneAction={vi.fn(async () => ({ ok: true as const, data: LANE }))}
      {...over}
    />,
  );
}

describe('/planning/carriers — CarriersView', () => {
  it('lists carriers with mode + active status', async () => {
    renderView();
    await waitFor(() => expect(screen.getByTestId('carriers-table')).toBeInTheDocument());
    const row = screen.getByTestId('carrier-row-DHL');
    expect(row).toHaveTextContent('DHL');
    expect(row).toHaveTextContent('DHL Freight');
    expect(row).toHaveTextContent('Road');
    expect(row).toHaveTextContent('Active');
  });

  it('shows the honest empty state', async () => {
    renderView({ listCarriersAction: vi.fn(async () => []) });
    await waitFor(() => expect(screen.getByTestId('carriers-empty')).toBeInTheDocument());
    expect(screen.getByTestId('carriers-empty')).toHaveTextContent('No carriers configured');
  });

  it('surfaces permission-denied when the list seam rejects with forbidden', async () => {
    renderView({
      listCarriersAction: vi.fn(async () => {
        throw new Error('forbidden');
      }),
    });
    await waitFor(() => expect(screen.getByTestId('carriers-denied')).toBeInTheDocument());
    expect(screen.queryByTestId('carriers-table')).toBeNull();
  });

  it('surfaces the error state without a 500', async () => {
    renderView({
      listCarriersAction: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    await waitFor(() => expect(screen.getByTestId('carriers-error')).toBeInTheDocument());
  });

  it('requires code + name before submitting the add dialog', async () => {
    const upsertCarrierAction = vi.fn();
    renderView({ upsertCarrierAction });
    await waitFor(() => expect(screen.getByTestId('carriers-table')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('carriers-add'));
    await waitFor(() => expect(screen.getByTestId('carrier-form')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('carrier-submit'));
    await waitFor(() => expect(screen.getByTestId('carrier-form-error')).toBeInTheDocument());
    expect(screen.getByTestId('carrier-form-error')).toHaveTextContent('Code is required.');
    expect(upsertCarrierAction).not.toHaveBeenCalled();
  });

  it('saves a new carrier with the upsert payload and reloads the list', async () => {
    const upsertCarrierAction = vi.fn(async () => ({ ok: true as const, data: CARRIER }));
    const listCarriersAction = vi.fn(async () => [CARRIER]);
    renderView({ upsertCarrierAction, listCarriersAction });
    await waitFor(() => expect(screen.getByTestId('carriers-table')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('carriers-add'));
    await waitFor(() => expect(screen.getByTestId('carrier-form')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('carrier-code'), { target: { value: 'UPS' } });
    fireEvent.change(screen.getByTestId('carrier-name'), { target: { value: 'UPS Road' } });
    fireEvent.change(screen.getByTestId('carrier-email'), { target: { value: 'eu@ups.test' } });
    fireEvent.click(screen.getByTestId('carrier-submit'));

    await waitFor(() =>
      expect(upsertCarrierAction).toHaveBeenCalledWith({
        id: undefined,
        code: 'UPS',
        name: 'UPS Road',
        mode: 'road',
        contactEmail: 'eu@ups.test',
        contactPhone: undefined,
        isActive: true,
      }),
    );
    await waitFor(() => expect(screen.queryByTestId('carrier-form')).toBeNull());
    expect(listCarriersAction).toHaveBeenCalledTimes(2);
  });

  it('maps a forbidden upsert to the inline dialog error', async () => {
    const upsertCarrierAction = vi.fn(async () => ({ ok: false as const, error: 'forbidden' as const }));
    renderView({ upsertCarrierAction });
    await waitFor(() => expect(screen.getByTestId('carriers-table')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('carrier-edit-DHL'));
    await waitFor(() => expect(screen.getByTestId('carrier-form')).toBeInTheDocument());
    // Prefilled from the row.
    expect(screen.getByTestId('carrier-code')).toHaveValue('DHL');
    fireEvent.click(screen.getByTestId('carrier-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('carrier-form-error')).toHaveTextContent(
        "You don't have permission to edit carriers.",
      ),
    );
  });

  it('opens the per-carrier lanes panel and saves a new lane', async () => {
    const upsertLaneAction = vi.fn(async () => ({ ok: true as const, data: LANE }));
    const listLanesAction = vi.fn(async () => [LANE]);
    renderView({ upsertLaneAction, listLanesAction });
    await waitFor(() => expect(screen.getByTestId('carriers-table')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('carrier-lanes-DHL'));
    await waitFor(() => expect(screen.getByTestId('lanes-panel-DHL')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('lanes-table')).toBeInTheDocument());
    expect(screen.getByTestId('lane-row-l-1')).toHaveTextContent('Warsaw');
    expect(screen.getByTestId('lane-row-l-1')).toHaveTextContent('Berlin');

    fireEvent.click(screen.getByTestId('lanes-add'));
    await waitFor(() => expect(screen.getByTestId('lane-form')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('lane-origin'), { target: { value: 'Gdansk' } });
    fireEvent.change(screen.getByTestId('lane-destination'), { target: { value: 'Hamburg' } });
    fireEvent.change(screen.getByTestId('lane-cost-amount'), { target: { value: '300.50' } });
    fireEvent.change(screen.getByTestId('lane-transit-days'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('lane-submit'));

    await waitFor(() =>
      expect(upsertLaneAction).toHaveBeenCalledWith({
        id: undefined,
        carrierId: 'c-1',
        origin: 'Gdansk',
        destination: 'Hamburg',
        mode: 'road',
        costBasis: 'per_shipment',
        costAmount: '300.50',
        currency: 'EUR',
        transitDays: 3,
        isActive: true,
      }),
    );
    // listLanes called on panel mount + after save.
    await waitFor(() => expect(listLanesAction).toHaveBeenCalledTimes(2));
  });

  it('rejects a malformed lane cost client-side before calling the action', async () => {
    const upsertLaneAction = vi.fn();
    renderView({ upsertLaneAction });
    await waitFor(() => expect(screen.getByTestId('carriers-table')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('carrier-lanes-DHL'));
    await waitFor(() => expect(screen.getByTestId('lanes-add')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('lanes-add'));
    await waitFor(() => expect(screen.getByTestId('lane-form')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('lane-origin'), { target: { value: 'A' } });
    fireEvent.change(screen.getByTestId('lane-destination'), { target: { value: 'B' } });
    fireEvent.change(screen.getByTestId('lane-cost-amount'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByTestId('lane-submit'));

    await waitFor(() => expect(screen.getByTestId('lane-form-error')).toBeInTheDocument());
    expect(upsertLaneAction).not.toHaveBeenCalled();
  });
});

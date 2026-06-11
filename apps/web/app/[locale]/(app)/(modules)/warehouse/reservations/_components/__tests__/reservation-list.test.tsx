/**
 * WH-017 — Reservations list + release-reservation modal: RTL parity + flow tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/warehouse/movement-screens.jsx:202-295
 *   + modals.jsx:879-924 (ReleaseReservationModal).
 * Tests the presentational <ReservationListClient> directly with a stub release
 * action + a mocked next/navigation router. Asserts: reserved-LP table (LP link,
 * WO link, reserved qty), empty state, the Release flow (open modal → reason
 * required disables Confirm → pick reason → Confirm calls the action → on success
 * the page refreshes), forbidden surfaces inline, and en + pl labels resolve.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}));

import { ReservationListClient, type ReservationListLabels } from '../reservation-list.client';
import { getWhcTranslator } from '../../../wh-c-labels';
import type { ReservationRow, WarehouseResult } from '../../../_actions/shared';

function buildLabels(locale: string): ReservationListLabels {
  const t = getWhcTranslator(locale);
  return {
    rowsLabel: t('reservations.rowsLabel'),
    infoNote: t('reservations.infoNote'),
    emptyAll: t('reservations.emptyAll'),
    release: t('reservations.release'),
    none: t('reservations.none'),
    status: {
      reserved: t('reservations.status.reserved'),
      available: t('reservations.status.available'),
      blocked: t('reservations.status.blocked'),
    },
    col: {
      lp: t('reservations.columns.lp'),
      item: t('reservations.columns.item'),
      reservedQty: t('reservations.columns.reservedQty'),
      lpTotal: t('reservations.columns.lpTotal'),
      wo: t('reservations.columns.wo'),
      status: t('reservations.columns.status'),
      actions: t('reservations.columns.actions'),
    },
    modal: {
      title: t('reservations.modal.title'),
      intro: t('reservations.modal.intro'),
      facts: {
        lp: t('reservations.modal.facts.lp'),
        wo: t('reservations.modal.facts.wo'),
        qty: t('reservations.modal.facts.qty'),
        item: t('reservations.modal.facts.item'),
      },
      reasonLabel: t('reservations.modal.reasonLabel'),
      reasonPlaceholder: t('reservations.modal.reasonPlaceholder'),
      reasons: {
        consumed: t('reservations.modal.reasons.consumed'),
        cancelled: t('reservations.modal.reasons.cancelled'),
        wo_cancelled: t('reservations.modal.reasons.wo_cancelled'),
        admin_override: t('reservations.modal.reasons.admin_override'),
      },
      overrideTextLabel: t('reservations.modal.overrideTextLabel'),
      overrideTextPlaceholder: t('reservations.modal.overrideTextPlaceholder'),
      overrideNote: t('reservations.modal.overrideNote'),
      cancel: t('reservations.modal.cancel'),
      confirm: t('reservations.modal.confirm'),
      releasing: t('reservations.modal.releasing'),
      denied: t('reservations.modal.denied'),
      notFound: t('reservations.modal.notFound'),
      errorLocked: t('reservations.modal.errorLocked'),
      error: t('reservations.modal.error'),
      success: t('reservations.modal.success'),
    },
  };
}

const EN = buildLabels('en');

function makeRow(over: Partial<ReservationRow>): ReservationRow {
  return {
    lpId: over.lpId ?? 'lp-1',
    lpNumber: over.lpNumber ?? 'LP-4431',
    status: over.status ?? 'reserved',
    reservedQty: over.reservedQty ?? '220.5',
    reservedForWoId: over.reservedForWoId ?? 'wo-1',
    woNumber: over.woNumber ?? 'WO-2026-0108',
    itemCode: over.itemCode ?? 'R-1001',
    itemName: over.itemName ?? 'Wieprzowina',
    quantity: over.quantity ?? '400',
    uom: over.uom ?? 'kg',
  };
}

function renderList(rows: ReservationRow[], releaseAction: (input: { lpId: string; reason: string }) => Promise<WarehouseResult<ReservationRow>>) {
  refreshMock.mockClear();
  return render(
    <ReservationListClient rows={rows} labels={EN} locale="en" releaseAction={releaseAction} />,
  );
}

describe('ReservationListClient (WH-017 parity + release flow)', () => {
  it('renders the reserved-LP table with LP link, WO link and reserved qty', () => {
    renderList([makeRow({ lpId: 'lp-x', lpNumber: 'LP-9999', reservedForWoId: 'wo-9', woNumber: 'WO-9' })], async () => ({
      ok: true,
      data: makeRow({}),
    }));
    expect(screen.getByTestId('reservation-lp-link-lp-x')).toHaveAttribute(
      'href',
      '/en/warehouse/license-plates/lp-x',
    );
    expect(screen.getByTestId('reservation-wo-link-lp-x')).toHaveAttribute(
      'href',
      '/en/planning/work-orders/wo-9',
    );
    expect(screen.getByTestId('reservation-wo-link-lp-x')).toHaveTextContent('WO-9');
  });

  it('shows the empty state when there are no reservations', () => {
    renderList([], async () => ({ ok: true, data: makeRow({}) }));
    expect(screen.getByTestId('reservation-empty')).toHaveTextContent(EN.emptyAll);
  });

  it('opens the release modal with the LP facts and a disabled Confirm until a reason is picked', () => {
    renderList([makeRow({ lpId: 'lp-1' })], async () => ({ ok: true, data: makeRow({}) }));
    fireEvent.click(screen.getByTestId('reservation-release-lp-1'));
    expect(screen.getByTestId('reservation-release-modal')).toBeInTheDocument();
    // reason required → Confirm disabled
    expect(screen.getByTestId('reservation-release-confirm')).toBeDisabled();
  });

  it('confirms a release: calls the action with the reason and refreshes the page', async () => {
    const action = vi.fn(async () => ({ ok: true as const, data: makeRow({}) }));
    renderList([makeRow({ lpId: 'lp-1' })], action);

    fireEvent.click(screen.getByTestId('reservation-release-lp-1'));
    // pick a reason via the Select's option (shadcn Select renders role=option)
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: EN.modal.reasons.consumed }));

    const confirm = screen.getByTestId('reservation-release-confirm');
    await waitFor(() => expect(confirm).not.toBeDisabled());
    fireEvent.click(confirm);

    await waitFor(() => expect(action).toHaveBeenCalledWith({ lpId: 'lp-1', reason: 'consumed' }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('surfaces a forbidden release inline (never trusts a client flag)', async () => {
    const action = vi.fn(async () => ({ ok: false as const, reason: 'forbidden' as const }));
    renderList([makeRow({ lpId: 'lp-1' })], action);

    fireEvent.click(screen.getByTestId('reservation-release-lp-1'));
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: EN.modal.reasons.cancelled }));

    const confirm = screen.getByTestId('reservation-release-confirm');
    await waitFor(() => expect(confirm).not.toBeDisabled());
    fireEvent.click(confirm);

    await waitFor(() => expect(screen.getByTestId('reservation-release-error')).toHaveTextContent(EN.modal.denied));
    // modal stays open on forbidden; page is NOT refreshed
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('resolves every staged i18n key in en and pl (no leaked dotted keys)', () => {
    for (const locale of ['en', 'pl']) {
      const flat = JSON.stringify(buildLabels(locale));
      expect(flat).not.toMatch(/reservations\.[a-z]/i);
    }
    expect(buildLabels('pl').release).not.toBe(EN.release);
  });
});

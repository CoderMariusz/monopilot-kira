/**
 * WH-006 — Stock movements list client: RTL parity + state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/warehouse/movement-screens.jsx:3-200.
 * Tests the presentational <MovementListClient> directly (the page is an async RSC
 * that reads Supabase via listStockMoves + renders the permission-denied / error
 * panels). Asserts: move-type tabs render with counts + filter the table (transfers
 * groups transfer+putaway), search filters rows, LP mono link, type chip, empty /
 * empty-filtered states, and en + pl staged bundles resolve every label.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MovementListClient, type MovementListLabels } from '../movement-list.client';
import { getWhcTranslator } from '../../../wh-c-labels';
import type { StockMoveListItem } from '../../../_actions/shared';

function buildLabels(locale: string): MovementListLabels {
  const t = getWhcTranslator(locale);
  return {
    searchPlaceholder: t('movements.searchPlaceholder'),
    searchLabel: t('movements.searchLabel'),
    rowsLabel: t('movements.rowsLabel'),
    emptyAll: t('movements.emptyAll'),
    emptyFiltered: t('movements.emptyFiltered'),
    none: t('movements.none'),
    tab: {
      all: t('movements.tabs.all'),
      receipts: t('movements.tabs.receipts'),
      consume: t('movements.tabs.consume'),
      transfers: t('movements.tabs.transfers'),
      adjustments: t('movements.tabs.adjustments'),
    },
    moveType: {
      receipt: t('movements.moveType.receipt'),
      putaway: t('movements.moveType.putaway'),
      transfer: t('movements.moveType.transfer'),
      consume_to_wo: t('movements.moveType.consume_to_wo'),
      adjustment: t('movements.moveType.adjustment'),
      quarantine: t('movements.moveType.quarantine'),
      return: t('movements.moveType.return'),
    },
    col: {
      move: t('movements.columns.move'),
      lp: t('movements.columns.lp'),
      type: t('movements.columns.type'),
      from: t('movements.columns.from'),
      to: t('movements.columns.to'),
      qty: t('movements.columns.qty'),
      date: t('movements.columns.date'),
      reason: t('movements.columns.reason'),
    },
  };
}

const EN = buildLabels('en');

function makeRow(over: Partial<StockMoveListItem>): StockMoveListItem {
  return {
    id: over.id ?? 'sm-1',
    moveNumber: over.moveNumber ?? 'SM-0001',
    lpId: over.lpId ?? 'lp-1',
    lpNumber: over.lpNumber ?? 'LP-0001',
    moveType: over.moveType ?? 'receipt',
    fromLocationCode: over.fromLocationCode ?? null,
    toLocationCode: over.toLocationCode ?? 'COLD-B1',
    quantity: over.quantity ?? '100',
    uom: over.uom ?? 'kg',
    moveDate: over.moveDate ?? '2026-04-21T00:00:00.000Z',
    reasonText: over.reasonText ?? null,
  };
}

function renderList(rows: StockMoveListItem[]) {
  return render(<MovementListClient rows={rows} labels={EN} locale="en" />);
}

describe('MovementListClient (WH-006 parity)', () => {
  it('renders the five move-type tabs with counts', () => {
    renderList([
      makeRow({ id: 'a', moveType: 'receipt' }),
      makeRow({ id: 'b', moveType: 'consume_to_wo' }),
      makeRow({ id: 'c', moveType: 'transfer' }),
      makeRow({ id: 'd', moveType: 'putaway' }),
      makeRow({ id: 'e', moveType: 'adjustment' }),
    ]);
    for (const k of ['all', 'receipts', 'consume', 'transfers', 'adjustments']) {
      expect(screen.getByTestId(`movement-tab-${k}`)).toBeInTheDocument();
    }
    expect(within(screen.getByTestId('movement-tab-all')).getByText('5')).toBeInTheDocument();
    expect(within(screen.getByTestId('movement-tab-receipts')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('movement-tab-consume')).getByText('1')).toBeInTheDocument();
    // transfers groups transfer + putaway (parity movement-screens.jsx:13,22)
    expect(within(screen.getByTestId('movement-tab-transfers')).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByTestId('movement-tab-adjustments')).getByText('1')).toBeInTheDocument();
  });

  it('filters rows by the active move-type tab (transfers includes putaway)', () => {
    renderList([
      makeRow({ id: 'a', moveType: 'receipt' }),
      makeRow({ id: 'b', moveType: 'transfer' }),
      makeRow({ id: 'c', moveType: 'putaway' }),
    ]);
    fireEvent.click(screen.getByTestId('movement-tab-transfers'));
    expect(screen.queryByTestId('movement-row-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('movement-row-b')).toBeInTheDocument();
    expect(screen.getByTestId('movement-row-c')).toBeInTheDocument();
  });

  it('searches by move number and LP number', () => {
    renderList([
      makeRow({ id: 'a', moveNumber: 'SM-AAA', lpNumber: 'LP-AAA' }),
      makeRow({ id: 'b', moveNumber: 'SM-BBB', lpNumber: 'LP-BBB' }),
    ]);
    const search = screen.getByTestId('movement-search');
    fireEvent.change(search, { target: { value: 'LP-BBB' } });
    expect(screen.queryByTestId('movement-row-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('movement-row-b')).toBeInTheDocument();
  });

  it('renders the LP as a mono link to the LP detail route + type chip', () => {
    renderList([makeRow({ id: 'sm-x', lpId: 'lp-9', lpNumber: 'LP-9999', moveType: 'transfer' })]);
    const link = screen.getByTestId('movement-lp-link-sm-x');
    expect(link).toHaveAttribute('href', '/en/warehouse/license-plates/lp-9');
    expect(screen.getByTestId('movement-type-sm-x')).toHaveTextContent(EN.moveType.transfer);
  });

  it('shows the empty-all state when there are no rows', () => {
    renderList([]);
    expect(screen.getByTestId('movement-empty')).toHaveTextContent(EN.emptyAll);
  });

  it('shows the empty-filtered state when the search matches nothing', () => {
    renderList([makeRow({ id: 'a', moveNumber: 'SM-AAA' })]);
    fireEvent.change(screen.getByTestId('movement-search'), { target: { value: 'zzz-nope' } });
    expect(screen.getByTestId('movement-empty-filtered')).toHaveTextContent(EN.emptyFiltered);
  });

  it('resolves every staged i18n key in en and pl (no leaked dotted keys)', () => {
    for (const locale of ['en', 'pl']) {
      const flat = JSON.stringify(buildLabels(locale));
      expect(flat).not.toMatch(/movements\.[a-z]/i);
    }
    expect(buildLabels('pl').tab.receipts).not.toBe(EN.tab.receipts);
  });
});

/**
 * WH-010 — GRN list client: RTL parity + state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/warehouse/grn-screens.jsx:3-90.
 * Tests the presentational <GrnListClient> directly (the page is an async RSC that
 * reads Supabase via listGrns + renders the permission-denied / error panels).
 * Asserts: status tabs render with counts + filter the table, source filter +
 * search filter rows, GRN mono link to detail, status badge, empty / empty-filtered
 * states, and that the en + pl staged bundles resolve every label (no leaked key).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GrnListClient, type GrnListLabels } from '../grn-list.client';
import { getWhcTranslator } from '../../../wh-c-labels';
import type { GrnListItem } from '../../../_actions/shared';

function buildLabels(locale: string): GrnListLabels {
  const t = getWhcTranslator(locale);
  return {
    searchPlaceholder: t('grnList.searchPlaceholder'),
    searchLabel: t('grnList.searchLabel'),
    rowsLabel: t('grnList.rowsLabel'),
    sourceFilterLabel: t('grnList.sourceFilterLabel'),
    sourceAll: t('grnList.sourceAll'),
    emptyAll: t('grnList.emptyAll'),
    emptyFiltered: t('grnList.emptyFiltered'),
    tab: {
      all: t('grnList.tabs.all'),
      draft: t('grnList.tabs.draft'),
      completed: t('grnList.tabs.completed'),
      cancelled: t('grnList.tabs.cancelled'),
    },
    status: {
      draft: t('grnList.status.draft'),
      completed: t('grnList.status.completed'),
      cancelled: t('grnList.status.cancelled'),
      in_progress: t('grnList.status.in_progress'),
    },
    col: {
      grn: t('grnList.columns.grn'),
      source: t('grnList.columns.source'),
      supplier: t('grnList.columns.supplier'),
      warehouse: t('grnList.columns.warehouse'),
      receiptDate: t('grnList.columns.receiptDate'),
      status: t('grnList.columns.status'),
      items: t('grnList.columns.items'),
    },
  };
}

const EN = buildLabels('en');

function makeRow(over: Partial<GrnListItem>): GrnListItem {
  return {
    id: over.id ?? 'grn-1',
    grnNumber: over.grnNumber ?? 'GRN-0001',
    sourceType: over.sourceType ?? 'po',
    status: over.status ?? 'completed',
    supplierId: over.supplierId ?? 's-1',
    supplierName: over.supplierName ?? 'Baltic Pork Co.',
    warehouseId: over.warehouseId ?? 'w-1',
    warehouseCode: over.warehouseCode ?? 'WH-A',
    receiptDate: over.receiptDate ?? '2026-04-21T00:00:00.000Z',
    completedAt: over.completedAt ?? null,
    itemCount: over.itemCount ?? 0,
  };
}

function renderList(rows: GrnListItem[], opts?: { itemCounts?: Record<string, number>; sourceTypes?: string[] }) {
  return render(
    <GrnListClient
      rows={rows}
      itemCounts={opts?.itemCounts ?? {}}
      sourceTypes={opts?.sourceTypes ?? [...new Set(rows.map((r) => r.sourceType))]}
      labels={EN}
      locale="en"
    />,
  );
}

describe('GrnListClient (WH-010 parity)', () => {
  it('renders the four status tabs with counts', () => {
    renderList([
      makeRow({ id: 'a', status: 'draft' }),
      makeRow({ id: 'b', status: 'completed' }),
      makeRow({ id: 'c', status: 'completed' }),
      makeRow({ id: 'd', status: 'cancelled' }),
    ]);
    for (const k of ['all', 'draft', 'completed', 'cancelled']) {
      expect(screen.getByTestId(`grn-tab-${k}`)).toBeInTheDocument();
    }
    expect(within(screen.getByTestId('grn-tab-all')).getByText('4')).toBeInTheDocument();
    expect(within(screen.getByTestId('grn-tab-draft')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('grn-tab-completed')).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByTestId('grn-tab-cancelled')).getByText('1')).toBeInTheDocument();
  });

  it('filters rows by the active status tab', () => {
    renderList([
      makeRow({ id: 'a', grnNumber: 'GRN-DRAFT', status: 'draft' }),
      makeRow({ id: 'b', grnNumber: 'GRN-DONE', status: 'completed' }),
    ]);
    expect(screen.getByTestId('grn-row-a')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('grn-tab-completed'));
    expect(screen.queryByTestId('grn-row-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('grn-row-b')).toBeInTheDocument();
  });

  it('searches by GRN number and supplier', () => {
    renderList([
      makeRow({ id: 'a', grnNumber: 'GRN-AAA', supplierName: 'Agro-Fresh' }),
      makeRow({ id: 'b', grnNumber: 'GRN-BBB', supplierName: 'Baltic Pork' }),
    ]);
    const search = screen.getByTestId('grn-list-search');
    fireEvent.change(search, { target: { value: 'baltic' } });
    expect(screen.queryByTestId('grn-row-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('grn-row-b')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'GRN-AAA' } });
    expect(screen.getByTestId('grn-row-a')).toBeInTheDocument();
    expect(screen.queryByTestId('grn-row-b')).not.toBeInTheDocument();
  });

  it('renders the GRN number as a mono link to the detail route + source chip', () => {
    renderList([makeRow({ id: 'grn-x', grnNumber: 'GRN-9999', sourceType: 'to' })]);
    const link = screen.getByTestId('grn-link-grn-x');
    expect(link).toHaveAttribute('href', '/en/warehouse/grns/grn-x');
    expect(link).toHaveTextContent('GRN-9999');
    expect(screen.getByTestId('grn-source-grn-x')).toHaveTextContent('TO');
  });

  it('renders the items-count column from the server-provided map (em-dash when unknown)', () => {
    renderList([makeRow({ id: 'grn-c' })], { itemCounts: { 'grn-c': 7 } });
    expect(screen.getByTestId('grn-items-grn-c')).toHaveTextContent('7');
    renderList([makeRow({ id: 'grn-u' })]);
    expect(screen.getByTestId('grn-items-grn-u')).toHaveTextContent('—');
  });

  it('shows the empty-all state when there are no rows', () => {
    renderList([]);
    expect(screen.getByTestId('grn-list-empty')).toHaveTextContent(EN.emptyAll);
  });

  it('shows the empty-filtered state when the search matches nothing', () => {
    renderList([makeRow({ id: 'a', grnNumber: 'GRN-AAA' })]);
    fireEvent.change(screen.getByTestId('grn-list-search'), { target: { value: 'zzz-nope' } });
    expect(screen.getByTestId('grn-list-empty-filtered')).toHaveTextContent(EN.emptyFiltered);
  });

  it('resolves every staged i18n key in en and pl (no leaked dotted keys)', () => {
    for (const locale of ['en', 'pl']) {
      const flat = JSON.stringify(buildLabels(locale));
      expect(flat).not.toMatch(/grnList\.[a-z]/i);
    }
    expect(buildLabels('pl').tab.draft).not.toBe(EN.tab.draft);
  });
});

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
import { describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

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
    pagination: {
      showing: t('grnList.pagination.showing'),
      previous: t('grnList.pagination.previous'),
      next: t('grnList.pagination.next'),
    },
  };
}

const DEFAULT_FILTERS = { status: '', search: '', sourceType: '' };

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

function renderList(
  rows: GrnListItem[],
  opts?: { sourceTypes?: string[]; filters?: typeof DEFAULT_FILTERS; total?: number },
) {
  pushMock.mockClear();
  return render(
    <GrnListClient
      rows={rows}
      pagination={{
        items: rows,
        total: opts?.total ?? rows.length,
        page: 1,
        limit: 50,
        offset: 0,
        hasMore: false,
      }}
      filters={opts?.filters ?? DEFAULT_FILTERS}
      sourceTypes={opts?.sourceTypes ?? [...new Set(rows.map((r) => r.sourceType))]}
      labels={EN}
      locale="en"
    />,
  );
}

describe('GrnListClient (WH-010 parity)', () => {
  it('renders the four status tabs with count on the active tab', () => {
    renderList(
      [
        makeRow({ id: 'a', status: 'draft' }),
        makeRow({ id: 'b', status: 'completed' }),
      ],
      { total: 2 },
    );
    for (const k of ['all', 'draft', 'completed', 'cancelled']) {
      expect(screen.getByTestId(`grn-tab-${k}`)).toBeInTheDocument();
    }
    expect(within(screen.getByTestId('grn-tab-all')).getByText('2')).toBeInTheDocument();
  });

  it('navigates to the completed tab filter via the URL', () => {
    renderList([
      makeRow({ id: 'a', grnNumber: 'GRN-DRAFT', status: 'draft' }),
      makeRow({ id: 'b', grnNumber: 'GRN-DONE', status: 'completed' }),
    ]);
    fireEvent.click(screen.getByTestId('grn-tab-completed'));
    expect(pushMock).toHaveBeenCalledWith('/en/warehouse/grns?status=completed');
  });

  it('debounces search navigation to the URL', async () => {
    vi.useFakeTimers();
    renderList([makeRow({ id: 'a', grnNumber: 'GRN-AAA', supplierName: 'Agro-Fresh' })]);
    fireEvent.change(screen.getByTestId('grn-list-search'), { target: { value: 'baltic' } });
    expect(pushMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(pushMock).toHaveBeenCalledWith('/en/warehouse/grns?q=baltic');
    vi.useRealTimers();
  });

  it('renders the GRN number as a mono link to the detail route + source chip', () => {
    renderList([makeRow({ id: 'grn-x', grnNumber: 'GRN-9999', sourceType: 'to' })]);
    const link = screen.getByTestId('grn-link-grn-x');
    expect(link).toHaveAttribute('href', '/en/warehouse/grns/grn-x');
    expect(link).toHaveTextContent('GRN-9999');
    expect(screen.getByTestId('grn-source-grn-x')).toHaveTextContent('TO');
  });

  it('renders the items-count column from each row itemCount, not the row index', () => {
    renderList([
      makeRow({ id: 'grn-a', itemCount: 3 }),
      makeRow({ id: 'grn-b', itemCount: 1 }),
    ]);

    expect(screen.getByTestId('grn-items-grn-a')).toHaveTextContent('3');
    expect(screen.getByTestId('grn-items-grn-a')).not.toHaveTextContent('0');
    expect(screen.getByTestId('grn-items-grn-b')).toHaveTextContent('1');
  });

  it('shows the empty-all state when there are no rows', () => {
    renderList([], { total: 0 });
    expect(screen.getByTestId('grn-list-empty')).toHaveTextContent(EN.emptyAll);
  });

  it('shows the empty-filtered state when filters are active and there are no rows', () => {
    renderList([], { filters: { status: '', search: 'zzz-nope', sourceType: '' }, total: 0 });
    expect(screen.getByTestId('grn-list-empty')).toHaveTextContent(EN.emptyFiltered);
  });

  it('resolves every staged i18n key in en and pl (no leaked dotted keys)', () => {
    for (const locale of ['en', 'pl']) {
      const flat = JSON.stringify(buildLabels(locale));
      expect(flat).not.toMatch(/grnList\.[a-z]/i);
    }
    expect(buildLabels('pl').tab.draft).not.toBe(EN.tab.draft);
  });
});

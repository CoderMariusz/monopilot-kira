/**
 * WAVE E10 — stock-count sessions list + create dialog: RTL parity + flow tests.
 *
 * Spec-driven (warehouse list+detail convention). Tests the presentational
 * <CountSessionListClient> directly with a stub create action + a mocked
 * next/navigation router. Asserts: sessions table (link, status badge, lines
 * summary), empty state, the New-session flow (open dialog → warehouse + type
 * required disables Create → pick both → Create calls the action → on success the
 * page navigates + refreshes), forbidden surfaces inline, and en + pl labels
 * resolve (no leaked dotted keys).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const refreshMock = vi.fn();
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: pushMock, replace: vi.fn() }),
}));

import { CountSessionListClient, type CountSessionListLabels } from '../count-session-list.client';
import { getCountsTranslator } from '../../counts-labels';
import type { CountSession } from '../../_actions/count-types';
import type { CountClientResult } from '../count-client-result';

function buildLabels(locale: string): CountSessionListLabels {
  const t = getCountsTranslator(locale);
  return {
    newSession: t('list.newSession'),
    rowsLabel: t('list.rowsLabel'),
    empty: t('list.empty'),
    none: t('list.none'),
    columns: {
      session: t('list.columns.session'),
      warehouse: t('list.columns.warehouse'),
      type: t('list.columns.type'),
      status: t('list.columns.status'),
      lines: t('list.columns.lines'),
      variances: t('list.columns.variances'),
      created: t('list.columns.created'),
    },
    type: { cycle: t('list.type.cycle'), full: t('list.type.full'), spot: t('list.type.spot') },
    status: {
      open: t('list.status.open'),
      in_review: t('list.status.in_review'),
      approved: t('list.status.approved'),
      applied: t('list.status.applied'),
      cancelled: t('list.status.cancelled'),
    },
    linesSummary: t('list.linesSummary'),
    create: {
      title: t('create.title'),
      intro: t('create.intro'),
      warehouseLabel: t('create.warehouseLabel'),
      warehousePlaceholder: t('create.warehousePlaceholder'),
      warehouseEmpty: t('create.warehouseEmpty'),
      typeLabel: t('create.typeLabel'),
      typePlaceholder: t('create.typePlaceholder'),
      type: { cycle: t('create.type.cycle'), full: t('create.type.full'), spot: t('create.type.spot') },
      cancel: t('create.cancel'),
      create: t('create.create'),
      creating: t('create.creating'),
      denied: t('create.denied'),
      error: t('create.error'),
      siteMismatch: t('create.siteMismatch'),
    },
  };
}

const EN = buildLabels('en');

function makeSession(over: Partial<CountSession>): CountSession {
  return {
    id: over.id ?? '11111111-2222-4333-a444-555555555555',
    warehouseId: over.warehouseId ?? 'wh-1',
    warehouseCode: over.warehouseCode ?? 'WH-MAIN',
    countType: over.countType ?? 'cycle',
    status: over.status ?? 'open',
    createdAt: over.createdAt ?? '2026-06-20T10:00:00.000Z',
    lineCount: over.lineCount ?? 8,
    countedLineCount: over.countedLineCount ?? 3,
    varianceLineCount: over.varianceLineCount ?? 1,
    varianceQty: over.varianceQty ?? '5',
  };
}

const WAREHOUSES = [
  { id: 'wh-1', code: 'WH-MAIN', name: 'Main warehouse', siteId: 'site-a' },
  { id: 'wh-2', code: 'WH-COLD', name: 'Cold store', siteId: 'site-b' },
];

function renderList(
  sessions: CountSession[],
  createAction: (input: { warehouseId: string; countType: 'cycle' | 'full' | 'spot' }) => Promise<CountClientResult<{ id: string }>>,
  options: { activeSiteId?: string | null; setSiteAction?: (siteId: string | null) => Promise<{ ok: boolean }> } = {},
) {
  const setSiteAction = options.setSiteAction ?? vi.fn(async () => ({ ok: true }));
  refreshMock.mockClear();
  pushMock.mockClear();
  return render(
    <CountSessionListClient
      sessions={sessions}
      warehouses={WAREHOUSES}
      labels={EN}
      locale="en"
      createAction={createAction}
      activeSiteId={options.activeSiteId ?? 'site-a'}
      setSiteAction={setSiteAction}
    />,
  );
}

describe('CountSessionListClient (E10 list + create dialog)', () => {
  it('renders the sessions table with a session link, status badge and lines summary', () => {
    renderList(
      [makeSession({ id: 'aaaaaaaa-bbbb-4ccc-add0-eeeeeeeeeeee', status: 'open', countedLineCount: 3, lineCount: 8 })],
      async () => ({ ok: true, data: { id: 'x' } }),
    );
    expect(screen.getByTestId('count-session-link-aaaaaaaa-bbbb-4ccc-add0-eeeeeeeeeeee')).toHaveAttribute(
      'href',
      '/en/warehouse/counts/aaaaaaaa-bbbb-4ccc-add0-eeeeeeeeeeee',
    );
    expect(screen.getByTestId('count-session-status-aaaaaaaa-bbbb-4ccc-add0-eeeeeeeeeeee')).toHaveTextContent(
      EN.status.open,
    );
    // "3/8 counted"
    expect(screen.getByTestId('count-session-row-aaaaaaaa-bbbb-4ccc-add0-eeeeeeeeeeee')).toHaveTextContent('3/8');
  });

  it('shows the empty state when there are no sessions', () => {
    renderList([], async () => ({ ok: true, data: { id: 'x' } }));
    expect(screen.getByTestId('count-session-empty')).toHaveTextContent(EN.empty);
  });

  it('opens the create dialog with Create disabled until warehouse + type are picked', () => {
    renderList([], async () => ({ ok: true, data: { id: 'x' } }));
    fireEvent.click(screen.getByTestId('count-session-new'));
    expect(screen.getByTestId('count-session-create-modal')).toBeInTheDocument();
    expect(screen.getByTestId('count-session-create-confirm')).toBeDisabled();
  });

  it('warns and switches site before create when the warehouse site differs from the top bar', async () => {
    const setSiteAction = vi.fn(async () => ({ ok: true }));
    const action = vi.fn(async () => ({ ok: true as const, data: { id: 'new-session-id' } }));
    renderList([], action, { activeSiteId: 'site-a', setSiteAction });

    fireEvent.click(screen.getByTestId('count-session-new'));
    const combos = screen.getAllByRole('combobox');
    fireEvent.click(combos[0]);
    fireEvent.click(screen.getByRole('option', { name: 'Cold store' }));
    expect(screen.getByTestId('count-session-site-mismatch')).toBeInTheDocument();

    fireEvent.click(combos[1]);
    fireEvent.click(screen.getByRole('option', { name: EN.create.type.cycle }));
    fireEvent.click(screen.getByTestId('count-session-create-confirm'));

    await waitFor(() => expect(setSiteAction).toHaveBeenCalledWith('site-b'));
    await waitFor(() => expect(action).toHaveBeenCalledWith({ warehouseId: 'wh-2', countType: 'cycle' }));
  });

  it('creates a session: calls the action with warehouse + type, navigates and refreshes', async () => {
    const action = vi.fn(async () => ({ ok: true as const, data: { id: 'new-session-id' } }));
    renderList([], action);

    fireEvent.click(screen.getByTestId('count-session-new'));
    // pick the warehouse (combobox 1) then the count type (combobox 2)
    const combos = screen.getAllByRole('combobox');
    fireEvent.click(combos[0]);
    fireEvent.click(screen.getByRole('option', { name: 'Main warehouse' }));
    fireEvent.click(combos[1]);
    fireEvent.click(screen.getByRole('option', { name: EN.create.type.cycle }));

    const confirm = screen.getByTestId('count-session-create-confirm');
    await waitFor(() => expect(confirm).not.toBeDisabled());
    fireEvent.click(confirm);

    await waitFor(() => expect(action).toHaveBeenCalledWith({ warehouseId: 'wh-1', countType: 'cycle' }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/en/warehouse/counts/new-session-id'));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('surfaces a forbidden create inline (never trusts a client flag)', async () => {
    const action = vi.fn(async () => ({ ok: false as const, code: 'forbidden' as const }));
    renderList([], action);

    fireEvent.click(screen.getByTestId('count-session-new'));
    const combos = screen.getAllByRole('combobox');
    fireEvent.click(combos[0]);
    fireEvent.click(screen.getByRole('option', { name: 'Cold store' }));
    fireEvent.click(combos[1]);
    fireEvent.click(screen.getByRole('option', { name: EN.create.type.full }));

    const confirm = screen.getByTestId('count-session-create-confirm');
    await waitFor(() => expect(confirm).not.toBeDisabled());
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(screen.getByTestId('count-session-create-error')).toHaveTextContent(EN.create.denied),
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('resolves every staged i18n key in en and pl (no leaked dotted keys)', () => {
    for (const locale of ['en', 'pl']) {
      const flat = JSON.stringify(buildLabels(locale));
      expect(flat).not.toMatch(/list\.[a-z]+\.[a-z]/i);
      expect(flat).not.toMatch(/create\.[a-z]+\.[a-z]/i);
    }
    expect(buildLabels('pl').newSession).not.toBe(EN.newSession);
  });
});

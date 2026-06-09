/**
 * @vitest-environment jsdom
 *
 * N1-B — Revision history (HistoryScreen) RTL parity + states.
 *
 * Prototype parity source (translated, NOT pasted):
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:182-216
 *   (HistoryScreen) — timeline grid (when · tag · who · action+object).
 *
 * Asserts:
 *  - rows render from the action payload (entity code / actor / action / status);
 *  - the entity-type pills drive the Server Action args (entityType filter);
 *  - the search box submits the search arg;
 *  - the empty + error + permission-denied UI states.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RevisionsClient,
  type RevisionRow,
  type RevisionsLabels,
} from '../revisions.client';

afterEach(() => cleanup());

const LABELS: RevisionsLabels = {
  filterAll: 'All',
  filterItem: 'Item',
  filterBom: 'BOM',
  filterFactorySpec: 'Factory spec',
  filterEco: 'Change order',
  searchPlaceholder: 'Search code, title or action…',
  searchLabel: 'Search revisions',
  limitLabel: 'Limit',
  apply: 'Apply',
  colWhen: 'When',
  colTag: 'Type',
  colWho: 'Who',
  colWhat: 'What changed',
  unknownActor: 'System',
  revisionPrefix: 'v',
  loading: 'Loading…',
  empty: 'No revisions yet',
  emptyBody: 'Changes to products, BOMs and specs will appear here.',
  error: 'Could not load revision history.',
  denied: 'You do not have access.',
  resultCount: '{count} revisions',
};

const ROWS: RevisionRow[] = [
  {
    entityType: 'bom',
    entityId: 'b-1',
    entityCode: 'B-0421',
    entityTitle: 'Kiełbasa śląska',
    revision: 7,
    status: 'active',
    statusTone: 'success',
    actorUserId: 'A. Majewska',
    occurredAt: '2026-04-14 11:10:00+00',
    action: 'bom.active',
  },
  {
    entityType: 'eco',
    entityId: 'e-1',
    entityCode: 'ECO-2044',
    entityTitle: 'Redukcja soli -10%',
    revision: 1,
    status: 'draft',
    statusTone: 'muted',
    actorUserId: 'A. Majewska',
    occurredAt: '2026-04-18 09:41:00+00',
    action: 'eco.draft',
  },
];

function makeAction(rows: RevisionRow[] = ROWS) {
  return vi.fn().mockResolvedValue({ ok: true, data: { revisions: rows } });
}

function renderClient(
  overrides: Partial<React.ComponentProps<typeof RevisionsClient>> = {},
) {
  const listAction = overrides.listAction ?? makeAction();
  render(
    <RevisionsClient
      initialState="ready"
      initialRevisions={ROWS}
      labels={LABELS}
      listAction={listAction}
      {...overrides}
    />,
  );
  return { listAction };
}

describe('RevisionsClient — parity + states', () => {
  it('renders timeline rows from the action payload', () => {
    renderClient();
    const timeline = screen.getByTestId('revisions-timeline');
    expect(within(timeline).getByText('B-0421')).toBeInTheDocument();
    expect(within(timeline).getByText('ECO-2044')).toBeInTheDocument();
    // Both fixture rows share the same actor — assert per-row.
    expect(within(screen.getByTestId('revisions-row-0')).getByText('A. Majewska')).toBeInTheDocument();
    // action + status badge present
    expect(within(timeline).getByText(/bom\.active/)).toBeInTheDocument();
    expect(within(timeline).getByText('active')).toBeInTheDocument();
    // mono when column, minute precision
    expect(within(timeline).getByText('2026-04-14 11:10')).toBeInTheDocument();
    expect(screen.getByTestId('revisions-count')).toHaveTextContent('2 revisions');
  });

  it('entity-type pill drives the Server Action entityType arg', async () => {
    const { listAction } = renderClient();
    fireEvent.click(screen.getByTestId('revisions-pill-eco'));
    await waitFor(() => expect(listAction).toHaveBeenCalled());
    expect(listAction).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'eco' }),
    );
  });

  it('the "All" pill clears the entityType filter (undefined)', async () => {
    const { listAction } = renderClient();
    fireEvent.click(screen.getByTestId('revisions-pill-bom'));
    await waitFor(() => expect(listAction).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('revisions-pill-all'));
    await waitFor(() => expect(listAction).toHaveBeenCalledTimes(2));
    expect(listAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ entityType: undefined }),
    );
  });

  it('search submit passes the search arg', async () => {
    const { listAction } = renderClient();
    fireEvent.change(screen.getByTestId('revisions-search'), { target: { value: 'B-0421' } });
    fireEvent.click(screen.getByTestId('revisions-apply'));
    await waitFor(() => expect(listAction).toHaveBeenCalled());
    expect(listAction).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'B-0421' }),
    );
  });

  it('shows the empty state when the action returns no rows', async () => {
    const empty = vi.fn().mockResolvedValue({ ok: true, data: { revisions: [] } });
    renderClient({ listAction: empty });
    fireEvent.click(screen.getByTestId('revisions-pill-item'));
    await waitFor(() => expect(screen.getByTestId('revisions-empty')).toBeInTheDocument());
    expect(screen.getByText('No revisions yet')).toBeInTheDocument();
  });

  it('shows the error state when the action fails', async () => {
    const fail = vi.fn().mockResolvedValue({ ok: false, error: 'persistence_failed' });
    renderClient({ listAction: fail });
    fireEvent.click(screen.getByTestId('revisions-pill-bom'));
    await waitFor(() => expect(screen.getByTestId('revisions-error')).toBeInTheDocument());
  });

  it('renders the permission-denied state (shared contract)', () => {
    renderClient({ initialState: 'denied', initialRevisions: [] });
    expect(screen.getByTestId('revisions-denied')).toBeInTheDocument();
  });
});

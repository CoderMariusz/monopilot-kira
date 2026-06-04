/**
 * @vitest-environment jsdom
 * T-045 — TEC-089 BOM Change History timeline — component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:230-263
 *
 * Asserts: parity (timeline list — time / tag badge / actor / action+delta), the
 * empty state when there are no audit entries, and the actor filter (shadcn
 * <Select>, no raw <select>) narrowing the timeline to one actor's entries. FG
 * canonical (no FA labels).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import {
  BomHistoryTimeline,
  type BomHistoryLabels,
  type HistoryActor,
  type HistoryEntryView,
} from '../bom-history-timeline';

afterEach(() => cleanup());

const LABELS: BomHistoryLabels = {
  title: 'Change history',
  subtitle: 'Immutable audit timeline of every change to this BOM.',
  filterActorLabel: 'Actor',
  filterAllActors: 'All actors',
  empty: 'No history yet for this BOM.',
  emptyFiltered: 'No changes by the selected actor.',
  tagCreated: 'Created',
  tagApprove: 'Approved',
  tagRelease: 'Released',
  tagOther: 'Change',
  versionChip: 'v{version}',
  unknownActor: 'System',
};

const ACTORS: HistoryActor[] = [
  { id: 'u1', name: 'A. Majewska' },
  { id: 'u2', name: 'P. Kowalski' },
];

const ENTRIES: HistoryEntryView[] = [
  {
    id: 'a1',
    occurredAt: '2026-04-19T14:22:00.000Z',
    tag: 'release',
    action: 'bom.publish',
    actorUserId: 'u1',
    actorName: 'A. Majewska',
    version: 7,
    deltaSummary: 'technical_approved → active',
  },
  {
    id: 'a2',
    occurredAt: '2026-04-18T09:41:00.000Z',
    tag: 'approve',
    action: 'bom.approve',
    actorUserId: 'u2',
    actorName: 'P. Kowalski',
    version: 7,
    deltaSummary: 'draft → technical_approved',
  },
];

describe('BomHistoryTimeline — parity', () => {
  it('renders one timeline entry per audit row with tag, actor, action and delta', () => {
    render(<BomHistoryTimeline entries={ENTRIES} actors={ACTORS} labels={LABELS} />);
    const rows = screen.getAllByTestId('bom-history-entry');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('A. Majewska')).toBeInTheDocument();
    expect(screen.getByText(/technical_approved → active/)).toBeInTheDocument();
    expect(screen.getByText('Released')).toBeInTheDocument();
  });

  it('does not leak the legacy FA label', () => {
    const { container } = render(
      <BomHistoryTimeline entries={ENTRIES} actors={ACTORS} labels={LABELS} />,
    );
    expect(container.textContent).not.toMatch(/Factory Article/i);
  });
});

describe('BomHistoryTimeline — empty state', () => {
  it('shows the empty copy when there are no audit entries', () => {
    render(<BomHistoryTimeline entries={[]} actors={[]} labels={LABELS} />);
    expect(screen.getByTestId('bom-history-empty')).toHaveTextContent(LABELS.empty);
  });
});

describe('BomHistoryTimeline — actor filter', () => {
  it('narrows the timeline to the selected actor (no raw <select>)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <BomHistoryTimeline entries={ENTRIES} actors={ACTORS} labels={LABELS} />,
    );
    expect(container.querySelector('select')).toBeNull();
    expect(screen.getAllByTestId('bom-history-entry')).toHaveLength(2);

    await user.click(screen.getByRole('combobox', { name: 'Actor' }));
    await user.click(screen.getByRole('option', { name: 'P. Kowalski' }));

    const rows = screen.getAllByTestId('bom-history-entry');
    expect(rows).toHaveLength(1);
    expect(screen.getByText('P. Kowalski')).toBeInTheDocument();
    expect(screen.queryByText('A. Majewska')).toBeNull();
  });
});

/**
 * @vitest-environment jsdom
 *
 * T-086 — TEC-025 BOM Snapshots Viewer (spec-driven): RTL structure + interaction
 * + pure JSON-flatten diff tests.
 *
 * Spec-driven layout-primitive prototypes:
 *   spec-driven-screens.jsx:223-303 (`bom_snapshots_viewer_screen`)
 *   spec-driven-screens.jsx:307-354 (`bom_snapshot_diff_modal`)
 * PRD §7.5 + 03-TECHNICAL-UX.md are canonical. Asserts the immutable list (status
 * pills + WO filter + immutability banner + per-row Diff CTA + the column set),
 * the read-only diff modal (computed server-side, kinds noop/chg/add/rem), and
 * that NO edit/save/apply action exists (red-line: snapshots are immutable).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SnapshotsViewer, type SnapshotsViewerLabels } from '../_components/snapshots-viewer.client';
import { diffSnapshotVsCurrent, flattenJson } from '../_actions/shared';
import type { SnapshotRow } from '../_actions/shared';

afterEach(cleanup);

const LABELS: SnapshotsViewerLabels = {
  immutableBanner: 'Immutable. A snapshot is the BOM frozen at WO release.',
  orphanedNote: 'Orphaned = canonical BOM version deleted; snapshot stays read-only.',
  searchPlaceholder: 'Filter by WO',
  filterAll: 'All',
  filterInUse: 'In use',
  filterClosed: 'Closed',
  filterOrphaned: 'Orphaned',
  colSnapshot: 'Snapshot ID',
  colVersion: 'Ver.',
  colWo: 'WO',
  colFg: 'Finished good',
  colLines: 'Lines',
  colTaken: 'Taken',
  colStatus: 'Status',
  diffCta: 'Diff vs current',
  noMatches: 'No snapshots match',
  modalTitle: 'Snapshot diff',
  modalReadOnly: 'Read-only. Snapshot is immutable.',
  diffColKind: 'Kind',
  diffColPath: 'Path',
  diffColFrozen: 'Snapshot (frozen)',
  diffColCurrent: 'Current BOM',
  diffLoading: 'Computing diff…',
  diffError: 'Could not compute the diff.',
  diffEmpty: 'No differences.',
  close: 'Close',
  noWo: '—',
};

const SNAP_1_ID = '11111111-1111-4111-8111-111111111111';
const SNAP_2_ID = '22222222-2222-4222-8222-222222222222';
const WO_1_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const SNAPSHOTS: SnapshotRow[] = [
  {
    id: SNAP_1_ID,
    workOrderId: WO_1_ID,
    workOrderNumber: 'WO-12044',
    bomHeaderId: 'h1',
    bomVersion: 7,
    productId: 'FG5101',
    productName: 'Sausage 450g',
    lineCount: 11,
    snapshotAt: '2026-04-19T14:22:00.000Z',
    status: 'in_use',
  },
  {
    id: SNAP_2_ID,
    workOrderId: null,
    workOrderNumber: null,
    bomHeaderId: 'h2',
    bomVersion: 6,
    productId: 'FG5101',
    productName: 'Sausage 450g',
    lineCount: 11,
    snapshotAt: '2026-04-12T11:55:00.000Z',
    status: 'orphaned',
  },
];

describe('TEC-025 Snapshots viewer (spec: spec-driven-screens.jsx:223-303)', () => {
  it('renders the immutability banner, status pills, WO filter and column set', () => {
    render(<SnapshotsViewer snapshots={SNAPSHOTS} diffAction={vi.fn()} labels={LABELS} />);
    expect(screen.getByText(/Immutable\./)).toBeInTheDocument();
    expect(screen.getByTestId('snapshot-filter-all')).toBeInTheDocument();
    expect(screen.getByTestId('snapshot-filter-orphaned')).toHaveTextContent('Orphaned');
    expect(screen.getByTestId('snapshot-wo-filter')).toBeInTheDocument();

    const table = screen.getByRole('table', { name: 'BOM snapshots' });
    ['Snapshot ID', 'Ver.', 'WO', 'Finished good', 'Lines', 'Taken', 'Status'].forEach((c) =>
      expect(within(table).getByText(c)).toBeInTheDocument(),
    );
    expect(screen.getAllByTestId('snapshot-row')).toHaveLength(2);

    // Rule 0.11: neither the snapshot UUID nor the WO UUID leak into the table —
    // the snapshot column shows a readable BOM code + version, the WO column the
    // human wo_number.
    expect(table.textContent).not.toContain(SNAP_1_ID);
    expect(table.textContent).not.toContain(WO_1_ID);
    expect(within(table).getByText('FG5101 · v7')).toBeInTheDocument();
    expect(within(table).getByText('WO-12044')).toBeInTheDocument();
  });

  it('flags orphaned snapshots and exposes NO edit/save/apply action (immutable)', () => {
    render(<SnapshotsViewer snapshots={SNAPSHOTS} diffAction={vi.fn()} labels={LABELS} />);
    const orphan = screen.getAllByTestId('snapshot-row').find((r) => r.getAttribute('data-status') === 'orphaned');
    expect(orphan).toBeTruthy();
    expect(screen.queryByText(/save/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/apply/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^edit$/i)).not.toBeInTheDocument();
  });

  it('filters by status pill and by WO substring', () => {
    render(<SnapshotsViewer snapshots={SNAPSHOTS} diffAction={vi.fn()} labels={LABELS} />);
    fireEvent.click(screen.getByTestId('snapshot-filter-orphaned'));
    expect(screen.getAllByTestId('snapshot-row')).toHaveLength(1);

    fireEvent.click(screen.getByTestId('snapshot-filter-all'));
    fireEvent.change(screen.getByTestId('snapshot-wo-filter'), { target: { value: '12044' } });
    const rows = screen.getAllByTestId('snapshot-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('WO-12044');
  });

  it('opens the read-only diff modal and renders the server-computed diff', async () => {
    const diffAction = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        currentExists: true,
        snapshotJson: {},
        diff: [
          { kind: 'noop', path: 'lines[0].code', frozen: 'RM-1001', current: 'RM-1001' },
          { kind: 'chg', path: 'lines[0].quantity', frozen: '0.540', current: '0.535' },
        ],
      },
    });
    render(<SnapshotsViewer snapshots={SNAPSHOTS} diffAction={diffAction} labels={LABELS} />);
    fireEvent.click(screen.getByTestId(`snapshot-diff-cta-${SNAP_1_ID}`));
    await waitFor(() => expect(diffAction).toHaveBeenCalledWith(SNAP_1_ID));
    await waitFor(() => expect(screen.getByTestId('snapshot-diff-modal')).toBeInTheDocument());
    expect(screen.getByText('Read-only. Snapshot is immutable.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId('snapshot-diff-row')).toHaveLength(2));
  });
});

describe('TEC-025 pure JSON-flatten diff', () => {
  it('flattens nested arrays/objects to stable JSON paths', () => {
    const flat = flattenJson({ header: { version: 7 }, lines: [{ code: 'RM-1', qty: '0.5' }] });
    expect(flat['header.version']).toBe('7');
    expect(flat['lines[0].code']).toBe('RM-1');
    expect(flat['lines[0].qty']).toBe('0.5');
  });

  it('classifies noop/chg/add/rem between frozen and current', () => {
    const frozen = { lines: [{ code: 'RM-1', qty: '0.540' }], process: { smoke: '72C' } };
    const current = { lines: [{ code: 'RM-1', qty: '0.535' }, { code: 'RM-2', qty: '0.1' }] };
    const diff = diffSnapshotVsCurrent(frozen, current);
    const byKind = (k: string) => diff.filter((d) => d.kind === k).map((d) => d.path);
    expect(byKind('noop')).toContain('lines[0].code');
    expect(byKind('chg')).toContain('lines[0].qty');
    expect(byKind('add')).toContain('lines[1].code');
    expect(byKind('rem')).toContain('process.smoke');
  });

  it('treats legacy ea vs pcs line uom as noop after piece normalization', () => {
    const diff = diffSnapshotVsCurrent(
      { lines: [{ code: 'RM-1', uom: 'ea' }] },
      { lines: [{ code: 'RM-1', uom: 'pcs' }] },
    );
    expect(diff.find((d) => d.path === 'lines[0].uom')).toMatchObject({ kind: 'noop' });
  });
});

'use client';

/**
 * 03-technical · TEC-025 BOM Snapshots Viewer (T-086, spec-driven) — client island.
 *
 * Spec-driven Wave0 surface. Layout-primitive prototypes (structural reference
 * only, NOT a 1:1 visual source):
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:223-303
 *     (`bom_snapshots_viewer_screen`) — immutable list filterable by status pill +
 *     WO substring, with an immutability banner and a per-row "Diff vs current".
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:307-354
 *     (`bom_snapshot_diff_modal`) — wide JSON-flatten diff modal (noop/chg/add/rem)
 *     vs the current canonical BOM.
 *
 * Strictly read-only (red-line): snapshots are immutable; there is NO edit / save
 * / apply action anywhere on this surface. The diff is computed server-side via
 * diffBomSnapshot — the client never re-derives. Orphaned snapshots stay
 * read-only and are visually flagged.
 */

import React from 'react';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card, CardContent } from '@monopilot/ui/Card';
import Modal from '@monopilot/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type { DiffSnapshotResult } from '../_actions/diff-snapshot';
import type { SnapshotDiffEntry, SnapshotRow, SnapshotStatus } from '../_actions/shared';

type Filter = 'all' | SnapshotStatus;

const STATUS_VARIANT: Record<SnapshotStatus, BadgeVariant> = {
  in_use: 'info',
  closed: 'muted',
  orphaned: 'danger',
};

const DIFF_VARIANT: Record<SnapshotDiffEntry['kind'], BadgeVariant> = {
  noop: 'muted',
  chg: 'warning',
  add: 'success',
  rem: 'danger',
};

export type SnapshotsViewerLabels = {
  immutableBanner: string;
  orphanedNote: string;
  searchPlaceholder: string;
  filterAll: string;
  filterInUse: string;
  filterClosed: string;
  filterOrphaned: string;
  colSnapshot: string;
  colVersion: string;
  colWo: string;
  colFg: string;
  colLines: string;
  colTaken: string;
  colStatus: string;
  diffCta: string;
  noMatches: string;
  modalTitle: string;
  modalReadOnly: string;
  diffColKind: string;
  diffColPath: string;
  diffColFrozen: string;
  diffColCurrent: string;
  diffLoading: string;
  diffError: string;
  diffEmpty: string;
  close: string;
  noWo: string;
};

function formatTaken(snapshotAt: string): string {
  const d = new Date(snapshotAt);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 16).replace('T', ' ');
}

export function SnapshotsViewer({
  snapshots,
  diffAction,
  labels,
}: {
  snapshots: SnapshotRow[];
  diffAction: (snapshotId: string) => Promise<DiffSnapshotResult>;
  labels: SnapshotsViewerLabels;
}) {
  const [filter, setFilter] = React.useState<Filter>('all');
  const [woFilter, setWoFilter] = React.useState('');
  const [openSnapshot, setOpenSnapshot] = React.useState<SnapshotRow | null>(null);
  const [diff, setDiff] = React.useState<SnapshotDiffEntry[] | null>(null);
  const [diffState, setDiffState] = React.useState<'idle' | 'loading' | 'error'>('idle');

  const counts = React.useMemo(
    () => ({
      all: snapshots.length,
      in_use: snapshots.filter((s) => s.status === 'in_use').length,
      closed: snapshots.filter((s) => s.status === 'closed').length,
      orphaned: snapshots.filter((s) => s.status === 'orphaned').length,
    }),
    [snapshots],
  );

  const rows = React.useMemo(() => {
    const wo = woFilter.trim().toLowerCase();
    return snapshots.filter((s) => {
      if (filter !== 'all' && s.status !== filter) return false;
      if (wo && !(s.workOrderId ?? '').toLowerCase().includes(wo)) return false;
      return true;
    });
  }, [snapshots, filter, woFilter]);

  const onDiff = React.useCallback(
    (snapshot: SnapshotRow) => {
      setOpenSnapshot(snapshot);
      setDiff(null);
      setDiffState('loading');
      void diffAction(snapshot.id).then((res) => {
        if (res.ok) {
          setDiff(res.data.diff);
          setDiffState('idle');
        } else {
          setDiffState('error');
        }
      });
    },
    [diffAction],
  );

  const pills: Array<[Filter, string, number]> = [
    ['all', labels.filterAll, counts.all],
    ['in_use', labels.filterInUse, counts.in_use],
    ['closed', labels.filterClosed, counts.closed],
    ['orphaned', labels.filterOrphaned, counts.orphaned],
  ];

  return (
    <div data-prototype-label="bom_snapshots_viewer_screen" className="flex flex-col gap-4">
      <div role="alert" className="alert alert-red">
        <div className="alert-title">{labels.immutableBanner}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Filter snapshots" className="flex flex-wrap gap-2">
          {pills.map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              data-testid={`snapshot-filter-${key}`}
              onClick={() => setFilter(key)}
              className={`pill${filter === key ? ' on' : ''}`}
            >
              {label} <span className="ml-1 opacity-50">{count}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <label htmlFor="snapshot-wo-filter" className="sr-only">
            {labels.searchPlaceholder}
          </label>
          <input
            id="snapshot-wo-filter"
            type="search"
            value={woFilter}
            onChange={(e) => setWoFilter(e.target.value)}
            placeholder={labels.searchPlaceholder}
            className="form-input w-56 font-mono"
            data-testid="snapshot-wo-filter"
          />
        </div>
      </div>

      <Card className="card">
        <CardContent className="p-0">
          <Table aria-label="BOM snapshots">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.colSnapshot}</TableHead>
                <TableHead scope="col">{labels.colVersion}</TableHead>
                <TableHead scope="col">{labels.colWo}</TableHead>
                <TableHead scope="col">{labels.colFg}</TableHead>
                <TableHead scope="col" className="text-right">
                  {labels.colLines}
                </TableHead>
                <TableHead scope="col">{labels.colTaken}</TableHead>
                <TableHead scope="col">{labels.colStatus}</TableHead>
                <TableHead scope="col" className="text-right">
                  <span className="sr-only">{labels.diffCta}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((s) => (
                  <TableRow key={s.id} data-testid="snapshot-row" data-status={s.status}>
                    <TableCell className="font-mono text-xs">{s.id}</TableCell>
                    <TableCell>
                      <Badge variant="info">{s.bomVersion === null ? '—' : `v${s.bomVersion}`}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{s.workOrderId ?? labels.noWo}</TableCell>
                    <TableCell className="text-sm">
                      {s.productId ? (
                        <span>
                          <span className="font-mono">{s.productId}</span>
                          {s.productName ? <span className="text-muted-foreground"> · {s.productName}</span> : null}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{s.lineCount}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{formatTaken(s.snapshotAt)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[s.status]}>{s.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        data-testid={`snapshot-diff-cta-${s.id}`}
                        onClick={() => onDiff(s)}
                      >
                        {labels.diffCta}
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    {labels.noMatches}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="alert alert-blue">
        <div className="alert-title">{labels.orphanedNote}</div>
      </div>

      <Modal open={Boolean(openSnapshot)} onOpenChange={(o) => (o ? null : setOpenSnapshot(null))} size="xl" modalId="bom_snapshot_diff_modal">
        <Modal.Header title={`${labels.modalTitle} · ${openSnapshot?.id ?? ''}`} />
        <Modal.Body>
          <div data-prototype-label="bom_snapshot_diff_modal" data-testid="snapshot-diff-modal">
            <div role="alert" className="alert alert-red mb-3">
              <div className="alert-title">{labels.modalReadOnly}</div>
            </div>
            {diffState === 'loading' ? (
              <p className="text-sm text-muted-foreground" data-testid="snapshot-diff-loading">
                {labels.diffLoading}
              </p>
            ) : diffState === 'error' ? (
              <p role="alert" className="text-sm text-red-700" data-testid="snapshot-diff-error">
                {labels.diffError}
              </p>
            ) : diff && diff.length ? (
              <Table aria-label="Snapshot diff">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{labels.diffColKind}</TableHead>
                    <TableHead scope="col">{labels.diffColPath}</TableHead>
                    <TableHead scope="col">{labels.diffColFrozen}</TableHead>
                    <TableHead scope="col">{labels.diffColCurrent}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {diff.map((d, i) => (
                    <TableRow key={i} data-testid="snapshot-diff-row" data-kind={d.kind}>
                      <TableCell>
                        <Badge variant={DIFF_VARIANT[d.kind]}>{d.kind}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{d.path}</TableCell>
                      <TableCell className="font-mono text-xs">{d.frozen}</TableCell>
                      <TableCell className={['font-mono text-xs', d.kind !== 'noop' ? 'font-semibold' : ''].join(' ')}>
                        {d.current}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="snapshot-diff-empty">
                {labels.diffEmpty}
              </p>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpenSnapshot(null)} data-testid="snapshot-diff-close">
            {labels.close}
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

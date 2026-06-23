'use client';

/**
 * Wave E3 — CCP Deviations register list (client island).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   haccp-screens.jsx:229-299 (QaCcpDeviations):
 *     status filter (Open / Resolved / All)            → haccp-screens.jsx:263-266
 *     dense deviations table (CCP code+step, reading +
 *       limit, linked NCR/hold, status, recorded at)   → haccp-screens.jsx:270-296
 *     per-open-row resolve/sign-off action             → haccp-screens.jsx:288-291
 *
 * Presentational + owns ONLY the client status-filter state (the prototype's
 * `status` useState) + the resolve-modal open/target state. No data fetching, no
 * permission logic — both resolved server-side; the resolve action + the
 * server-resolved `canResolve` flag are passed in as props (imported from
 * _actions / probed server-side, never authored or client-trusted here).
 *
 * Shows the CCP CODE + name, the hold NUMBER (deep-link to /quality/holds/{id}
 * when present) — NEVER a raw UUID (rule 0.11). Status badge: open = red,
 * resolved = green.
 *
 * DEVIATIONS (red-lines, documented per UI-PROTOTYPE-PARITY-POLICY.md):
 *   - The KPI summary strip + hazard/CCP/severity/date filters + the Export and
 *     manual-log-deviation actions (haccp-screens.jsx:244-268) are OUT OF SCOPE
 *     for this read surface — the reviewed backend exposes list + resolve only
 *     (no manual-log / severity / export action). The status filter collapses to
 *     the backend open | resolved | all union.
 *   - The prototype linked-NCR column is replaced by the backend LINKED HOLD
 *     (the reviewed row carries hold, not an ncr ref); the hold is the real
 *     cross-link the action returns. No raw select: the status filter is
 *     shadcn-style pills.
 *   - The hazard / severity / recorded-by / signed-icon columns are dropped —
 *     the reviewed row does not carry hazard/severity, and signed identity is a
 *     server concern surfaced on resolve, not faked client-side.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { DeviationResolveModal } from './deviation-resolve-modal.client';
import {
  DEVIATION_STATUS_FILTERS,
  type DeviationRow,
  type DeviationStatus,
  type DeviationStatusFilter,
  type ResolveDeviationAction,
} from './ccp-deviations-contracts';
import type { DeviationListLabels, DeviationResolveLabels } from './labels';

const STATUS_VARIANT: Record<DeviationStatus, BadgeVariant> = {
  open: 'danger',
  resolved: 'success',
};

function readingText(row: DeviationRow, noReading: string): string {
  if (row.measuredValue === null) return noReading;
  return `${row.measuredValue}${row.uom ? ` ${row.uom}` : ''}`;
}

export function DeviationsListClient({
  rows,
  labels,
  resolveLabels,
  locale,
  canResolve,
  resolveAction,
}: {
  rows: DeviationRow[];
  labels: DeviationListLabels;
  resolveLabels: DeviationResolveLabels;
  locale: string;
  canResolve: boolean;
  resolveAction: ResolveDeviationAction;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<DeviationStatusFilter>('open');
  const [target, setTarget] = useState<DeviationRow | null>(null);

  const filterCount = (f: DeviationStatusFilter): number =>
    f === 'all' ? rows.length : rows.filter((r) => r.status === f).length;

  const visible = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Status filter pills (parity haccp-screens.jsx:263-266) — no raw <select>. */}
      <Card className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label={labels.filterLabel}>
          {DEVIATION_STATUS_FILTERS.map((f) => {
            const on = filter === f;
            return (
              <button
                key={f}
                type="button"
                data-testid={`deviation-filter-${f}`}
                aria-pressed={on}
                onClick={() => setFilter(f)}
                className={[
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition',
                  on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-600 hover:border-slate-400',
                ].join(' ')}
              >
                {labels.filter[f]}
                <span
                  className={[
                    'rounded-full px-1.5 text-[11px] tabular-nums',
                    on ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600',
                  ].join(' ')}
                >
                  {filterCount(f)}
                </span>
              </button>
            );
          })}
        </div>
        <span className="ml-auto text-xs text-slate-500" data-testid="deviations-list-rows">
          {labels.rowsLabel.replace('{count}', String(visible.length))}
        </span>
      </Card>

      {/* Table / filtered-empty state (parity haccp-screens.jsx:270-296). */}
      <Card
        data-testid="deviations-list-table-card"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        {visible.length === 0 ? (
          <p
            data-testid="deviations-list-empty-filtered"
            className="px-4 py-10 text-center text-sm text-slate-500"
          >
            {labels.emptyFiltered}
          </p>
        ) : (
          <Table aria-label={labels.columns.ccp}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.columns.ccp}</TableHead>
                <TableHead scope="col">{labels.columns.reading}</TableHead>
                <TableHead scope="col">{labels.columns.status}</TableHead>
                <TableHead scope="col">{labels.columns.hold}</TableHead>
                <TableHead scope="col">{labels.columns.openedAt}</TableHead>
                <TableHead scope="col">{labels.columns.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow
                  key={r.id}
                  data-testid={`deviation-row-${r.id}`}
                  style={r.status === 'resolved' ? { opacity: 0.6 } : undefined}
                >
                  {/* CCP code (mono) + name — never a UUID. */}
                  <TableCell>
                    <span data-testid={`deviation-ccp-${r.id}`} className="font-mono text-sm font-semibold text-slate-900">
                      {r.ccpCode}
                    </span>
                    <div className="text-[11px] text-slate-500">{r.ccpName}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-700" data-testid={`deviation-reading-${r.id}`}>
                    {readingText(r, labels.noReading)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status] ?? 'muted'} data-testid={`deviation-status-${r.id}`}>
                      {labels.status[r.status] ?? r.status}
                    </Badge>
                  </TableCell>
                  {/* Linked hold — hold NUMBER deep-linked to /quality/holds/{id}; never the id. */}
                  <TableCell>
                    {r.hold ? (
                      <Link
                        href={`/${locale}/quality/holds/${r.hold.id}`}
                        data-testid={`deviation-hold-link-${r.id}`}
                        className="font-mono text-xs font-medium text-sky-700 hover:underline"
                      >
                        {r.hold.holdNumber}
                      </Link>
                    ) : (
                      <span data-testid={`deviation-hold-none-${r.id}`} className="text-xs text-slate-400">
                        {labels.noHold}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">{r.openedAt.slice(0, 10)}</TableCell>
                  <TableCell>
                    {r.status === 'open' ? (
                      <button
                        type="button"
                        data-testid={`deviation-resolve-open-${r.id}`}
                        disabled={!canResolve}
                        title={!canResolve ? labels.resolveDisabled : undefined}
                        onClick={() => canResolve && setTarget(r)}
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {labels.resolveAction}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">{labels.noHold}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {target ? (
        <DeviationResolveModal
          open={target !== null}
          onOpenChange={(o) => {
            if (!o) setTarget(null);
          }}
          deviation={target}
          labels={resolveLabels}
          resolveAction={resolveAction}
          onResolved={() => {
            setTarget(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

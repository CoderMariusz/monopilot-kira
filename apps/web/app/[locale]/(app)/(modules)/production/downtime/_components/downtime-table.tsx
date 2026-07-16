/**
 * Downtime event log table — prototype parity: other-screens.jsx:186-211 (Event log
 * card + table). Columns: Started · Line · Linked WO · Category · Reason · Operator ·
 * Duration · Source. The prototype's category badge color is driven by the 4P group;
 * here it maps from downtime_categories.kind (plant≈unplanned/red, changeover/amber,
 * planned≈blue). Open events (ended_at IS NULL) carry an "Open" badge.
 *
 * Presentational only — all strings arrive as props (i18n resolved by the RSC page).
 */
import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';

import type { DowntimeEventRow, DowntimeKind, DowntimeSource } from '../_actions/downtime-data';

export type DowntimeTableLabels = {
  title: string;
  empty: string;
  open: string;
  uncategorized: string;
  col: {
    started: string;
    line: string;
    shift: string;
    wo: string;
    category: string;
    reason: string;
    operator: string;
    duration: string;
    source: string;
  };
  kind: Record<DowntimeKind, string>;
  source: Record<DowntimeSource, string>;
  /** "{min} min" formatter resolved by the caller. */
  durationFmt: (min: number) => string;
  /** Locale date/time formatter resolved by the caller. */
  dateFmt: (iso: string) => string;
};

const KIND_VARIANT: Record<DowntimeKind, BadgeVariant> = {
  unplanned: 'danger',
  changeover: 'warning',
  planned: 'info',
};

export function DowntimeTable({
  rows,
  labels,
}: {
  rows: DowntimeEventRow[];
  labels: DowntimeTableLabels;
}) {
  if (rows.length === 0) {
    return (
      <div
        data-testid="production-downtime-empty"
        className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500"
      >
        {labels.empty}
      </div>
    );
  }

  return (
    <div data-testid="production-downtime-table" className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-semibold">{labels.col.started}</th>
            <th className="px-3 py-2 font-semibold">{labels.col.line}</th>
            <th className="px-3 py-2 font-semibold">{labels.col.shift}</th>
            <th className="px-3 py-2 font-semibold">{labels.col.wo}</th>
            <th className="px-3 py-2 font-semibold">{labels.col.category}</th>
            <th className="px-3 py-2 font-semibold">{labels.col.reason}</th>
            <th className="px-3 py-2 font-semibold">{labels.col.operator}</th>
            <th className="px-3 py-2 text-right font-semibold">{labels.col.duration}</th>
            <th className="px-3 py-2 font-semibold">{labels.col.source}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-testid={`production-downtime-row-${r.id}`} className="border-b border-slate-100 last:border-0">
              <td className="px-3 py-2 font-mono text-xs text-slate-600">{labels.dateFmt(r.startedAt)}</td>
              <td className="px-3 py-2 font-mono text-slate-700">{r.lineLabel}</td>
              <td className="px-3 py-2 text-slate-700">{r.shiftLabel ?? '—'}</td>
              <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.woNumber ?? '—'}</td>
              <td className="px-3 py-2">
                {r.categoryName ? (
                  <Badge variant={r.categoryKind ? KIND_VARIANT[r.categoryKind] : 'muted'}>{r.categoryName}</Badge>
                ) : (
                  <span className="text-slate-400">{labels.uncategorized}</span>
                )}
              </td>
              <td className="px-3 py-2 text-slate-700">{r.reasonNotes ?? '—'}</td>
              <td className="px-3 py-2 text-slate-700">{r.operatorName ?? '—'}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">
                {r.isOpen ? (
                  <Badge variant="warning" data-testid={`production-downtime-open-${r.id}`}>
                    {labels.open}
                  </Badge>
                ) : r.durationMin === null ? (
                  '—'
                ) : (
                  labels.durationFmt(r.durationMin)
                )}
              </td>
              <td className="px-3 py-2">
                <Badge variant="muted">{labels.source[r.source]}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

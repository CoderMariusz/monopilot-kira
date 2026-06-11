/**
 * 15-OEE — presentational tables (pure; no data fetching, labels via props).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/oee/dashboard.jsx
 *   per-line summary table  → dashboard.jsx:120-188 ("OEE by line" card: line cell
 *     with mono code + muted name, OEE/A/P/Q percent columns, output kg right-aligned)
 *   "—" for NULL components → dashboard.jsx:157 (d.oee == null ? "—" : ...)
 * Honest subset: no sparklines / best-worst shift / drill-in buttons here — those are
 * 15-OEE backlog dashboards (T-014..T-019).
 */
import type { OeeLineRow, OeeSnapshotRow } from '../_actions/oee-data';

export type OeeLinesTableLabels = {
  title: string;
  empty: string;
  unassigned: string;
  col: { line: string; wos: string; availability: string; performance: string; quality: string; oee: string };
};

function Pct({ value }: { value: string | null }) {
  if (value == null) return <span className="text-slate-400">—</span>;
  return <span className="font-mono tabular-nums">{value}%</span>;
}

export function OeeLinesTable({ rows, labels }: { rows: OeeLineRow[]; labels: OeeLinesTableLabels }) {
  return (
    <div data-testid="oee-lines-table" className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{labels.title}</h2>
      </div>
      {rows.length === 0 ? (
        <p data-testid="oee-lines-empty" className="px-4 py-6 text-sm text-slate-500">
          {labels.empty}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">{labels.col.line}</th>
              <th className="px-4 py-2 text-right">{labels.col.wos}</th>
              <th className="px-4 py-2 text-right">{labels.col.oee}</th>
              <th className="px-4 py-2 text-right">{labels.col.availability}</th>
              <th className="px-4 py-2 text-right">{labels.col.performance}</th>
              <th className="px-4 py-2 text-right">{labels.col.quality}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.lineId} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2">
                  <div className="font-mono text-sm font-semibold text-slate-900">
                    {r.lineCode ?? (r.lineId === 'unassigned' ? labels.unassigned : r.lineId)}
                  </div>
                  {r.lineName ? <div className="text-xs text-slate-500">{r.lineName}</div> : null}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">{r.woCount}</td>
                <td className="px-4 py-2 text-right font-semibold"><Pct value={r.avgOee} /></td>
                <td className="px-4 py-2 text-right"><Pct value={r.avgAvailability} /></td>
                <td className="px-4 py-2 text-right"><Pct value={r.avgPerformance} /></td>
                <td className="px-4 py-2 text-right"><Pct value={r.avgQuality} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export type OeeSnapshotsTableLabels = {
  title: string;
  empty: string;
  unassigned: string;
  col: {
    time: string;
    line: string;
    shift: string;
    wo: string;
    availability: string;
    performance: string;
    quality: string;
    oee: string;
    output: string;
    downtime: string;
    waste: string;
  };
  /** e.g. (min) => `${min} min` */
  downtimeFmt: (min: number) => string;
  dateFmt: (iso: string) => string;
};

export function OeeSnapshotsTable({
  rows,
  labels,
}: {
  rows: OeeSnapshotRow[];
  labels: OeeSnapshotsTableLabels;
}) {
  return (
    <div data-testid="oee-snapshots-table" className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{labels.title}</h2>
      </div>
      {rows.length === 0 ? (
        <p data-testid="oee-snapshots-empty" className="px-4 py-6 text-sm text-slate-500">
          {labels.empty}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">{labels.col.time}</th>
              <th className="px-4 py-2">{labels.col.line}</th>
              <th className="px-4 py-2">{labels.col.shift}</th>
              <th className="px-4 py-2">{labels.col.wo}</th>
              <th className="px-4 py-2 text-right">{labels.col.oee}</th>
              <th className="px-4 py-2 text-right">{labels.col.availability}</th>
              <th className="px-4 py-2 text-right">{labels.col.performance}</th>
              <th className="px-4 py-2 text-right">{labels.col.quality}</th>
              <th className="px-4 py-2 text-right">{labels.col.output}</th>
              <th className="px-4 py-2 text-right">{labels.col.downtime}</th>
              <th className="px-4 py-2 text-right">{labels.col.waste}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 whitespace-nowrap text-slate-700">{labels.dateFmt(r.snapshotMinute)}</td>
                <td className="px-4 py-2 font-mono text-xs">
                  {r.lineCode ?? (r.lineId === 'unassigned' ? labels.unassigned : r.lineId)}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{r.shiftId}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.woNumber ?? <span className="text-slate-400">—</span>}</td>
                <td className="px-4 py-2 text-right font-semibold"><Pct value={r.oee} /></td>
                <td className="px-4 py-2 text-right"><Pct value={r.availability} /></td>
                <td className="px-4 py-2 text-right"><Pct value={r.performance} /></td>
                <td className="px-4 py-2 text-right"><Pct value={r.quality} /></td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {r.outputKg ?? <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {r.downtimeMin == null ? <span className="text-slate-400">—</span> : labels.downtimeFmt(r.downtimeMin)}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {r.wasteKg ?? <span className="text-slate-400">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

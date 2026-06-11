'use client';

/**
 * W9-M2 — MRP screen client view: "Run MRP" → runMrp Server Action → KPI tiles +
 * shortage-sorted results table.
 *
 * Prototype note: NO MRP screen exists in prototypes/design/Monopilot Design
 * System/planning/ or planning-ext/ (verified by sweep — no `mrp` match in any
 * jsx). Presentation therefore follows the locked MON-design-system conventions
 * already used module-wide: `kpi` tiles (kpi-strip.tsx), `card`/`card-head`/
 * `card-title` shells, `badge` severity chips, `btn btn-primary` actions,
 * `empty-state` blocks and the po-list-view table markup.
 *
 * UI states: initial (honest "no run yet" empty state), loading (button busy),
 * results (table + KPIs + run timestamp), no-requirements empty state,
 * permission-denied (amber note), error (red alert). The action is read-only —
 * nothing is persisted, no orders are auto-created in this slice.
 */
import { useState, useTransition } from 'react';

import type { MrpRunData, MrpRunResult } from '../../_actions/mrp';
import type { MrpRow, MrpSeverity } from '../../_actions/mrp-compute';

export type MrpLabels = {
  run: string;
  running: string;
  ranAt: string;
  denied: string;
  error: string;
  emptyInitial: string;
  emptyInitialHint: string;
  emptyRows: string;
  excludedUoms: string;
  readOnlyNote: string;
  kpis: {
    itemsShort: string;
    coverage: string;
    itemsAnalyzed: string;
    totalDemand: string;
    totalDemandHint: string;
  };
  columns: {
    item: string;
    type: string;
    onHand: string;
    reserved: string;
    openSupply: string;
    demand: string;
    net: string;
    action: string;
  };
  severity: Record<MrpSeverity, string>;
  actionTypes: { buy: string; make: string; none: string };
  itemTypes: Record<string, string>;
};

function severityBadgeClass(severity: MrpSeverity): string {
  switch (severity) {
    case 'shortage':
      return 'badge badge-red';
    case 'at_risk':
      return 'badge badge-amber';
    default:
      return 'badge badge-green';
  }
}

function KpiTiles({ data, labels }: { data: MrpRunData; labels: MrpLabels }) {
  const { kpis } = data;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="mrp-kpis">
      <div className={kpis.itemsShort > 0 ? 'kpi red' : 'kpi green'} data-testid="mrp-kpi-itemsShort">
        <div className="kpi-label">{labels.kpis.itemsShort}</div>
        <div className="kpi-value">{kpis.itemsShort}</div>
      </div>
      <div
        className={kpis.coveragePct < 100 ? 'kpi amber' : 'kpi green'}
        data-testid="mrp-kpi-coverage"
      >
        <div className="kpi-label">{labels.kpis.coverage}</div>
        <div className="kpi-value">{kpis.coveragePct}%</div>
      </div>
      <div className="kpi" data-testid="mrp-kpi-itemsAnalyzed">
        <div className="kpi-label">{labels.kpis.itemsAnalyzed}</div>
        <div className="kpi-value">{kpis.itemsAnalyzed}</div>
      </div>
      <div className="kpi" data-testid="mrp-kpi-totalDemand">
        <div className="kpi-label">{labels.kpis.totalDemand}</div>
        <div className="kpi-value">{kpis.totalDemand}</div>
        <div className="kpi-change text-slate-400">{labels.kpis.totalDemandHint}</div>
      </div>
    </div>
  );
}

function ResultsTable({ rows, labels }: { rows: MrpRow[]; labels: MrpLabels }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="mrp-results-table">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">{labels.columns.item}</th>
            <th className="px-3 py-2">{labels.columns.type}</th>
            <th className="px-3 py-2 text-right">{labels.columns.onHand}</th>
            <th className="px-3 py-2 text-right">{labels.columns.reserved}</th>
            <th className="px-3 py-2 text-right">{labels.columns.openSupply}</th>
            <th className="px-3 py-2 text-right">{labels.columns.demand}</th>
            <th className="px-3 py-2 text-right">{labels.columns.net}</th>
            <th className="px-3 py-2">{labels.columns.action}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.itemId} data-testid={`mrp-row-${row.itemCode}`} data-severity={row.severity}>
              <td className="px-3 py-2">
                <div className="font-mono text-xs font-semibold text-slate-800">{row.itemCode}</div>
                <div className="text-slate-600">{row.itemName}</div>
                {row.excludedUoms.length > 0 ? (
                  <div className="mt-0.5 text-xs text-amber-700" data-testid={`mrp-excluded-${row.itemCode}`}>
                    {labels.excludedUoms}: {row.excludedUoms.join(', ')}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-2">
                <span className="badge badge-gray">{labels.itemTypes[row.itemType] ?? row.itemType}</span>
              </td>
              <td className="px-3 py-2 text-right font-mono">{row.onHand}</td>
              <td className="px-3 py-2 text-right font-mono">{row.reserved}</td>
              <td className="px-3 py-2 text-right font-mono">{row.openSupply}</td>
              <td className="px-3 py-2 text-right font-mono">{row.demand}</td>
              <td className="px-3 py-2 text-right">
                <span className={severityBadgeClass(row.severity)} data-testid={`mrp-net-${row.itemCode}`}>
                  {row.net} {row.uomBase}
                </span>
                <div className="mt-0.5 text-xs text-slate-400">{labels.severity[row.severity]}</div>
              </td>
              <td className="px-3 py-2">
                {row.suggestedAction ? (
                  <span
                    className={row.suggestedAction.type === 'make' ? 'badge badge-blue' : 'badge badge-amber'}
                    data-testid={`mrp-action-${row.itemCode}`}
                  >
                    {row.suggestedAction.type === 'make' ? labels.actionTypes.make : labels.actionTypes.buy}{' '}
                    {row.suggestedAction.qty} {row.uomBase}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">{labels.actionTypes.none}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MrpView({
  labels,
  runAction,
  timeFormatter,
}: {
  labels: MrpLabels;
  /** The runMrp Server Action (injected for testability). */
  runAction: () => Promise<MrpRunResult>;
  /** Locale-aware timestamp formatter (composed server-side; falls back to ISO). */
  timeFormatter?: (iso: string) => string;
}) {
  const [result, setResult] = useState<MrpRunResult | null>(null);
  const [pending, startTransition] = useTransition();

  const onRun = () => {
    startTransition(async () => {
      setResult(await runAction());
    });
  };

  const formatTime = (iso: string): string => {
    if (timeFormatter) return timeFormatter(iso);
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex flex-col gap-6" data-testid="mrp-view">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{labels.readOnlyNote}</p>
        <div className="flex items-center gap-3">
          {result?.ok ? (
            <span className="text-xs text-slate-500" data-testid="mrp-ran-at">
              {labels.ranAt}: {formatTime(result.data.ranAt)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onRun}
            disabled={pending}
            data-testid="mrp-run-button"
            className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? labels.running : labels.run}
          </button>
        </div>
      </div>

      {result === null && !pending ? (
        <div className="card">
          <div className="empty-state" data-testid="mrp-empty-initial">
            <div className="empty-state-icon" aria-hidden>
              🧮
            </div>
            <div className="empty-state-body">{labels.emptyInitial}</div>
            <div className="mt-1 text-xs text-slate-400">{labels.emptyInitialHint}</div>
          </div>
        </div>
      ) : null}

      {result && !result.ok && result.error === 'forbidden' ? (
        <div
          role="note"
          data-testid="mrp-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          {labels.denied}
        </div>
      ) : null}

      {result && !result.ok && result.error !== 'forbidden' ? (
        <div
          role="alert"
          data-testid="mrp-error"
          className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
        >
          {labels.error}
        </div>
      ) : null}

      {result?.ok ? (
        <>
          <KpiTiles data={result.data} labels={labels} />
          <div className="card">
            {result.data.rows.length === 0 ? (
              <div className="empty-state" data-testid="mrp-empty-rows">
                <div className="empty-state-icon" aria-hidden>
                  ✓
                </div>
                <div className="empty-state-body">{labels.emptyRows}</div>
              </div>
            ) : (
              <ResultsTable rows={result.data.rows} labels={labels} />
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

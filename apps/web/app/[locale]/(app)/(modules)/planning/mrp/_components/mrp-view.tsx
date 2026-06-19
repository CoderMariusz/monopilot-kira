'use client';

/**
 * W9-M2 — MRP screen client view: "Run MRP" → runMrp Server Action → KPI tiles +
 * shortage-sorted results table.
 * CL2 slice 2 additions: "Save this run" persist toggle (write-gated server-
 * side), below-min amber severity (distinct from the red shortage badge),
 * suggested due dates from supplier lead times, and a "Previous runs" section
 * listing persisted mrp_runs with an expandable per-run requirement ledger.
 *
 * Prototype note: NO MRP screen exists in prototypes/design/Monopilot Design
 * System/planning/ or planning-ext/ (verified by sweep — no `mrp` match in any
 * jsx). Presentation therefore follows the locked MON-design-system conventions
 * already used module-wide: `kpi` tiles (kpi-strip.tsx), `card`/`card-head`/
 * `card-title` shells, `badge` severity chips, `btn btn-primary` actions,
 * `empty-state` blocks and the po-list-view table markup.
 *
 * UI states: initial (honest "no run yet" empty state), loading (button busy),
 * results (table + KPIs + run timestamp + persisted run number), no-
 * requirements empty state, permission-denied (amber note), error (red alert).
 * Previous runs: loading / empty / error / expanded-ledger states.
 */
import React, { useEffect, useState, useTransition } from 'react';

import type {
  MrpConvertResult,
  MrpPlannedOrder,
  MrpRunData,
  MrpRunInput,
  MrpRunRequirement,
  MrpRunRequirementsResult,
  MrpRunResult,
  MrpRunsListResult,
  MrpRunSummary,
} from '../../_actions/mrp';
import { convertPlannedToPo, convertPlannedToWo } from '../../_actions/mrp';
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
  persistToggle: string;
  persistNote: string;
  persistedAs: string;
  minQty: string;
  dueBy: string;
  kpis: {
    itemsShort: string;
    coverage: string;
    itemsAnalyzed: string;
    totalDemand: string;
    totalDemandHint: string;
    belowMin: string;
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
  previousRuns: {
    title: string;
    empty: string;
    loading: string;
    error: string;
    expand: string;
    collapse: string;
    columns: { run: string; date: string; items: string; exceptions: string; status: string };
    requirements: {
      item: string;
      gross: string;
      receipts: string;
      projected: string;
      net: string;
      empty: string;
    };
  };
};

function severityBadgeClass(severity: MrpSeverity): string {
  switch (severity) {
    case 'shortage':
      return 'badge badge-red';
    case 'below_min':
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
      <div
        className={kpis.itemsShort > 0 ? 'kpi red' : kpis.itemsBelowMin > 0 ? 'kpi amber' : 'kpi green'}
        data-testid="mrp-kpi-itemsShort"
      >
        <div className="kpi-label">{labels.kpis.itemsShort}</div>
        <div className="kpi-value">{kpis.itemsShort}</div>
        {kpis.itemsBelowMin > 0 ? (
          <div className="kpi-change text-amber-700" data-testid="mrp-kpi-belowMin">
            {labels.kpis.belowMin}: {kpis.itemsBelowMin}
          </div>
        ) : null}
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
                {row.severity === 'below_min' && row.minQty !== null ? (
                  <div className="text-xs text-amber-700" data-testid={`mrp-min-${row.itemCode}`}>
                    {labels.minQty}: {row.minQty} {row.uomBase}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-2">
                {row.suggestedAction ? (
                  <>
                    <span
                      className={row.suggestedAction.type === 'make' ? 'badge badge-blue' : 'badge badge-amber'}
                      data-testid={`mrp-action-${row.itemCode}`}
                    >
                      {row.suggestedAction.type === 'make' ? labels.actionTypes.make : labels.actionTypes.buy}{' '}
                      {row.suggestedAction.qty} {row.uomBase}
                    </span>
                    {row.suggestedAction.dueDate ? (
                      <div className="mt-0.5 text-xs text-slate-500" data-testid={`mrp-due-${row.itemCode}`}>
                        {labels.dueBy}: {row.suggestedAction.dueDate}
                      </div>
                    ) : null}
                  </>
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

function PlannedOrdersTable({
  rows,
  selectedIds,
  onToggle,
}: {
  rows: MrpPlannedOrder[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="card" data-testid="mrp-planned-orders">
      <div className="card-head">
        <div className="card-title">Planned orders</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="mrp-planned-orders-table">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Select</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2">Need by</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} data-testid={`mrp-planned-order-${row.id}`}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => onToggle(row.id)}
                    aria-label={`Select ${row.itemCode ?? row.id}`}
                    data-testid={`mrp-planned-select-${row.id}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="font-mono text-xs font-semibold text-slate-800">{row.itemCode ?? row.itemId}</div>
                  <div className="text-slate-600">{row.itemName ?? ''}</div>
                </td>
                <td className="px-3 py-2">
                  <span className={row.type === 'make' ? 'badge badge-blue' : row.type === 'buy' ? 'badge badge-amber' : 'badge badge-gray'}>
                    {row.type}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {row.qty} {row.uom}
                </td>
                <td className="px-3 py-2">{row.needBy}</td>
                <td className="px-3 py-2">
                  <span className="badge badge-gray">{row.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** "Previous runs" — persisted mrp_runs list with an expandable requirement ledger. */
function PreviousRuns({
  labels,
  listRunsAction,
  getRunRequirementsAction,
  refreshKey,
}: {
  labels: MrpLabels;
  listRunsAction: () => Promise<MrpRunsListResult>;
  getRunRequirementsAction: (runId: string) => Promise<MrpRunRequirementsResult>;
  /** Bumped after a persisted run so the list reloads. */
  refreshKey: number;
}) {
  const [runs, setRuns] = useState<MrpRunSummary[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [ledgers, setLedgers] = useState<Record<string, MrpRunRequirement[] | 'loading' | 'error'>>({});

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    listRunsAction()
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setRuns(result.data);
          setState('ready');
        } else {
          setState(result.error === 'forbidden' ? 'forbidden' : 'error');
        }
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [listRunsAction, refreshKey]);

  const toggle = (runId: string) => {
    if (expandedId === runId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(runId);
    if (ledgers[runId] === undefined || ledgers[runId] === 'error') {
      setLedgers((prev) => ({ ...prev, [runId]: 'loading' }));
      getRunRequirementsAction(runId)
        .then((result) => {
          setLedgers((prev) => ({ ...prev, [runId]: result.ok ? result.data : 'error' }));
        })
        .catch(() => {
          setLedgers((prev) => ({ ...prev, [runId]: 'error' }));
        });
    }
  };

  // Permission-denied for the list read mirrors the page-level denied state —
  // the section simply hides (the main view already showed the denied note).
  if (state === 'forbidden') return null;

  return (
    <div className="card" data-testid="mrp-previous-runs">
      <div className="card-head">
        <div className="card-title">{labels.previousRuns.title}</div>
      </div>
      {state === 'loading' ? (
        <div className="px-6 py-4 text-sm text-slate-500" data-testid="mrp-runs-loading">
          {labels.previousRuns.loading}
        </div>
      ) : null}
      {state === 'error' ? (
        <div role="alert" className="px-6 py-4 text-sm text-red-700" data-testid="mrp-runs-error">
          {labels.previousRuns.error}
        </div>
      ) : null}
      {state === 'ready' && runs !== null && runs.length === 0 ? (
        <div className="px-6 py-4 text-sm text-slate-500" data-testid="mrp-runs-empty">
          {labels.previousRuns.empty}
        </div>
      ) : null}
      {state === 'ready' && runs !== null && runs.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="mrp-runs-table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">{labels.previousRuns.columns.run}</th>
                <th className="px-3 py-2">{labels.previousRuns.columns.date}</th>
                <th className="px-3 py-2 text-right">{labels.previousRuns.columns.items}</th>
                <th className="px-3 py-2 text-right">{labels.previousRuns.columns.exceptions}</th>
                <th className="px-3 py-2">{labels.previousRuns.columns.status}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {runs.map((run) => {
                const expanded = expandedId === run.id;
                const ledger = ledgers[run.id];
                return (
                  <React.Fragment key={run.id}>
                    <tr data-testid={`mrp-run-${run.runNumber}`}>
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-800">{run.runNumber}</td>
                      <td className="px-3 py-2 text-slate-600">{run.horizonStart}</td>
                      <td className="px-3 py-2 text-right font-mono">{run.requirementCount}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={run.exceptionCount > 0 ? 'badge badge-red' : 'badge badge-green'}>
                          {run.exceptionCount}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="badge badge-gray">{run.status}</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          className="btn btn--ghost btn-sm"
                          data-testid={`mrp-run-toggle-${run.runNumber}`}
                          onClick={() => toggle(run.id)}
                        >
                          {expanded ? labels.previousRuns.collapse : labels.previousRuns.expand}
                        </button>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr data-testid={`mrp-run-ledger-${run.runNumber}`}>
                        <td colSpan={6} className="bg-slate-50 px-3 py-2">
                          {ledger === 'loading' || ledger === undefined ? (
                            <div className="py-2 text-xs text-slate-500">{labels.previousRuns.loading}</div>
                          ) : ledger === 'error' ? (
                            <div role="alert" className="py-2 text-xs text-red-700">
                              {labels.previousRuns.error}
                            </div>
                          ) : ledger.length === 0 ? (
                            <div className="py-2 text-xs text-slate-500">{labels.previousRuns.requirements.empty}</div>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left uppercase tracking-wide text-slate-500">
                                  <th className="px-2 py-1">{labels.previousRuns.requirements.item}</th>
                                  <th className="px-2 py-1 text-right">{labels.previousRuns.requirements.gross}</th>
                                  <th className="px-2 py-1 text-right">{labels.previousRuns.requirements.receipts}</th>
                                  <th className="px-2 py-1 text-right">{labels.previousRuns.requirements.projected}</th>
                                  <th className="px-2 py-1 text-right">{labels.previousRuns.requirements.net}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ledger.map((req) => (
                                  <tr key={req.itemId} data-testid={`mrp-req-${req.itemCode ?? req.itemId}`}>
                                    <td className="px-2 py-1">
                                      <span className="font-mono font-semibold text-slate-800">{req.itemCode ?? req.itemId}</span>{' '}
                                      <span className="text-slate-600">{req.itemName ?? ''}</span>
                                    </td>
                                    <td className="px-2 py-1 text-right font-mono">{req.grossRequirement}</td>
                                    <td className="px-2 py-1 text-right font-mono">{req.scheduledReceipts}</td>
                                    <td className="px-2 py-1 text-right font-mono">{req.projectedOnHand}</td>
                                    <td className="px-2 py-1 text-right">
                                      <span className={req.exceptionType === 'shortage' ? 'badge badge-red' : 'badge badge-green'}>
                                        {req.netRequirement} {req.uom}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function MrpView({
  labels,
  runAction,
  listRunsAction,
  getRunRequirementsAction,
  timeFormatter,
}: {
  labels: MrpLabels;
  /** The runMrp Server Action (injected for testability). */
  runAction: (input?: MrpRunInput) => Promise<MrpRunResult>;
  /** listMrpRuns Server Action — drives the "Previous runs" section. */
  listRunsAction: () => Promise<MrpRunsListResult>;
  /** getMrpRunRequirements Server Action — per-run expandable ledger. */
  getRunRequirementsAction: (runId: string) => Promise<MrpRunRequirementsResult>;
  /** Locale-aware timestamp formatter (composed server-side; falls back to ISO). */
  timeFormatter?: (iso: string) => string;
}) {
  const [result, setResult] = useState<MrpRunResult | null>(null);
  const [persist, setPersist] = useState(false);
  const [runsRefreshKey, setRunsRefreshKey] = useState(0);
  const [selectedPlannedIds, setSelectedPlannedIds] = useState<Set<string>>(new Set());
  const [convertFeedback, setConvertFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [convertPending, startConvertTransition] = useTransition();

  const onRun = () => {
    startTransition(async () => {
      const next = await runAction({ persist });
      setResult(next);
      setSelectedPlannedIds(new Set());
      setConvertFeedback(null);
      if (next.ok && next.data.runId) setRunsRefreshKey((k) => k + 1);
    });
  };

  const togglePlanned = (id: string) => {
    setSelectedPlannedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const summarizeConversion = (result: MrpConvertResult, noun: 'PO' | 'WO') => {
    if (!result.ok) return `Create ${noun} failed: ${result.error}`;
    const skipped = result.skipped.length > 0 ? `, skipped ${result.skipped.length}: ${result.skipped.map((s) => s.reason).join(', ')}` : '';
    return `Created ${result.created} ${noun}${result.created === 1 ? '' : 's'}${skipped}`;
  };

  const convertSelected = (kind: 'po' | 'wo') => {
    const ids = [...selectedPlannedIds];
    if (ids.length === 0 || convertPending) return;
    startConvertTransition(async () => {
      const next = kind === 'po' ? await convertPlannedToPo(ids) : await convertPlannedToWo(ids);
      setConvertFeedback(summarizeConversion(next, kind === 'po' ? 'PO' : 'WO'));
      if (next.ok) {
        setSelectedPlannedIds(new Set());
        setRunsRefreshKey((k) => k + 1);
      }
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
        <p className="text-sm text-slate-500">{persist ? labels.persistNote : labels.readOnlyNote}</p>
        <div className="flex items-center gap-3">
          {result?.ok ? (
            <span className="text-xs text-slate-500" data-testid="mrp-ran-at">
              {labels.ranAt}: {formatTime(result.data.ranAt)}
              {result.data.runNumber ? (
                <span data-testid="mrp-persisted-as">
                  {' '}
                  · {labels.persistedAs} <span className="font-mono">{result.data.runNumber}</span>
                </span>
              ) : null}
            </span>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={persist}
              data-testid="mrp-persist-toggle"
              onChange={(e) => setPersist(e.target.checked)}
            />
            {labels.persistToggle}
          </label>
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
          {result.data.plannedOrders.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-500" data-testid="mrp-planned-selection-count">
                {selectedPlannedIds.size} selected
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={selectedPlannedIds.size === 0 || convertPending}
                  onClick={() => convertSelected('po')}
                  data-testid="mrp-create-po-button"
                >
                  Create PO
                </button>
                <button
                  type="button"
                  className="btn btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={selectedPlannedIds.size === 0 || convertPending}
                  onClick={() => convertSelected('wo')}
                  data-testid="mrp-create-wo-button"
                >
                  Create WO
                </button>
              </div>
            </div>
          ) : null}
          {convertFeedback ? (
            <div role="status" className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-4 text-sm text-slate-700" data-testid="mrp-convert-feedback">
              {convertFeedback}
            </div>
          ) : null}
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
          <PlannedOrdersTable rows={result.data.plannedOrders} selectedIds={selectedPlannedIds} onToggle={togglePlanned} />
        </>
      ) : null}

      <PreviousRuns
        labels={labels}
        listRunsAction={listRunsAction}
        getRunRequirementsAction={getRunRequirementsAction}
        refreshKey={runsRefreshKey}
      />
    </div>
  );
}

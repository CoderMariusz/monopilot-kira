'use client';

/**
 * Trace & Recall workbench (Wave E2A, client island).
 *
 * Spec-driven DS conformance (no JSX prototype for trace — nearest reusable
 * pattern is the sibling quality CCP board + record modal, plus the genealogy
 * panel): an input row (ref field + shadcn Select type picker + a direction
 * toggle) → [Run trace] → runTraceReport; a summary panel (the 5 counts), an
 * expandable node tree (supplier→GRN→input LP→WO→output LP→shipment marker), and
 * a flat table (ref, type, qty+uom). A [Save as drill] button persists the run
 * via startRecallDrill + completeRecallDrill.
 *
 * Presentational + owns ONLY the input state, the last-run report, and the
 * transient drill-saved banner. No data fetching, no permission logic (both
 * resolved server-side — a forbidden read renders the denied panel from the
 * RSC page). The Server Actions are passed in as props (imported by the page,
 * never authored here).
 *
 * Rule 0.11: no raw UUID is ever rendered — only `node.ref`/`node.label` (human
 * refs: lp_code / wo_number / grn number / supplier code+name). The deep-link
 * href is built from the internal `nodeId` UUID by the pure, locale-scoped
 * `toDetailHref` (run here from the `locale` string prop — not passed as a
 * function-valued prop, which cannot cross the RSC boundary) and used ONLY in
 * the `href` attribute, never as visible text.
 */

import { useMemo, useState, useTransition } from 'react';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Select } from '@monopilot/ui/Select';

import { downloadCsv, fileSafe, isoDateStamp, toCsv } from '../../../../../../../lib/shared/download';
import type {
  RunTraceReportAction,
  StartRecallDrillAction,
  CompleteRecallDrillAction,
  TraceDirection,
  TraceInputType,
  TraceNodeType,
  TraceNodeView,
  TraceReportView,
} from './trace-contracts';
import { DIRECTIONS, INPUT_TYPES, toDetailHref, type TraceLabels } from './labels';

type TraceNodeCsvView = TraceNodeView & {
  expiryDate?: string | null;
  bestBeforeDate?: string | null;
  qaStatus?: string | null;
};

type TraceReportCsvView = Omit<TraceReportView, 'nodes'> & {
  nodes: TraceNodeCsvView[];
  affectedCustomers?: Array<{
    customerId: string;
    customerName: string;
    customerCode: string | null;
  }>;
};

const NODE_VARIANT: Record<TraceNodeType, BadgeVariant> = {
  supplier: 'info',
  purchase_order: 'secondary',
  grn: 'secondary',
  input_lp: 'warning',
  work_order: 'default',
  output_lp: 'success',
  shipment_placeholder: 'muted',
};

/** The vertical chain order rendered in the tree (parity: supplier→…→shipment). */
const CHAIN_ORDER: TraceNodeType[] = [
  'supplier',
  'purchase_order',
  'grn',
  'input_lp',
  'work_order',
  'output_lp',
  'shipment_placeholder',
];

function summaryItem(testid: string, label: string, value: string | number) {
  return (
    <Card
      data-testid={testid}
      className="rounded-xl border border-slate-200 bg-white p-4"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{value}</p>
    </Card>
  );
}

export function TraceWorkbench({
  labels,
  locale,
  runTraceReportAction,
  startRecallDrillAction,
  completeRecallDrillAction,
  recallDrillsHref,
}: {
  labels: TraceLabels;
  locale: string;
  runTraceReportAction: RunTraceReportAction;
  startRecallDrillAction: StartRecallDrillAction;
  completeRecallDrillAction: CompleteRecallDrillAction;
  recallDrillsHref: string;
}) {
  const [inputRef, setInputRef] = useState('');
  const [inputType, setInputType] = useState<TraceInputType>('lp');
  const [direction, setDirection] = useState<TraceDirection>('both');
  const [report, setReport] = useState<TraceReportView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drillSaved, setDrillSaved] = useState(false);
  const [running, startRun] = useTransition();
  const [savingDrill, startSave] = useTransition();

  const trimmedRef = inputRef.trim();
  const canRun = trimmedRef.length > 0 && !running;

  // The plain runTraceReport returns nodes WITHOUT detailHref; we enrich each
  // node with a deep-link href client-side. `toDetailHref` is a PURE,
  // locale-scoped builder (validates the UUID format and only constructs the
  // href — never renders the UUID), so it runs here from the `locale` string
  // prop. This avoids passing a function-valued resolver across the RSC
  // boundary (which cannot serialise and crashes the page).
  const enrich = useMemo(
    () =>
      (raw: TraceReportView): TraceReportView => ({
        ...raw,
        nodes: raw.nodes.map((n) => ({
          ...n,
          detailHref: n.detailHref ?? toDetailHref(locale, n.type, n.nodeId),
        })),
      }),
    [locale],
  );

  function runTrace() {
    if (trimmedRef.length === 0) return;
    setError(null);
    setDrillSaved(false);
    startRun(async () => {
      try {
        const raw = await runTraceReportAction({ inputType, inputRef: trimmedRef, direction });
        setReport(enrich(raw as TraceReportView));
      } catch (error) {
        console.error('Trace report failed', error);
        setReport(null);
        setError(labels.states.errorTitle);
      }
    });
  }

  function saveDrill() {
    if (!report) return;
    setError(null);
    setDrillSaved(false);
    startSave(async () => {
      try {
        const { drillId, report: rawReport } = await startRecallDrillAction({
          inputType,
          inputRef: trimmedRef,
          direction,
        });
        // Strip the view-only `detailHref` enrichment before persisting so the
        // stored report matches the action's TraceReport shape exactly.
        const persisted = stripView(rawReport as TraceReportView);
        await completeRecallDrillAction(drillId, persisted as never);
        setReport(enrich(rawReport as TraceReportView));
        setDrillSaved(true);
      } catch (error) {
        console.error('Recall drill save failed', error);
        setError(labels.drillSaveError);
      }
    });
  }

  function exportCsv() {
    if (!report) return;
    const csv = buildTraceReportCsv(report as TraceReportCsvView);
    downloadCsv(csv, `quality-trace-${fileSafe(trimmedRef)}-${isoDateStamp()}.csv`);
  }

  const groupedNodes = useMemo(() => groupByChain(report?.nodes ?? []), [report]);

  return (
    <div className="flex flex-col gap-6">
      {/* ── Input row ─────────────────────────────────────────── */}
      <Card
        data-testid="trace-input-row"
        className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <fieldset className="flex flex-col gap-4">
          <legend className="sr-only">{labels.form.legend}</legend>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr]">
            {/* ref entry field */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.form.refLabel}</span>
              <input
                type="text"
                data-testid="trace-input-ref"
                value={inputRef}
                onChange={(e) => {
                  setInputRef(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canRun) runTrace();
                }}
                placeholder={labels.form.refPlaceholder}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
              />
            </label>

            {/* type selector (shadcn Select — no raw <select>) */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.form.typeLabel}</span>
              <div data-testid="trace-input-type">
                <Select
                  aria-label={labels.form.typeLabel}
                  value={inputType}
                  placeholder={labels.form.typePlaceholder}
                  onValueChange={(v) => setInputType(v as TraceInputType)}
                  options={INPUT_TYPES.map((k) => ({ value: k, label: labels.inputType[k] }))}
                />
              </div>
            </label>
          </div>

          {/* direction toggle (segmented control — all three options) */}
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.form.directionLabel}</span>
            <div
              role="radiogroup"
              aria-label={labels.form.directionLabel}
              className="inline-flex w-fit overflow-hidden rounded-md border border-slate-300"
            >
              {DIRECTIONS.map((d) => {
                const active = direction === d;
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    data-testid={`trace-direction-${d}`}
                    onClick={() => setDirection(d)}
                    className={[
                      'px-3 py-1.5 text-sm font-medium transition',
                      active ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    {labels.direction[d]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="trace-run"
              disabled={!canRun}
              onClick={runTrace}
              className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? labels.form.running : labels.form.run}
            </button>
            {report && (
              <>
                <button
                  type="button"
                  data-testid="trace-save-drill"
                  disabled={savingDrill}
                  onClick={saveDrill}
                  className="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 transition enabled:hover:bg-slate-50 disabled:opacity-50"
                >
                  {savingDrill ? labels.form.savingDrill : labels.form.saveDrill}
                </button>
                <button
                  type="button"
                  data-testid="trace-export-csv"
                  onClick={exportCsv}
                  className="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Export CSV
                </button>
              </>
            )}
          </div>
        </fieldset>
      </Card>

      {/* drill-saved banner */}
      {drillSaved && (
        <div
          role="status"
          data-testid="trace-drill-saved"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {labels.drillSaved}{' '}
          <a href={recallDrillsHref} className="font-medium underline">
            {labels.summary.title}
          </a>
        </div>
      )}

      {/* ── States: loading / error / empty / data ────────────── */}
      {running && !report ? (
        <div
          data-testid="trace-loading"
          data-state="loading"
          aria-busy="true"
          aria-label={labels.states.loading}
          className="flex flex-col gap-4"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
          <div className="h-48 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : error ? (
        <div
          role="alert"
          data-testid="trace-error"
          data-state="error"
          className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
        >
          <p className="font-semibold">{labels.states.errorTitle}</p>
          <p className="mt-1">{labels.states.errorBody}</p>
        </div>
      ) : !report ? (
        <Card
          data-testid="trace-empty"
          data-state="empty"
          className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center"
        >
          <span className="text-base font-semibold text-slate-700">{labels.states.emptyTitle}</span>
          <span className="max-w-md text-sm text-slate-500">{labels.states.emptyBody}</span>
          <span className="text-xs text-slate-400">{labels.states.emptyCta}</span>
        </Card>
      ) : (
        <div data-testid="trace-report" data-state="data" className="flex flex-col gap-6">
          {/* Summary panel — 5 counts */}
          <section aria-label={labels.summary.title} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-slate-800">{labels.summary.title}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {summaryItem('trace-summary-lpCount', labels.summary.lpCount, report.summary.lpCount)}
              {summaryItem('trace-summary-woCount', labels.summary.woCount, report.summary.woCount)}
              {summaryItem('trace-summary-shipmentCount', labels.summary.shipmentCount, report.summary.shipmentCount)}
              {summaryItem('trace-summary-customersAffected', labels.summary.customersAffected, report.summary.customersAffected)}
              {summaryItem('trace-summary-totalKg', labels.summary.totalKg, `${report.summary.totalKg} kg`)}
            </div>
          </section>

          {/* Node tree — supplier→GRN→input LP→WO→output LP→shipment marker */}
          <section aria-label={labels.graph.ariaLabel} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-slate-800">{labels.graph.title}</h2>
            <ol data-testid="trace-graph" className="flex flex-col gap-2">
              {groupedNodes.map(({ type, nodes }) => (
                <li key={type} className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {labels.nodeType[type]}
                  </span>
                  <ul className="flex flex-col gap-1">
                    {nodes.map((node) => (
                      <li key={node.nodeId}>
                        <NodeRow node={node} labels={labels} />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>

          {/* Flat table — ref, type, qty + uom */}
          <section aria-label={labels.table.ariaLabel} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-slate-800">{labels.table.title}</h2>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table data-testid="trace-flat-table" className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left font-medium text-slate-500">{labels.table.ref}</th>
                    <th scope="col" className="px-4 py-2 text-left font-medium text-slate-500">{labels.table.type}</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium text-slate-500">{labels.table.qty}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.flat.map((row) => (
                    <tr key={row.nodeId} data-testid={`trace-flat-row-${row.nodeId}`}>
                      <td className="px-4 py-2 font-mono text-slate-800">{row.ref}</td>
                      <td className="px-4 py-2">
                        <Badge variant={NODE_VARIANT[row.type]}>{labels.nodeType[row.type]}</Badge>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                        {row.qty !== null ? `${row.qty}${row.uom ? ` ${row.uom}` : ''}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function NodeRow({ node, labels }: { node: TraceNodeView; labels: TraceLabels }) {
  const inner = (
    <span className="flex items-center gap-2">
      <Badge variant={NODE_VARIANT[node.type]}>{labels.nodeType[node.type]}</Badge>
      <span className="font-mono text-sm text-slate-800">{node.label}</span>
      {node.qty !== null && (
        <span className="text-xs text-slate-500">
          {node.qty}
          {node.uom ? ` ${node.uom}` : ''}
        </span>
      )}
    </span>
  );
  if (node.detailHref) {
    return (
      <a
        href={node.detailHref}
        data-testid={`trace-node-link-${node.nodeId}`}
        className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 transition hover:border-sky-300 hover:bg-sky-50"
      >
        {inner}
        <span className="text-xs font-medium text-sky-700">{labels.graph.open}</span>
      </a>
    );
  }
  return (
    <div
      data-testid={`trace-node-${node.nodeId}`}
      className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
    >
      {inner}
    </div>
  );
}

export function buildTraceReportCsv(report: TraceReportCsvView): string {
  const header = ['section', 'node_id', 'type', 'ref', 'label', 'qty', 'uom', 'expiry_date', 'best_before_date', 'qa_status', 'customer_code', 'customer_name'];
  const rows: Array<ReadonlyArray<string | number | null | undefined>> = [];

  for (const node of report.nodes) {
    rows.push([
      'node',
      node.nodeId,
      node.type,
      node.ref,
      node.label,
      node.qty,
      node.uom,
      node.expiryDate,
      node.bestBeforeDate,
      node.qaStatus,
      null,
      null,
    ]);
  }

  for (const customer of report.affectedCustomers ?? []) {
    rows.push([
      'affected_customer',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      customer.customerCode,
      customer.customerName,
    ]);
  }

  return toCsv(header, rows);
}

/** Groups nodes by their chain stage in CHAIN_ORDER (only non-empty stages). */
function groupByChain(nodes: TraceNodeView[]): { type: TraceNodeType; nodes: TraceNodeView[] }[] {
  const byType = new Map<TraceNodeType, TraceNodeView[]>();
  for (const node of nodes) {
    const list = byType.get(node.type) ?? [];
    list.push(node);
    byType.set(node.type, list);
  }
  return CHAIN_ORDER.filter((type) => byType.has(type)).map((type) => ({
    type,
    nodes: byType.get(type) ?? [],
  }));
}

/** Drops the view-only `detailHref` so the persisted report matches TraceReport. */
function stripView(view: TraceReportView) {
  return {
    nodes: view.nodes.map(({ detailHref: _ignored, ...n }) => n),
    edges: view.edges,
    flat: view.flat,
    summary: view.summary,
  };
}

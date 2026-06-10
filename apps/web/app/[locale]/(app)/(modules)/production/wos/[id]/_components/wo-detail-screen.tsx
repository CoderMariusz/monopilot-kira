'use client';

/**
 * P-L1 — WO Execution detail screen, 8 tabs (prototype wo-detail.jsx:4-530).
 *
 * Presentational client component: receives the already-loaded, org-scoped
 * detail bundle + i18n labels from the server page and owns ONLY the active-tab
 * client state (prototype's `tab` useState, default "overview"). No data
 * fetching, no permission logic (both server-resolved).
 *
 * Tab parity (prototype anchors):
 *   Overview     :4-101   header KPIs / status / line / schedule
 *   Consumption  :257     wo_materials vs wo_material_consumption per component
 *   Output       :347     wo_outputs rows
 *   Waste        :409     waste events on this WO
 *   Downtime     :438     downtime events linked to this WO
 *   QA results   :181     linked inspections (honest empty until read-model lands)
 *   Genealogy    :454     LP links from wo_material_consumption (empty-state OK)
 *   History      :505     wo_status_history + execution events
 *
 * P2-MODALS: the prototype's header action bar (Pause / Waste / Catch-weight /
 * Complete — plus Start / Resume / Cancel / Close) + per-tab mutation buttons
 * (Register output, Log waste) are now WIRED to the existing WO route handlers
 * via the <WoActionsProvider> orchestrator. Each button is rendered ONLY when the
 * action is state-legal for the WO's runtime status AND the caller holds the
 * matching permission (server-resolved). The over-consumption approval banner +
 * D365 push card from the prototype remain omitted (no backing read-model here).
 */

import { useState } from 'react';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@monopilot/ui/Tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type {
  WorkOrderDetailData,
  WorkOrderDetailStatus,
} from '../../../_actions/get-work-order-detail';
import {
  WoActionsProvider,
  WoActionTrigger,
} from '../../_components/modals/wo-actions';
import type {
  WoActionPermissions,
  WoModalLabels,
  WoReasonCategory,
  WoWasteCategory,
  WoState,
} from '../../_components/modals/types';

const STATUS_VARIANT: Record<WorkOrderDetailStatus, BadgeVariant> = {
  planned: 'muted',
  in_progress: 'info',
  paused: 'warning',
  completed: 'success',
  closed: 'secondary',
  cancelled: 'danger',
};

type TabKey =
  | 'overview'
  | 'consumption'
  | 'output'
  | 'waste'
  | 'downtime'
  | 'qa'
  | 'genealogy'
  | 'history';

export type WoDetailLabels = {
  status: Record<WorkOrderDetailStatus, string>;
  deferredActionTitle: string;
  headerActions: {
    start: string;
    pause: string;
    resume: string;
    waste: string;
    catchWeight: string;
    complete: string;
    cancel: string;
    close: string;
  };
  tabs: Record<TabKey, string>;
  overview: {
    summaryTitle: string;
    kpisTitle: string;
    wo: string;
    product: string;
    line: string;
    machine: string;
    planned: string;
    output: string;
    plannedWindow: string;
    actualStart: string;
    elapsed: string;
    allergens: string;
    bomVersion: string;
    consumption: string;
    consumptionKpi: string;
    outputKpi: string;
    allergenYes: string;
    allergenNo: string;
    elapsedMin: string;
  };
  consumption: {
    title: string;
    empty: string;
    addAction: string;
    col: { code: string; component: string; planned: string; consumed: string; remaining: string; progress: string };
  };
  output: {
    title: string;
    empty: string;
    addAction: string;
    col: { type: string; product: string; qty: string; batch: string; expiry: string; qa: string; lp: string };
  };
  waste: {
    title: string;
    empty: string;
    addAction: string;
    totalLabel: string;
    col: { time: string; category: string; qty: string; reason: string };
  };
  downtime: {
    title: string;
    empty: string;
    addAction: string;
    openLabel: string;
    col: { category: string; start: string; end: string; duration: string; reason: string };
  };
  qa: { title: string; empty: string; total: string; pass: string; hold: string; fail: string };
  genealogy: {
    title: string;
    empty: string;
    inputsLabel: string;
    fefoOk: string;
    fefoDeviation: string;
  };
  history: {
    title: string;
    empty: string;
    sourceStatus: string;
    sourceExecution: string;
    col: { time: string; source: string; action: string; transition: string; reason: string };
  };
};

/**
 * Out-of-lane mutation slots (Consumption "Scan LP", Downtime "Log downtime")
 * stay DEFERRED — they belong to separate flows (LP scan / manual downtime) not
 * wired by P2-MODALS. Rendered DISABLED with an explanatory title.
 */
function DeferredButton({ label, title, testid }: { label: string; title: string; testid: string }) {
  return (
    <button
      type="button"
      disabled
      title={title}
      data-testid={testid}
      className="cursor-not-allowed rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-400"
    >
      {label}
    </button>
  );
}

function ProgressBar({ pct, label }: { pct: number; label: string }) {
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-sky-500' : 'bg-amber-500';
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
    >
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Server-resolved action context handed down to the modal orchestrator. */
export type WoDetailActions = {
  locale: string;
  status: WoState | null;
  permissions: WoActionPermissions;
  currentUserId: string;
  downtimeCategories: WoReasonCategory[];
  wasteCategories: WoWasteCategory[];
  modalLabels: WoModalLabels;
};

// Formatters live IN this client module — passing them as props from the RSC
// page crashed live (Next16 "Functions cannot be passed to Client Components";
// wave-P1 live verify, digests 568085975/520930007).
const QTY_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
function fmtQty(n: number): string {
  return QTY_FMT.format(Math.round(n));
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

export function WoDetailScreen({
  data,
  labels,
  actions,
}: {
  data: WorkOrderDetailData;
  labels: WoDetailLabels;
  /** Null when the action-context read failed/forbade — buttons are then hidden. */
  actions: WoDetailActions | null;
}) {
  const [tab, setTab] = useState<TabKey>('overview');
  const { header: h } = data;

  const tabOrder: TabKey[] = [
    'overview',
    'consumption',
    'output',
    'waste',
    'downtime',
    'qa',
    'genealogy',
    'history',
  ];
  const counts: Partial<Record<TabKey, number>> = {
    consumption: data.components.length,
    output: data.outputs.length,
    waste: data.waste.length,
    downtime: data.downtime.length,
    qa: data.qa.total,
    history: data.history.length,
  };

  const wasteTotalKg = data.waste.reduce((a, w) => a + w.qtyKg, 0);

  const body = (
    <div className="flex flex-col gap-4">
      {/* WO header — code, name, status, key facts + wired action bar */}
      <Card data-testid="wo-detail-header" className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-lg font-semibold text-slate-900">{h.woNumber}</span>
              <Badge variant={STATUS_VARIANT[h.status]}>{labels.status[h.status]}</Badge>
              {h.bomVersion !== null ? (
                <Badge variant="muted" className="text-[10px]">
                  {labels.overview.bomVersion} {h.bomVersion}
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              <span className="font-mono">{h.productId.slice(0, 8)}</span>
              {h.lineId ? <> · {h.lineId.slice(0, 8)}</> : null}
              {' · '}
              {labels.overview.elapsed} <b>{h.elapsedMin === null ? '—' : `${h.elapsedMin} ${labels.overview.elapsedMin}`}</b>
            </p>
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap gap-2" data-testid="wo-action-bar">
              <WoActionTrigger kind="start" label={labels.headerActions.start} />
              <WoActionTrigger kind="pause" label={labels.headerActions.pause} />
              <WoActionTrigger kind="resume" label={labels.headerActions.resume} />
              <WoActionTrigger kind="waste" label={labels.headerActions.waste} testid="wo-action-waste-header" />
              <WoActionTrigger kind="output" label={labels.headerActions.catchWeight} testid="wo-action-catchweight" />
              <WoActionTrigger kind="complete" label={labels.headerActions.complete} />
              <WoActionTrigger kind="close" label={labels.headerActions.close} />
              <WoActionTrigger kind="cancel" label={labels.headerActions.cancel} />
            </div>
          ) : null}
        </div>

        {/* Twin progress bars */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1 flex justify-between text-xs text-slate-600">
              <span>{labels.overview.consumption}</span>
              <b className="font-mono">{h.consumptionPct.toFixed(1)}%</b>
            </div>
            <ProgressBar pct={h.consumptionPct} label={`${labels.overview.consumption} ${h.consumptionPct}%`} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs text-slate-600">
              <span>{labels.overview.output}</span>
              <b className="font-mono">
                {fmtQty(h.outputKg)} / {fmtQty(h.plannedQty)} {h.uom} ({h.outputPct.toFixed(1)}%)
              </b>
            </div>
            <ProgressBar pct={h.outputPct} label={`${labels.overview.output} ${h.outputPct}%`} />
          </div>
        </div>
      </Card>

      {/* 8 tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} data-testid="wo-detail-tabs">
        <TabsList className="flex flex-wrap gap-1 border-b border-slate-200" aria-label={labels.overview.summaryTitle}>
          {tabOrder.map((k) => (
            <TabsTrigger
              key={k}
              value={k}
              data-testid={`wo-detail-tab-${k}`}
              className="flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm text-slate-500 transition data-[state=active]:border-slate-900 data-[state=active]:font-semibold data-[state=active]:text-slate-900"
            >
              {labels.tabs[k]}
              {counts[k] !== undefined ? (
                <span className="rounded-full bg-slate-100 px-1.5 text-[11px] tabular-nums text-slate-600">
                  {counts[k]}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-4">
          <Card data-testid="wo-tab-overview" className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">{labels.overview.summaryTitle}</h3>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Fact label={labels.overview.wo} value={h.woNumber} mono />
              <Fact label={labels.overview.product} value={h.productId.slice(0, 8)} mono />
              <Fact label={labels.overview.line} value={h.lineId ? h.lineId.slice(0, 8) : '—'} mono />
              <Fact label={labels.overview.machine} value={h.machineId ? h.machineId.slice(0, 8) : '—'} mono />
              <Fact label={labels.overview.planned} value={`${fmtQty(h.plannedQty)} ${h.uom}`} mono />
              <Fact label={labels.overview.output} value={`${fmtQty(h.outputKg)} ${h.uom}`} mono />
              <Fact label={labels.overview.plannedWindow} value={`${fmtDate(h.scheduledStart)} → ${fmtDate(h.scheduledEnd)}`} mono />
              <Fact label={labels.overview.actualStart} value={fmtDate(h.startedAt)} mono />
              <Fact
                label={labels.overview.allergens}
                value={h.allergenGate ? labels.overview.allergenYes : labels.overview.allergenNo}
              />
            </dl>

            {/* KPI mini-cards */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Kpi label={labels.overview.consumptionKpi} value={`${h.consumptionPct.toFixed(1)}%`} />
              <Kpi label={labels.overview.outputKpi} value={`${h.outputPct.toFixed(1)}%`} />
            </div>
          </Card>
        </TabsContent>

        {/* Consumption */}
        <TabsContent value="consumption" className="mt-4">
          <Card data-testid="wo-tab-consumption" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <CardHead title={labels.consumption.title}>
              <DeferredButton label={labels.consumption.addAction} title={labels.deferredActionTitle} testid="wo-consumption-add" />
            </CardHead>
            {data.components.length === 0 ? (
              <Empty testid="wo-consumption-empty" copy={labels.consumption.empty} />
            ) : (
              <Table aria-label={labels.consumption.title}>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{labels.consumption.col.code}</TableHead>
                    <TableHead scope="col">{labels.consumption.col.component}</TableHead>
                    <TableHead scope="col" className="text-right">{labels.consumption.col.planned}</TableHead>
                    <TableHead scope="col" className="text-right">{labels.consumption.col.consumed}</TableHead>
                    <TableHead scope="col" className="text-right">{labels.consumption.col.remaining}</TableHead>
                    <TableHead scope="col">{labels.consumption.col.progress}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.components.map((c) => (
                    <TableRow key={c.id} data-testid="wo-component-row">
                      <TableCell className="font-mono text-xs text-slate-500">{c.productId.slice(0, 8)}</TableCell>
                      <TableCell className="text-sm font-medium text-slate-800">{c.materialName}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{fmtQty(c.requiredQty)} {c.uom}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{fmtQty(c.consumedQty)} {c.uom}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{fmtQty(c.remainingQty)} {c.uom}</TableCell>
                      <TableCell className="w-40">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-[11px] tabular-nums text-slate-500">{c.progressPct}%</span>
                          <ProgressBar pct={c.progressPct} label={`${c.materialName} ${c.progressPct}%`} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* Output */}
        <TabsContent value="output" className="mt-4">
          <Card data-testid="wo-tab-output" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <CardHead title={labels.output.title}>
              {actions ? (
                <WoActionTrigger kind="output" label={labels.output.addAction} variant="tab" testid="wo-output-add" />
              ) : null}
            </CardHead>
            {data.outputs.length === 0 ? (
              <Empty testid="wo-output-empty" copy={labels.output.empty} />
            ) : (
              <Table aria-label={labels.output.title}>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{labels.output.col.type}</TableHead>
                    <TableHead scope="col">{labels.output.col.product}</TableHead>
                    <TableHead scope="col" className="text-right">{labels.output.col.qty}</TableHead>
                    <TableHead scope="col">{labels.output.col.batch}</TableHead>
                    <TableHead scope="col">{labels.output.col.expiry}</TableHead>
                    <TableHead scope="col">{labels.output.col.qa}</TableHead>
                    <TableHead scope="col">{labels.output.col.lp}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.outputs.map((o) => (
                    <TableRow key={o.id} data-testid="wo-output-row">
                      <TableCell><Badge variant="muted" className="text-[10px]">{o.outputType}</Badge></TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">{o.productId.slice(0, 8)}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{fmtQty(o.qtyKg)} {o.uom}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">{o.batchNumber}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">{fmtDate(o.expiryDate)}</TableCell>
                      <TableCell><Badge variant="muted" className="text-[10px]">{o.qaStatus}</Badge></TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">{o.lpId ? o.lpId.slice(0, 8) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* Waste */}
        <TabsContent value="waste" className="mt-4">
          <Card data-testid="wo-tab-waste" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <CardHead title={labels.waste.title}>
              {actions ? (
                <WoActionTrigger kind="waste" label={labels.waste.addAction} variant="tab" testid="wo-waste-add" />
              ) : null}
            </CardHead>
            {data.waste.length === 0 ? (
              <Empty testid="wo-waste-empty" copy={labels.waste.empty} />
            ) : (
              <>
                <Table aria-label={labels.waste.title}>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{labels.waste.col.time}</TableHead>
                      <TableHead scope="col">{labels.waste.col.category}</TableHead>
                      <TableHead scope="col" className="text-right">{labels.waste.col.qty}</TableHead>
                      <TableHead scope="col">{labels.waste.col.reason}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.waste.map((w) => (
                      <TableRow key={w.id} data-testid="wo-waste-row">
                        <TableCell className="font-mono text-xs text-slate-500">{fmtDate(w.recordedAt)}</TableCell>
                        <TableCell><Badge variant="warning" className="text-[10px]">{w.categoryName ?? '—'}</Badge></TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">{fmtQty(w.qtyKg)} kg</TableCell>
                        <TableCell className="text-sm text-slate-600">{w.reasonNotes ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="px-4 py-2 text-xs text-slate-500" data-testid="wo-waste-total">
                  {labels.waste.totalLabel.replace('{kg}', fmtQty(wasteTotalKg))}
                </p>
              </>
            )}
          </Card>
        </TabsContent>

        {/* Downtime */}
        <TabsContent value="downtime" className="mt-4">
          <Card data-testid="wo-tab-downtime" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <CardHead title={labels.downtime.title}>
              <DeferredButton label={labels.downtime.addAction} title={labels.deferredActionTitle} testid="wo-downtime-add" />
            </CardHead>
            {data.downtime.length === 0 ? (
              <Empty testid="wo-downtime-empty" copy={labels.downtime.empty} />
            ) : (
              <Table aria-label={labels.downtime.title}>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{labels.downtime.col.category}</TableHead>
                    <TableHead scope="col">{labels.downtime.col.start}</TableHead>
                    <TableHead scope="col">{labels.downtime.col.end}</TableHead>
                    <TableHead scope="col" className="text-right">{labels.downtime.col.duration}</TableHead>
                    <TableHead scope="col">{labels.downtime.col.reason}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.downtime.map((d) => (
                    <TableRow key={d.id} data-testid="wo-downtime-row">
                      <TableCell><Badge variant="muted" className="text-[10px]">{d.categoryName ?? '—'}</Badge></TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">{fmtDate(d.startedAt)}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">
                        {d.endedAt ? fmtDate(d.endedAt) : <Badge variant="info" className="text-[10px]">{labels.downtime.openLabel}</Badge>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{d.durationMin === null ? '—' : `${d.durationMin}m`}</TableCell>
                      <TableCell className="text-sm text-slate-600">{d.reasonNotes ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* QA results */}
        <TabsContent value="qa" className="mt-4">
          <Card data-testid="wo-tab-qa" className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">{labels.qa.title}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label={labels.qa.total} value={String(data.qa.total)} />
              <Kpi label={labels.qa.pass} value={String(data.qa.pass)} />
              <Kpi label={labels.qa.hold} value={String(data.qa.hold)} />
              <Kpi label={labels.qa.fail} value={String(data.qa.fail)} />
            </div>
            {data.qa.total === 0 ? (
              <p className="mt-4 text-center text-sm text-slate-500" data-testid="wo-qa-empty">
                {labels.qa.empty}
              </p>
            ) : null}
          </Card>
        </TabsContent>

        {/* Genealogy */}
        <TabsContent value="genealogy" className="mt-4">
          <Card data-testid="wo-tab-genealogy" className="overflow-hidden rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">{labels.genealogy.title}</h3>
            {data.genealogyInputs.length === 0 ? (
              <p className="text-center text-sm text-slate-500" data-testid="wo-genealogy-empty">
                {labels.genealogy.empty}
              </p>
            ) : (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {labels.genealogy.inputsLabel} ({data.genealogyInputs.length})
                </p>
                <ul className="flex flex-col gap-2">
                  {data.genealogyInputs.map((g) => (
                    <li
                      key={g.id}
                      data-testid="wo-genealogy-input"
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-slate-700">{g.lpId.slice(0, 8)}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono tabular-nums text-slate-600">{fmtQty(g.qtyKg)} kg</span>
                        <Badge variant={g.fefoAdherence ? 'success' : 'warning'} className="text-[10px]">
                          {g.fefoAdherence ? labels.genealogy.fefoOk : labels.genealogy.fefoDeviation}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="mt-4">
          <Card data-testid="wo-tab-history" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <CardHead title={labels.history.title} />
            {data.history.length === 0 ? (
              <Empty testid="wo-history-empty" copy={labels.history.empty} />
            ) : (
              <Table aria-label={labels.history.title}>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{labels.history.col.time}</TableHead>
                    <TableHead scope="col">{labels.history.col.source}</TableHead>
                    <TableHead scope="col">{labels.history.col.action}</TableHead>
                    <TableHead scope="col">{labels.history.col.transition}</TableHead>
                    <TableHead scope="col">{labels.history.col.reason}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.history.map((e) => (
                    <TableRow key={e.id} data-testid="wo-history-row">
                      <TableCell className="font-mono text-xs text-slate-500">{fmtDate(e.occurredAt)}</TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {e.source === 'status' ? labels.history.sourceStatus : labels.history.sourceExecution}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-slate-800">{e.action}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">
                        {e.fromStatus ? `${e.fromStatus} → ${e.toStatus}` : e.toStatus}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">{e.reason ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );

  // When the action context resolved, wrap the screen in the orchestrator so the
  // header / per-tab triggers can open the wired modals. Otherwise (read failed /
  // forbidden) the body renders with no action affordances.
  if (!actions) return body;

  return (
    <WoActionsProvider
      locale={actions.locale}
      woId={h.id}
      status={actions.status}
      permissions={actions.permissions}
      labels={actions.modalLabels}
      currentUserId={actions.currentUserId}
      downtimeCategories={actions.downtimeCategories}
      wasteCategories={actions.wasteCategories}
      defaultLineId={h.lineId}
      defaultProductId={h.productId}
    >
      {body}
    </WoActionsProvider>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className={['font-medium text-slate-800', mono ? 'font-mono' : ''].filter(Boolean).join(' ')}>{value}</dd>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="font-mono text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function CardHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {children ? <div className="flex gap-2">{children}</div> : null}
    </div>
  );
}

function Empty({ testid, copy }: { testid: string; copy: string }) {
  return (
    <p data-testid={testid} className="px-4 py-10 text-center text-sm text-slate-500">
      {copy}
    </p>
  );
}

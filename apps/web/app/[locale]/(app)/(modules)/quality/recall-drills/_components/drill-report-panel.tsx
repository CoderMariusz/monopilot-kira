/**
 * Recall Drill — saved-report panel (Wave E2A).
 *
 * Presentational (server-renderable) component that renders the trace report
 * persisted on a recall drill (the 5 summary counts + the flat node table). It
 * is read-only — the live, interactive trace workbench lives on /quality/trace;
 * a drill stores a SNAPSHOT, so this panel never re-runs the trace and never
 * builds deep-links (the snapshot ids may be stale). Only the human node refs
 * are rendered (rule 0.11: no raw UUID).
 *
 * Copy: the node-type / summary / table headers live under `quality.trace`, so
 * the parent page passes the resolved trace labels (`traceLabels`); the section
 * titles + empty copy come from `quality.recallDrills` (`labels`).
 */
import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';

import type { TraceNodeType, TraceReport } from '../../trace/_components/trace-contracts';
import type { TraceLabels } from '../../trace/_components/labels';
import type { RecallDrillsLabels } from '../../trace/_components/labels';

const NODE_VARIANT: Record<TraceNodeType, BadgeVariant> = {
  supplier: 'info',
  purchase_order: 'secondary',
  grn: 'secondary',
  input_lp: 'warning',
  work_order: 'default',
  output_lp: 'success',
  shipment_placeholder: 'muted',
};

function summaryItem(label: string, value: string | number) {
  return (
    <Card className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{value}</p>
    </Card>
  );
}

export function DrillReportPanel({
  report,
  labels,
  traceLabels,
}: {
  report: TraceReport | null;
  labels: RecallDrillsLabels;
  traceLabels: TraceLabels;
}) {
  if (!report) {
    return (
      <Card
        data-testid="drill-report-empty"
        data-state="empty"
        className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500"
      >
        {labels.states.emptyBody}
      </Card>
    );
  }

  return (
    <div data-testid="drill-report" className="flex flex-col gap-6">
      <section aria-label={labels.detail.summaryTitle} className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-slate-800">{labels.detail.summaryTitle}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {summaryItem(traceLabels.summary.lpCount, report.summary.lpCount)}
          {summaryItem(traceLabels.summary.woCount, report.summary.woCount)}
          {summaryItem(traceLabels.summary.shipmentCount, report.summary.shipmentCount)}
          {summaryItem(traceLabels.summary.customersAffected, report.summary.customersAffected)}
          {summaryItem(traceLabels.summary.totalKg, `${report.summary.totalKg} kg`)}
        </div>
      </section>

      <section aria-label={labels.detail.reportTitle} className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-slate-800">{labels.detail.reportTitle}</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table data-testid="drill-flat-table" className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-2 text-left font-medium text-slate-500">{traceLabels.table.ref}</th>
                <th scope="col" className="px-4 py-2 text-left font-medium text-slate-500">{traceLabels.table.type}</th>
                <th scope="col" className="px-4 py-2 text-right font-medium text-slate-500">{traceLabels.table.qty}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.flat.map((row) => (
                <tr key={row.nodeId}>
                  <td className="px-4 py-2 font-mono text-slate-800">{row.ref}</td>
                  <td className="px-4 py-2">
                    <Badge variant={NODE_VARIANT[row.type]}>{traceLabels.nodeType[row.type]}</Badge>
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
  );
}

/**
 * T-046 — SCR-08-02 Production WO list (dashboard panel).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/production/
 * wo-list.jsx:52-101 (the WO table: WO number + allergen badge, item/product,
 * line, status badge, planned kg, progress bar, output). Translated to the
 * @monopilot/ui Table + Badge primitives; the prototype's WOS mock array + raw
 * `<table>` are replaced by real wo_executions⨝work_orders rows (RLS-scoped) and
 * shadcn primitives. The inline progress `<span>` becomes an accessible
 * `role="progressbar"` bar. Per-row Start/Pause/Resume actions are out of scope
 * for the landing panel (T-047 owns row actions / the Start WO modal); a blocked
 * (planned) row carries a Planning deep-link instead of an in-Production Release
 * control — the deprecated `release_wo_modal` is never rendered.
 *
 * Presentational only — strings (headers, status labels, empty copy) arrive as
 * props so the panel is RTL-testable and i18n is owned by the page.
 */
import Link from 'next/link';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type { WoExecStatus } from '../_actions/dashboard-data';

export type WoRowView = {
  id: string;
  woNumber: string;
  status: WoExecStatus;
  statusLabel: string;
  lineLabel: string;
  plannedLabel: string;
  producedLabel: string;
  progressPct: number | null;
  allergenGate: boolean;
  overProductionFlagged: boolean;
  /** Deep-link to the Planning release queue for not-yet-startable (planned) WOs. */
  planningHref: string | null;
  /** Deep-link to the WO Execution detail (`/production/wos/<id>`). */
  detailHref?: string;
};

const STATUS_VARIANT: Record<WoExecStatus, BadgeVariant> = {
  planned: 'muted',
  in_progress: 'info',
  paused: 'warning',
  completed: 'success',
  closed: 'secondary',
  cancelled: 'danger',
};

export type WoListLabels = {
  title: string;
  emptyCopy: string;
  allergenBadge: string;
  overProductionListBadge: string;
  planningLink: string;
  col: {
    wo: string;
    line: string;
    status: string;
    planned: string;
    progress: string;
    output: string;
  };
};

function ProgressBar({ pct, label }: { pct: number; label: string }) {
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-sky-500' : 'bg-amber-500';
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100"
    >
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function WoListTable({ rows, labels }: { rows: WoRowView[]; labels: WoListLabels }) {
  return (
    <Card
      data-testid="production-wo-list"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
        {labels.title}
      </div>
      {rows.length === 0 ? (
        <p data-testid="production-wo-list-empty" className="px-4 py-8 text-center text-sm text-slate-500">
          {labels.emptyCopy}
        </p>
      ) : (
        <Table aria-label={labels.title}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{labels.col.wo}</TableHead>
              <TableHead scope="col">{labels.col.line}</TableHead>
              <TableHead scope="col">{labels.col.status}</TableHead>
              <TableHead scope="col" className="text-right">{labels.col.planned}</TableHead>
              <TableHead scope="col">{labels.col.progress}</TableHead>
              <TableHead scope="col" className="text-right">{labels.col.output}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} data-testid={`production-wo-row-${row.id}`}>
                <TableCell className="font-mono text-sm font-semibold text-slate-900">
                  {row.detailHref ? (
                    <Link
                      href={row.detailHref}
                      data-testid={`production-wo-detail-link-${row.id}`}
                      className="inline-flex items-center gap-2 hover:underline"
                    >
                      {row.woNumber}
                      {row.allergenGate ? (
                        <Badge
                          variant="warning"
                          data-testid={`production-wo-allergen-${row.id}`}
                          className="text-[10px]"
                        >
                          {labels.allergenBadge}
                        </Badge>
                      ) : null}
                      {row.overProductionFlagged ? (
                        <Badge
                          variant="warning"
                          data-testid={`production-wo-over-production-${row.id}`}
                          className="text-[10px]"
                        >
                          {labels.overProductionListBadge}
                        </Badge>
                      ) : null}
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      {row.woNumber}
                      {row.allergenGate ? (
                        <Badge
                          variant="warning"
                          data-testid={`production-wo-allergen-${row.id}`}
                          className="text-[10px]"
                        >
                          {labels.allergenBadge}
                        </Badge>
                      ) : null}
                      {row.overProductionFlagged ? (
                        <Badge
                          variant="warning"
                          data-testid={`production-wo-over-production-${row.id}`}
                          className="text-[10px]"
                        >
                          {labels.overProductionListBadge}
                        </Badge>
                      ) : null}
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-slate-500">{row.lineLabel}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[row.status]}>{row.statusLabel}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">{row.plannedLabel}</TableCell>
                <TableCell>
                  {row.progressPct === null ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums">{row.progressPct}%</span>
                      <ProgressBar pct={row.progressPct} label={`${labels.col.progress} ${row.progressPct}%`} />
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {row.status === 'planned' && row.planningHref ? (
                    <Link
                      href={row.planningHref}
                      data-testid={`production-wo-planning-link-${row.id}`}
                      className="text-sky-600 hover:text-sky-700"
                    >
                      {labels.planningLink}
                    </Link>
                  ) : (
                    row.producedLabel
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

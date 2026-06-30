'use client';

import { Card } from '@monopilot/ui/Card';

import type { MwoOverviewStats } from '../_actions/mwo-actions';
import type { MwoListLabels } from './mwo-list.client';

export function MwoOverview({
  stats,
  labels,
}: {
  stats: MwoOverviewStats;
  labels: NonNullable<MwoListLabels['overview']>;
}) {
  const backlog = [
    { label: labels.d0_7, value: stats.backlog.d0_7 },
    { label: labels.d8_30, value: stats.backlog.d8_30 },
    { label: labels.d31_plus, value: stats.backlog.d31_plus },
  ];
  const backlogMax = Math.max(1, ...backlog.map((b) => b.value));
  const ratioTotal = Math.max(1, stats.ratio.planned + stats.ratio.unplanned);
  const plannedPct = Math.round((stats.ratio.planned / ratioTotal) * 100);
  const unplannedPct = Math.max(0, 100 - plannedPct);

  return (
    <div className="grid gap-3 lg:grid-cols-[2fr_1fr]" data-testid="mwo-overview">
      <Card className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">{labels.backlogTitle}</h2>
          <p className="text-xs text-slate-500">{labels.backlogSubtitle}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {backlog.map((bucket) => (
            <div key={bucket.label} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-slate-600">{bucket.label}</span>
                <span className="font-mono text-lg font-semibold text-slate-900">{bucket.value}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-200" aria-hidden="true">
                <div
                  className="h-2 rounded-full bg-slate-900"
                  style={{ width: `${Math.max(4, Math.round((bucket.value / backlogMax) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">{labels.ratioTitle}</h2>
          <p className="text-xs text-slate-500">{labels.ratioSubtitle}</p>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-amber-100" aria-hidden="true">
          <div className="bg-emerald-600" style={{ width: `${plannedPct}%` }} />
          <div className="bg-amber-400" style={{ width: `${unplannedPct}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs text-slate-500">{labels.planned}</p>
            <p className="font-mono text-lg font-semibold text-slate-900">{stats.ratio.planned}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{labels.unplanned}</p>
            <p className="font-mono text-lg font-semibold text-slate-900">{stats.ratio.unplanned}</p>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
          <span>{plannedPct}%</span>
          <span>{unplannedPct}%</span>
        </div>
      </Card>
    </div>
  );
}

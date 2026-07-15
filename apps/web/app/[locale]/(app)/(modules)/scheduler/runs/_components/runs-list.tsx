import Link from 'next/link';

import type { SchedulerRunListItem } from '../_actions/runs-loaders';

export type RunsListLabels = {
  empty: string;
  emptyHint: string;
  columns: {
    when: string;
    status: string;
    lines: string;
    assignments: string;
    horizon: string;
    actions: string;
  };
  allLines: string;
  applied: string;
  viewAssignments: string;
  openOnBoard: string;
  horizonDays: (n: number) => string;
  counts: (total: number, draft: number, approved: number) => string;
};

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function RunsList({
  locale,
  runs,
  labels,
}: {
  locale: string;
  runs: SchedulerRunListItem[];
  labels: RunsListLabels;
}) {
  if (runs.length === 0) {
    return (
      <div
        data-testid="scheduler-runs-empty"
        className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center"
      >
        <p className="text-sm font-medium text-slate-800">{labels.empty}</p>
        <p className="mt-1 text-sm text-slate-500">{labels.emptyHint}</p>
      </div>
    );
  }

  return (
    <div
      data-testid="scheduler-runs-table"
      className="overflow-x-auto rounded-xl border border-slate-200 bg-white"
    >
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">{labels.columns.when}</th>
            <th className="px-4 py-3 font-medium">{labels.columns.status}</th>
            <th className="px-4 py-3 font-medium">{labels.columns.lines}</th>
            <th className="px-4 py-3 font-medium">{labels.columns.assignments}</th>
            <th className="px-4 py-3 font-medium">{labels.columns.horizon}</th>
            <th className="px-4 py-3 font-medium">{labels.columns.actions}</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.runId}
              data-testid={`scheduler-run-row-${run.runId}`}
              className="border-b border-slate-100 last:border-0"
            >
              <td className="px-4 py-3 text-slate-800">
                {formatWhen(run.completedAt ?? run.queuedAt)}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase text-slate-700">
                    {run.status}
                  </span>
                  {run.applied ? (
                    <span
                      data-testid={`scheduler-run-applied-${run.runId}`}
                      className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                    >
                      {labels.applied}
                    </span>
                  ) : null}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-700">
                {run.lineLabels.length > 0 ? run.lineLabels.join(', ') : labels.allLines}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {labels.counts(run.assignmentCount, run.draftCount, run.approvedCount)}
              </td>
              <td className="px-4 py-3 text-slate-700">{labels.horizonDays(run.horizonDays)}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/${locale}/scheduler/runs/${run.runId}`}
                    data-testid={`scheduler-run-assignments-link-${run.runId}`}
                    className="text-sm font-medium text-slate-900 underline-offset-2 hover:underline"
                  >
                    {labels.viewAssignments}
                  </Link>
                  <Link
                    href={`/${locale}/scheduler?runId=${run.runId}`}
                    data-testid={`scheduler-run-board-link-${run.runId}`}
                    className="text-sm text-slate-600 underline-offset-2 hover:underline"
                  >
                    {labels.openOnBoard}
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

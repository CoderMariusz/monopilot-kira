import Link from 'next/link';

import type {
  SchedulerRunAssignmentItem,
  SchedulerRunListItem,
} from '../_actions/runs-loaders';

export type RunDetailLabels = {
  backToRuns: string;
  openOnBoard: string;
  applied: string;
  allLines: string;
  emptyAssignments: string;
  meta: {
    status: string;
    horizon: string;
    lines: string;
    when: string;
    optimizer: string;
  };
  columns: {
    sequence: string;
    wo: string;
    line: string;
    start: string;
    end: string;
    changeover: string;
    status: string;
  };
  horizonDays: (n: number) => string;
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

export function RunDetail({
  locale,
  run,
  assignments,
  labels,
}: {
  locale: string;
  run: SchedulerRunListItem;
  assignments: SchedulerRunAssignmentItem[];
  labels: RunDetailLabels;
}) {
  return (
    <div data-testid="scheduler-run-detail" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/${locale}/scheduler/runs`}
          data-testid="scheduler-run-detail-back"
          className="text-sm font-medium text-slate-700 underline-offset-2 hover:underline"
        >
          {labels.backToRuns}
        </Link>
        <Link
          href={`/${locale}/scheduler?runId=${run.runId}`}
          data-testid="scheduler-run-detail-board"
          className="text-sm text-slate-600 underline-offset-2 hover:underline"
        >
          {labels.openOnBoard}
        </Link>
        {run.applied ? (
          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            {labels.applied}
          </span>
        ) : null}
      </div>

      <dl
        data-testid="scheduler-run-detail-meta"
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{labels.meta.status}</dt>
          <dd className="mt-1 text-sm font-medium text-slate-900">{run.status}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{labels.meta.horizon}</dt>
          <dd className="mt-1 text-sm font-medium text-slate-900">
            {labels.horizonDays(run.horizonDays)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{labels.meta.lines}</dt>
          <dd className="mt-1 text-sm font-medium text-slate-900">
            {run.lineLabels.length > 0 ? run.lineLabels.join(', ') : labels.allLines}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{labels.meta.when}</dt>
          <dd className="mt-1 text-sm font-medium text-slate-900">
            {formatWhen(run.completedAt ?? run.queuedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{labels.meta.optimizer}</dt>
          <dd className="mt-1 text-sm font-medium text-slate-900">{run.optimizerVersion}</dd>
        </div>
      </dl>

      {assignments.length === 0 ? (
        <div
          data-testid="scheduler-run-detail-empty"
          className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-sm text-slate-600"
        >
          {labels.emptyAssignments}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table
            data-testid="scheduler-run-assignments-table"
            className="min-w-full text-left text-sm"
          >
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">{labels.columns.sequence}</th>
                <th className="px-4 py-3 font-medium">{labels.columns.wo}</th>
                <th className="px-4 py-3 font-medium">{labels.columns.line}</th>
                <th className="px-4 py-3 font-medium">{labels.columns.start}</th>
                <th className="px-4 py-3 font-medium">{labels.columns.end}</th>
                <th className="px-4 py-3 font-medium">{labels.columns.changeover}</th>
                <th className="px-4 py-3 font-medium">{labels.columns.status}</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr
                  key={a.id}
                  data-testid={`scheduler-run-assignment-${a.id}`}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-4 py-3 text-slate-700">{a.sequenceIndex ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{a.woNumber}</td>
                  <td className="px-4 py-3 text-slate-700">{a.lineLabel ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{formatWhen(a.plannedStartAt)}</td>
                  <td className="px-4 py-3 text-slate-700">{formatWhen(a.plannedEndAt)}</td>
                  <td className="px-4 py-3 text-slate-700">{a.changeoverMinutes ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase text-slate-700">
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

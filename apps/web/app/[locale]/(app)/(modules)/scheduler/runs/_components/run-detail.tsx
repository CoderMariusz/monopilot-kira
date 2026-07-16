import Link from 'next/link';

import type {
  SchedulerRunAssignmentItem,
  SchedulerRunListItem,
} from '../_actions/runs-loaders';
import {
  RunAssignmentsTable,
  type RunAssignmentsTableLabels,
} from './run-assignments-table';
import type { OverrideSchedulerAssignmentResult } from '../../_actions/scheduler-types';

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
  assignments: RunAssignmentsTableLabels;
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
  canOverride = false,
  lines = [],
  overrideAction,
}: {
  locale: string;
  run: SchedulerRunListItem;
  assignments: SchedulerRunAssignmentItem[];
  labels: RunDetailLabels;
  canOverride?: boolean;
  lines?: Array<{ id: string; code: string; name: string }>;
  overrideAction?: (
    input: import('../../_actions/scheduler-types').OverrideSchedulerAssignmentInput,
  ) => Promise<OverrideSchedulerAssignmentResult>;
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
        <RunAssignmentsTable
          assignments={assignments}
          applied={run.applied}
          canOverride={canOverride}
          lines={lines}
          labels={labels.assignments}
          overrideAction={overrideAction}
        />
      )}
    </div>
  );
}

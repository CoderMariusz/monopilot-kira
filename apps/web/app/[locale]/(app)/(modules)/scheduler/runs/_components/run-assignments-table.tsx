'use client';

import React from 'react';

import { Button } from '@monopilot/ui/Button';

import { formatUtcDateTime } from '../../../../../../../lib/shared/format-utc-datetime';

import type { OverrideSchedulerAssignmentResult } from '../../_actions/scheduler-types';
import {
  OverrideAssignmentModal,
  type OverrideAssignmentModalLabels,
  type OverrideAssignmentTarget,
} from '../../_components/override-assignment-modal';
import type { SchedulerRunAssignmentItem } from '../_actions/runs-loaders';

export type RunAssignmentsTableLabels = {
  columns: {
    sequence: string;
    wo: string;
    line: string;
    start: string;
    end: string;
    changeover: string;
    status: string;
    actions: string;
  };
  override: string;
  overrideModal: OverrideAssignmentModalLabels;
};

type OverrideAction = (
  input: import('../../_actions/scheduler-types').OverrideSchedulerAssignmentInput,
) => Promise<OverrideSchedulerAssignmentResult>;

function formatWhen(iso: string | null): string {
  return formatUtcDateTime(iso, 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function RunAssignmentsTable({
  assignments,
  applied,
  canOverride,
  lines,
  labels,
  overrideAction,
}: {
  assignments: SchedulerRunAssignmentItem[];
  applied: boolean;
  canOverride: boolean;
  lines: Array<{ id: string; code: string; name: string }>;
  labels: RunAssignmentsTableLabels;
  overrideAction?: OverrideAction;
}) {
  const [target, setTarget] = React.useState<OverrideAssignmentTarget | null>(null);

  const openOverride = (assignment: SchedulerRunAssignmentItem) => {
    setTarget({
      assignmentId: assignment.id,
      woLabel: assignment.woNumber,
      lineId: assignment.lineId,
      lineLabel: assignment.lineLabel,
      plannedStartAt: assignment.plannedStartAt,
      plannedEndAt: assignment.plannedEndAt,
    });
  };

  const showOverride =
    canOverride && !applied && Boolean(overrideAction) && lines.length > 0;

  return (
    <>
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
              {showOverride ? (
                <th className="px-4 py-3 font-medium">{labels.columns.actions}</th>
              ) : null}
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
                {showOverride ? (
                  <td className="px-4 py-3">
                    {a.status === 'draft' || a.status === 'overridden' ? (
                      <Button
                        type="button"
                        className="btn--secondary"
                        data-testid={`scheduler-override-open-${a.id}`}
                        onClick={() => openOverride(a)}
                      >
                        {labels.override}
                      </Button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showOverride && overrideAction ? (
        <OverrideAssignmentModal
          open={target !== null}
          target={target}
          lines={lines}
          labels={labels.overrideModal}
          overrideAction={overrideAction}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </>
  );
}

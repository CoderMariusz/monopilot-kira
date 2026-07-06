'use client';

import { useState } from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type { PmScheduleRow } from '../_actions/mwo-actions';
import type { GenerateMwoFromPmScheduleAction, MwoListLabels } from './mwo-list.client';
import { fmtDate, fmtDateTime } from './mwo-list.client';

function isScheduleDue(nextDueDate: string | null): boolean {
  if (!nextDueDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return nextDueDate <= today;
}

/** PM schedule list with due-schedule → MWO generation (pm-schedules.jsx list + bridge). */
export function PmScheduleList({
  pmSchedules,
  labels,
  canGenerate,
  generateMwoFromPmScheduleAction,
  onGenerated,
}: {
  pmSchedules: PmScheduleRow[];
  labels: MwoListLabels;
  canGenerate: boolean;
  generateMwoFromPmScheduleAction: GenerateMwoFromPmScheduleAction;
  onGenerated: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (scheduleId: string) => {
    setBusyId(scheduleId);
    setError(null);
    const result = await generateMwoFromPmScheduleAction({ scheduleId });
    setBusyId(null);
    if (!result.ok) {
      setError(result.message ?? labels.pm.generateFailed);
      return;
    }
    onGenerated();
  };

  return (
    <Card data-testid="pm-schedule-card" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {error ? (
        <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {pmSchedules.length === 0 ? (
        <p data-testid="pm-empty" data-state="empty" className="px-4 py-10 text-center text-sm text-slate-500">
          {labels.pm.empty}
        </p>
      ) : (
        <Table aria-label={labels.pm.title}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{labels.pm.col.equipment}</TableHead>
              <TableHead scope="col">{labels.pm.col.type}</TableHead>
              <TableHead scope="col">{labels.pm.col.interval}</TableHead>
              <TableHead scope="col">{labels.pm.col.nextDue}</TableHead>
              <TableHead scope="col">{labels.pm.col.lastCompleted}</TableHead>
              <TableHead scope="col">{labels.pm.col.active}</TableHead>
              {canGenerate ? <TableHead scope="col">{labels.pm.colActions}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pmSchedules.map((s) => {
              const due = s.active && isScheduleDue(s.nextDueDate);
              return (
                <TableRow key={s.id} data-testid={`pm-row-${s.id}`}>
                  <TableCell className="text-xs text-slate-600">
                    {s.equipmentCode ? (
                      <div className="flex flex-col">
                        <span className="font-mono text-xs font-semibold text-slate-900">{s.equipmentCode}</span>
                        <span className="text-[11px] text-slate-500">{s.equipmentName}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{labels.pm.type[s.scheduleType]}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">
                    {s.intervalValue} {labels.pm.intervalUnit[s.intervalBasis]}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">{fmtDate(s.nextDueDate)}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">{fmtDateTime(s.lastCompletedAt)}</TableCell>
                  <TableCell>
                    <Badge variant={s.active ? 'success' : 'muted'}>
                      {s.active ? labels.pm.activeYes : labels.pm.activeNo}
                    </Badge>
                  </TableCell>
                  {canGenerate ? (
                    <TableCell>
                      {due ? (
                        <button
                          type="button"
                          data-testid={`pm-generate-${s.id}`}
                          disabled={busyId === s.id}
                          onClick={() => void handleGenerate(s.id)}
                          className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                          {busyId === s.id ? labels.pm.generating : labels.pm.generateMwo}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

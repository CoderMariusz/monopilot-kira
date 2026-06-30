'use client';

import { Badge } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type { PmScheduleRow } from '../_actions/mwo-actions';
import { fmtDate, fmtDateTime, type MwoListLabels } from './mwo-list.client';

/** Read-only PM schedule list (pm-schedules.jsx:3-277, list view only). */
export function PmScheduleList({ pmSchedules, labels }: { pmSchedules: PmScheduleRow[]; labels: MwoListLabels }) {
  return (
    <Card data-testid="pm-schedule-card" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {pmSchedules.map((s) => (
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

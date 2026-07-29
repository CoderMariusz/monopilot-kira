'use client';

import { useState } from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type { EquipmentOption, PmScheduleRow } from '../_actions/mwo-actions';
import type { GenerateMwoFromPmScheduleAction, MwoListLabels } from './mwo-list.client';
import { PmScheduleFormModal } from './pm-schedule-form-modal';
import { fmtDate, fmtDateTime } from './mwo-list.client';

function isScheduleDue(nextDueDate: string | null): boolean {
  if (!nextDueDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return nextDueDate <= today;
}

type CreatePmScheduleAction = (input: {
  equipmentId: string;
  scheduleType: PmScheduleRow['scheduleType'];
  intervalValue: number;
  warningDays?: number;
  firstDueDate?: string;
}) => Promise<{ ok: boolean; reason?: string; message?: string }>;

type UpdatePmScheduleAction = (input: {
  scheduleId: string;
  intervalValue?: number;
  warningDays?: number;
  nextDueDate?: string;
  active?: boolean;
}) => Promise<{ ok: boolean; reason?: string; message?: string }>;

/** PM schedule list with recurrence editor and due-schedule → MWO generation. */
export function PmScheduleList({
  pmSchedules,
  equipment,
  labels,
  canManage,
  canGenerate,
  createPmScheduleAction,
  updatePmScheduleAction,
  generateMwoFromPmScheduleAction,
  onChanged,
}: {
  pmSchedules: PmScheduleRow[];
  equipment: EquipmentOption[];
  labels: MwoListLabels;
  canManage: boolean;
  canGenerate: boolean;
  createPmScheduleAction: CreatePmScheduleAction;
  updatePmScheduleAction: UpdatePmScheduleAction;
  generateMwoFromPmScheduleAction: GenerateMwoFromPmScheduleAction;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<PmScheduleRow | null>(null);

  const handleGenerate = async (scheduleId: string) => {
    setBusyId(scheduleId);
    setError(null);
    const result = await generateMwoFromPmScheduleAction({ scheduleId });
    setBusyId(null);
    if (!result.ok) {
      setError(result.message ?? labels.pm.generateFailed);
      return;
    }
    onChanged();
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingSchedule(null);
  };

  return (
    <Card data-testid="pm-schedule-card" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2">
        <p data-testid="pm-scope-notice" role="note" className="text-xs text-slate-600">
          {labels.pm.subtitle}
        </p>
        {canManage ? (
          <button
            type="button"
            data-testid="pm-schedule-create-open"
            onClick={() => setModalMode('create')}
            className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800"
          >
            {labels.pm.createSchedule}
          </button>
        ) : null}
      </div>
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
              <TableHead scope="col">{labels.pm.colActions}</TableHead>
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
                  <TableCell className="space-x-2">
                    {canManage ? (
                      <button
                        type="button"
                        data-testid={`pm-edit-${s.id}`}
                        onClick={() => {
                          setEditingSchedule(s);
                          setModalMode('edit');
                        }}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {labels.pm.editSchedule}
                      </button>
                    ) : null}
                    {canGenerate && due ? (
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
                      !canManage ? <span className="text-xs text-slate-400">—</span> : null
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {modalMode === 'create' ? (
        <PmScheduleFormModal
          mode="create"
          equipment={equipment}
          labels={labels.pm.form}
          createPmScheduleAction={createPmScheduleAction}
          updatePmScheduleAction={updatePmScheduleAction}
          onClose={closeModal}
          onSaved={() => {
            closeModal();
            onChanged();
          }}
        />
      ) : null}

      {modalMode === 'edit' && editingSchedule ? (
        <PmScheduleFormModal
          mode="edit"
          schedule={editingSchedule}
          equipment={equipment}
          labels={labels.pm.form}
          createPmScheduleAction={createPmScheduleAction}
          updatePmScheduleAction={updatePmScheduleAction}
          onClose={closeModal}
          onSaved={() => {
            closeModal();
            onChanged();
          }}
        />
      ) : null}
    </Card>
  );
}

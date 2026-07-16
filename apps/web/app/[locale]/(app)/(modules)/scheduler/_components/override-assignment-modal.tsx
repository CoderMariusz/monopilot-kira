'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';

import type {
  OverrideSchedulerAssignmentInput,
  OverrideSchedulerAssignmentResult,
} from '../_actions/scheduler-types';

export type OverrideAssignmentTarget = {
  assignmentId: string;
  woLabel: string;
  lineId: string | null;
  lineLabel: string | null;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
};

export type OverrideAssignmentModalLabels = {
  title: string;
  currentLine: string;
  currentStart: string;
  newLine: string;
  newStart: string;
  reasonCode: string;
  reasonNotes: string;
  selectReason: string;
  cancel: string;
  confirm: string;
  saving: string;
  reasonOptions: Record<string, string>;
  errors: Record<string, string>;
};

type LineOption = { id: string; code: string; name: string };

type OverrideAction = (
  input: OverrideSchedulerAssignmentInput,
) => Promise<OverrideSchedulerAssignmentResult>;

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

export function OverrideAssignmentModal({
  open,
  target,
  lines,
  labels,
  overrideAction,
  onClose,
}: {
  open: boolean;
  target: OverrideAssignmentTarget | null;
  lines: LineOption[];
  labels: OverrideAssignmentModalLabels;
  overrideAction: OverrideAction;
  onClose: () => void;
}) {
  const router = useRouter();
  const [lineId, setLineId] = React.useState('');
  const [plannedStart, setPlannedStart] = React.useState('');
  const [reasonCode, setReasonCode] = React.useState('');
  const [reasonNotes, setReasonNotes] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!target) return;
    setLineId(target.lineId ?? lines[0]?.id ?? '');
    setPlannedStart(toDatetimeLocalValue(target.plannedStartAt));
    setReasonCode('');
    setReasonNotes('');
    setErrorKey(null);
  }, [target, lines]);

  const errorLabel = (key: string) => labels.errors[key] ?? labels.errors.persistence_failed;

  const submit = async () => {
    if (!target || saving) return;
    const isoStart = fromDatetimeLocalValue(plannedStart);
    if (!lineId || !isoStart || !reasonCode) {
      setErrorKey('invalid_input');
      return;
    }

    setSaving(true);
    setErrorKey(null);
    const result = await overrideAction({
      assignmentId: target.assignmentId,
      lineId,
      plannedStartAt: isoStart,
      reasonCode,
      reasonNotes: reasonNotes.trim() || null,
    });
    setSaving(false);

    if (result.ok) {
      onClose();
      router.refresh();
      return;
    }
    setErrorKey(result.error);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
      }}
      size="md"
      modalId="scheduler-override-assignment-modal"
    >
      {target ? (
        <>
          <Modal.Header title={labels.title.replace('{wo}', target.woLabel)} />
          <Modal.Body>
            <div className="flex flex-col gap-4 text-sm">
              <dl className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">{labels.currentLine}</dt>
                  <dd className="font-medium text-slate-900">{target.lineLabel ?? '—'}</dd>
                </div>
                <div className="mt-2 flex justify-between gap-3">
                  <dt className="text-slate-500">{labels.currentStart}</dt>
                  <dd className="font-mono text-slate-900">
                    {target.plannedStartAt
                      ? new Date(target.plannedStartAt).toLocaleString()
                      : '—'}
                  </dd>
                </div>
              </dl>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">{labels.newLine}</span>
                <select
                  data-testid="scheduler-override-line"
                  className="mp-field-control h-9 rounded-md border border-slate-300 px-2 text-sm"
                  value={lineId}
                  onChange={(e) => setLineId(e.target.value)}
                  disabled={saving}
                >
                  {lines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.code} — {line.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">{labels.newStart}</span>
                <input
                  type="datetime-local"
                  data-testid="scheduler-override-start"
                  className="mp-field-control h-9 rounded-md border border-slate-300 px-2 text-sm"
                  value={plannedStart}
                  onChange={(e) => setPlannedStart(e.target.value)}
                  disabled={saving}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">{labels.reasonCode}</span>
                <select
                  data-testid="scheduler-override-reason"
                  className="mp-field-control h-9 rounded-md border border-slate-300 px-2 text-sm"
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value)}
                  disabled={saving}
                >
                  <option value="">{labels.selectReason}</option>
                  {Object.entries(labels.reasonOptions).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">{labels.reasonNotes}</span>
                <textarea
                  data-testid="scheduler-override-notes"
                  className="min-h-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  value={reasonNotes}
                  onChange={(e) => setReasonNotes(e.target.value)}
                  disabled={saving}
                />
              </label>

              {errorKey ? (
                <p
                  role="alert"
                  data-testid="scheduler-override-error"
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                >
                  {errorLabel(errorKey)}
                </p>
              ) : null}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" onClick={onClose} disabled={saving}>
              {labels.cancel}
            </Button>
            <Button
              type="button"
              className="btn--primary"
              data-testid="scheduler-override-confirm"
              onClick={() => void submit()}
              disabled={saving}
            >
              {saving ? labels.saving : labels.confirm}
            </Button>
          </Modal.Footer>
        </>
      ) : null}
    </Modal>
  );
}

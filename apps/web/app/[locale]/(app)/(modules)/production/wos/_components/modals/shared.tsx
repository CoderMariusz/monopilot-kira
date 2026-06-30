'use client';

/**
 * P2-MODALS — shared shell and small lifecycle modals for WO execution actions.
 *
 * Extracted from action-modals.tsx as a pure move; behavior is unchanged.
 */

import { useState } from 'react';

import Link from 'next/link';

import Modal from '@monopilot/ui/Modal';
import Input from '@monopilot/ui/Input';
import Textarea from '@monopilot/ui/Textarea';
import { Button } from '@monopilot/ui/Button';

import { freshTransactionId } from './use-wo-action';
import type {
  RunWoAction,
  WoModalLabels,
  WoReasonCategory,
  WoShiftOption,
  WoLineOption,
} from './types';

// ── Shared shell ────────────────────────────────────────────────────────────

export function ErrorBanner({ message, testid }: { message: string; testid: string }) {
  return (
    <div
      role="alert"
      data-testid={testid}
      className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800"
    >
      {message}
    </div>
  );
}

export function mapError(labels: WoModalLabels, code: string, message?: string): string {
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }
  return labels.errors[code] ?? labels.errors.unknown ?? labels.errorFallback;
}

/**
 * Resolve a shift option's display name. The loader returns the stable scanner
 * shift CODE (morning/afternoon/night); the localized label lives in
 * labels.shifts.<code>. Falls back to the option's own `name` (then the code)
 * for any future code not yet in the labels map.
 */
export function shiftLabel(labels: WoModalLabels, opt: WoShiftOption): string {
  const localized = (labels.shifts as Record<string, string | undefined>)[opt.code];
  return localized ?? opt.name ?? opt.code;
}

/** Field row helper — label + control with a stable id. */
export function FieldRow({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-900">
        {label}
      </label>
      {children}
      {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </div>
  );
}

export type BaseModalProps = {
  open: boolean;
  woId: string;
  labels: WoModalLabels;
  run: RunWoAction;
  onClose: () => void;
};

// ── Release ───────────────────────────────────────────────────────────────────

export function ReleaseModal({ open, labels, run, onClose }: BaseModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    const result = await run('release', {});
    setBusy(false);
    if (result.ok) {
      setError(null);
      onClose();
    } else {
      setError(mapError(labels, result.errorCode, result.message));
    }
  }

  return (
    <Modal open={open} onOpenChange={(n) => (n ? undefined : onClose())} modalId="wo-release" size="sm">
      <Modal.Header title={labels.release.title} />
      <Modal.Body>
        <p className="mb-3 text-sm text-slate-600">{labels.release.subtitle}</p>
        {error ? <ErrorBanner message={error} testid="wo-release-error" /> : null}
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" data-testid="wo-release-cancel" disabled={busy} onClick={onClose}>
          {labels.cancel}
        </Button>
        <Button type="button" data-testid="wo-release-confirm" disabled={busy} onClick={handleConfirm}>
          {busy ? labels.submitting : labels.confirm}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// ── Start ─────────────────────────────────────────────────────────────────────

export function StartModal({ open, woId, labels, run, onClose }: BaseModalProps) {
  const [lineId, setLineId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    const result = await run('start', {
      transactionId: freshTransactionId(),
      lineId: lineId.trim() || null,
      shiftId: shiftId.trim() || null,
    });
    setBusy(false);
    if (result.ok) {
      reset();
      onClose();
    } else {
      setError(mapError(labels, result.errorCode));
    }
  }
  function reset() {
    setLineId('');
    setShiftId('');
    setError(null);
  }

  return (
    <Modal open={open} onOpenChange={(n) => (n ? undefined : onClose())} modalId="wo-start" size="sm">
      <Modal.Header title={labels.start.title} />
      <Modal.Body>
        <p className="mb-3 text-sm text-slate-600">{labels.start.subtitle}</p>
        {error ? <ErrorBanner message={error} testid="wo-start-error" /> : null}
        <div className="space-y-3">
          <FieldRow id="wo-start-line" label={`${labels.start.line} (${labels.start.optional})`}>
            <Input id="wo-start-line" value={lineId} disabled={busy} onChange={(e) => setLineId(e.target.value)} data-testid="wo-start-line" />
          </FieldRow>
          <FieldRow id="wo-start-shift" label={`${labels.start.shift} (${labels.start.optional})`}>
            <Input id="wo-start-shift" value={shiftId} disabled={busy} onChange={(e) => setShiftId(e.target.value)} data-testid="wo-start-shift" />
          </FieldRow>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" data-testid="wo-start-cancel" disabled={busy} onClick={onClose}>
          {labels.cancel}
        </Button>
        <Button type="button" data-testid="wo-start-confirm" disabled={busy} onClick={handleConfirm}>
          {busy ? labels.submitting : labels.confirm}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// ── Resume ──────────────────────────────────────────────────────────────────

export function ResumeModal({ open, woId, labels, run, onClose }: BaseModalProps) {
  const [duration, setDuration] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    const trimmed = duration.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    const result = await run('resume', {
      transactionId: freshTransactionId(),
      actualDurationMin: parsed !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null,
    });
    setBusy(false);
    if (result.ok) {
      setDuration('');
      onClose();
    } else {
      setError(mapError(labels, result.errorCode));
    }
  }

  return (
    <Modal open={open} onOpenChange={(n) => (n ? undefined : onClose())} modalId="wo-resume" size="sm">
      <Modal.Header title={labels.resume.title} />
      <Modal.Body>
        <p className="mb-3 text-sm text-slate-600">{labels.resume.subtitle}</p>
        {error ? <ErrorBanner message={error} testid="wo-resume-error" /> : null}
        <FieldRow id="wo-resume-duration" label={labels.resume.duration} hint={labels.resume.durationHint}>
          <Input id="wo-resume-duration" type="number" min={1} value={duration} disabled={busy} onChange={(e) => setDuration(e.target.value)} data-testid="wo-resume-duration" />
        </FieldRow>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" data-testid="wo-resume-cancel" disabled={busy} onClick={onClose}>
          {labels.cancel}
        </Button>
        <Button type="button" data-testid="wo-resume-confirm" disabled={busy} onClick={handleConfirm}>
          {busy ? labels.submitting : labels.confirm}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// ── Cancel ──────────────────────────────────────────────────────────────────

export function CancelModal({ open, woId, labels, run, onClose }: BaseModalProps) {
  const [reasonCode, setReasonCode] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = reasonCode.trim() !== '' && !busy;

  async function handleConfirm() {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    const result = await run('cancel', {
      transactionId: freshTransactionId(),
      reasonCode: reasonCode.trim(),
      notes: notes.trim() || null,
    });
    setBusy(false);
    if (result.ok) {
      onClose();
    } else {
      setError(mapError(labels, result.errorCode));
    }
  }

  return (
    <Modal open={open} onOpenChange={(n) => (n ? undefined : onClose())} modalId="wo-cancel" size="sm">
      <Modal.Header title={labels.cancelWo.title} />
      <Modal.Body>
        <p className="mb-3 text-sm text-slate-600">{labels.cancelWo.subtitle}</p>
        {error ? <ErrorBanner message={error} testid="wo-cancel-error" /> : null}
        <div className="space-y-3">
          <FieldRow id="wo-cancel-reason" label={labels.cancelWo.reasonCode}>
            <Input id="wo-cancel-reason" value={reasonCode} disabled={busy} onChange={(e) => setReasonCode(e.target.value)} data-testid="wo-cancel-reason" />
          </FieldRow>
          <FieldRow id="wo-cancel-notes" label={labels.cancelWo.notes}>
            <Textarea id="wo-cancel-notes" rows={2} value={notes} disabled={busy} onChange={(e) => setNotes(e.target.value)} data-testid="wo-cancel-notes" />
          </FieldRow>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" data-testid="wo-cancel-cancel" disabled={busy} onClick={onClose}>
          {labels.cancel}
        </Button>
        <Button type="button" data-testid="wo-cancel-confirm" disabled={!canConfirm} onClick={handleConfirm}>
          {busy ? labels.submitting : labels.confirm}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// ── Complete ────────────────────────────────────────────────────────────────

export function CompleteModal({ open, woId, labels, run, onClose }: BaseModalProps) {
  const [override, setOverride] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    const result = await run('complete', {
      transactionId: freshTransactionId(),
      overrideReasonCode: override.trim() || null,
    });
    setBusy(false);
    if (result.ok) {
      setOverride('');
      onClose();
    } else {
      setError(mapError(labels, result.errorCode));
    }
  }

  return (
    <Modal open={open} onOpenChange={(n) => (n ? undefined : onClose())} modalId="wo-complete" size="sm">
      <Modal.Header title={labels.complete.title} />
      <Modal.Body>
        <p className="mb-3 text-sm text-slate-600">{labels.complete.subtitle}</p>
        {error ? <ErrorBanner message={error} testid="wo-complete-error" /> : null}
        <FieldRow id="wo-complete-override" label={labels.complete.override} hint={labels.complete.overrideHint}>
          <Input id="wo-complete-override" value={override} disabled={busy} onChange={(e) => setOverride(e.target.value)} data-testid="wo-complete-override" />
        </FieldRow>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" data-testid="wo-complete-cancel" disabled={busy} onClick={onClose}>
          {labels.cancel}
        </Button>
        <Button type="button" data-testid="wo-complete-confirm" disabled={busy} onClick={handleConfirm}>
          {busy ? labels.submitting : labels.confirm}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

'use client';

/**
 * P2-MODALS — shared shell and small lifecycle modals for WO execution actions.
 *
 * Extracted from action-modals.tsx as a pure move; behavior is unchanged.
 */

import { useEffect, useState } from 'react';

import Link from 'next/link';

import Modal from '@monopilot/ui/Modal';
import Input from '@monopilot/ui/Input';
import Textarea from '@monopilot/ui/Textarea';
import { Button } from '@monopilot/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

import { YIELD_GATE_OVERRIDE_REASON_CODES } from '../../../../../../../../lib/production/yield-gate-override';

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

export function StartModal({
  open,
  woId,
  labels,
  run,
  onClose,
  lines = [],
  shifts = [],
  defaultLineId = null,
}: BaseModalProps & {
  /** F15 — org production lines for the Line dropdown (empty ⇒ free-text fallback). */
  lines?: WoLineOption[];
  /** F15 — shift options for the Shift dropdown (empty ⇒ free-text fallback). */
  shifts?: WoShiftOption[];
  /** WO's assigned line id — preselected in the Line dropdown when a known option. */
  defaultLineId?: string | null;
}) {
  // Line/Shift stay OPTIONAL on Start (unlike Pause). When the org has lines/shifts
  // configured we render <Select> pickers (F15) — line defaults to the WO's assigned
  // line when it is a known option; otherwise the field degrades to a free-text Input.
  const hasLineOptions = lines.length > 0;
  const hasShiftOptions = shifts.length > 0;
  const [lineId, setLineId] = useState(
    defaultLineId && lines.some((l) => l.id === defaultLineId) ? defaultLineId : '',
  );
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
    setLineId(defaultLineId && lines.some((l) => l.id === defaultLineId) ? defaultLineId : '');
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
            {hasLineOptions ? (
              <Select
                value={lineId}
                onValueChange={setLineId}
                options={lines.map((l) => ({ value: l.id, label: l.code }))}
                aria-label={labels.start.line}
              >
                <SelectTrigger id="wo-start-line" data-testid="wo-start-line">
                  <SelectValue placeholder={labels.start.linePlaceholder ?? labels.start.line} />
                </SelectTrigger>
                <SelectContent>
                  {lines.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input id="wo-start-line" value={lineId} disabled={busy} onChange={(e) => setLineId(e.target.value)} data-testid="wo-start-line" />
            )}
          </FieldRow>
          <FieldRow id="wo-start-shift" label={`${labels.start.shift} (${labels.start.optional})`}>
            {hasShiftOptions ? (
              <Select
                value={shiftId}
                onValueChange={setShiftId}
                options={shifts.map((s) => ({ value: s.code, label: shiftLabel(labels, s) }))}
                aria-label={labels.start.shift}
              >
                <SelectTrigger id="wo-start-shift" data-testid="wo-start-shift">
                  <SelectValue placeholder={labels.start.shiftPlaceholder ?? labels.start.shift} />
                </SelectTrigger>
                <SelectContent>
                  {shifts.map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {shiftLabel(labels, s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input id="wo-start-shift" value={shiftId} disabled={busy} onChange={(e) => setShiftId(e.target.value)} data-testid="wo-start-shift" />
            )}
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

function formatYieldOverrideLabel(code: string): string {
  return code
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

type StrictGateDetails = {
  output_kg?: string;
  posted_consumption_kg?: string;
  effective_yield_pct?: string;
  expected_input_kg?: string | null;
  within_tolerance?: boolean;
};

function parseStrictGateDetails(details: unknown): StrictGateDetails | null {
  if (!details || typeof details !== 'object') return null;
  const root = details as Record<string, unknown>;
  const strictGate =
    root.strictGate && typeof root.strictGate === 'object'
      ? (root.strictGate as Record<string, unknown>)
      : root;
  return {
    output_kg: typeof strictGate.output_kg === 'string' ? strictGate.output_kg : undefined,
    posted_consumption_kg:
      typeof strictGate.posted_consumption_kg === 'string' ? strictGate.posted_consumption_kg : undefined,
    effective_yield_pct:
      typeof strictGate.effective_yield_pct === 'string' ? strictGate.effective_yield_pct : undefined,
    expected_input_kg:
      strictGate.expected_input_kg === null || typeof strictGate.expected_input_kg === 'string'
        ? strictGate.expected_input_kg
        : undefined,
    within_tolerance:
      typeof strictGate.within_tolerance === 'boolean' ? strictGate.within_tolerance : undefined,
  };
}

export function CompleteModal({
  open,
  woId,
  labels,
  run,
  onClose,
  yieldGateGreen,
  signerUserId,
  locale = 'en',
}: BaseModalProps & { yieldGateGreen: boolean; signerUserId: string; locale?: string }) {
  const [overrideCode, setOverrideCode] = useState('');
  const [overridePin, setOverridePin] = useState('');
  const [overrideEsignReason, setOverrideEsignReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forceOverridePath, setForceOverridePath] = useState(false);
  const [strictGateDetails, setStrictGateDetails] = useState<StrictGateDetails | null>(null);

  const needsOverride = !yieldGateGreen || forceOverridePath;

  useEffect(() => {
    if (!open) {
      setOverrideCode('');
      setOverridePin('');
      setOverrideEsignReason('');
      setError(null);
      setForceOverridePath(false);
      setStrictGateDetails(null);
      setBusy(false);
    }
  }, [open]);

  const canConfirm = needsOverride
    ? overrideCode.trim() !== '' &&
      overridePin.trim() !== '' &&
      overrideEsignReason.trim() !== '' &&
      !busy
    : !busy;

  async function handleConfirm() {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    const payload: Record<string, unknown> = {
      transactionId: freshTransactionId(),
    };
    if (needsOverride) {
      payload.overrideReasonCode = overrideCode;
      payload.overrideSignerUserId = signerUserId;
      payload.overridePin = overridePin;
      payload.overrideEsignReason = overrideEsignReason.trim();
    }
    const result = await run('complete', payload);
    setBusy(false);
    if (result.ok) {
      onClose();
    } else if (result.errorCode === 'closed_production_strict_failed') {
      setForceOverridePath(true);
      const parsed = parseStrictGateDetails(result.details);
      if (parsed) setStrictGateDetails(parsed);
      setError(
        mapError(labels, result.errorCode, result.message) ||
          labels.complete.gateBlocked ||
          labels.errors.closed_production_strict_failed,
      );
    } else {
      setError(mapError(labels, result.errorCode, result.message));
    }
  }

  // A 409 from the server (forceOverridePath) invalidates the pre-evaluated green.
  const gateGreenNow = yieldGateGreen && !forceOverridePath;
  const gateStatusLabel = gateGreenNow
    ? labels.complete.gateStatusGreen ?? 'Yield gate: green'
    : labels.complete.gateStatusBlocked ?? 'Yield gate: override required';

  return (
    <Modal open={open} onOpenChange={(n) => (n ? undefined : onClose())} modalId="wo-complete" size="sm">
      <Modal.Header title={labels.complete.title} />
      <Modal.Body>
        <p className="mb-3 text-sm text-slate-600">{labels.complete.subtitle}</p>
        <div
          role="status"
          data-testid="wo-complete-gate-status"
          data-gate-green={gateGreenNow ? 'true' : 'false'}
          className={[
            'mb-3 rounded-md border px-2.5 py-2 text-sm',
            gateGreenNow
              ? 'border-green-200 bg-green-50 text-green-900'
              : forceOverridePath
                ? 'border-red-200 bg-red-50 text-red-900'
                : 'border-amber-200 bg-amber-50 text-amber-900',
          ].join(' ')}
        >
          {gateStatusLabel}
        </div>
        {strictGateDetails ? (
          <div
            role="status"
            data-testid="wo-complete-gate-details"
            className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900"
          >
            <p className="font-medium">
              {labels.complete.consumptionOutOfTolerance ?? 'Consumption is outside configured tolerance.'}
            </p>
            <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
              {strictGateDetails.output_kg ? (
                <>
                  <dt>{labels.complete.actualOutputKg ?? 'Output (kg)'}</dt>
                  <dd className="font-mono">{strictGateDetails.output_kg}</dd>
                </>
              ) : null}
              {strictGateDetails.posted_consumption_kg ? (
                <>
                  <dt>{labels.complete.postedConsumptionKg ?? 'Posted consumption (kg)'}</dt>
                  <dd className="font-mono">{strictGateDetails.posted_consumption_kg}</dd>
                </>
              ) : null}
              {strictGateDetails.expected_input_kg ? (
                <>
                  <dt>{labels.complete.expectedInputKg ?? 'Expected input (kg)'}</dt>
                  <dd className="font-mono">{strictGateDetails.expected_input_kg}</dd>
                </>
              ) : null}
              {strictGateDetails.effective_yield_pct ? (
                <>
                  <dt>{labels.complete.effectiveYieldPct ?? 'Effective yield %'}</dt>
                  <dd className="font-mono">{strictGateDetails.effective_yield_pct}</dd>
                </>
              ) : null}
            </dl>
          </div>
        ) : null}
        {error ? <ErrorBanner message={error} testid="wo-complete-error" /> : null}
        {needsOverride ? (
          <div className="space-y-3">
            <FieldRow id="wo-complete-override" label={labels.complete.override} hint={labels.complete.overrideHint}>
              <Select value={overrideCode} disabled={busy} onValueChange={setOverrideCode}>
                <SelectTrigger id="wo-complete-override" data-testid="wo-complete-override">
                  <SelectValue placeholder={labels.complete.overridePlaceholder ?? labels.complete.override} />
                </SelectTrigger>
                <SelectContent>
                  {YIELD_GATE_OVERRIDE_REASON_CODES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {formatYieldOverrideLabel(code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow
              id="wo-complete-override-pin"
              label={labels.complete.overridePin ?? labels.close.password}
            >
              <Input
                id="wo-complete-override-pin"
                type="password"
                autoComplete="off"
                value={overridePin}
                disabled={busy}
                onChange={(e) => setOverridePin(e.target.value)}
                data-testid="wo-complete-override-pin"
              />
            </FieldRow>
            {labels.close.pinHint ? (
              <p className="text-xs text-slate-500">
                <Link href={`/${locale}/account/pin`} className="underline">
                  {labels.close.pinHint}
                </Link>
              </p>
            ) : null}
            <FieldRow
              id="wo-complete-override-reason"
              label={labels.complete.overrideEsignReason ?? labels.close.reason}
            >
              <Textarea
                id="wo-complete-override-reason"
                rows={2}
                value={overrideEsignReason}
                disabled={busy}
                onChange={(e) => setOverrideEsignReason(e.target.value)}
                data-testid="wo-complete-override-esign-reason"
              />
            </FieldRow>
          </div>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" data-testid="wo-complete-cancel" disabled={busy} onClick={onClose}>
          {labels.cancel}
        </Button>
        <Button type="button" data-testid="wo-complete-confirm" disabled={!canConfirm} onClick={handleConfirm}>
          {busy ? labels.submitting : labels.confirm}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

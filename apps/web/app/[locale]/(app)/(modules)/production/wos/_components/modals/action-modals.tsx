'use client';

/**
 * P2-MODALS — the WO execution action modals (design-system, @monopilot/ui only).
 *
 * One modal per action. Each is PURE: transient form state + an `onSubmit` that
 * delegates to the action runner (use-wo-action). They map the runner's VERBATIM
 * error code to inline i18n copy (role=alert), close + refresh on success.
 *
 * Payload shapes are the EXACT handler zod/parse contracts:
 *   start   { transactionId, lineId?, shiftId? }
 *   pause   { transactionId, reasonCategoryId, lineId, shiftId?, notes? }
 *   resume  { transactionId, actualDurationMin? }
 *   cancel  { transactionId, reasonCode, notes? }
 *   complete{ transactionId, overrideReasonCode? }
 *   close   { transactionId, signerUserId, pin, reason }   (e-sign; login-password fallback)
 *   output  { transaction_id, output_type, product_id, qty_kg, batch_number? }  (manual parse)
 *   waste   { transaction_id, category_code, qty_kg, shift_id, reason_code?, reason_notes? }
 *
 * The Close modal mirrors the GateApprovalModal copy: a password field + a
 * mandatory reason, verified server-side via signEvent (PIN with login-password
 * fallback) — never client-trusted.
 */

import { useState } from 'react';

import Modal from '@monopilot/ui/Modal';
import Input from '@monopilot/ui/Input';
import Textarea from '@monopilot/ui/Textarea';
import { Button } from '@monopilot/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

import { freshTransactionId } from './use-wo-action';
import {
  toBaseQty,
  TypedError,
  type OutputUom,
  type UomSnapshot,
} from '../../../../../../../../lib/uom/convert';
import type {
  RunWoAction,
  WoModalLabels,
  WoReasonCategory,
  WoWasteCategory,
} from './types';

// ── Shared shell ────────────────────────────────────────────────────────────

function ErrorBanner({ message, testid }: { message: string; testid: string }) {
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

function mapError(labels: WoModalLabels, code: string): string {
  return labels.errors[code] ?? labels.errorFallback;
}

/** Field row helper — label + control with a stable id. */
function FieldRow({
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

type BaseModalProps = {
  open: boolean;
  woId: string;
  labels: WoModalLabels;
  run: RunWoAction;
  onClose: () => void;
};

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

// ── Pause ─────────────────────────────────────────────────────────────────────

export function PauseModal({
  open,
  woId,
  labels,
  run,
  onClose,
  categories,
  defaultLineId,
}: BaseModalProps & { categories: WoReasonCategory[]; defaultLineId: string | null }) {
  const [reasonCategoryId, setReasonCategoryId] = useState('');
  const [lineId, setLineId] = useState(defaultLineId ?? '');
  const [shiftId, setShiftId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = reasonCategoryId !== '' && lineId.trim() !== '' && !busy;

  async function handleConfirm() {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    const result = await run('pause', {
      transactionId: freshTransactionId(),
      reasonCategoryId,
      lineId: lineId.trim(),
      shiftId: shiftId.trim() || null,
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
    <Modal open={open} onOpenChange={(n) => (n ? undefined : onClose())} modalId="wo-pause" size="sm">
      <Modal.Header title={labels.pause.title} />
      <Modal.Body>
        <p className="mb-3 text-sm text-slate-600">{labels.pause.subtitle}</p>
        {error ? <ErrorBanner message={error} testid="wo-pause-error" /> : null}
        <div className="space-y-3">
          <FieldRow id="wo-pause-reason" label={labels.pause.reason}>
            {categories.length === 0 ? (
              <p data-testid="wo-pause-no-categories" className="text-sm text-amber-700">
                {labels.pause.noCategories}
              </p>
            ) : (
              <Select value={reasonCategoryId} onValueChange={setReasonCategoryId} aria-label={labels.pause.reason}>
                <SelectTrigger id="wo-pause-reason" data-testid="wo-pause-reason">
                  <SelectValue placeholder={labels.pause.reasonPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FieldRow>
          <FieldRow id="wo-pause-line" label={labels.pause.line}>
            <Input id="wo-pause-line" value={lineId} disabled={busy} onChange={(e) => setLineId(e.target.value)} data-testid="wo-pause-line" />
          </FieldRow>
          <FieldRow id="wo-pause-shift" label={labels.pause.shift}>
            <Input id="wo-pause-shift" value={shiftId} disabled={busy} onChange={(e) => setShiftId(e.target.value)} data-testid="wo-pause-shift" />
          </FieldRow>
          <FieldRow id="wo-pause-notes" label={labels.pause.notes}>
            <Textarea id="wo-pause-notes" rows={2} value={notes} disabled={busy} onChange={(e) => setNotes(e.target.value)} data-testid="wo-pause-notes" />
          </FieldRow>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" data-testid="wo-pause-cancel" disabled={busy} onClick={onClose}>
          {labels.cancel}
        </Button>
        <Button type="button" data-testid="wo-pause-confirm" disabled={!canConfirm} onClick={handleConfirm}>
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

// ── Close (e-sign) ──────────────────────────────────────────────────────────

export function CloseModal({
  open,
  woId,
  labels,
  run,
  onClose,
  signerUserId,
}: BaseModalProps & { signerUserId: string }) {
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = password.trim() !== '' && reason.trim() !== '' && !busy;

  async function handleConfirm() {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    const result = await run('close', {
      transactionId: freshTransactionId(),
      signerUserId,
      pin: password,
      reason: reason.trim(),
    });
    setBusy(false);
    if (result.ok) {
      setPassword('');
      setReason('');
      onClose();
    } else {
      setError(mapError(labels, result.errorCode));
    }
  }

  return (
    <Modal open={open} onOpenChange={(n) => (n ? undefined : onClose())} modalId="wo-close" size="md">
      <Modal.Header title={labels.close.title} />
      <Modal.Body>
        <p className="mb-3 text-sm text-slate-600">{labels.close.subtitle}</p>
        {error ? <ErrorBanner message={error} testid="wo-close-error" /> : null}
        <div className="space-y-3">
          <FieldRow id="wo-close-password" label={labels.close.password}>
            <Input
              id="wo-close-password"
              type="password"
              autoComplete="off"
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="wo-close-password"
            />
          </FieldRow>
          <FieldRow id="wo-close-reason" label={labels.close.reason}>
            <Textarea id="wo-close-reason" rows={3} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} data-testid="wo-close-reason" />
          </FieldRow>
          <p className="text-xs text-slate-500">{labels.close.legal}</p>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" data-testid="wo-close-cancel" disabled={busy} onClick={onClose}>
          {labels.cancel}
        </Button>
        <Button type="button" data-testid="wo-close-confirm" disabled={!canConfirm} onClick={handleConfirm}>
          {busy ? labels.submitting : labels.confirm}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// ── Register output ───────────────────────────────────────────────────────────

const OUTPUT_TYPES = ['primary', 'co_product', 'by_product'] as const;

/**
 * P0-UOM — the per-WO output-unit snapshot threaded from the detail screen header
 * (itemCode / productName / output_uom + pack fields). Null/absent → the modal
 * falls back to entering quantity directly in base kg (legacy qty_kg payload).
 */
export type OutputUomContext = {
  /** READ-ONLY product identity surfaced instead of an editable UUID textbox. */
  productCode: string | null;
  productName: string | null;
  /** The product's output unit. Absent ⇒ treated as 'base'. */
  outputUom?: OutputUom;
  uomBase?: string;
  netQtyPerEach?: number | null;
  eachPerBox?: number | null;
  weightMode?: 'fixed' | 'catch';
};

function fmtKg(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

// B-3 catch-weight: per-unit input cap. Beyond this we refuse the dynamic grid
// (an honest "reduce the quantity" message) rather than rendering 100s of inputs.
const CATCH_WEIGHT_MAX_UNITS = 50;

const DECIMAL_RE = /^\d+(\.\d+)?$/;
function isPositiveDecimal(s: string): boolean {
  const t = s.trim();
  return DECIMAL_RE.test(t) && Number(t) > 0;
}

/**
 * Exact 3-dp sum of catch-weight decimal STRINGS using integer micro-units
 * (1e-6) so the live Σ line never drifts on binary-float addition. Mirrors the
 * service's toMicro/microToDecimal contract (register-output.ts). Skips blanks.
 */
function sumCatchWeightsKg(weights: readonly string[]): string {
  const SCALE = 1_000_000n;
  let micro = 0n;
  for (const w of weights) {
    const t = w.trim();
    if (t === '' || !DECIMAL_RE.test(t)) continue;
    const [intPart, fracRaw = ''] = t.split('.');
    const frac = (fracRaw + '000000').slice(0, 6);
    micro += BigInt(intPart || '0') * SCALE + BigInt(frac || '0');
  }
  const intPart = micro / SCALE;
  const frac = (micro % SCALE).toString().padStart(6, '0').slice(0, 3);
  return `${intPart}.${frac}`;
}

export function OutputModal({
  open,
  woId,
  labels,
  run,
  onClose,
  defaultProductId,
  uom,
}: BaseModalProps & { defaultProductId: string | null; uom?: OutputUomContext | null }) {
  const [outputType, setOutputType] = useState<(typeof OUTPUT_TYPES)[number]>('primary');
  const [qty, setQty] = useState('');
  const [actualWeight, setActualWeight] = useState('');
  const [batch, setBatch] = useState('');
  // B-3 catch-weight per-unit captures. `catchUnits` backs the dynamic per-unit
  // grid (each/box catch items); `catchText` backs the base-uom textarea fallback
  // (one weight per line) where the unit count is unknown up front.
  const [catchUnits, setCatchUnits] = useState<string[]>([]);
  const [catchText, setCatchText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Product id is FIXED to the WO's FG product — never an editable textbox. We
  // surface the read-only code + name and keep the id in the payload.
  const productId = (defaultProductId ?? '').trim();

  // Resolve the output unit. With no snapshot (or 'base') the modal behaves like
  // the legacy kg entry; for each/box we enter units + convert to base kg.
  const outputUom: OutputUom = uom?.outputUom ?? 'base';
  const snap: UomSnapshot = {
    outputUom,
    uomBase: uom?.uomBase ?? 'kg',
    netQtyPerEach: uom?.netQtyPerEach ?? null,
    eachPerBox: uom?.eachPerBox ?? null,
    boxesPerPallet: null,
    weightMode: uom?.weightMode ?? 'fixed',
  };
  const isBase = outputUom === 'base';

  // qty must be a plain decimal string (the handler REJECTS JS numbers).
  const qtyValid = /^\d+(\.\d+)?$/.test(qty.trim()) && Number(qty.trim()) > 0;
  const weightTrimmed = actualWeight.trim();
  const weightValid = weightTrimmed === '' || (/^\d+(\.\d+)?$/.test(weightTrimmed) && Number(weightTrimmed) > 0);

  // ── B-3 catch-weight ────────────────────────────────────────────────────────
  // The service (register-output.ts) REQUIRES catch_weight_kg_per_unit for any
  // item whose weight_mode === 'catch' and 422s without it. We surface a per-unit
  // capture section: for each/box the qty (units) determines N compact inputs; for
  // base (N unknown) a textarea taking one weight per line. Nothing changes for
  // 'fixed' items.
  const isCatch = snap.weightMode === 'catch';
  // N from qty for the dynamic grid (each/box). Whole units only.
  const catchN = !isBase && qtyValid ? Math.floor(Number(qty.trim())) : 0;
  const catchOverCap = isCatch && !isBase && catchN > CATCH_WEIGHT_MAX_UNITS;

  // The per-unit list, sized to N. We keep entered values stable as N grows/shrinks.
  const catchInputs: string[] = isCatch && !isBase && !catchOverCap
    ? Array.from({ length: catchN }, (_, i) => catchUnits[i] ?? '')
    : [];

  // Parse the base-uom textarea into trimmed non-empty lines.
  const catchTextLines = isCatch && isBase
    ? catchText.split('\n').map((l) => l.trim()).filter((l) => l !== '')
    : [];

  // The effective per-unit weight strings for sum/payload/validation.
  const catchWeights = isCatch ? (isBase ? catchTextLines : catchInputs) : [];
  const catchSumKg = isCatch ? sumCatchWeightsKg(catchWeights) : '0';
  const catchValid = isCatch
    ? !catchOverCap &&
      catchWeights.length > 0 &&
      catchWeights.every(isPositiveDecimal) &&
      // each/box: every rendered slot must be filled (length already === N).
      (isBase || catchWeights.length === catchN)
    : true;

  const canConfirm = productId !== '' && qtyValid && weightValid && catchValid && !busy;

  const cw = labels.output.catchWeight;
  const catchSumLine = cw ? cw.sumLabel.replace('{total}', catchSumKg) : `Σ ${catchSumKg} kg`;
  const catchTooManyLine = cw
    ? cw.tooMany.replace('{max}', String(CATCH_WEIGHT_MAX_UNITS))
    : `Too many units (max ${CATCH_WEIGHT_MAX_UNITS}).`;

  // Live nominal conversion preview for each/box (hidden for base). When the pack
  // factors are missing the preview shows the conversion-unavailable copy.
  const qtyUnitLabel =
    outputUom === 'box'
      ? labels.output.qtyUom?.box
      : outputUom === 'each'
        ? labels.output.qtyUom?.each
        : labels.output.qtyUom?.base;
  // The legacy base label already carries its unit ("Quantity (kg)") — only
  // append a suffix for each/box, else live renders "Quantity (kg) (kg)".
  const qtyLabel =
    !isBase && qtyUnitLabel ? `${labels.output.qty} (${qtyUnitLabel})` : labels.output.qty;

  let preview: string | null = null;
  if (!isBase && qtyValid) {
    try {
      const baseKg = toBaseQty(snap, Number(qty.trim()), outputUom);
      preview =
        labels.output.conversionPreview
          ?.replace('{qty}', qty.trim())
          .replace('{unit}', qtyUnitLabel ?? outputUom)
          .replace('{kg}', fmtKg(baseKg))
          .replace('{base}', snap.uomBase) ?? null;
    } catch {
      preview = labels.errors.uom_conversion_unavailable ?? labels.errorFallback;
    }
  }

  async function handleConfirm() {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);

    // For base, post the legacy { qty_kg } shape. For each/box, post units +
    // unitsUom + the OPTIONAL actualWeightKg; if the conversion factors are
    // missing, surface uom_conversion_unavailable verbatim before the round-trip.
    let body: Record<string, unknown>;
    if (isBase) {
      body = {
        transaction_id: freshTransactionId(),
        output_type: outputType,
        product_id: productId,
        qty_kg: qty.trim(),
        // REGULATED WEIGHT: decimal STRING, never a JS number — the route's
        // DecimalString schema rejects numbers by design (live 422 otherwise).
        ...(weightTrimmed ? { actualWeightKg: weightTrimmed } : {}),
        ...(batch.trim() ? { batch_number: batch.trim() } : {}),
        // B-3 catch-weight: per-unit kg as decimal STRINGS (DecimalString boundary
        // rejects numbers). Only for weight_mode='catch' items.
        ...(isCatch ? { catch_weight_kg_per_unit: catchWeights.map((w) => w.trim()) } : {}),
      };
    } else {
      // Validate the conversion is possible client-side (mirrors the handler).
      try {
        toBaseQty(snap, Number(qty.trim()), outputUom);
      } catch (e) {
        setBusy(false);
        if (e instanceof TypedError) {
          setError(mapError(labels, e.code));
        } else {
          setError(labels.errorFallback);
        }
        return;
      }
      body = {
        transaction_id: freshTransactionId(),
        output_type: outputType,
        product_id: productId,
        // REGULATED QUANTITIES: decimal STRINGS (DecimalString schema).
        qtyUnits: qty.trim(),
        unitsUom: outputUom,
        ...(weightTrimmed ? { actualWeightKg: weightTrimmed } : {}),
        ...(batch.trim() ? { batch_number: batch.trim() } : {}),
        // B-3 catch-weight per-unit kg (decimal STRINGS) for weight_mode='catch'.
        ...(isCatch ? { catch_weight_kg_per_unit: catchWeights.map((w) => w.trim()) } : {}),
      };
    }

    const result = await run('output', body);
    setBusy(false);
    if (result.ok) {
      setQty('');
      setActualWeight('');
      setBatch('');
      setCatchUnits([]);
      setCatchText('');
      onClose();
    } else {
      setError(mapError(labels, result.errorCode));
    }
  }

  const productDisplay =
    uom?.productCode || uom?.productName
      ? [uom?.productCode, uom?.productName].filter(Boolean).join(' — ')
      : productId.slice(0, 8);

  return (
    <Modal open={open} onOpenChange={(n) => (n ? undefined : onClose())} modalId="wo-output" size="md">
      <Modal.Header title={labels.output.title} />
      <Modal.Body>
        <p className="mb-3 text-sm text-slate-600">{labels.output.subtitle}</p>
        {error ? <ErrorBanner message={error} testid="wo-output-error" /> : null}
        <div className="space-y-3">
          <FieldRow id="wo-output-type" label={labels.output.type}>
            <Select value={outputType} onValueChange={(v) => setOutputType(v as (typeof OUTPUT_TYPES)[number])} aria-label={labels.output.type}>
              <SelectTrigger id="wo-output-type" data-testid="wo-output-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTPUT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {labels.output.types[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          {/* Product — READ-ONLY code + name (id kept in the payload). */}
          <FieldRow id="wo-output-product" label={labels.output.product}>
            <p
              id="wo-output-product"
              data-testid="wo-output-product"
              className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700"
            >
              {productDisplay}
            </p>
          </FieldRow>
          <FieldRow id="wo-output-qty" label={qtyLabel}>
            <Input id="wo-output-qty" inputMode="decimal" value={qty} disabled={busy} onChange={(e) => setQty(e.target.value)} data-testid="wo-output-qty" />
            {preview ? (
              <span data-testid="wo-output-conversion" className="mt-1 text-xs text-slate-500">
                {preview}
              </span>
            ) : null}
          </FieldRow>
          {/* B-3 catch-weight — per-unit scale capture for weight_mode='catch'.
              Parity anchor: production/modals.jsx:173-201 (catch_weight_modal):
              per-unit numbered weights + a running total/avg summary line. */}
          {isCatch ? (
            <div
              data-testid="wo-output-catch-weights"
              className="rounded-md border border-slate-200 bg-slate-50 p-3"
            >
              <div className="mb-1 text-sm font-medium text-slate-900">
                {cw?.sectionTitle ?? 'Per-unit weights (kg)'}
              </div>
              <p className="mb-2 text-xs text-slate-500">
                {cw?.sectionHint ?? 'Catch-weight item — enter the scale reading for each unit.'}
              </p>
              {isBase ? (
                // Base uom: unit count is unknown up front — one weight per line.
                <>
                  <label htmlFor="wo-output-catch-textarea" className="sr-only">
                    {cw?.baseTextareaLabel ?? 'Per-unit weights (one per line, kg)'}
                  </label>
                  <Textarea
                    id="wo-output-catch-textarea"
                    rows={4}
                    inputMode="decimal"
                    value={catchText}
                    disabled={busy}
                    onChange={(e) => setCatchText(e.target.value)}
                    data-testid="wo-output-catch-textarea"
                    placeholder={cw?.baseTextareaHint ?? 'Enter one positive weight per line.'}
                  />
                </>
              ) : catchOverCap ? (
                <p data-testid="wo-output-catch-toomany" className="text-sm text-amber-700">
                  {catchTooManyLine}
                </p>
              ) : catchN > 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {catchInputs.map((value, i) => (
                    <Input
                      key={i}
                      inputMode="decimal"
                      aria-label={(cw?.unitLabel ?? 'Unit {n}').replace('{n}', String(i + 1))}
                      value={value}
                      disabled={busy}
                      onChange={(e) =>
                        setCatchUnits((prev) => {
                          const next = prev.slice();
                          // Grow the backing array to at least N before writing.
                          while (next.length < catchN) next.push('');
                          next[i] = e.target.value;
                          return next;
                        })
                      }
                      data-testid={`wo-output-catch-weight-${i}`}
                    />
                  ))}
                </div>
              ) : null}
              {(isBase ? catchTextLines.length > 0 : catchN > 0 && !catchOverCap) ? (
                <div
                  data-testid="wo-output-catch-sum"
                  className="mt-2 text-sm font-medium tabular-nums text-slate-800"
                >
                  {catchSumLine}
                </div>
              ) : null}
            </div>
          ) : null}
          {/* Optional actual weighed kg — always visible (nominal otherwise). */}
          <FieldRow id="wo-output-actual-weight" label={labels.output.actualWeight ?? labels.output.qty} hint={labels.output.actualWeightHint}>
            <Input
              id="wo-output-actual-weight"
              inputMode="decimal"
              value={actualWeight}
              disabled={busy}
              onChange={(e) => setActualWeight(e.target.value)}
              data-testid="wo-output-actual-weight"
            />
          </FieldRow>
          <FieldRow id="wo-output-batch" label={labels.output.batch} hint={labels.output.batchHint}>
            <Input id="wo-output-batch" value={batch} disabled={busy} onChange={(e) => setBatch(e.target.value)} data-testid="wo-output-batch" />
          </FieldRow>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" data-testid="wo-output-cancel" disabled={busy} onClick={onClose}>
          {labels.cancel}
        </Button>
        <Button type="button" data-testid="wo-output-confirm" disabled={!canConfirm} onClick={handleConfirm}>
          {busy ? labels.submitting : labels.confirm}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// ── Log waste ──────────────────────────────────────────────────────────────

export function WasteModal({
  open,
  woId,
  labels,
  run,
  onClose,
  categories,
}: BaseModalProps & { categories: WoWasteCategory[] }) {
  const [categoryCode, setCategoryCode] = useState('');
  const [qty, setQty] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qtyValid = /^\d+(\.\d+)?$/.test(qty.trim()) && Number(qty.trim()) > 0;
  const canConfirm = categoryCode !== '' && qtyValid && shiftId.trim() !== '' && !busy;

  async function handleConfirm() {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    const result = await run('waste', {
      transaction_id: freshTransactionId(),
      category_code: categoryCode,
      qty_kg: qty.trim(),
      shift_id: shiftId.trim(),
      ...(reasonCode.trim() ? { reason_code: reasonCode.trim() } : {}),
      ...(notes.trim() ? { reason_notes: notes.trim() } : {}),
    });
    setBusy(false);
    if (result.ok) {
      setQty('');
      setReasonCode('');
      setNotes('');
      onClose();
    } else {
      setError(mapError(labels, result.errorCode));
    }
  }

  return (
    <Modal open={open} onOpenChange={(n) => (n ? undefined : onClose())} modalId="wo-waste" size="md">
      <Modal.Header title={labels.waste.title} />
      <Modal.Body>
        <p className="mb-3 text-sm text-slate-600">{labels.waste.subtitle}</p>
        {error ? <ErrorBanner message={error} testid="wo-waste-error" /> : null}
        <div className="space-y-3">
          <FieldRow id="wo-waste-category" label={labels.waste.category}>
            {categories.length === 0 ? (
              <p data-testid="wo-waste-no-categories" className="text-sm text-amber-700">
                {labels.waste.noCategories}
              </p>
            ) : (
              <Select value={categoryCode} onValueChange={setCategoryCode} aria-label={labels.waste.category}>
                <SelectTrigger id="wo-waste-category" data-testid="wo-waste-category">
                  <SelectValue placeholder={labels.waste.categoryPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FieldRow>
          <FieldRow id="wo-waste-qty" label={labels.waste.qty}>
            <Input id="wo-waste-qty" inputMode="decimal" value={qty} disabled={busy} onChange={(e) => setQty(e.target.value)} data-testid="wo-waste-qty" />
          </FieldRow>
          <FieldRow id="wo-waste-shift" label={labels.waste.shift}>
            <Input id="wo-waste-shift" value={shiftId} disabled={busy} onChange={(e) => setShiftId(e.target.value)} data-testid="wo-waste-shift" />
          </FieldRow>
          <FieldRow id="wo-waste-reason" label={labels.waste.reasonCode}>
            <Input id="wo-waste-reason" value={reasonCode} disabled={busy} onChange={(e) => setReasonCode(e.target.value)} data-testid="wo-waste-reason" />
          </FieldRow>
          <FieldRow id="wo-waste-notes" label={labels.waste.notes}>
            <Textarea id="wo-waste-notes" rows={2} value={notes} disabled={busy} onChange={(e) => setNotes(e.target.value)} data-testid="wo-waste-notes" />
          </FieldRow>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" data-testid="wo-waste-cancel" disabled={busy} onClick={onClose}>
          {labels.cancel}
        </Button>
        <Button type="button" data-testid="wo-waste-confirm" disabled={!canConfirm} onClick={handleConfirm}>
          {busy ? labels.submitting : labels.confirm}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

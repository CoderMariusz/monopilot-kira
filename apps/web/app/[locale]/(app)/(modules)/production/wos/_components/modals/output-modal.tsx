'use client';

import { useEffect, useRef, useState } from 'react';

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
import type { WoActionData } from './types';
import { ErrorBanner, FieldRow, mapError, type BaseModalProps } from './shared';

export type OutputPrintLabelResult = { status: 'queued' | 'sent' | 'failed'; result_url: string | null };
export type OutputPrintLabelInput = { entityType: 'lp'; entityId: string };
export type PrintFgLabelAction = (input: OutputPrintLabelInput) => Promise<OutputPrintLabelResult>;

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
  /**
   * SOFT-warning (owner decision — warn, NEVER block): set when the WO currently
   * has no real material consumption recorded. The Register-output modal then
   * shows a non-blocking notice before submit with a [Continue anyway]
   * affordance — registering an output now gives the resulting LP no
   * genealogy/traceability parent. Null/absent ⇒ no warning. Copy is resolved
   * server-side (i18n) and threaded in — never authored in the modal.
   */
  noConsumptionWarning?: { message: string; continueLabel: string } | null;
};

function fmtKg(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function fmtMassBalanceNumber(value: string, digits = 3): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

function formatMassBalanceWarning(template: string, warning: NonNullable<WoActionData['massBalanceWarning']>): string {
  const expectedKg = Number(warning.expected_input_kg);
  const yieldPct = Number(warning.effective_yield_pct);
  const outputKg =
    Number.isFinite(expectedKg) && Number.isFinite(yieldPct)
      ? String((expectedKg * yieldPct) / 100)
      : warning.expected_input_kg;
  return template
    .replace('{outputKg}', fmtMassBalanceNumber(outputKg))
    .replace('{expectedKg}', fmtMassBalanceNumber(warning.expected_input_kg))
    .replace('{yieldPct}', fmtMassBalanceNumber(warning.effective_yield_pct, 2))
    .replace('{consumedKg}', fmtMassBalanceNumber(warning.posted_consumption_kg));
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
  printLabelAction,
  canPrintFgLabel = false,
}: BaseModalProps & {
  defaultProductId: string | null;
  uom?: OutputUomContext | null;
  /**
   * E1 — print the created FG LP label. OWNED by the printers settings actions
   * (settings/infra/printers/_actions/printers.ts → printLabel) and threaded in by
   * the page; never imported here directly. RBAC is re-enforced server-side.
   */
  printLabelAction?: PrintFgLabelAction;
  /** Server-resolved settings.org.update; false ⇒ Print button disabled + tooltip. */
  canPrintFgLabel?: boolean;
}) {
  const [outputType, setOutputType] = useState<(typeof OUTPUT_TYPES)[number]>('primary');
  const [qty, setQty] = useState('');
  const [actualWeight, setActualWeight] = useState('');
  const [batch, setBatch] = useState('');
  // E1 — success state: the created FG LP (id/number) + the print result.
  const [output, setOutput] = useState<WoActionData | null>(null);
  const [printBusy, setPrintBusy] = useState(false);
  const [printResult, setPrintResult] = useState<OutputPrintLabelResult | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  // B-3 catch-weight per-unit captures. `catchUnits` backs the dynamic per-unit
  // grid (each/box catch items); `catchText` backs the base-uom textarea fallback
  // (one weight per line) where the unit count is unknown up front.
  const [catchUnits, setCatchUnits] = useState<string[]>([]);
  const [catchText, setCatchText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const transactionIdRef = useRef(freshTransactionId());
  // SOFT-warning acknowledgement (owner decision — warn, never block). When the
  // WO has no recorded material consumption we surface a non-blocking notice; the
  // operator clicks [Continue anyway] to acknowledge before submitting. Submit is
  // never disabled by anything other than the normal field validity.
  const [noConsumptionAck, setNoConsumptionAck] = useState(false);

  useEffect(() => {
    if (!open) return;
    submittingRef.current = false;
    transactionIdRef.current = freshTransactionId();
  }, [open]);

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

  // SOFT-warning: a non-blocking acknowledgement gate. When present, the operator
  // must click [Continue anyway] once before Confirm enables — but nothing here
  // can hard-block the submit beyond a single acknowledging click.
  const noConsumptionWarning = uom?.noConsumptionWarning ?? null;
  const consumptionAcknowledged = noConsumptionWarning == null || noConsumptionAck;
  const canConfirm =
    productId !== '' && qtyValid && weightValid && catchValid && consumptionAcknowledged && !busy;

  const cw = labels.output.catchWeight;
  // E1 — print-FG-label copy with EN fallbacks (staged keys; injected by the page).
  const p = labels.output.print ?? {
    successTitle: 'Output registered',
    successBody: 'The finished-goods license plate was created.',
    lpLine: 'FG label — {lp}',
    action: 'Print FG label',
    printing: 'Printing…',
    queued: 'Print job queued for the printer.',
    sent: 'Label sent — download the rendered output below.',
    download: 'Download label',
    error: 'Label could not be printed. Try again or contact an administrator.',
    forbidden: 'Insufficient permissions: settings.org.update is required to print labels.',
    close: 'Done',
  };
  const fgLpCode = output?.lpNumber ?? null;
  const massBalanceWarning = output?.massBalanceWarning ?? null;
  const massBalanceWarningText = massBalanceWarning
    ? formatMassBalanceWarning(
        labels.output.mass_balance_warning ??
          'Registered output ({outputKg} kg) requires approx {expectedKg} kg of components at {yieldPct}% yield, but {consumedKg} kg consumed so far.',
        massBalanceWarning,
      )
    : null;
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
    if (submittingRef.current || !canConfirm) return;
    submittingRef.current = true;
    setBusy(true);
    setError(null);
    const transactionId = transactionIdRef.current;

    // For base, post the legacy { qty_kg } shape. For each/box, post units +
    // unitsUom + the OPTIONAL actualWeightKg; if the conversion factors are
    // missing, surface uom_conversion_unavailable verbatim before the round-trip.
    let body: Record<string, unknown>;
    if (isBase) {
      body = {
        transaction_id: transactionId,
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
        submittingRef.current = false;
        setBusy(false);
        if (e instanceof TypedError) {
          setError(mapError(labels, e.code));
        } else {
          setError(labels.errorFallback);
        }
        return;
      }
      body = {
        transaction_id: transactionId,
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
    submittingRef.current = false;
    setBusy(false);
    if (result.ok) {
      setQty('');
      setActualWeight('');
      setBatch('');
      setCatchUnits([]);
      setCatchText('');
      setNoConsumptionAck(false);
      // E1 — when the route surfaced the created FG LP or post-submit warning,
      // switch to the success state; otherwise close as before.
      if (result.data && (result.data.lpId || result.data.lpNumber || result.data.massBalanceWarning)) {
        setOutput(result.data);
      } else {
        onClose();
      }
    } else {
      setError(mapError(labels, result.reason ?? result.errorCode, result.message));
    }
  }

  // E1 — print the FG label for the created LP, mirroring the B4 result pattern.
  async function handlePrintFgLabel() {
    const lpId = output?.lpId;
    if (!printLabelAction || !canPrintFgLabel || !lpId || printBusy) return;
    setPrintBusy(true);
    setPrintError(null);
    setPrintResult(null);
    try {
      const res = await printLabelAction({ entityType: 'lp', entityId: lpId });
      setPrintResult(res);
    } catch {
      setPrintError(p.error);
    } finally {
      setPrintBusy(false);
    }
  }

  // E1 — close + reset BOTH the form and the success/print state.
  function closeAndReset() {
    setOutput(null);
    setPrintResult(null);
    setPrintError(null);
    setPrintBusy(false);
    onClose();
  }

  // productCode/productName are threaded from the WO detail query (items join).
  // When the item row is missing, render an honest em-dash — NEVER the raw uuid.
  const productDisplay =
    uom?.productCode || uom?.productName
      ? [uom?.productCode, uom?.productName].filter(Boolean).join(' — ')
      : '—';

  // E1 — success state: output registered → offer [Print FG label] for the LP.
  if (output) {
    return (
      <Modal open={open} onOpenChange={(n) => (n ? undefined : closeAndReset())} modalId="wo-output" size="md">
        <Modal.Header title={p.successTitle} />
        <Modal.Body>
          <div data-testid="wo-output-success" className="flex flex-col gap-3">
            <div className="flex flex-col items-center gap-1 py-3 text-center">
              <span aria-hidden="true" className="text-3xl">✅</span>
              <p className="text-sm font-medium text-slate-900">{p.successTitle}</p>
              <p className="text-sm text-slate-500">{p.successBody}</p>
            </div>
            {fgLpCode ? (
              <p data-testid="wo-output-fg-lp" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-center font-mono text-sm text-slate-800">
                {p.lpLine.replace('{lp}', fgLpCode)}
              </p>
            ) : null}
            {massBalanceWarningText ? (
              <div
                role="status"
                data-testid="wo-output-mass-balance-warning"
                className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"
              >
                ⚠ {massBalanceWarningText}
              </div>
            ) : null}
            <button
              type="button"
              data-testid="wo-output-print-fg"
              disabled={!canPrintFgLabel || !output.lpId || printBusy}
              title={canPrintFgLabel ? undefined : p.forbidden}
              aria-label={canPrintFgLabel ? p.action : `${p.action} — ${p.forbidden}`}
              onClick={() => void handlePrintFgLabel()}
              className={
                canPrintFgLabel && output.lpId
                  ? 'w-fit self-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50'
                  : 'w-fit cursor-not-allowed self-center rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-400'
              }
            >
              {printBusy ? p.printing : p.action}
            </button>
            {printResult ? (
              <div
                role="status"
                data-testid="wo-output-print-result"
                data-print-status={printResult.status}
                className="flex flex-col items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
              >
                <span>{printResult.status === 'sent' ? p.sent : p.queued}</span>
                {printResult.result_url ? (
                  <a
                    href={printResult.result_url}
                    download
                    data-testid="wo-output-print-download"
                    className="text-sky-700 underline"
                  >
                    {p.download}
                  </a>
                ) : null}
              </div>
            ) : null}
            {printError ? (
              <p role="alert" data-testid="wo-output-print-error" className="text-center text-sm text-red-700">
                {printError}
              </p>
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" data-testid="wo-output-done" onClick={closeAndReset}>
            {p.close}
          </Button>
        </Modal.Footer>
      </Modal>
    );
  }

  return (
    <Modal open={open} onOpenChange={(n) => (n ? undefined : onClose())} modalId="wo-output" size="md">
      <Modal.Header title={labels.output.title} />
      <Modal.Body>
        <p className="mb-3 text-sm text-slate-600">{labels.output.subtitle}</p>
        {error ? <ErrorBanner message={error} testid="wo-output-error" /> : null}
        {noConsumptionWarning ? (
          <div
            role="status"
            data-testid="wo-output-no-consumption-warning"
            className="mb-3 flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"
          >
            <span>⚠ {noConsumptionWarning.message}</span>
            {!noConsumptionAck ? (
              <button
                type="button"
                data-testid="wo-output-no-consumption-continue"
                onClick={() => setNoConsumptionAck(true)}
                className="self-start rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                {noConsumptionWarning.continueLabel}
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-3">
          <FieldRow id="wo-output-type" label={labels.output.type}>
            <Select
              value={outputType}
              onValueChange={(v) => setOutputType(v as (typeof OUTPUT_TYPES)[number])}
              options={OUTPUT_TYPES.map((t) => ({ value: t, label: labels.output.types[t] }))}
              aria-label={labels.output.type}
            >
              <SelectTrigger id="wo-output-type" data-testid="wo-output-type">
                <SelectValue placeholder={labels.output.type} />
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
        <Button
          type="button"
          data-testid="wo-output-confirm"
          disabled={!canConfirm}
          onClick={handleConfirm}
          title={
            !canConfirm && !consumptionAcknowledged && noConsumptionWarning
              ? noConsumptionWarning.continueLabel
              : undefined
          }
        >
          {busy ? labels.submitting : labels.confirm}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

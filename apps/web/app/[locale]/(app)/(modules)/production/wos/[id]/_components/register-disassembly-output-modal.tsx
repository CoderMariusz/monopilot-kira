'use client';

/**
 * E7 — Desktop "Register disassembly outputs" modal.
 *
 * A disassembly WO breaks ONE input license plate (a carcass/primal) into N
 * co-product OUTPUTS. This modal lists the BOM's expected co-products (server-
 * resolved: code/name + read-only allocation %), prefilled with the nominal
 * yield, and lets the operator enter the ACTUAL yielded kg per output. On submit
 * it posts { inputLpId, outputs: [{ coProductItemId, qtyKg }] } to the
 * disassembly-outputs route, which calls registerDisassemblyOutput.
 *
 * Mirrors the desktop RecordConsumptionModal conventions (Modal + Select + Input
 * + Button) and surfaces all five UI states:
 *   loading    — N/A (data is server-pushed, no in-modal fetch)
 *   empty      — no input LP consumed yet (consume the carcass first) OR the BOM
 *                has no co-products → the form is disabled with the empty notice
 *   error      — verbatim route error mapped to copy in the banner
 *   denied     — the route's `forbidden` error → permission copy in the banner
 *   optimistic — submit pending (button disabled + "Registering…")
 *
 * NUMERIC-exact boundary: qty is a decimal STRING passed straight to the service
 * (which validates `^\d+(\.\d+)?$` and rejects JS numbers) — never `Number()`-ed.
 */

import { useEffect, useMemo, useState } from 'react';

import Modal from '@monopilot/ui/Modal';
import Input from '@monopilot/ui/Input';
import { Button } from '@monopilot/ui/Button';
import { Select } from '@monopilot/ui/Select';

import type {
  WoDisassemblyInputLp,
  WoDisassemblyOutput,
} from '../../../_actions/get-work-order-detail';

/** Result of the route call, threaded in by the screen (mirrors useWoAction). */
export type DisassemblyRegisterResult =
  | { ok: true }
  | { ok: false; errorCode: string };

export type DisassemblyModalLabels = {
  title: string;
  subtitle: string;
  inputLp: string;
  inputLpPlaceholder: string;
  inputLpEmpty: string;
  outputsTitle: string;
  outputsEmpty: string;
  /** Read-only allocation badge, `{pct}` = allocation_pct. */
  allocation: string;
  byproduct: string;
  qty: string;
  /** Per-output qty hint, `{uom}` = the output unit. */
  qtyHint: string;
  submit: string;
  submitting: string;
  cancel: string;
  formIncomplete: string;
  errors: {
    forbidden: string;
    'not-disassembly': string;
    'co-product-mismatch': string;
    'input-cost-missing': string;
    'invalid-input': string;
    'not-found': string;
    'warehouse-not-configured': string;
    generic: string;
  };
};

/** decimal-string guard mirroring the service's DecimalInput (positive plain decimal). */
function isPositiveDecimal(value: string): boolean {
  const v = value.trim();
  return /^\d+(\.\d+)?$/.test(v) && Number(v) > 0;
}

export function RegisterDisassemblyOutputModal({
  open,
  woId,
  outputs,
  inputLps,
  labels,
  registerAction,
  onClose,
  onRegistered,
}: {
  open: boolean;
  woId: string;
  outputs: WoDisassemblyOutput[];
  inputLps: WoDisassemblyInputLp[];
  labels: DisassemblyModalLabels;
  /**
   * Posts to the disassembly-outputs route. OWNED by the screen (which composes
   * the locale-prefixed fetch + router.refresh on success); this modal stays pure
   * transport-free and only renders the result.
   */
  registerAction: (input: {
    woId: string;
    inputLpId: string;
    outputs: Array<{ coProductItemId: string; qtyKg: string }>;
  }) => Promise<DisassemblyRegisterResult>;
  onClose: () => void;
  onRegistered: () => void;
}) {
  const [inputLpId, setInputLpId] = useState('');
  const [qtyByItem, setQtyByItem] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // (Re)initialise on open: preselect the only/first input LP, prefill each output
  // qty with its nominal expected yield (operator edits to the actual scale read).
  useEffect(() => {
    if (!open) return;
    setInputLpId(inputLps[0]?.lpId ?? '');
    setQtyByItem(
      Object.fromEntries(
        outputs.map((o) => [o.coProductItemId, o.expectedQty > 0 ? String(o.expectedQty) : '']),
      ),
    );
    setError(null);
    setBusy(false);
  }, [open, inputLps, outputs]);

  const inputLpOptions = inputLps.map((lp) => ({
    value: lp.lpId,
    label: `${lp.lpNumber ?? lp.lpId.slice(0, 8)} · ${lp.qtyKg} kg`,
  }));

  const hasInputLp = inputLps.length > 0;
  const hasOutputs = outputs.length > 0;

  const allQtysValid = useMemo(
    () => outputs.every((o) => isPositiveDecimal(qtyByItem[o.coProductItemId] ?? '')),
    [outputs, qtyByItem],
  );

  const canSubmit = hasInputLp && hasOutputs && inputLpId !== '' && allQtysValid && !busy;

  function mapError(code: string): string {
    if (code in labels.errors) return labels.errors[code as keyof typeof labels.errors];
    return labels.errors.generic;
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const result = await registerAction({
      woId,
      inputLpId,
      outputs: outputs.map((o) => ({
        coProductItemId: o.coProductItemId,
        qtyKg: (qtyByItem[o.coProductItemId] ?? '').trim(),
      })),
    });
    setBusy(false);
    if (result.ok) {
      onRegistered();
      return;
    }
    setError(mapError(result.errorCode));
  }

  return (
    <Modal
      open={open}
      onOpenChange={(n) => (n ? undefined : onClose())}
      modalId="wo-disassembly"
      size="md"
    >
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <p className="mb-3 text-sm text-slate-600">{labels.subtitle}</p>

        {error ? (
          <div
            role="alert"
            data-testid="wo-disassembly-error"
            className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </div>
        ) : null}

        <div className="space-y-4">
          {/* Input LP picker — the carcass/primal being broken down. */}
          <div>
            <label
              htmlFor="wo-disassembly-input-lp"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              {labels.inputLp}
            </label>
            {hasInputLp ? (
              <Select
                id="wo-disassembly-input-lp"
                aria-label={labels.inputLp}
                value={inputLpId}
                onValueChange={setInputLpId}
                options={inputLpOptions}
                placeholder={labels.inputLpPlaceholder}
                disabled={busy}
              />
            ) : (
              <p data-testid="wo-disassembly-input-empty" className="text-sm text-slate-500">
                {labels.inputLpEmpty}
              </p>
            )}
          </div>

          {/* Expected outputs — one qty input per co-product. */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {labels.outputsTitle}
            </p>
            {hasOutputs ? (
              <ul className="flex flex-col gap-3">
                {outputs.map((o) => {
                  const qty = qtyByItem[o.coProductItemId] ?? '';
                  return (
                    <li
                      key={o.coProductItemId}
                      data-testid="wo-disassembly-output-row"
                      className="rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800">
                          {o.itemCode || o.itemName ? (
                            <span title={o.itemName ?? undefined}>{o.itemCode ?? o.itemName}</span>
                          ) : (
                            <span className="text-slate-400" title={o.coProductItemId}>
                              —
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-slate-500">
                          {o.isByproduct ? (
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-600">
                              {labels.byproduct}
                            </span>
                          ) : null}
                          <span className="font-mono tabular-nums">
                            {labels.allocation.replace('{pct}', String(o.allocationPct))}
                          </span>
                        </span>
                      </div>
                      <label
                        htmlFor={`wo-disassembly-qty-${o.coProductItemId}`}
                        className="mb-1 block text-xs font-medium text-slate-600"
                      >
                        {labels.qty}
                        <span className="ml-1 font-normal text-slate-400">({o.uom})</span>
                      </label>
                      <Input
                        id={`wo-disassembly-qty-${o.coProductItemId}`}
                        data-testid={`wo-disassembly-qty-${o.coProductItemId}`}
                        inputMode="decimal"
                        value={qty}
                        disabled={busy || !hasInputLp}
                        onChange={(e) =>
                          setQtyByItem((prev) => ({ ...prev, [o.coProductItemId]: e.target.value }))
                        }
                      />
                      <p className="mt-1 text-[11px] text-slate-400">
                        {labels.qtyHint.replace('{uom}', o.uom)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p data-testid="wo-disassembly-outputs-empty" className="text-sm text-slate-500">
                {labels.outputsEmpty}
              </p>
            )}
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" data-testid="wo-disassembly-cancel" disabled={busy} onClick={onClose}>
          {labels.cancel}
        </Button>
        <Button
          type="button"
          data-testid="wo-disassembly-submit"
          disabled={!canSubmit}
          onClick={handleSubmit}
          title={!canSubmit ? labels.formIncomplete : undefined}
        >
          {busy ? labels.submitting : labels.submit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

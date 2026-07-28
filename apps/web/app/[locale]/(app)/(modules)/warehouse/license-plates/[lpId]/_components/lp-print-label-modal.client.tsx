'use client';

/**
 * R08-05 — LP label print configuration modal.
 *
 * Collects copies (1–100) and an active site printer before calling the page-threaded
 * printLabel adapter. Mirrors the in-repo modal pattern (LpSplitModal): shadcn Modal +
 * Input + Select, inline validation, refresh-on-success via caller onSuccess.
 */

import { useEffect, useMemo, useState, useTransition } from 'react';

import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@monopilot/ui/Select';

import type { LpPrintLabelInput, LpPrintLabelModalLabels, LpPrintLabelResult, LpPrinterOption } from './lp-detail-labels';

const MIN_COPIES = 1;
const MAX_COPIES = 100;

function parseCopies(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isInteger(n) ? n : null;
}

export function LpPrintLabelModal({
  open,
  onOpenChange,
  lpId,
  lpNumber,
  printers,
  printersLoadError = false,
  labels,
  printAction,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lpId: string;
  lpNumber: string;
  printers: LpPrinterOption[];
  /** True when the server failed to load printers (distinct from an empty config). */
  printersLoadError?: boolean;
  labels: LpPrintLabelModalLabels;
  printAction: (input: LpPrintLabelInput) => Promise<LpPrintLabelResult>;
  onSuccess: (result: LpPrintLabelResult) => void;
}) {
  const [copies, setCopies] = useState('1');
  const [printerId, setPrinterId] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const parsedCopies = useMemo(() => parseCopies(copies), [copies]);

  const copiesError = useMemo<string | null>(() => {
    if (copies.trim().length === 0) return null;
    if (parsedCopies === null) return labels.validation.copiesInteger;
    if (parsedCopies < MIN_COPIES) return labels.validation.copiesMin;
    if (parsedCopies > MAX_COPIES) return labels.validation.copiesMax;
    return null;
  }, [copies, labels.validation.copiesInteger, labels.validation.copiesMax, labels.validation.copiesMin, parsedCopies]);

  const printerError =
    submitAttempted && printers.length > 0 && printerId.trim() === '' ? labels.validation.printerRequired : null;

  const copiesValid =
    parsedCopies !== null &&
    parsedCopies >= MIN_COPIES &&
    parsedCopies <= MAX_COPIES &&
    !copiesError;

  useEffect(() => {
    if (open) {
      setCopies('1');
      setPrinterId('');
      setSubmitAttempted(false);
    } else {
      setCopies('1');
      setPrinterId('');
      setSubmitAttempted(false);
    }
  }, [open, printers]);

  function close() {
    if (isPending) return;
    onOpenChange(false);
  }

  function submit() {
    setSubmitAttempted(true);
    if (!copiesValid || parsedCopies === null) return;
    if (printers.length > 0 && printerId.trim() === '') return;
    startTransition(async () => {
      try {
        const result = await printAction({
          entityType: 'lp',
          entityId: lpId,
          copies: parsedCopies,
          printerId,
        });
        onOpenChange(false);
        onSuccess(result);
      } catch {
        onOpenChange(false);
        onSuccess({ status: 'failed', result_url: null, code: 'print_failed' });
      }
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" modalId="lp-print-label" dismissible={!isPending}>
      <Modal.Header title={labels.title.replace('{lp}', lpNumber)} />
      <Modal.Body>
        <div data-testid="lp-print-label-modal" className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">{labels.intro}</p>

          <label htmlFor="lp-print-copies" className="text-sm font-medium text-slate-700">
            {labels.copies}
          </label>
          <Input
            id="lp-print-copies"
            data-testid="lp-print-copies"
            type="number"
            inputMode="numeric"
            min={MIN_COPIES}
            max={MAX_COPIES}
            step={1}
            value={copies}
            disabled={isPending}
            onChange={(e) => setCopies(e.target.value)}
            aria-invalid={copiesError ? true : undefined}
          />
          <span className="text-xs text-slate-500">{labels.copiesHelp}</span>
          {copiesError ? (
            <p role="alert" data-testid="lp-print-copies-error" className="text-xs text-red-600">
              {copiesError}
            </p>
          ) : null}

          <label htmlFor="lp-print-printer" className="text-sm font-medium text-slate-700">
            {labels.printer}
          </label>
          {printersLoadError ? (
            <p role="alert" data-testid="lp-print-printers-error" className="text-sm text-red-600">
              {labels.printersLoadError}
            </p>
          ) : printers.length === 0 ? (
            <p data-testid="lp-print-no-printers" className="text-sm text-slate-500">
              {labels.noPrinters}
            </p>
          ) : (
            <Select
              value={printerId}
              onValueChange={setPrinterId}
              disabled={isPending}
              aria-label={labels.printer}
            >
              <SelectTrigger id="lp-print-printer" data-testid="lp-print-printer-trigger">
                <SelectValue placeholder={labels.printerPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {printers.map((p) => (
                  <SelectItem key={p.id} value={p.id} data-testid="lp-print-printer-option">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {printerError ? (
            <p role="alert" data-testid="lp-print-printer-error" className="text-xs text-red-600">
              {printerError}
            </p>
          ) : null}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="lp-print-cancel"
          onClick={close}
          disabled={isPending}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="lp-print-submit"
          onClick={submit}
          disabled={!copiesValid || isPending || printers.length === 0 || printersLoadError}
          aria-busy={isPending}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? labels.submitting : labels.submit}
        </button>
      </Modal.Footer>
    </Modal>
  );
}

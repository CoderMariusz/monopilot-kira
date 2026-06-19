'use client';

/**
 * MODAL — Record CCP reading (Wave E3, client island).
 *
 * Design-system conformance (no JSX prototype for a live CCP-reading modal in
 * prototypes/design/Monopilot Design System/quality/haccp-screens.jsx — the
 * "+ Record reading" button at haccp-screens.jsx:140 opens an out-of-anchor
 * `ccpReading` modal whose markup is not in this file). Conformance follows the
 * sibling MODAL-INSPECTION-CREATE island (inspection-create-modal.client.tsx):
 * shadcn Modal + Select (no raw <select>), useTransition for the optimistic
 * submit, action error surfaced verbatim.
 *
 * Wires the reviewed `recordMonitoring` Server Action (imported by the page,
 * passed in as a prop — never authored here). On an out-of-limit value the
 * action auto-creates an NCR and returns its id; this island surfaces that
 * breach inline with a deep-link to the NCR (CCP CODE shown, never a UUID).
 *
 * DEVIATION (documented per UI-PROTOTYPE-PARITY-POLICY.md): the optional
 * work-order selector is OMITTED. `recordMonitoring.woId` is optional and
 * expects a UUID; the only existing WO reader (production/_actions/
 * list-work-orders.ts) lives in another module and is a list — not a
 * number→UUID resolver — so wiring it would require a cross-module import +
 * authoring a new resolver action (both out of scope) or leaking a raw UUID
 * (forbidden by rule 0.11). The reading is recorded without a WO link.
 */

import { useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

import type { CcpBoardItem, RecordMonitoringAction } from './ccp-contracts';
import type { CcpRecordLabels } from './labels';

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

export type CcpRecordSuccess =
  | { kind: 'in_limit' }
  | { kind: 'breach'; ccpCode: string; value: string; ncrId: string | null };

export function CcpRecordModal({
  open,
  onOpenChange,
  ccps,
  labels,
  locale,
  recordMonitoringAction,
  onRecorded,
  initialCcpId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ccps: CcpBoardItem[];
  labels: CcpRecordLabels;
  locale: string;
  recordMonitoringAction: RecordMonitoringAction;
  onRecorded?: (result: CcpRecordSuccess) => void;
  initialCcpId?: string;
}) {
  const [ccpId, setCcpId] = useState<string>(initialCcpId ?? '');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [breach, setBreach] = useState<{ ccpCode: string; value: string; ncrId: string | null } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const selectedCcp = ccps.find((c) => c.id === ccpId) ?? null;
  const normalizedValue = value.trim().replace(',', '.');
  const valid = ccpId !== '' && normalizedValue !== '' && DECIMAL_RE.test(normalizedValue);

  function reset() {
    setCcpId(initialCcpId ?? '');
    setValue('');
    setNote('');
    setError(null);
    setBreach(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function submit() {
    setError(null);
    setBreach(null);
    if (ccpId === '') {
      setError(labels.validation.ccpRequired);
      return;
    }
    if (normalizedValue === '') {
      setError(labels.validation.valueRequired);
      return;
    }
    if (!DECIMAL_RE.test(normalizedValue)) {
      setError(labels.validation.valueNumeric);
      return;
    }

    startTransition(async () => {
      const result = await recordMonitoringAction({
        ccpId,
        measuredValue: normalizedValue,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      if (!result.ok) {
        setError(labels.error.replace('{message}', result.message ?? result.reason));
        return;
      }
      if (result.data.withinLimits) {
        reset();
        onOpenChange(false);
        onRecorded?.({ kind: 'in_limit' });
        return;
      }
      // Out-of-limit: surface the breach inline (NCR auto-created), keep modal open.
      const ccpCode = selectedCcp?.ccpCode ?? '';
      setBreach({ ccpCode, value: normalizedValue, ncrId: result.data.ncrId });
      onRecorded?.({ kind: 'breach', ccpCode, value: normalizedValue, ncrId: result.data.ncrId });
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="ccp_record_modal" dismissible={!pending}>
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <div data-testid="ccp-record-form" className="flex flex-col gap-4 text-sm">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>

          {/* CCP picker (shadcn Select — no raw <select>; shows CODE — NAME, never a UUID). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.ccp}</span>
            <div data-testid="ccp-record-ccp-select">
              <Select
                aria-label={labels.ccp}
                value={ccpId}
                placeholder={labels.ccpPlaceholder}
                onValueChange={(v) => {
                  setCcpId(v);
                  setError(null);
                  setBreach(null);
                }}
                options={ccps.map((c) => ({
                  value: c.id,
                  label: `${c.ccpCode} — ${c.name}`,
                }))}
              />
            </div>
          </label>

          {/* Measured value (numeric). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.value}
              {selectedCcp?.unit ? <span className="ml-1 text-slate-400">({selectedCcp.unit})</span> : null}
            </span>
            <input
              type="text"
              inputMode="decimal"
              data-testid="ccp-record-value"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              placeholder={labels.valuePlaceholder}
              className="w-48 rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.valueHelp}</span>
          </label>

          {/* Note (optional). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.note}</span>
            <textarea
              data-testid="ccp-record-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={labels.notePlaceholder}
              rows={2}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
          </label>

          {error && (
            <p role="alert" data-testid="ccp-record-error" className="text-sm text-red-600">
              {error}
            </p>
          )}

          {breach && (
            <div
              role="alert"
              data-testid="ccp-record-breach"
              data-state="optimistic"
              className="flex flex-col gap-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              <span className="font-semibold">{labels.breach.title}</span>
              <span className="text-xs text-red-700">
                {labels.breach.body
                  .replace('{value}', breach.value)
                  .replace('{ccp}', breach.ccpCode)}
              </span>
              {breach.ncrId ? (
                <a
                  href={`/${locale}/quality/ncrs/${breach.ncrId}`}
                  data-testid="ccp-record-breach-ncr-link"
                  className="mt-1 inline-flex w-fit rounded border border-red-300 px-2 py-0.5 text-[11px] font-medium text-red-800 hover:bg-red-100"
                >
                  {labels.breach.viewNcr}
                </a>
              ) : null}
            </div>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="ccp-record-cancel"
          onClick={close}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="ccp-record-submit"
          disabled={!valid || pending}
          onClick={submit}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? labels.submitting : labels.submit}
        </button>
      </Modal.Footer>
    </Modal>
  );
}

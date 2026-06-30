'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import Modal from '@monopilot/ui/Modal';
import Input from '@monopilot/ui/Input';
import { Button } from '@monopilot/ui/Button';
import { Select } from '@monopilot/ui/Select';

import type { WoDetailComponent } from '../../../_actions/get-work-order-detail';
import type {
  ConsumableLp,
  ConsumeActionResult,
  RecordDesktopConsumptionData,
  RecordDesktopConsumptionInput,
} from '../../../_actions/consume-material-actions';
import type { WoDetailLabels } from './wo-detail-screen';

type RecordLabels = WoDetailLabels['consumption']['record'];

/**
 * M-5 — Desktop "Record consumption" modal. Mirrors the action-modals.tsx shape
 * (Modal + Select + Input + Button) but lives HERE (the task forbids touching
 * action-modals.tsx). All five UI states surface:
 *   loading  — LP candidate fetch in flight (lpStatus === 'loading')
 *   empty    — no FEFO candidates for the chosen component
 *   error    — LP fetch failed / verbatim submit error banner
 *   denied   — forbidden submit error → permission copy in the banner
 *   optimistic — submit pending (button disabled + "Recording…")
 * The optional LP list is FEFO-ordered (server) with the top row pre-suggested;
 * '— no LP —' is the explicit fallback (consume without decrementing an LP).
 */
export function RecordConsumptionModal({
  open,
  woId,
  components,
  preselectId,
  labels,
  recordConsumptionAction,
  listConsumableLpsAction,
  onClose,
  onRecorded,
}: {
  open: boolean;
  woId: string;
  components: WoDetailComponent[];
  preselectId: string | null;
  labels: RecordLabels;
  recordConsumptionAction: (
    input: RecordDesktopConsumptionInput,
  ) => Promise<ConsumeActionResult<RecordDesktopConsumptionData>>;
  listConsumableLpsAction: (
    input: { woId: string; materialId: string },
  ) => Promise<ConsumeActionResult<{ lps: ConsumableLp[] }>>;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const [materialId, setMaterialId] = useState('');
  const [qty, setQty] = useState('');
  const [lpId, setLpId] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [lps, setLps] = useState<ConsumableLp[]>([]);
  const [lpStatus, setLpStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Warn-tier over-consumption: the write SUCCEEDED but landed above the warn
  // threshold (≤ approval threshold). Keep the modal open with a non-blocking
  // amber line; Close then runs the normal onRecorded refresh path.
  const [warning, setWarning] = useState<{ overPct: number; warnPct: number } | null>(null);

  const selected = useMemo(
    () => components.find((c) => c.id === materialId) ?? null,
    [components, materialId],
  );

  // (Re)initialise selection whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setMaterialId(preselectId ?? components[0]?.id ?? '');
    setQty('');
    setLpId('');
    setReasonCode('');
    setLps([]);
    setLpStatus('idle');
    setError(null);
    setWarning(null);
    setBusy(false);
  }, [open, preselectId, components]);

  // FEFO candidate fetch keyed on the chosen component.
  useEffect(() => {
    if (!open || !materialId) return;
    let cancelled = false;
    setLpStatus('loading');
    setLps([]);
    setLpId('');
    void listConsumableLpsAction({ woId, materialId }).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setLps(res.data.lps);
        setLpId(res.data.lps[0]?.lpId ?? '');
        setLpStatus('ready');
      } else {
        setLpStatus('error');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, woId, materialId, listConsumableLpsAction]);

  const mapError = useCallback(
    (reason: string, message?: string): string => {
      if (typeof message === 'string' && message.trim().length > 0) {
        return message;
      }
      switch (reason) {
        case 'forbidden':
          return labels.errors.forbidden;
        case 'lp_unavailable':
          return labels.errors.lp_unavailable;
        case 'lp_not_released':
          return labels.errors.lp_not_released;
        case 'lp_expired':
          return labels.errors.lp_expired;
        case 'lp_locked':
          return labels.errors.lp_locked;
        case 'quality_hold_active':
          return labels.errors.quality_hold_active;
        case 'reason_required':
          return labels.errors.reason_required;
        case 'overconsume_blocked':
          return labels.errors.overconsume_blocked;
        case 'wo_not_consumable':
          return labels.errors.wo_not_consumable;
        case 'invalid_input':
          return labels.errors.invalid_input;
        case 'error':
          return labels.errors.error;
        case 'invalid_material':
          return labels.errors.invalid_material;
        case 'invalid_qty':
          return labels.errors.invalid_qty;
        default:
          return labels.errors.unknown;
      }
    },
    [labels],
  );

  const canSubmit =
    materialId !== '' &&
    qty.trim() !== '' &&
    (lpId !== '' || reasonCode.trim() !== '') &&
    !busy &&
    warning === null;

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const clientOpId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${woId}-${materialId}-${Date.now()}`;
    const result = await recordConsumptionAction({
      woId,
      materialId,
      qty: qty.trim(),
      lpId: lpId || null,
      reasonCode: lpId ? null : reasonCode.trim(),
      clientOpId,
    });
    setBusy(false);
    if (result.ok) {
      if (result.data.warning) {
        // Warn tier: recorded + flagged — surface the amber line instead of
        // silently closing; the Close button runs onRecorded (close + refresh).
        setWarning({ overPct: result.data.warning.overPct, warnPct: result.data.warning.warnPct });
        return;
      }
      onRecorded();
      return;
    }
    setError(mapError(result.reason, result.message));
  }

  const materialOptions = components.map((c) => ({
    value: c.id,
    label: `${c.materialName} (${c.uom})`,
  }));

  const lpOptions = [
    { value: '', label: labels.lpNone },
    ...lps.map((lp, i) => ({
      value: lp.lpId,
      label:
        i === 0
          ? `${lp.lpNumber} · ${lp.qty} ${lp.uom}${lp.expiry ? ` · ${lp.expiry}` : ''} (${labels.lpSuggested})`
          : `${lp.lpNumber} · ${lp.qty} ${lp.uom}${lp.expiry ? ` · ${lp.expiry}` : ''}`,
    })),
  ];

  return (
    <Modal open={open} onOpenChange={(n) => (n ? undefined : onClose())} modalId="wo-consume" size="sm">
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <p className="mb-3 text-sm text-slate-600">{labels.subtitle}</p>
        {error ? (
          <div
            role="alert"
            data-testid="wo-consume-error"
            className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </div>
        ) : null}
        {warning ? (
          <div
            role="status"
            data-testid="wo-consume-warning"
            className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            {labels.warningOver.replace('{pct}', warning.overPct.toFixed(2))}
          </div>
        ) : null}
        <div className="space-y-3">
          <div>
            <label htmlFor="wo-consume-material" className="mb-1 block text-sm font-medium text-slate-700">
              {labels.material}
            </label>
            <Select
              id="wo-consume-material"
              aria-label={labels.material}
              value={materialId}
              onValueChange={setMaterialId}
              options={materialOptions}
              placeholder={labels.materialPlaceholder}
              disabled={busy || warning !== null}
            />
          </div>

          <div>
            <label htmlFor="wo-consume-qty" className="mb-1 block text-sm font-medium text-slate-700">
              {labels.qty}
              {selected ? <span className="ml-1 text-xs font-normal text-slate-500">({selected.uom})</span> : null}
            </label>
            <Input
              id="wo-consume-qty"
              data-testid="wo-consume-qty"
              inputMode="decimal"
              value={qty}
              disabled={busy || warning !== null}
              onChange={(e) => setQty(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">{labels.qtyHint}</p>
          </div>

          <div>
            <label htmlFor="wo-consume-lp" className="mb-1 block text-sm font-medium text-slate-700">
              {labels.lp}
            </label>
            {lpStatus === 'loading' ? (
              <p data-testid="wo-consume-lp-loading" className="text-sm text-slate-500">
                {labels.lpLoading}
              </p>
            ) : lpStatus === 'error' ? (
              <p data-testid="wo-consume-lp-error" className="text-sm text-red-600">
                {labels.lpError}
              </p>
            ) : (
              <>
                <Select
                  id="wo-consume-lp"
                  aria-label={labels.lp}
                  value={lpId}
                  onValueChange={setLpId}
                  options={lpOptions}
                  disabled={busy || warning !== null}
                />
                {lpStatus === 'ready' && lps.length === 0 ? (
                  <p data-testid="wo-consume-lp-empty" className="mt-1 text-xs text-slate-500">
                    {labels.lpEmpty}
                  </p>
                ) : null}
              </>
            )}
          </div>
          {lpId === '' ? (
            <div>
              <label htmlFor="wo-consume-reason" className="mb-1 block text-sm font-medium text-slate-700">
                {labels.reasonCode}
              </label>
              <Input
                id="wo-consume-reason"
                data-testid="wo-consume-reason"
                value={reasonCode}
                disabled={busy || warning !== null}
                placeholder={labels.reasonPlaceholder}
                onChange={(e) => setReasonCode(e.target.value)}
              />
            </div>
          ) : null}
        </div>
      </Modal.Body>
      <Modal.Footer>
        {warning ? (
          // Recorded + flagged: the only exit is the normal close+refresh path.
          <Button type="button" data-testid="wo-consume-warning-close" onClick={onRecorded}>
            {labels.warningClose}
          </Button>
        ) : (
          <>
            <Button type="button" data-testid="wo-consume-cancel" disabled={busy} onClick={onClose}>
              {labels.cancel}
            </Button>
            <Button type="button" data-testid="wo-consume-submit" disabled={!canSubmit} onClick={handleSubmit} title={!canSubmit ? labels.formIncomplete : undefined}>
              {busy ? labels.submitting : labels.submit}
            </Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}

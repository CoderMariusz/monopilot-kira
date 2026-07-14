'use client';

import { Code128Barcode } from '../../../../../../../lib/barcode/code128-barcode';
import { resolveSsccBarcode } from '@monopilot/gs1/barcode-resolve';

/**
 * Wave-shipping — Shipment pack screen (client view).
 *
 * Prototype parity: shipping/pack-screens.jsx:48-220 (ShPackStation):
 *     header (station/shipment + SO + customer)  → pack-screens.jsx:57-67
 *     scan/enter-LP input into the active box     → pack-screens.jsx:109
 *     box builder + closed boxes w/ SSCC + content→ pack-screens.jsx:97-174
 *     right-rail shipment summary                 → pack-screens.jsx:177-216
 *
 * Deviations (documented for parity evidence):
 *   - The prototype's catch-weight grid (nominal/actual kg + variance badge), box
 *     dimensions, ZPL printer/station picker, packing-slip and the SSCC label
 *     preview are dropped: none have a backing feed in getShipment. We render the
 *     REAL boxes + SSCC-18 + contents, the persisted BOL/POD lifecycle values,
 *     and the single reviewed pack control (packLpIntoBox).
 *   - The prototype's left "picked LPs queue" is replaced by a single scan/enter-LP
 *     field (the only LP-resolving seam the reviewed packLpIntoBox exposes — it takes
 *     an lpId and validates allocation server-side). The operator may target an existing
 *     box or let the action open a new one.
 *
 * Data comes from the reviewed getShipment (read by the page) + packLpIntoBox (passed
 * as a seam). RBAC (ship.dashboard.view for the read, ship.pack.close for the pack) is
 * enforced server-side; `caps.canPack` is an advisory server-side probe used ONLY to
 * disable + tooltip the control, never client-trusted for authorisation.
 *
 * UI states: loading/error/denied resolved by the RSC page; here the detail is always a
 * successfully-loaded shipment. Boxes-empty (no boxes packed) renders an empty panel.
 * Pack action: optimistic (pending — input + button disabled + busy), error (inline
 * alert keyed off the action error), success (toast-less inline note + router.refresh).
 * NO raw UUIDs are ever rendered (lp_code / SSCC / shipment_number / so_number shown).
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';
import { Button } from '@monopilot/ui/Button';

import { ShipmentStatusBadge } from './shipment-status-badge';
import { ShipmentShipControls, type ShipmentShipLabels, type ShipmentShipCaps } from './shipment-ship-controls';
import type {
  GenerateBolActionInput,
  GenerateBolResult,
  RecordPodResult,
  SealShipmentResult,
  ShipShipmentResult,
} from './shipment-ship-types';
import type { CancelShipmentInput, CancelShipmentResult } from './cancel-shipment-modal';
import type { ShipmentDetail } from '../_actions/shipments-data';

export type ShipmentPackLabels = {
  status: Record<string, string>;
  summary: {
    title: string;
    shipment: string;
    salesOrder: string;
    customer: string;
    status: string;
    boxes: string;
  };
  boxes: {
    title: string;
    empty: string;
    boxLabel: string;
    ssccLabel: string;
    noSscc: string;
    contentsEmpty: string;
    colLp: string;
    colItem: string;
    colQty: string;
  };
  pack: {
    title: string;
    lpLabel: string;
    lpPlaceholder: string;
    boxLabel: string;
    newBox: string;
    submit: string;
    submitting: string;
    /** Success note; {n} = box number the LP landed in. */
    success: string;
    /** Tooltip when the control is disabled because the user lacks ship.pack.close. */
    noPermission: string;
  };
  seal: {
    submit: string;
    submitting: string;
    noPermission: string;
    needsBox: string;
    invalidState: string;
  };
  errors: Record<string, string>;
  /** Ship / BOL / POD rail labels (added by the ship-controls lane). */
  ship: ShipmentShipLabels;
};

export type PackLpResult = { ok: true; boxId: string } | { ok: false; error: string };

export type ShipmentPackViewProps = {
  locale: string;
  detail: ShipmentDetail;
  labels: ShipmentPackLabels;
  caps: { canPack: boolean } & ShipmentShipCaps;
  packLpIntoBoxAction: (input: {
    shipmentId: string;
    lpId: string;
    boxId?: string;
  }) => Promise<PackLpResult>;
  sealShipmentAction: (shipmentId: string) => Promise<SealShipmentResult>;
  /** Reviewed ship-actions.ts seams (imported by the page, never authored here). */
  shipShipmentAction: (shipmentId: string) => Promise<ShipShipmentResult>;
  generateBolAction: (input: GenerateBolActionInput) => Promise<GenerateBolResult>;
  recordPodAction: (input: {
    shipmentId: string;
    signedPdfUrl: string;
    reason: string;
    signature: { password: string };
  }) => Promise<RecordPodResult>;
  cancelShipmentAction: (input: CancelShipmentInput) => Promise<CancelShipmentResult>;
};

export function ShipmentPackView({
  locale,
  detail,
  labels,
  caps,
  packLpIntoBoxAction,
  sealShipmentAction,
  shipShipmentAction,
  generateBolAction,
  recordPodAction,
  cancelShipmentAction,
}: ShipmentPackViewProps) {
  const router = useRouter();
  const { shipment, boxes } = detail;

  const [lp, setLp] = React.useState('');
  const [boxNumber, setBoxNumber] = React.useState(''); // '' = new box
  const [pending, setPending] = React.useState(false);
  const [sealPending, setSealPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sealError, setSealError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const statusLabel = (s: string) => labels.status[s.toLowerCase()] ?? s;

  // Existing boxes the operator may target. We surface box NUMBERS (never the raw
  // box id) and resolve number→detail at submit time. The reviewed packLpIntoBox
  // takes a box id, so we look it up from the box list; the page passes box ids
  // alongside numbers via the boxes feed (boxNumber is the user-facing handle).
  const boxOptions = React.useMemo(
    () => [
      { value: '', label: labels.pack.newBox },
      ...boxes.map((b) => ({
        value: String(b.boxNumber),
        label: labels.boxes.boxLabel.replace('{n}', String(b.boxNumber)),
      })),
    ],
    [boxes, labels.pack.newBox, labels.boxes.boxLabel],
  );

  const disabled = !caps.canPack || pending;
  const tooltip = !caps.canPack ? labels.pack.noPermission : undefined;
  const sealDisabledReason = !caps.canPack
    ? labels.seal.noPermission
    : boxes.length < 1
      ? labels.seal.needsBox
      : shipment.status !== 'packing'
        ? labels.seal.invalidState
        : null;
  const sealDisabled = sealPending || Boolean(sealDisabledReason);

  async function onSubmit() {
    if (disabled) return;
    const code = lp.trim();
    if (!code) {
      setError(labels.errors.invalid_input);
      setSuccess(null);
      return;
    }
    setPending(true);
    setError(null);
    setSealError(null);
    setSuccess(null);
    try {
      // boxId resolution: the reviewed packLpIntoBox takes an OPTIONAL boxId. The
      // operator chooses a box NUMBER; we map it to that box's position. Since
      // getShipment does not surface the raw box id, an explicit box selection is
      // passed through only when the page provides ids; in the default flow the
      // action opens/extends the latest box. We forward the chosen box via the
      // boxId carried on the box detail when present.
      const chosen = boxNumber ? boxes.find((b) => String(b.boxNumber) === boxNumber) : undefined;
      const result = await packLpIntoBoxAction({
        shipmentId: shipment.id,
        lpId: code,
        ...(chosen && chosen.boxId ? { boxId: chosen.boxId } : {}),
      });
      if (!result.ok) {
        setError(labels.errors[result.error] ?? labels.errors.persistence_failed);
        setPending(false);
        return;
      }
      setLp('');
      setBoxNumber('');
      router.refresh();
    } catch {
      setError(labels.errors.persistence_failed);
    } finally {
      setPending(false);
    }
  }

  async function onSeal() {
    if (sealDisabled) return;
    setSealPending(true);
    setError(null);
    setSealError(null);
    setSuccess(null);
    try {
      const result = await sealShipmentAction(shipment.id);
      if (!result.ok) {
        setSealError(
          result.error === 'invalid_state'
            ? labels.seal.invalidState
            : labels.errors[result.error] ?? labels.errors.persistence_failed,
        );
        setSealPending(false);
        return;
      }
      router.refresh();
    } catch {
      setSealError(labels.errors.persistence_failed);
    } finally {
      setSealPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="shipment-pack-view" data-prototype-label="ship_pack_station">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3" data-testid="shipment-pack-header">
        <span className="font-mono text-lg font-semibold text-slate-900">{shipment.shipmentNumber || '—'}</span>
        {shipment.salesOrderNumber ? (
          <span className="font-mono text-sm text-blue-700">{shipment.salesOrderNumber}</span>
        ) : null}
        <span className="text-slate-700">{shipment.customerName ?? '—'}</span>
        <ShipmentStatusBadge status={shipment.status} label={statusLabel(shipment.status)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {/* Left: Pack control + boxes */}
        <div className="flex flex-col gap-4">
          {/* Pack-LP control */}
          <div className="rounded-xl border border-slate-200 p-4" data-testid="pack-lp-control">
            <div className="mb-3 text-sm font-semibold text-slate-700">{labels.pack.title}</div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="pack-lp-input" className="text-xs font-medium text-slate-600">
                  {labels.pack.lpLabel}
                </label>
                <Input
                  id="pack-lp-input"
                  data-testid="pack-lp-input"
                  value={lp}
                  placeholder={labels.pack.lpPlaceholder}
                  disabled={disabled}
                  onChange={(e) => setLp(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void onSubmit();
                    }
                  }}
                  className="w-64"
                />
              </div>
              <div className="flex w-44 flex-col gap-1">
                <span id="pack-box-label" className="text-xs font-medium text-slate-600">
                  {labels.pack.boxLabel}
                </span>
                <Select
                  value={boxNumber}
                  onValueChange={setBoxNumber}
                  aria-labelledby="pack-box-label"
                  disabled={disabled}
                  options={boxOptions}
                />
              </div>
              <Button
                type="button"
                className="btn--primary"
                data-testid="pack-lp-submit"
                disabled={disabled}
                aria-busy={pending}
                title={tooltip}
                onClick={() => void onSubmit()}
              >
                {pending ? labels.pack.submitting : labels.pack.submit}
              </Button>
            </div>

            {error ? (
              <div
                role="alert"
                data-testid="pack-lp-error"
                className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </div>
            ) : null}
            {success ? (
              <div
                role="status"
                data-testid="pack-lp-success"
                className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
              >
                {success}
              </div>
            ) : null}
          </div>

          {/* Boxes */}
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
              <span>
                {labels.boxes.title} · {boxes.length}
              </span>
            </div>
            {boxes.length === 0 ? (
              <div data-testid="shipment-boxes-empty" className="px-4 py-8 text-center text-sm text-slate-500">
                {labels.boxes.empty}
              </div>
            ) : (
              <div className="flex flex-col">
                {boxes.map((box) => (
                  <div
                    key={box.boxNumber}
                    data-testid={`shipment-box-${box.boxNumber}`}
                    className="border-b border-slate-100 p-4 last:border-0"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold text-slate-800">
                        {labels.boxes.boxLabel.replace('{n}', String(box.boxNumber))}
                      </span>
                      <span className="text-xs text-slate-500">
                        {labels.boxes.ssccLabel}:{' '}
                        <span className="font-mono tracking-wide text-blue-700">
                          {box.sscc || labels.boxes.noSscc}
                        </span>
                      </span>
                    </div>
                    {box.sscc ? (
                      <div className="mb-3 max-w-xs" data-testid={`shipment-box-${box.boxNumber}-sscc-barcode`}>
                        <Code128Barcode
                          value={box.sscc}
                          field="sscc"
                          symbology="GS1-128"
                          resolved={resolveSsccBarcode(box.sscc)}
                          barHeight={36}
                        />
                      </div>
                    ) : null}
                    {box.contents.length === 0 ? (
                      <div className="py-2 text-center text-xs text-slate-400">{labels.boxes.contentsEmpty}</div>
                    ) : (
                      <table className="w-full text-sm" data-testid={`shipment-box-${box.boxNumber}-contents`}>
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                            <th className="px-2 py-1.5">{labels.boxes.colLp}</th>
                            <th className="px-2 py-1.5">{labels.boxes.colItem}</th>
                            <th className="px-2 py-1.5 text-right">{labels.boxes.colQty}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {box.contents.map((c, i) => (
                            <tr key={`${box.boxNumber}-${c.lpCode}-${i}`} className="border-b border-slate-50 last:border-0">
                              <td className="px-2 py-1.5 font-mono text-xs font-semibold text-blue-700">{c.lpCode || '—'}</td>
                              <td className="px-2 py-1.5">
                                <div className="font-medium text-slate-800">{c.itemName ?? '—'}</div>
                                <div className="font-mono text-xs text-slate-500">{c.itemCode || '—'}</div>
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{c.qty}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: shipment summary */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-200 p-4" data-testid="shipment-pack-summary">
            <div className="mb-3 text-sm font-semibold text-slate-700">{labels.summary.title}</div>
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{labels.summary.shipment}</dt>
                <dd className="font-mono text-slate-800">{shipment.shipmentNumber || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{labels.summary.salesOrder}</dt>
                <dd className="font-mono text-slate-800">{shipment.salesOrderNumber ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{labels.summary.customer}</dt>
                <dd className="text-slate-800">{shipment.customerName ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{labels.summary.status}</dt>
                <dd>
                  <ShipmentStatusBadge status={shipment.status} label={statusLabel(shipment.status)} />
                </dd>
              </div>
              <div className="mt-1 flex justify-between gap-2 border-t border-slate-200 pt-2">
                <dt className="font-semibold text-slate-700">{labels.summary.boxes}</dt>
                <dd className="font-mono font-semibold text-slate-900" data-testid="shipment-box-count">
                  {boxes.length}
                </dd>
              </div>
            </dl>
            <div className="mt-3 border-t border-slate-200 pt-3">
              <Button
                type="button"
                className="btn--primary w-full"
                data-testid="shipment-seal-submit"
                disabled={sealDisabled}
                aria-busy={sealPending}
                title={sealDisabledReason ?? undefined}
                onClick={() => void onSeal()}
              >
                {sealPending ? labels.seal.submitting : labels.seal.submit}
              </Button>
              {sealError ? (
                <p role="alert" data-testid="shipment-seal-error" className="mt-2 text-sm text-red-600">
                  {sealError}
                </p>
              ) : null}
            </div>
          </div>

          {/* Ship / BOL / POD controls + lifecycle (parity pack-screens.jsx:191-216). */}
          <ShipmentShipControls
            locale={locale}
            shipmentNumber={shipment.shipmentNumber}
            shipmentId={shipment.id}
            status={shipment.status}
            shippedAt={shipment.shippedAt}
            bolPdfUrl={shipment.bolPdfUrl ?? null}
            bolSignedPdfUrl={shipment.bolSignedPdfUrl ?? null}
            deliveredAt={shipment.deliveredAt ?? null}
            carrier={shipment.carrier ?? null}
            serviceLevel={shipment.serviceLevel ?? null}
            trackingNumber={shipment.trackingNumber ?? null}
            boxCount={boxes.length}
            labels={labels.ship}
            caps={{ canShip: caps.canShip, canBol: caps.canBol, canPod: caps.canPod, canCancel: caps.canCancel }}
            shipShipmentAction={shipShipmentAction}
            generateBolAction={generateBolAction}
            recordPodAction={recordPodAction}
            cancelShipmentAction={cancelShipmentAction}
          />
        </div>
      </div>
    </div>
  );
}

'use client';

/**
 * Wave-shipping — Shipment ship/BOL/POD controls + lifecycle rail (client island).
 *
 * Prototype parity: shipping/pack-screens.jsx:191-216 — the right-rail
 * ship-confirm checklist + Generate-BOL + Confirm-shipment action group
 * (V-SHIP-SHIP). The prototype renders a static checklist and bare buttons; here
 * we render the REAL lifecycle (packing → shipped → delivered) driven by the
 * shipment status + the three reviewed Server Actions:
 *   - [Ship shipment]  → shipShipment(shipmentId)         (pack-screens.jsx:214)
 *   - [Generate BOL]    → generateBol(...) via modal       (pack-screens.jsx:213)
 *   - [Record POD]      → recordPod(...) via modal          (spec-driven; nearest
 *                          reusable pattern = the same rail action group)
 *
 * RBAC: every mutation is gated server-side (ship.pack.close for ship/BOL,
 * ship.dashboard.view for POD). `caps` are advisory server probes used ONLY to
 * disable + tooltip the controls, NEVER trusted for authorisation; a forbidden
 * result is surfaced inline (the action returns { ok:false, error:'forbidden' }).
 *
 * DATA-FEED GAP (documented for parity evidence): the reviewed getShipment
 * (pack-actions.ts) returns ONLY the ShipmentRow header — status / shippedAt /
 * packedAt — and does NOT surface bol_pdf_url / bol_signed_pdf_url / delivered_at /
 * carrier / tracking, even though ship-actions.ts writes them. So:
 *   - The [Ship] gate + the lifecycle "shipped" stamp use the REAL status +
 *     shippedAt that getShipment DOES return.
 *   - The BOL/POD links + delivered_at + carrier/tracking are surfaced
 *     OPTIMISTICALLY: after a successful generateBol/recordPod the action returns
 *     the bolRef / ok and we show the just-produced link + a "delivered" lifecycle
 *     state for the rest of the session; on the next server load they will persist
 *     only once getShipment is extended to return those columns. We do NOT modify
 *     pack-actions.ts (owned by the parallel lane) — see the linked gap note.
 *
 * NO raw UUIDs are rendered: only the (mono) shipment NUMBER, the BOL reference,
 * and stamped timestamps are shown.
 */

import React from 'react';

import { ShipmentStatusBadge } from './shipment-status-badge';
import { GenerateBolModal, type GenerateBolLabels } from './generate-bol-modal';
import { RecordPodModal, type RecordPodLabels } from './record-pod-modal';
import type { ShipShipmentResult, GenerateBolResult, RecordPodResult } from './shipment-ship-types';

export type ShipmentLifecycleStage = 'packing' | 'shipped' | 'delivered';

export type ShipmentShipLabels = {
  status: Record<string, string>;
  lifecycle: {
    title: string;
    /** Stage labels keyed by stage. */
    stages: Record<ShipmentLifecycleStage, string>;
    shippedAt: string;
    deliveredAt: string;
    bolLink: string;
    signedBolLink: string;
    notShipped: string;
    notDelivered: string;
  };
  ship: {
    title: string;
    submit: string;
    submitting: string;
    /** Inline note shown once the shipment is shipped this session. */
    shipped: string;
    /** Tooltip when the control is disabled because the user lacks ship.pack.close. */
    noPermission: string;
    /** Tooltip when no boxes are packed yet. */
    needsBox: string;
    /** Tooltip when the shipment is already shipped/delivered. */
    alreadyShipped: string;
    errors: Record<string, string>;
  };
  bol: GenerateBolLabels;
  pod: RecordPodLabels;
};

export type ShipmentShipCaps = {
  /** ship.pack.close — gates [Ship shipment] + [Generate BOL]. */
  canShip: boolean;
  /** ship.dashboard.view — gates [Record POD]. */
  canPod: boolean;
};

export type ShipmentShipControlsProps = {
  locale: string;
  shipmentNumber: string;
  shipmentId: string;
  status: string;
  shippedAt: string | null;
  boxCount: number;
  labels: ShipmentShipLabels;
  caps: ShipmentShipCaps;
  shipShipmentAction: (shipmentId: string) => Promise<ShipShipmentResult>;
  generateBolAction: (input: {
    shipmentId: string;
    carrier?: string;
    serviceLevel?: string;
    trackingNumber?: string;
  }) => Promise<GenerateBolResult>;
  recordPodAction: (input: { shipmentId: string; signedPdfUrl?: string }) => Promise<RecordPodResult>;
};

const SHIPPED_STATES = new Set(['shipped', 'delivered']);
const DELIVERED_STATES = new Set(['delivered']);

const LOCALE_MAP: Record<string, string> = { pl: 'pl-PL', en: 'en-US', uk: 'uk-UA', ro: 'ro-RO' };

export function ShipmentShipControls({
  locale,
  shipmentNumber,
  shipmentId,
  status,
  shippedAt,
  boxCount,
  labels,
  caps,
  shipShipmentAction,
  generateBolAction,
  recordPodAction,
}: ShipmentShipControlsProps) {
  const normalized = status.toLowerCase();

  const formatDateTime = React.useCallback(
    (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return new Intl.DateTimeFormat(LOCALE_MAP[locale] ?? 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(d);
    },
    [locale],
  );

  // Optimistic session state — see the DATA-FEED GAP note in the file header.
  // getShipment does not return shipped_at after ship / the BOL+POD links, so we
  // hold the just-produced values for the session; the badge still reflects the
  // REAL server status until a refresh re-reads it.
  const [shipped, setShipped] = React.useState(SHIPPED_STATES.has(normalized));
  const [shippedStamp, setShippedStamp] = React.useState<string | null>(shippedAt);
  const [delivered, setDelivered] = React.useState(DELIVERED_STATES.has(normalized));
  const [deliveredStamp, setDeliveredStamp] = React.useState<string | null>(null);
  const [bolRef, setBolRef] = React.useState<string | null>(null);
  const [signedBol, setSignedBol] = React.useState<string | null>(null);

  const [shipPending, setShipPending] = React.useState(false);
  const [shipError, setShipError] = React.useState<string | null>(null);

  const packed = boxCount >= 1;
  // [Ship] shows only when the shipment is packed (≥1 box) and not yet shipped.
  const showShip = !shipped;

  const shipDisabledReason = !caps.canShip
    ? labels.ship.noPermission
    : !packed
      ? labels.ship.needsBox
      : null;
  const shipDisabled = shipPending || Boolean(shipDisabledReason);

  async function onShip() {
    if (shipDisabled) return;
    setShipPending(true);
    setShipError(null);
    try {
      const result = await shipShipmentAction(shipmentId);
      if (!result.ok) {
        setShipError(labels.ship.errors[result.error] ?? labels.ship.errors.persistence_failed);
        setShipPending(false);
        return;
      }
      setShipped(true);
      setShippedStamp(new Date().toISOString());
    } catch {
      setShipError(labels.ship.errors.persistence_failed);
    } finally {
      setShipPending(false);
    }
  }

  const lifecycleStage: ShipmentLifecycleStage = delivered ? 'delivered' : shipped ? 'shipped' : 'packing';
  const stageOrder: ShipmentLifecycleStage[] = ['packing', 'shipped', 'delivered'];
  const activeIndex = stageOrder.indexOf(lifecycleStage);

  return (
    <div className="flex flex-col gap-4" data-testid="shipment-ship-controls" data-prototype-label="ship_confirm_rail">
      {/* Lifecycle: packing → shipped → delivered */}
      <div className="rounded-xl border border-slate-200 p-4" data-testid="shipment-lifecycle">
        <div className="mb-3 text-sm font-semibold text-slate-700">{labels.lifecycle.title}</div>
        <ol className="flex flex-col gap-2">
          {stageOrder.map((stage, i) => {
            const reached = i <= activeIndex;
            return (
              <li
                key={stage}
                data-testid={`shipment-stage-${stage}`}
                data-active={i === activeIndex || undefined}
                className="flex items-center gap-2 text-sm"
              >
                <span
                  aria-hidden
                  className={[
                    'inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs',
                    reached ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-slate-400',
                  ].join(' ')}
                >
                  {reached ? '✓' : i + 1}
                </span>
                <span className={reached ? 'font-medium text-slate-800' : 'text-slate-500'}>
                  {labels.lifecycle.stages[stage]}
                </span>
              </li>
            );
          })}
        </ol>

        <dl className="mt-3 grid gap-1.5 border-t border-slate-200 pt-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-500">{labels.lifecycle.shippedAt}</dt>
            <dd className="font-mono text-slate-800" data-testid="shipment-shipped-at">
              {shippedStamp ? formatDateTime(shippedStamp) : labels.lifecycle.notShipped}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-500">{labels.lifecycle.deliveredAt}</dt>
            <dd className="font-mono text-slate-800" data-testid="shipment-delivered-at">
              {deliveredStamp ? formatDateTime(deliveredStamp) : labels.lifecycle.notDelivered}
            </dd>
          </div>
          {bolRef ? (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">{labels.lifecycle.bolLink}</dt>
              <dd className="font-mono text-blue-700" data-testid="shipment-bol-ref">
                {bolRef.slice(0, 12)}
              </dd>
            </div>
          ) : null}
          {signedBol ? (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">{labels.lifecycle.signedBolLink}</dt>
              <dd>
                <a
                  href={signedBol}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="shipment-signed-bol-link"
                  className="text-blue-700 hover:underline"
                >
                  {labels.lifecycle.signedBolLink}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      {/* Ship / BOL / POD action group */}
      <div className="rounded-xl border border-slate-200 p-4" data-testid="shipment-ship-actions">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-700">{labels.ship.title}</span>
          <ShipmentStatusBadge
            status={lifecycleStage}
            label={labels.status[lifecycleStage] ?? labels.status[normalized] ?? status}
          />
        </div>

        <div className="flex flex-col gap-2">
          {showShip ? (
            <button
              type="button"
              data-testid="shipment-ship-submit"
              className="btn btn--primary w-full"
              disabled={shipDisabled}
              aria-busy={shipPending}
              title={shipDisabledReason ?? undefined}
              onClick={() => void onShip()}
            >
              {shipPending ? labels.ship.submitting : labels.ship.submit}
            </button>
          ) : (
            <div
              role="status"
              data-testid="shipment-ship-done"
              className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-sm text-emerald-700"
            >
              {labels.ship.shipped}
            </div>
          )}

          {shipError ? (
            <p role="alert" data-testid="shipment-ship-error" className="text-sm text-red-600">
              {shipError}
            </p>
          ) : null}

          <GenerateBolModal
            shipmentNumber={shipmentNumber}
            shipmentId={shipmentId}
            hasBol={Boolean(bolRef)}
            canBol={caps.canShip}
            labels={labels.bol}
            generateBolAction={async (input) => {
              const result = await generateBolAction(input);
              if (result.ok) setBolRef(result.bolRef);
              return result;
            }}
          />

          <RecordPodModal
            shipmentNumber={shipmentNumber}
            shipmentId={shipmentId}
            canPod={caps.canPod}
            labels={labels.pod}
            recordPodAction={async (input) => {
              const result = await recordPodAction(input);
              if (result.ok) {
                setDelivered(true);
                setDeliveredStamp(new Date().toISOString());
                if (input.signedPdfUrl) setSignedBol(input.signedPdfUrl);
              }
              return result;
            }}
          />
        </div>
      </div>
    </div>
  );
}

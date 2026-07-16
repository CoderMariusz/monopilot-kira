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
 * ship.bol.sign for POD). `caps` are advisory server probes used ONLY to
 * disable + tooltip the controls, NEVER trusted for authorisation; a forbidden
 * result is surfaced inline (the action returns { ok:false, error:'forbidden' }).
 *
 * Data feed: getShipment returns the persisted lifecycle/document fields written
 * by ship-actions.ts (BOL URL, signed-BOL URL, delivered_at, carrier, service
 * level, tracking number, shipped_at). The rail initializes from those loaded
 * values, then supplements them optimistically until router.refresh reloads the
 * server state.
 *
 * NO raw UUIDs are rendered: only the (mono) shipment NUMBER, document labels,
 * lifecycle timestamps, and carrier/tracking display values are shown.
 */

import React from 'react';

import { ShipmentStatusBadge } from './shipment-status-badge';
import { GenerateBolModal, type GenerateBolLabels } from './generate-bol-modal';
import { RecordPodModal, type RecordPodLabels } from './record-pod-modal';
import {
  CancelShipmentModal,
  type CancelShipmentLabels,
  type CancelShipmentInput,
  type CancelShipmentResult,
} from './cancel-shipment-modal';
import type { GenerateBolActionInput, ShipShipmentResult, GenerateBolResult, RecordPodResult } from './shipment-ship-types';

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
    /** Tooltip when boxes exist but the shipment has not been sealed to packed yet. */
    needsSeal: string;
    /** Tooltip when the shipment is already shipped/delivered. */
    alreadyShipped: string;
    /** Tooltip when Generate BOL is disabled because the shipment status is out of its window. */
    bolNotAvailable: string;
    /** Tooltip when Record POD is disabled because the shipment is not in 'shipped'. */
    podNotShipped: string;
    errors: Record<string, string>;
  };
  bol: GenerateBolLabels;
  pod: RecordPodLabels;
  /** Cancel-shipment e-sign reverse (ship.so.cancel). */
  cancel: CancelShipmentLabels;
};

export type ShipmentShipCaps = {
  /** ship.ship.confirm — gates [Ship shipment]. */
  canShip: boolean;
  /** ship.ship.confirm + ship.bol.sign — gates [Generate BOL]. */
  canBol: boolean;
  /** ship.bol.sign — gates [Record POD]. */
  canPod: boolean;
  /** ship.so.cancel — gates [Cancel shipment]. */
  canCancel: boolean;
};

export type ShipmentShipControlsProps = {
  locale: string;
  shipmentNumber: string;
  shipmentId: string;
  status: string;
  shippedAt: string | null;
  bolPdfUrl?: string | null;
  bolSha256?: string | null;
  bolSignedPdfUrl?: string | null;
  deliveredAt?: string | null;
  carrier?: string | null;
  serviceLevel?: string | null;
  trackingNumber?: string | null;
  boxCount: number;
  labels: ShipmentShipLabels;
  caps: ShipmentShipCaps;
  shipShipmentAction: (shipmentId: string) => Promise<ShipShipmentResult>;
  generateBolAction: (input: GenerateBolActionInput) => Promise<GenerateBolResult>;
  recordPodAction: (input: {
    shipmentId: string;
    signedPdfUrl: string;
    reason: string;
    signature: { password: string };
  }) => Promise<RecordPodResult>;
  /** Reviewed cancelShipment seam (imported by the page, never authored here). */
  cancelShipmentAction: (input: CancelShipmentInput) => Promise<CancelShipmentResult>;
  /** Loaded-status gate mirroring cancelShipment's accepted shipment state. */
  canCancelCurrentShipment?: boolean;
};

const SHIPPED_STATES = new Set(['shipped', 'delivered']);
const DELIVERED_STATES = new Set(['delivered']);
/**
 * State-machine gates mirroring the server guards in ship-actions.ts:
 *   - recordPod requires shipment.status === 'shipped' (ship-actions.ts).
 *   - generateBol is part of the ship-confirm window (packed → shipped); it is
 *     inapplicable on a terminal shipment (delivered / cancelled / exception). The
 *     action itself has no status guard, so gating the affordance here is what keeps
 *     the UI honest for terminal shipments (the L2 leak: delivered shipments showed an
 *     enabled Generate-BOL / Record-POD).
 */
const POD_ALLOWED_STATES = new Set(['shipped']);
const BOL_ALLOWED_STATES = new Set(['packed', 'shipped']);

const LOCALE_MAP: Record<string, string> = { pl: 'pl-PL', en: 'en-US', uk: 'uk-UA', ro: 'ro-RO' };
const DOCUMENT_URL_PATTERN = /^https?:\/\//i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function displayText(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed || UUID_PATTERN.test(trimmed)) return null;
  return trimmed;
}

function documentUrl(value?: string | null): string | null {
  const text = displayText(value);
  return text && DOCUMENT_URL_PATTERN.test(text) ? text : null;
}

export function ShipmentShipControls({
  locale,
  shipmentNumber,
  shipmentId,
  status,
  shippedAt,
  bolPdfUrl,
  bolSha256,
  bolSignedPdfUrl,
  deliveredAt,
  carrier,
  serviceLevel,
  trackingNumber,
  boxCount,
  labels,
  caps,
  shipShipmentAction,
  generateBolAction,
  recordPodAction,
  cancelShipmentAction,
  canCancelCurrentShipment,
}: ShipmentShipControlsProps) {
  const normalized = status.toLowerCase();
  const cancelStatusReady = canCancelCurrentShipment ?? normalized === 'shipped';

  const formatDateTime = React.useCallback(
    (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      // timeZone is pinned to UTC so the server-rendered string (server tz = UTC) and
      // the client-rendered string (browser tz) agree byte-for-byte — otherwise the
      // shipped/delivered timestamps mismatch on hydration → React #418. The stamps are
      // ISO instants persisted by ship-actions; UTC is the honest canonical display tz.
      return new Intl.DateTimeFormat(LOCALE_MAP[locale] ?? 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(d);
    },
    [locale],
  );

  // Start from persisted getShipment data and hold just-produced values during
  // the current session until router.refresh re-reads the server state.
  const [shipped, setShipped] = React.useState(SHIPPED_STATES.has(normalized));
  const [shippedStamp, setShippedStamp] = React.useState<string | null>(shippedAt);
  const [delivered, setDelivered] = React.useState(DELIVERED_STATES.has(normalized) || Boolean(deliveredAt));
  const [deliveredStamp, setDeliveredStamp] = React.useState<string | null>(deliveredAt ?? null);
  const [bolDocument, setBolDocument] = React.useState<string | null>(displayText(bolPdfUrl));
  const [bolRef, setBolRef] = React.useState<string | null>(displayText(bolSha256));
  const [signedBol, setSignedBol] = React.useState<string | null>(displayText(bolSignedPdfUrl));
  const [carrierValue, setCarrierValue] = React.useState<string | null>(displayText(carrier));
  const [serviceLevelValue, setServiceLevelValue] = React.useState<string | null>(displayText(serviceLevel));
  const [trackingValue, setTrackingValue] = React.useState<string | null>(displayText(trackingNumber));

  const [shipPending, setShipPending] = React.useState(false);
  const [shipError, setShipError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const persistedBolRef = displayText(bolSha256);
    if (persistedBolRef) {
      setBolRef(persistedBolRef);
    }
  }, [bolSha256]);

  const hasBox = boxCount >= 1;
  // [Ship] remains visible before shipping but is actionable only after packing is sealed.
  const showShip = !shipped;

  // State-machine gates for the BOL / POD affordances (mirror the server guards). These
  // run off the LOADED server status (not the optimistic `shipped`/`delivered` flags) so
  // a terminal shipment never shows an enabled Generate-BOL / Record-POD on first paint.
  const bolStatusReady = BOL_ALLOWED_STATES.has(normalized);
  const podStatusReady = POD_ALLOWED_STATES.has(normalized);

  const shipDisabledReason = !caps.canShip
    ? labels.ship.noPermission
    : !hasBox
      ? labels.ship.needsBox
      : normalized !== 'packed'
        ? labels.ship.needsSeal
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
  const bolHref = documentUrl(bolDocument);
  const signedBolHref = documentUrl(signedBol);
  const persistedBolRef = displayText(bolSha256);
  const bolReference = bolRef ?? persistedBolRef;
  const serviceLevelLabel = serviceLevelValue
    ? labels.bol.serviceLevelOptions[serviceLevelValue] ?? serviceLevelValue
    : null;

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
          {carrierValue ? (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">{labels.bol.carrierLabel}</dt>
              <dd className="font-mono text-slate-800" data-testid="shipment-carrier">
                {carrierValue}
              </dd>
            </div>
          ) : null}
          {serviceLevelLabel ? (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">{labels.bol.serviceLevelLabel}</dt>
              <dd className="font-mono text-slate-800" data-testid="shipment-service-level">
                {serviceLevelLabel}
              </dd>
            </div>
          ) : null}
          {trackingValue ? (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">{labels.bol.trackingLabel}</dt>
              <dd className="font-mono text-slate-800" data-testid="shipment-tracking-number">
                {trackingValue}
              </dd>
            </div>
          ) : null}
          {bolDocument || bolReference ? (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">{labels.lifecycle.bolLink}</dt>
              <dd>
                {bolHref ? (
                  <a
                    href={bolHref}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="shipment-bol-link"
                    className="text-blue-700 hover:underline"
                  >
                    {labels.lifecycle.bolLink}
                  </a>
                ) : bolReference ? (
                  // Persisted ext_data.bol_sha256 or in-session generateBol ref — show truncated hash.
                  <span className="font-mono text-blue-700" data-testid="shipment-bol-ref">
                    {bolReference.slice(0, 12)}
                  </span>
                ) : (
                  // A BOL has been persisted (bol_pdf_url is set) but it is NOT a
                  // browsable URL — getShipment surfaces the serialized BOL payload,
                  // not the SHA reference — and no in-session hash is available after a
                  // reload. Render an honest em-dash, NEVER the label text as its own
                  // value (the "BOL reference: BOL reference" bug).
                  <span className="font-mono text-slate-400" data-testid="shipment-bol-ref">
                    —
                  </span>
                )}
              </dd>
            </div>
          ) : null}
          {signedBolHref ? (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">{labels.lifecycle.signedBolLink}</dt>
              <dd>
                <a
                  href={signedBolHref}
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
            hasBol={Boolean(bolDocument || bolReference)}
            canBol={caps.canBol}
            statusReady={bolStatusReady}
            statusTooltip={labels.ship.bolNotAvailable}
            labels={labels.bol}
            generateBolAction={async (input) => {
              const result = await generateBolAction(input);
              if (result.ok) {
                setBolDocument(null);
                setBolRef(result.bolRef);
                setCarrierValue(displayText(input.carrier));
                setServiceLevelValue(displayText(input.serviceLevel));
                setTrackingValue(displayText(input.trackingNumber));
              }
              return result;
            }}
          />

          <RecordPodModal
            shipmentNumber={shipmentNumber}
            shipmentId={shipmentId}
            canPod={caps.canPod}
            statusReady={podStatusReady}
            statusTooltip={labels.ship.podNotShipped}
            labels={labels.pod}
            recordPodAction={async (input) => {
              const result = await recordPodAction(input);
              if (result.ok) {
                setDelivered(true);
                setDeliveredStamp(new Date().toISOString());
                if (input.signedPdfUrl) setSignedBol(displayText(input.signedPdfUrl));
              }
              return result;
            }}
          />

          {/* Cancel-shipment (e-sign reverse) — shown only when the loaded shipment
              state matches the reviewed cancelShipment guard; the action still
              re-checks status, SO state, RBAC and e-sign server-side. */}
          {cancelStatusReady ? (
            <div className="border-t border-slate-200 pt-2" data-testid="shipment-cancel-region">
              <CancelShipmentModal
                shipmentNumber={shipmentNumber}
                shipmentId={shipmentId}
                canCancel={caps.canCancel}
                labels={labels.cancel}
                cancelShipmentAction={cancelShipmentAction}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

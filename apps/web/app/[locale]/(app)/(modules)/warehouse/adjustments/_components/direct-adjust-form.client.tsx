'use client';

/**
 * WAVE W11 — DIRECT stock-adjustment form (client island).
 *
 * Wires the reviewed applyDirectAdjustment Server Action
 * (warehouse/_actions/direct-adjust-actions.ts — backend lane, imported never
 * authored) into a UI. A direct adjustment corrects on-hand stock outside a
 * count session: an INCREASE mints a new pallet (LP) for found stock; a DECREASE
 * reduces existing on-hand and is a DESTRUCTIVE write, so the backend requires a
 * DISTINCT supervisor (second person) who also holds warehouse.stock.adjust to
 * countersign (direct-adjust-actions.ts:431-511).
 *
 * Nearest reusable prototype (spec-driven; no JSX stock-adjust screen exists):
 * the warehouse M-03 stock-move modal
 *   prototypes/design/Monopilot Design System/warehouse/modals.jsx:396-499
 * — LP/item identity, an "adjustment" move type, quantity, a reason-code dropdown
 * (damage/theft/counting_error/…), reason text on "other", and a delta-pct
 * approval gate. Here the prototype's generic approval gate is realised as the
 * backend's second-person SUPERVISOR countersignature for decreases, and the
 * reason codes are the action's enum (found_stock / spillage_damage /
 * expiry_write_off / data_entry_error / system_sync / other). The e-sign block
 * reuses the in-repo count-session approve-modal idiom (a `{ password }` field).
 *
 * No raw <select> (red line): location / reason / specific-LP are shadcn <Select>;
 * the item + supervisor pickers are search comboboxes (role="combobox"/listbox).
 * RBAC is enforced server-side inside the action; `forbidden` (and every other
 * machine code) surfaces INLINE and is never trusted client-side. clientOpId is a
 * fresh crypto.randomUUID per submit attempt (idempotency); the submit button is
 * disabled while pending to prevent double-submit.
 *
 * Five UI states: loading (supervisor/LP search spinners), empty (no locations /
 * no LPs panels), error (inline per-field + submit error banner), permission-
 * denied (forbidden → inline error copy), optimistic (submit disabled + pending
 * label, success banner with the affected LP).
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Select } from '@monopilot/ui/Select';

import type {
  DirectAdjustInput,
  DirectAdjustReasonCode,
  DirectAdjustResult,
} from '../../_actions/direct-adjust-actions';
import type { LocationOption } from '../../_actions/location-read-actions';
import type {
  DecreaseLpOption,
  EligibleSupervisor,
} from '../_actions/adjust-form-types';
import type { WarehouseResult } from '../../_actions/shared';
import type { ItemPickerOption } from '../../../../../../(npd)/fa/actions/search-items-types';
import { toDirectAdjustErrorCode, type DirectAdjustErrorCode } from './adjust-client-result';

const REASON_CODES: readonly DirectAdjustReasonCode[] = [
  'found_stock',
  'spillage_damage',
  'expiry_write_off',
  'data_entry_error',
  'system_sync',
  'other',
];

type Direction = 'increase' | 'decrease';

export type DirectAdjustFormLabels = {
  intro: string;
  warnUseCount: string;
  location: string;
  locationHelp: string;
  locationPlaceholder: string;
  locationsEmpty: string;
  warehouseResolved: string;
  item: string;
  itemHelp: string;
  itemTrigger: string;
  itemSelected: string;
  itemChange: string;
  itemSearchLabel: string;
  itemSearchPlaceholder: string;
  itemSearchLoading: string;
  itemSearchEmpty: string;
  itemSearchError: string;
  direction: string;
  directionIncrease: string;
  directionDecrease: string;
  directionIncreaseHelp: string;
  directionDecreaseHelp: string;
  quantity: string;
  quantityPlaceholder: string;
  uom: string;
  uomPlaceholder: string;
  reason: string;
  reasonPlaceholder: string;
  reasonCodes: Record<DirectAdjustReasonCode, string>;
  reasonText: string;
  reasonTextHelp: string;
  reasonTextPlaceholder: string;
  batch: string;
  batchHelp: string;
  batchPlaceholder: string;
  expiry: string;
  expiryHelp: string;
  lp: string;
  lpHelp: string;
  lpPlaceholder: string;
  lpAuto: string;
  lpLoading: string;
  lpEmpty: string;
  lpError: string;
  submit: string;
  submitting: string;
  validation: {
    locationRequired: string;
    itemRequired: string;
    quantityRequired: string;
    uomRequired: string;
    reasonRequired: string;
    reasonTextRequired: string;
    passwordRequired: string;
    supervisorRequired: string;
    supervisorPinRequired: string;
  };
  esign: {
    block: string;
    meaning: string;
    password: string;
    passwordPlaceholder: string;
    passwordHelp: string;
  };
  supervisor: {
    block: string;
    meaning: string;
    selectLabel: string;
    selectHelp: string;
    selectTrigger: string;
    searchLabel: string;
    searchPlaceholder: string;
    searchLoading: string;
    searchEmpty: string;
    searchError: string;
    selected: string;
    change: string;
    pinLabel: string;
    pinPlaceholder: string;
    pinHelp: string;
  };
  result: {
    successIncrease: string;
    successDecrease: string;
    affectedLp: string;
    viewLp: string;
    another: string;
  };
  errors: Record<DirectAdjustErrorCode, string>;
};

type ApplyAction = (input: DirectAdjustInput) => Promise<DirectAdjustResult>;
type SearchItemsAction = (input: { query?: string }) => Promise<ItemPickerOption[]>;
type SearchSupervisorsAction = (input: { query?: string }) => Promise<WarehouseResult<EligibleSupervisor[]>>;
type ListLpsAction = (input: { locationId: string; itemId: string }) => Promise<WarehouseResult<DecreaseLpOption[]>>;

/** Fresh idempotency key per submit attempt (the action keys its txn on it). */
function freshClientOpId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `adj-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function DirectAdjustForm({
  locale,
  labels,
  locations,
  applyAction,
  searchItemsAction,
  searchSupervisorsAction,
  listLpsAction,
}: {
  locale: string;
  labels: DirectAdjustFormLabels;
  locations: LocationOption[];
  applyAction: ApplyAction;
  searchItemsAction: SearchItemsAction;
  searchSupervisorsAction: SearchSupervisorsAction;
  listLpsAction: ListLpsAction;
}) {
  const router = useRouter();

  const [locationId, setLocationId] = useState('');
  const [item, setItem] = useState<ItemPickerOption | null>(null);
  const [direction, setDirection] = useState<Direction>('increase');
  const [quantity, setQuantity] = useState('');
  const [uom, setUom] = useState('');
  const [reasonCode, setReasonCode] = useState<DirectAdjustReasonCode | ''>('');
  const [reasonText, setReasonText] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [lpId, setLpId] = useState(''); // '' = FEFO auto (decrease only)
  const [password, setPassword] = useState('');
  const [supervisor, setSupervisor] = useState<EligibleSupervisor | null>(null);
  const [supervisorPin, setSupervisorPin] = useState('');

  const [validationError, setValidationError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<DirectAdjustErrorCode | null>(null);
  const [success, setSuccess] = useState<{ lpId: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedLocation = locations.find((l) => l.id === locationId) ?? null;
  const selectedWarehouseLabel = selectedLocation
    ? (selectedLocation.warehouseCode ?? selectedLocation.warehouseName ?? '—')
    : null;

  // ── Specific-LP picker (decrease only) ───────────────────────────────────────
  const [lps, setLps] = useState<DecreaseLpOption[]>([]);
  const [lpLoad, setLpLoad] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');

  useEffect(() => {
    // Reset the chosen LP whenever the scope (direction/location/item) changes.
    setLpId('');
    if (direction !== 'decrease' || !locationId || !item) {
      setLps([]);
      setLpLoad('idle');
      return;
    }
    let cancelled = false;
    setLpLoad('loading');
    (async () => {
      const res = await listLpsAction({ locationId, itemId: item.id });
      if (cancelled) return;
      if (!res.ok) {
        setLpLoad('error');
        return;
      }
      setLps(res.data);
      setLpLoad(res.data.length === 0 ? 'empty' : 'ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [direction, locationId, item, listLpsAction]);

  function resetForNext() {
    setItem(null);
    setQuantity('');
    setUom('');
    setReasonCode('');
    setReasonText('');
    setBatchNumber('');
    setExpiryDate('');
    setLpId('');
    setPassword('');
    setSupervisor(null);
    setSupervisorPin('');
    setValidationError(null);
    setErrorCode(null);
    setSuccess(null);
  }

  function validate(): string | null {
    if (!selectedLocation) return labels.validation.locationRequired;
    if (!item) return labels.validation.itemRequired;
    const qty = Number(quantity);
    if (quantity.trim() === '' || !Number.isFinite(qty) || qty <= 0) return labels.validation.quantityRequired;
    if (uom.trim() === '') return labels.validation.uomRequired;
    if (reasonCode === '') return labels.validation.reasonRequired;
    if (reasonCode === 'other' && reasonText.trim() === '') return labels.validation.reasonTextRequired;
    if (password.trim() === '') return labels.validation.passwordRequired;
    if (direction === 'decrease') {
      if (!supervisor) return labels.validation.supervisorRequired;
      if (supervisorPin.trim() === '') return labels.validation.supervisorPinRequired;
    }
    return null;
  }

  function submit() {
    setErrorCode(null);
    const invalid = validate();
    if (invalid) {
      setValidationError(invalid);
      return;
    }
    setValidationError(null);
    if (!selectedLocation || !item || reasonCode === '') return; // narrow for TS

    const base: DirectAdjustInput = {
      warehouseId: selectedLocation.warehouseId,
      locationId: selectedLocation.id,
      itemId: item.id,
      direction,
      quantity: quantity.trim(),
      uom: uom.trim(),
      reasonCode,
      reasonText: reasonText.trim() || undefined,
      signature: { password },
      clientOpId: freshClientOpId(),
    };

    let input: DirectAdjustInput;
    if (direction === 'increase') {
      // Increase: mint a new LP with optional batch/expiry. Never an lpId / supervisor.
      input = {
        ...base,
        batchNumber: batchNumber.trim() || undefined,
        expiryDate: expiryDate.trim() || undefined,
      };
    } else {
      // Decrease: optional specific LP + REQUIRED supervisor countersignature.
      input = {
        ...base,
        lpId: lpId.trim() ? lpId.trim() : undefined,
        supervisorUserId: supervisor?.id,
        supervisorPin: supervisorPin.trim(),
      };
    }

    startTransition(async () => {
      const res = await applyAction(input);
      if (res.ok) {
        setSuccess({ lpId: res.data.lpId });
        router.refresh();
        return;
      }
      // forbidden / typed errors surface INLINE — never trusted client-side.
      setErrorCode(toDirectAdjustErrorCode(res.error.code));
    });
  }

  // ── Success banner (inline "toast", warehouse module idiom) ───────────────────
  if (success) {
    return (
      <div
        data-testid="adjust-success"
        data-state="success"
        role="status"
        className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-5 text-sm text-emerald-800"
      >
        <p className="font-medium">
          {direction === 'increase' ? labels.result.successIncrease : labels.result.successDecrease}
        </p>
        <p className="flex items-center gap-2">
          <span className="text-emerald-700">{labels.result.affectedLp}:</span>
          <Link
            href={`/${locale}/warehouse/license-plates/${success.lpId}`}
            data-testid="adjust-success-lp"
            className="font-mono font-semibold text-emerald-900 underline hover:text-emerald-700"
          >
            {labels.result.viewLp}
          </Link>
        </p>
        <div>
          <button
            type="button"
            data-testid="adjust-another"
            onClick={resetForNext}
            className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100"
          >
            {labels.result.another}
          </button>
        </div>
      </div>
    );
  }

  const locationOptions = locations.map((l) => ({
    value: l.id,
    label: l.warehouseCode ? `${l.warehouseCode} · ${l.code} — ${l.name}` : `${l.code} — ${l.name}`,
  }));

  return (
    <div data-testid="adjust-form" className="flex flex-col gap-5 text-sm">
      <p className="text-slate-600">{labels.intro}</p>
      <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
        <span aria-hidden>ⓘ</span>
        <span>{labels.warnUseCount}</span>
      </p>

      {/* Location (shadcn Select). Site + warehouse are DERIVED from it. */}
      <label className="flex flex-col gap-1">
        <span className="font-medium text-slate-700">
          {labels.location} <span aria-hidden className="text-red-500">*</span>
        </span>
        {locations.length === 0 ? (
          <p data-testid="adjust-locations-empty" className="text-slate-500">
            {labels.locationsEmpty}
          </p>
        ) : (
          <div data-testid="adjust-location">
            <Select
              aria-label={labels.location}
              value={locationId}
              onValueChange={setLocationId}
              placeholder={labels.locationPlaceholder}
              options={locationOptions}
            />
          </div>
        )}
        <span className="text-xs text-slate-400">{labels.locationHelp}</span>
        {selectedLocation ? (
          <span data-testid="adjust-warehouse-resolved" className="mt-1 text-xs text-slate-500">
            {labels.warehouseResolved}:{' '}
            <span className="font-mono text-slate-700">
              {selectedWarehouseLabel}
            </span>
            {selectedLocation.warehouseCode && selectedLocation.warehouseName ? ` — ${selectedLocation.warehouseName}` : ''}
          </span>
        ) : null}
      </label>

      {/* Item picker (search combobox — no raw select). */}
      <div className="flex flex-col gap-1" data-testid="adjust-item-picker">
        <span className="font-medium text-slate-700">
          {labels.item} <span aria-hidden className="text-red-500">*</span>
        </span>
        {item ? (
          <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <span data-testid="adjust-item-selected" className="font-mono text-xs font-semibold text-blue-700">
              {item.itemCode}
            </span>
            <span className="text-slate-800">{item.name}</span>
            <span className="ml-auto">
              <button
                type="button"
                data-testid="adjust-item-change"
                onClick={() => setItem(null)}
                className="text-xs font-medium text-sky-700 hover:underline"
              >
                {labels.itemChange}
              </button>
            </span>
          </div>
        ) : (
          <SearchCombobox
            testId="adjust-item"
            triggerLabel={labels.itemTrigger}
            searchLabel={labels.itemSearchLabel}
            searchPlaceholder={labels.itemSearchPlaceholder}
            loadingLabel={labels.itemSearchLoading}
            emptyLabel={labels.itemSearchEmpty}
            errorLabel={labels.itemSearchError}
            onSearch={async (q) => {
              const rows = await searchItemsAction({ query: q });
              return rows.map((r) => ({
                id: r.id,
                primary: r.itemCode,
                secondary: r.name,
                payload: r,
              }));
            }}
            onSelect={(opt) => setItem(opt.payload as ItemPickerOption)}
          />
        )}
        <span className="text-xs text-slate-400">{labels.itemHelp}</span>
      </div>

      {/* Direction toggle (Increase / Decrease). */}
      <fieldset className="flex flex-col gap-1">
        <legend className="font-medium text-slate-700">{labels.direction}</legend>
        <div role="radiogroup" aria-label={labels.direction} className="inline-flex rounded-md border border-slate-300 p-0.5">
          <button
            type="button"
            role="radio"
            aria-checked={direction === 'increase'}
            data-testid="adjust-direction-increase"
            onClick={() => setDirection('increase')}
            className={`rounded px-3 py-1.5 text-sm font-medium transition ${
              direction === 'increase' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {labels.directionIncrease}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={direction === 'decrease'}
            data-testid="adjust-direction-decrease"
            onClick={() => setDirection('decrease')}
            className={`rounded px-3 py-1.5 text-sm font-medium transition ${
              direction === 'decrease' ? 'bg-red-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {labels.directionDecrease}
          </button>
        </div>
        <span className="text-xs text-slate-400">
          {direction === 'increase' ? labels.directionIncreaseHelp : labels.directionDecreaseHelp}
        </span>
      </fieldset>

      {/* Quantity + UoM. */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-700">
            {labels.quantity} <span aria-hidden className="text-red-500">*</span>
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            data-testid="adjust-quantity"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder={labels.quantityPlaceholder}
            className="w-36 rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-700">
            {labels.uom} <span aria-hidden className="text-red-500">*</span>
          </span>
          <input
            type="text"
            data-testid="adjust-uom"
            value={uom}
            onChange={(e) => setUom(e.target.value)}
            placeholder={item?.uomBase ?? labels.uomPlaceholder}
            className="w-28 rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
          />
        </label>
      </div>

      {/* Reason code (shadcn Select). */}
      <label className="flex flex-col gap-1">
        <span className="font-medium text-slate-700">
          {labels.reason} <span aria-hidden className="text-red-500">*</span>
        </span>
        <div data-testid="adjust-reason">
          <Select
            aria-label={labels.reason}
            value={reasonCode}
            onValueChange={(v) => setReasonCode(v as DirectAdjustReasonCode)}
            placeholder={labels.reasonPlaceholder}
            options={REASON_CODES.map((c) => ({ value: c, label: labels.reasonCodes[c] }))}
          />
        </div>
      </label>

      {/* Reason note (required for "other"). */}
      {reasonCode === 'other' ? (
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-700">
            {labels.reasonText} <span aria-hidden className="text-red-500">*</span>
          </span>
          <textarea
            data-testid="adjust-reason-text"
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder={labels.reasonTextPlaceholder}
            rows={2}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
          />
          <span className="text-xs text-slate-400">{labels.reasonTextHelp}</span>
        </label>
      ) : null}

      {/* INCREASE: optional batch + expiry recorded on the new pallet. */}
      {direction === 'increase' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.batch}</span>
            <input
              type="text"
              id="adjust-batch-number"
              name="batch_number"
              data-testid="adjust-batch"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              placeholder={labels.batchPlaceholder}
              autoComplete="batch-number"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.batchHelp}</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.expiry}</span>
            <input
              type="date"
              data-testid="adjust-expiry"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.expiryHelp}</span>
          </label>
        </div>
      ) : null}

      {/* DECREASE: optional specific-LP picker (FEFO auto by default). */}
      {direction === 'decrease' ? (
        <label className="flex flex-col gap-1" data-testid="adjust-lp-picker">
          <span className="font-medium text-slate-700">{labels.lp}</span>
          {lpLoad === 'loading' ? (
            <div data-testid="adjust-lp-loading" aria-busy="true" className="h-10 animate-pulse rounded-md bg-slate-100" />
          ) : lpLoad === 'error' ? (
            <p role="alert" data-testid="adjust-lp-error" className="text-red-600">
              {labels.lpError}
            </p>
          ) : lpLoad === 'empty' ? (
            <p data-testid="adjust-lp-empty" className="text-slate-500">
              {labels.lpEmpty}
            </p>
          ) : (
            <div data-testid="adjust-lp-select">
              <Select
                aria-label={labels.lp}
                value={lpId}
                onValueChange={setLpId}
                placeholder={labels.lpPlaceholder}
                options={[
                  { value: '', label: labels.lpAuto },
                  ...lps.map((lp) => ({
                    value: lp.id,
                    label: `${lp.lpNumber} — ${lp.availableQty} ${lp.uom}${lp.batchNumber ? ` · ${lp.batchNumber}` : ''}`,
                  })),
                ]}
              />
            </div>
          )}
          <span className="text-xs text-slate-400">{labels.lpHelp}</span>
        </label>
      ) : null}

      {/* Initiator e-sign (password). */}
      <div data-testid="adjust-esign" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.esign.block}</div>
        <p className="mt-1 text-[11px] text-slate-500">{labels.esign.meaning}</p>
        <label className="mt-2 flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-700">
            {labels.esign.password} <span aria-hidden className="text-red-600">*</span>
          </span>
          <input
            type="password"
            data-testid="adjust-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={labels.esign.passwordPlaceholder}
            autoComplete="off"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
          />
        </label>
        <p className="mt-1 text-[10px] leading-snug text-slate-400">{labels.esign.passwordHelp}</p>
      </div>

      {/* DECREASE: SUPERVISOR second-person countersignature (distinct user + PIN). */}
      {direction === 'decrease' ? (
        <div
          data-testid="adjust-supervisor-block"
          className="rounded-md border border-red-200 bg-red-50/60 px-3 py-3"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-red-700">{labels.supervisor.block}</div>
          <p className="mt-1 text-[11px] text-red-700/80">{labels.supervisor.meaning}</p>

          {/* Supervisor user picker (distinct from the initiator). */}
          <div className="mt-2 flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-700">
              {labels.supervisor.selectLabel} <span aria-hidden className="text-red-600">*</span>
            </span>
            {supervisor ? (
              <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
                <span data-testid="adjust-supervisor-selected" className="text-slate-800">
                  {supervisor.name ?? supervisor.email}
                </span>
                <span className="text-xs text-slate-500">{supervisor.email}</span>
                <span className="ml-auto">
                  <button
                    type="button"
                    data-testid="adjust-supervisor-change"
                    onClick={() => {
                      setSupervisor(null);
                      setSupervisorPin('');
                    }}
                    className="text-xs font-medium text-sky-700 hover:underline"
                  >
                    {labels.supervisor.change}
                  </button>
                </span>
              </div>
            ) : (
              <SearchCombobox
                testId="adjust-supervisor"
                triggerLabel={labels.supervisor.selectTrigger}
                searchLabel={labels.supervisor.searchLabel}
                searchPlaceholder={labels.supervisor.searchPlaceholder}
                loadingLabel={labels.supervisor.searchLoading}
                emptyLabel={labels.supervisor.searchEmpty}
                errorLabel={labels.supervisor.searchError}
                onSearch={async (q) => {
                  const res = await searchSupervisorsAction({ query: q });
                  if (!res.ok) throw new Error(res.reason);
                  return res.data.map((s) => ({
                    id: s.id,
                    primary: s.name ?? s.email,
                    secondary: s.email,
                    payload: s,
                  }));
                }}
                onSelect={(opt) => setSupervisor(opt.payload as EligibleSupervisor)}
              />
            )}
            <span className="text-xs text-slate-400">{labels.supervisor.selectHelp}</span>
          </div>

          {/* Supervisor's own PIN. */}
          <label className="mt-2 flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-700">
              {labels.supervisor.pinLabel} <span aria-hidden className="text-red-600">*</span>
            </span>
            <input
              type="password"
              data-testid="adjust-supervisor-pin"
              value={supervisorPin}
              onChange={(e) => setSupervisorPin(e.target.value)}
              placeholder={labels.supervisor.pinPlaceholder}
              autoComplete="one-time-code"
              inputMode="numeric"
              className="w-40 rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
            <span className="text-[10px] leading-snug text-slate-400">{labels.supervisor.pinHelp}</span>
          </label>
        </div>
      ) : null}

      {validationError ? (
        <p role="alert" data-testid="adjust-validation-error" className="text-sm text-red-600">
          {validationError}
        </p>
      ) : null}
      {errorCode ? (
        <p role="alert" data-testid="adjust-error" data-state="error" className="text-sm text-red-600">
          {labels.errors[errorCode]}
        </p>
      ) : null}

      <div>
        <button
          type="button"
          data-testid="adjust-submit"
          onClick={submit}
          disabled={pending}
          aria-busy={pending}
          className={`rounded-md px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
            direction === 'decrease' ? 'bg-red-600 enabled:hover:bg-red-700' : 'bg-emerald-600 enabled:hover:bg-emerald-700'
          }`}
        >
          {pending ? labels.submitting : labels.submit}
        </button>
      </div>
    </div>
  );
}

// ── Generic search combobox (item + supervisor) — portaled, no raw <select> ────

type ComboOption = { id: string; primary: string; secondary?: string; payload: unknown };

function SearchCombobox({
  testId,
  triggerLabel,
  searchLabel,
  searchPlaceholder,
  loadingLabel,
  emptyLabel,
  errorLabel,
  onSearch,
  onSelect,
}: {
  testId: string;
  triggerLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
  loadingLabel: string;
  emptyLabel: string;
  errorLabel: string;
  onSearch: (query: string) => Promise<ComboOption[]>;
  onSelect: (option: ComboOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<ComboOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqRef = useRef(0);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const updatePanelPosition = () => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(420, Math.max(320, r.width));
    const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
    setPanelRect({ top: r.bottom + 4, left, width });
  };

  const runSearch = (term: string) => {
    const seq = ++reqRef.current;
    setLoading(true);
    setError(false);
    void (async () => {
      try {
        const result = await onSearch(term);
        if (seq !== reqRef.current) return;
        setOptions(result);
        setActiveIndex(0);
      } catch {
        if (seq !== reqRef.current) return;
        setOptions([]);
        setError(true);
      } finally {
        if (seq === reqRef.current) setLoading(false);
      }
    })();
  };

  useEffect(() => {
    if (!open) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSearch(query), 250);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open, query]);

  useEffect(() => {
    if (open) {
      updatePanelPosition();
      const reposition = () => updatePanelPosition();
      window.addEventListener('scroll', reposition, true);
      window.addEventListener('resize', reposition);
      return () => {
        window.removeEventListener('scroll', reposition, true);
        window.removeEventListener('resize', reposition);
      };
    }
    setQuery('');
    setOptions([]);
    setError(false);
    setPanelRect(null);
    return undefined;
  }, [open]);

  useEffect(() => {
    if (open && panelRect) inputRef.current?.focus();
  }, [open, panelRect]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (!containerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function choose(opt: ComboOption) {
    onSelect(opt);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt) choose(opt);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative inline-block" data-testid={`${testId}-picker-root`}>
      <button
        type="button"
        data-testid={`${testId}-trigger`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        {triggerLabel}
      </button>

      {open && panelRect && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label={searchLabel}
              style={{
                position: 'fixed',
                top: panelRect.top,
                left: panelRect.left,
                width: panelRect.width,
                zIndex: 1000,
                pointerEvents: 'auto',
              }}
              className="rounded-md border border-slate-200 bg-white p-2 shadow-xl"
              data-testid={`${testId}-panel`}
            >
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded={open}
                aria-autocomplete="list"
                aria-label={searchLabel}
                value={query}
                placeholder={searchPlaceholder}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              />
              <ul role="listbox" aria-label={searchLabel} className="mt-1 max-h-56 overflow-auto" data-testid={`${testId}-options`}>
                {loading ? (
                  <li role="status" className="px-2 py-2 text-xs text-slate-500">
                    {loadingLabel}
                  </li>
                ) : error ? (
                  <li role="alert" data-testid={`${testId}-search-error`} className="px-2 py-2 text-xs text-red-600">
                    {errorLabel}
                  </li>
                ) : options.length === 0 ? (
                  <li className="px-2 py-2 text-xs text-slate-500" data-testid={`${testId}-empty`}>
                    {emptyLabel}
                  </li>
                ) : (
                  options.map((opt, idx) => (
                    <li
                      key={opt.id}
                      role="option"
                      aria-selected={idx === activeIndex}
                      data-testid={`${testId}-option`}
                      className={`cursor-pointer rounded px-2 py-1.5 text-sm ${idx === activeIndex ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => choose(opt)}
                    >
                      <span className="font-mono text-xs font-semibold text-blue-700">{opt.primary}</span>
                      {opt.secondary ? <span className="ml-2 text-slate-700">{opt.secondary}</span> : null}
                    </li>
                  ))
                )}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

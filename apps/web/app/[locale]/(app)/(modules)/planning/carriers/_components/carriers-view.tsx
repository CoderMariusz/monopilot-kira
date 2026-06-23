'use client';

/**
 * WAVE E9 — Carriers + transport-lanes client view (mig 316 carriers /
 * transport_lanes).
 *
 * Surface (follows the locked MON-design-system list+dialog conventions reused
 * from /planning/reorder-thresholds and /planning/suppliers):
 *   - carrier list (code / name / mode / active) with an add/edit dialog;
 *   - per-carrier transport-lanes panel (origin → destination, mode, cost basis +
 *     amount + currency, transit days) with its own add/edit dialog.
 *
 * Prototype note: no carriers/freight screen exists in prototypes/design/Monopilot
 * Design System/planning(-ext)/ — presentation follows the module-wide card/table/
 * badge/empty-state + @monopilot/ui Modal/Button/Input/Select pattern. Desktop
 * planning context, so a normal @monopilot/ui Select is used (the raw-<select>
 * red-line is scanner-only; this is not the scanner).
 *
 * All writes go through the write-gated upsert Server Actions (npd.planning.write);
 * reads gate server-side too. UI states: loading, permission-denied (amber note),
 * error (red alert), empty, table; dialog idle/pending/error.
 */
import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';

import type {
  CarrierRow,
  CarrierUpsertInput,
  CostBasis,
  FreightMode,
  FreightResult,
  TransportLaneRow,
  TransportLaneUpsertInput,
} from '../../_actions/freight-actions';

const FREIGHT_MODES: FreightMode[] = ['road', 'sea', 'air', 'rail', 'parcel'];
const COST_BASES: CostBasis[] = ['per_shipment', 'per_kg', 'per_km', 'per_pallet'];
const COST_PATTERN = /^\d+(?:\.\d{1,4})?$/;

export type CarriersLabels = {
  title: string;
  addCarrier: string;
  editCarrier: string;
  loading: string;
  denied: string;
  error: string;
  empty: string;
  emptyHint: string;
  active: string;
  inactive: string;
  manageLanes: string;
  noContact: string;
  modes: Record<FreightMode, string>;
  costBases: Record<CostBasis, string>;
  columns: {
    code: string;
    name: string;
    mode: string;
    contact: string;
    status: string;
    actions: string;
  };
  carrierModal: {
    titleAdd: string;
    titleEdit: string;
    codeLabel: string;
    nameLabel: string;
    modeLabel: string;
    emailLabel: string;
    phoneLabel: string;
    activeLabel: string;
    submit: string;
    submitting: string;
    cancel: string;
    edit: string;
    errors: {
      codeRequired: string;
      nameRequired: string;
      emailInvalid: string;
      invalid_input: string;
      forbidden: string;
      not_found: string;
      already_exists: string;
      persistence_failed: string;
    };
  };
  lanes: {
    title: string;
    addLane: string;
    empty: string;
    days: string;
    columns: {
      route: string;
      mode: string;
      cost: string;
      transit: string;
      status: string;
      actions: string;
    };
    edit: string;
    modal: {
      titleAdd: string;
      titleEdit: string;
      originLabel: string;
      destinationLabel: string;
      modeLabel: string;
      costBasisLabel: string;
      costAmountLabel: string;
      currencyLabel: string;
      transitDaysLabel: string;
      activeLabel: string;
      submit: string;
      submitting: string;
      cancel: string;
      errors: {
        originRequired: string;
        destinationRequired: string;
        costInvalid: string;
        invalid_input: string;
        forbidden: string;
        not_found: string;
        already_exists: string;
        persistence_failed: string;
      };
    };
  };
};

export type CarriersViewProps = {
  labels: CarriersLabels;
  /** Server Action seams (injected from the RSC page). */
  listCarriersAction: () => Promise<CarrierRow[]>;
  upsertCarrierAction: (input: CarrierUpsertInput) => Promise<FreightResult<CarrierRow>>;
  listLanesAction: (carrierId: string) => Promise<TransportLaneRow[]>;
  upsertLaneAction: (input: TransportLaneUpsertInput) => Promise<FreightResult<TransportLaneRow>>;
};

type CarrierModalState = { open: false } | { open: true; editing: CarrierRow | null };

export function CarriersView({
  labels,
  listCarriersAction,
  upsertCarrierAction,
  listLanesAction,
  upsertLaneAction,
}: CarriersViewProps) {
  const [carriers, setCarriers] = React.useState<CarrierRow[] | null>(null);
  const [state, setState] = React.useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [modal, setModal] = React.useState<CarrierModalState>({ open: false });
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setState('loading');
    listCarriersAction()
      .then((rows) => {
        setCarriers(rows);
        setState('ready');
      })
      .catch((err: unknown) => {
        // The list action throws `forbidden` from the server gate; map it.
        if (err instanceof Error && err.message === 'forbidden') setState('forbidden');
        else setState('error');
      });
  }, [listCarriersAction]);

  React.useEffect(() => {
    load();
  }, [load]);

  const modeLabel = (m: FreightMode) => labels.modes[m] ?? m;

  return (
    <div className="flex flex-col gap-6" data-testid="carriers-view">
      <div className="flex items-center justify-end">
        <Button
          type="button"
          className="btn--primary"
          data-testid="carriers-add"
          onClick={() => setModal({ open: true, editing: null })}
        >
          {labels.addCarrier}
        </Button>
      </div>

      {state === 'loading' ? (
        <div className="card px-6 py-4 text-sm text-slate-500" data-testid="carriers-loading">
          {labels.loading}
        </div>
      ) : null}

      {state === 'forbidden' ? (
        <div
          role="note"
          data-testid="carriers-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          {labels.denied}
        </div>
      ) : null}

      {state === 'error' ? (
        <div
          role="alert"
          data-testid="carriers-error"
          className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
        >
          {labels.error}
        </div>
      ) : null}

      {state === 'ready' && carriers !== null && carriers.length === 0 ? (
        <div className="card">
          <div className="empty-state" data-testid="carriers-empty">
            <div className="empty-state-icon" aria-hidden>
              🚚
            </div>
            <div className="empty-state-body">{labels.empty}</div>
            <div className="mt-1 text-xs text-slate-400">{labels.emptyHint}</div>
          </div>
        </div>
      ) : null}

      {state === 'ready' && carriers !== null && carriers.length > 0 ? (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="carriers-table">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">{labels.columns.code}</th>
                  <th className="px-3 py-2">{labels.columns.name}</th>
                  <th className="px-3 py-2">{labels.columns.mode}</th>
                  <th className="px-3 py-2">{labels.columns.contact}</th>
                  <th className="px-3 py-2">{labels.columns.status}</th>
                  <th className="px-3 py-2 text-right">{labels.columns.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {carriers.map((carrier) => (
                  <tr key={carrier.id} data-testid={`carrier-row-${carrier.code}`}>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-800">{carrier.code}</td>
                    <td className="px-3 py-2 text-slate-800">{carrier.name}</td>
                    <td className="px-3 py-2">
                      <span className="badge badge-gray">{modeLabel(carrier.mode)}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {carrier.contactEmail || carrier.contactPhone ? (
                        <span>
                          {carrier.contactEmail ?? ''}
                          {carrier.contactEmail && carrier.contactPhone ? ' · ' : ''}
                          {carrier.contactPhone ?? ''}
                        </span>
                      ) : (
                        <span className="text-slate-400">{labels.noContact}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {carrier.isActive ? (
                        <span className="badge badge-green">{labels.active}</span>
                      ) : (
                        <span className="badge badge-gray">{labels.inactive}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="btn btn--secondary btn-sm"
                          data-testid={`carrier-edit-${carrier.code}`}
                          onClick={() => setModal({ open: true, editing: carrier })}
                        >
                          {labels.carrierModal.edit}
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn-sm"
                          data-testid={`carrier-lanes-${carrier.code}`}
                          aria-pressed={selectedId === carrier.id}
                          onClick={() => setSelectedId(selectedId === carrier.id ? null : carrier.id)}
                        >
                          {labels.manageLanes}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Per-carrier transport lanes panel. */}
      {state === 'ready' && selectedId && carriers ? (
        <LanesPanel
          key={selectedId}
          labels={labels}
          carrier={carriers.find((c) => c.id === selectedId)!}
          listLanesAction={listLanesAction}
          upsertLaneAction={upsertLaneAction}
        />
      ) : null}

      {modal.open ? (
        <CarrierModal
          labels={labels}
          editing={modal.editing}
          upsertAction={upsertCarrierAction}
          onClose={() => setModal({ open: false })}
          onSaved={() => {
            setModal({ open: false });
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function CarrierModal({
  labels,
  editing,
  upsertAction,
  onClose,
  onSaved,
}: {
  labels: CarriersLabels;
  editing: CarrierRow | null;
  upsertAction: (input: CarrierUpsertInput) => Promise<FreightResult<CarrierRow>>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const m = labels.carrierModal;
  const [code, setCode] = React.useState(editing?.code ?? '');
  const [name, setName] = React.useState(editing?.name ?? '');
  const [mode, setMode] = React.useState<FreightMode>(editing?.mode ?? 'road');
  const [email, setEmail] = React.useState(editing?.contactEmail ?? '');
  const [phone, setPhone] = React.useState(editing?.contactPhone ?? '');
  const [isActive, setIsActive] = React.useState(editing?.isActive ?? true);
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!code.trim()) return setFormError(m.errors.codeRequired);
    if (!name.trim()) return setFormError(m.errors.nameRequired);
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setFormError(m.errors.emailInvalid);
    }

    setPending(true);
    try {
      const result = await upsertAction({
        id: editing?.id,
        code: code.trim(),
        name: name.trim(),
        mode,
        contactEmail: email.trim() || undefined,
        contactPhone: phone.trim() || undefined,
        isActive,
      });
      if (!result.ok) {
        const map = m.errors as Record<string, string>;
        setFormError(map[result.error] ?? m.errors.persistence_failed);
        setPending(false);
        return;
      }
      onSaved();
    } catch {
      setFormError(m.errors.persistence_failed);
      setPending(false);
    }
  }

  return (
    <Modal open onOpenChange={(open) => (!open ? onClose() : undefined)} size="md" modalId="plan_carrier_upsert">
      <Modal.Header title={editing ? m.titleEdit : m.titleAdd} />
      <Modal.Body>
        <form id="carrier-form" onSubmit={onSubmit} data-testid="carrier-form" className="flex flex-col gap-4">
          {formError ? (
            <div
              role="alert"
              data-testid="carrier-form-error"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {formError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{m.codeLabel}</span>
              <Input type="text" value={code} data-testid="carrier-code" onChange={(e) => setCode(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{m.nameLabel}</span>
              <Input type="text" value={name} data-testid="carrier-name" onChange={(e) => setName(e.target.value)} />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{m.modeLabel}</span>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as FreightMode)}
              aria-label={m.modeLabel}
              options={FREIGHT_MODES.map((md) => ({ value: md, label: labels.modes[md] }))}
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{m.emailLabel}</span>
              <Input type="email" value={email} data-testid="carrier-email" onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{m.phoneLabel}</span>
              <Input type="text" value={phone} data-testid="carrier-phone" onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={isActive}
              data-testid="carrier-active"
              onChange={(e) => setIsActive(e.target.checked)}
            />
            {m.activeLabel}
          </label>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="carrier-cancel" onClick={onClose}>
          {m.cancel}
        </Button>
        <Button
          type="submit"
          form="carrier-form"
          className="btn--primary"
          data-testid="carrier-submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? m.submitting : m.submit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

type LaneModalState = { open: false } | { open: true; editing: TransportLaneRow | null };

function LanesPanel({
  labels,
  carrier,
  listLanesAction,
  upsertLaneAction,
}: {
  labels: CarriersLabels;
  carrier: CarrierRow;
  listLanesAction: (carrierId: string) => Promise<TransportLaneRow[]>;
  upsertLaneAction: (input: TransportLaneUpsertInput) => Promise<FreightResult<TransportLaneRow>>;
}) {
  const [lanes, setLanes] = React.useState<TransportLaneRow[] | null>(null);
  const [state, setState] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const [modal, setModal] = React.useState<LaneModalState>({ open: false });

  const load = React.useCallback(() => {
    setState('loading');
    listLanesAction(carrier.id)
      .then((rows) => {
        setLanes(rows);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [listLanesAction, carrier.id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const modeLabel = (md: FreightMode) => labels.modes[md] ?? md;
  const costBasisLabel = (cb: CostBasis) => labels.costBases[cb] ?? cb;

  return (
    <div className="card" data-testid={`lanes-panel-${carrier.code}`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">
          {labels.lanes.title} · <span className="font-mono">{carrier.code}</span> {carrier.name}
        </h3>
        <Button
          type="button"
          className="btn--primary btn-sm"
          data-testid="lanes-add"
          onClick={() => setModal({ open: true, editing: null })}
        >
          {labels.lanes.addLane}
        </Button>
      </div>

      {state === 'loading' ? (
        <div className="px-4 py-3 text-sm text-slate-500" data-testid="lanes-loading">
          {labels.loading}
        </div>
      ) : null}

      {state === 'error' ? (
        <div role="alert" data-testid="lanes-error" className="m-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {labels.error}
        </div>
      ) : null}

      {state === 'ready' && lanes !== null && lanes.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-slate-400" data-testid="lanes-empty">
          {labels.lanes.empty}
        </div>
      ) : null}

      {state === 'ready' && lanes !== null && lanes.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="lanes-table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">{labels.lanes.columns.route}</th>
                <th className="px-3 py-2">{labels.lanes.columns.mode}</th>
                <th className="px-3 py-2 text-right">{labels.lanes.columns.cost}</th>
                <th className="px-3 py-2 text-right">{labels.lanes.columns.transit}</th>
                <th className="px-3 py-2">{labels.lanes.columns.status}</th>
                <th className="px-3 py-2 text-right">{labels.lanes.columns.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lanes.map((lane) => (
                <tr key={lane.id} data-testid={`lane-row-${lane.id}`}>
                  <td className="px-3 py-2">
                    <span className="text-slate-800">{lane.origin}</span>
                    <span className="px-1 text-slate-400">→</span>
                    <span className="text-slate-800">{lane.destination}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="badge badge-gray">{modeLabel(lane.mode)}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {lane.costAmount} {lane.currency}
                    <span className="ml-1 text-xs text-slate-400">/ {costBasisLabel(lane.costBasis)}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {lane.transitDays !== null ? (
                      <span className="font-mono">
                        {lane.transitDays} {labels.lanes.days}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {lane.isActive ? (
                      <span className="badge badge-green">{labels.active}</span>
                    ) : (
                      <span className="badge badge-gray">{labels.inactive}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="btn btn--secondary btn-sm"
                      data-testid={`lane-edit-${lane.id}`}
                      onClick={() => setModal({ open: true, editing: lane })}
                    >
                      {labels.lanes.edit}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {modal.open ? (
        <LaneModal
          labels={labels}
          carrierId={carrier.id}
          editing={modal.editing}
          upsertAction={upsertLaneAction}
          onClose={() => setModal({ open: false })}
          onSaved={() => {
            setModal({ open: false });
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function LaneModal({
  labels,
  carrierId,
  editing,
  upsertAction,
  onClose,
  onSaved,
}: {
  labels: CarriersLabels;
  carrierId: string;
  editing: TransportLaneRow | null;
  upsertAction: (input: TransportLaneUpsertInput) => Promise<FreightResult<TransportLaneRow>>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const m = labels.lanes.modal;
  const [origin, setOrigin] = React.useState(editing?.origin ?? '');
  const [destination, setDestination] = React.useState(editing?.destination ?? '');
  const [mode, setMode] = React.useState<FreightMode>(editing?.mode ?? 'road');
  const [costBasis, setCostBasis] = React.useState<CostBasis>(editing?.costBasis ?? 'per_shipment');
  const [costAmount, setCostAmount] = React.useState(editing?.costAmount ?? '');
  const [currency, setCurrency] = React.useState(editing?.currency ?? 'EUR');
  const [transitDays, setTransitDays] = React.useState(
    editing?.transitDays !== null && editing?.transitDays !== undefined ? String(editing.transitDays) : '',
  );
  const [isActive, setIsActive] = React.useState(editing?.isActive ?? true);
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!origin.trim()) return setFormError(m.errors.originRequired);
    if (!destination.trim()) return setFormError(m.errors.destinationRequired);
    if (!COST_PATTERN.test(costAmount.trim())) return setFormError(m.errors.costInvalid);

    const transit = transitDays.trim();
    const transitNum = transit === '' ? undefined : Number(transit);
    if (transitNum !== undefined && (!Number.isInteger(transitNum) || transitNum < 0)) {
      return setFormError(m.errors.invalid_input);
    }

    setPending(true);
    try {
      const result = await upsertAction({
        id: editing?.id,
        carrierId,
        origin: origin.trim(),
        destination: destination.trim(),
        mode,
        costBasis,
        costAmount: costAmount.trim(),
        currency: currency.trim().toUpperCase(),
        transitDays: transitNum,
        isActive,
      });
      if (!result.ok) {
        const map = m.errors as Record<string, string>;
        setFormError(map[result.error] ?? m.errors.persistence_failed);
        setPending(false);
        return;
      }
      onSaved();
    } catch {
      setFormError(m.errors.persistence_failed);
      setPending(false);
    }
  }

  return (
    <Modal open onOpenChange={(open) => (!open ? onClose() : undefined)} size="md" modalId="plan_lane_upsert">
      <Modal.Header title={editing ? m.titleEdit : m.titleAdd} />
      <Modal.Body>
        <form id="lane-form" onSubmit={onSubmit} data-testid="lane-form" className="flex flex-col gap-4">
          {formError ? (
            <div
              role="alert"
              data-testid="lane-form-error"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {formError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{m.originLabel}</span>
              <Input type="text" value={origin} data-testid="lane-origin" onChange={(e) => setOrigin(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{m.destinationLabel}</span>
              <Input
                type="text"
                value={destination}
                data-testid="lane-destination"
                onChange={(e) => setDestination(e.target.value)}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{m.modeLabel}</span>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as FreightMode)}
              aria-label={m.modeLabel}
              options={FREIGHT_MODES.map((md) => ({ value: md, label: labels.modes[md] }))}
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{m.costBasisLabel}</span>
              <Select
                value={costBasis}
                onValueChange={(v) => setCostBasis(v as CostBasis)}
                aria-label={m.costBasisLabel}
                options={COST_BASES.map((cb) => ({ value: cb, label: labels.costBases[cb] }))}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{m.costAmountLabel}</span>
              <Input
                type="text"
                inputMode="decimal"
                value={costAmount}
                data-testid="lane-cost-amount"
                onChange={(e) => setCostAmount(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{m.currencyLabel}</span>
              <Input
                type="text"
                value={currency}
                maxLength={3}
                data-testid="lane-currency"
                onChange={(e) => setCurrency(e.target.value)}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{m.transitDaysLabel}</span>
            <Input
              type="text"
              inputMode="numeric"
              value={transitDays}
              data-testid="lane-transit-days"
              onChange={(e) => setTransitDays(e.target.value)}
            />
          </label>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={isActive}
              data-testid="lane-active"
              onChange={(e) => setIsActive(e.target.checked)}
            />
            {m.activeLabel}
          </label>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="lane-cancel" onClick={onClose}>
          {m.cancel}
        </Button>
        <Button
          type="submit"
          form="lane-form"
          className="btn--primary"
          data-testid="lane-submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? m.submitting : m.submit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

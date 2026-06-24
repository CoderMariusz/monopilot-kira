'use client';

/**
 * WAVE E5 — Yard board client view (mig 317 yard tables).
 *
 * Surface (follows the locked MON-design-system list+dialog conventions reused
 * from /planning/carriers and /settings/infra/lines):
 *   - today's dock appointments grouped by dock door (time-ordered) with status
 *     chips;
 *   - a panel of vehicles currently on site with "Gate out" + "Weigh" actions;
 *   - a "Gate in" control (manual, or against a selected appointment).
 *
 * Prototype note: no yard/dock screen exists under prototypes/design/Monopilot
 * Design System/ — presentation follows the module-wide card/table/badge/empty-
 * state + @monopilot/ui Modal/Button/Input/Select pattern (prototype_match=false,
 * spec-driven; nearest pattern = planning/carriers). Desktop context, so the
 * @monopilot/ui Select is used (the raw-<select> red-line is scanner-only).
 *
 * Contract note: the yard Server Actions THROW on failure (forbidden /
 * validation / overlap) and return the bare row on success — we try/catch and
 * map Error.message via classifyYardError, never surfacing a raw message.
 *
 * UI states: loading, permission-denied (amber note), error (red alert), empty,
 * board; the gate-in / gate-out / weigh actions show pending + disabled.
 */
import React from 'react';
import { useTranslations } from 'next-intl';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';

import {
  classifyYardError,
  computeNet,
  type AppointmentRow,
  type AppointmentStatus,
  type CarrierOption,
  type GateInInput,
  type RecordWeighingInput,
  type AppointmentDirection,
  type WeighingRow,
  type YardVisitRow,
} from './yard-shared';
import { buildYardBoardLabels } from './yard-labels';

export type YardBoardLabels = {
  appointmentsTitle: string;
  appointmentsEmpty: string;
  onSiteTitle: string;
  onSiteEmpty: string;
  gateInTitle: string;
  gateIn: string;
  gateInPending: string;
  gateOut: string;
  gateOutPending: string;
  weigh: string;
  manual: string;
  againstAppointment: string;
  noAppointment: string;
  vehicleReg: string;
  trailerRef: string;
  driverName: string;
  carrier: string;
  noCarrier: string;
  reference: string;
  time: string;
  dockDoor: string;
  status: string;
  minutes: (count: number) => string;
  vehicleRegRequired: string;
  gateInFailed: string;
  gateOutFailed: string;
  loading: string;
  denied: string;
  error: string;
  cancel: string;
  directionLabel: (d: AppointmentDirection) => string;
  statusLabel: (s: AppointmentStatus) => string;
  // Weigh modal labels.
  weighFormTitle: string;
  grossLabel: string;
  tareLabel: string;
  netLabel: string;
  weighSubmit: string;
  weighSubmitting: string;
  weighErrors: {
    grossInvalid: string;
    tareInvalid: string;
    netNegative: string;
    invalid_input: string;
    forbidden: string;
    not_found: string;
    overlap: string;
    persistence_failed: string;
  };
};

export type YardBoardProps = {
  /** Server Action seams (injected from the RSC page). Each THROWS on failure. */
  listAppointmentsTodayAction: () => Promise<AppointmentRow[]>;
  listYardVisitsAction: () => Promise<YardVisitRow[]>;
  gateInAction: (input: GateInInput) => Promise<YardVisitRow>;
  gateOutAction: (yardVisitId: string) => Promise<YardVisitRow>;
  recordWeighingAction: (input: RecordWeighingInput) => Promise<WeighingRow>;
  carriers: CarrierOption[];
};

type BoardState = 'loading' | 'ready' | 'forbidden' | 'error';

function statusVariant(status: AppointmentStatus): string {
  switch (status) {
    case 'completed':
      return 'badge-green';
    case 'arrived':
      return 'badge-blue';
    case 'cancelled':
    case 'no_show':
      return 'badge-red';
    default:
      return 'badge-gray';
  }
}

function groupByDock(appointments: AppointmentRow[]): Array<{ code: string; rows: AppointmentRow[] }> {
  const byDock = new Map<string, AppointmentRow[]>();
  for (const a of appointments) {
    const code = a.dockDoorCode ?? '—';
    const list = byDock.get(code) ?? [];
    list.push(a);
    byDock.set(code, list);
  }
  return Array.from(byDock.entries())
    .map(([code, rows]) => ({
      code,
      rows: [...rows].sort((l, r) => l.scheduledAt.localeCompare(r.scheduledAt)),
    }))
    .sort((l, r) => l.code.localeCompare(r.code));
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function YardBoard({
  listAppointmentsTodayAction,
  listYardVisitsAction,
  gateInAction,
  gateOutAction,
  recordWeighingAction,
  carriers,
}: YardBoardProps) {
  // Labels built client-side from the `Yard` next-intl namespace: they contain
  // function-valued members (minutes/directionLabel/statusLabel) which the RSC
  // boundary cannot serialise, so they must NOT be passed as a prop.
  const t = useTranslations('Yard');
  const labels = React.useMemo(() => buildYardBoardLabels(t), [t]);
  const [appointments, setAppointments] = React.useState<AppointmentRow[] | null>(null);
  const [visits, setVisits] = React.useState<YardVisitRow[] | null>(null);
  const [state, setState] = React.useState<BoardState>('loading');
  const [gateInOpen, setGateInOpen] = React.useState(false);
  const [weighFor, setWeighFor] = React.useState<YardVisitRow | null>(null);
  const [gatingOutId, setGatingOutId] = React.useState<string | null>(null);
  const [gateOutError, setGateOutError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setState('loading');
    Promise.all([listAppointmentsTodayAction(), listYardVisitsAction()])
      .then(([appts, vs]) => {
        setAppointments(appts);
        setVisits(vs);
        setState('ready');
      })
      .catch((err: unknown) => {
        setState(classifyYardError(err) === 'forbidden' ? 'forbidden' : 'error');
      });
  }, [listAppointmentsTodayAction, listYardVisitsAction]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function onGateOut(visitId: string) {
    setGateOutError(null);
    setGatingOutId(visitId);
    try {
      await gateOutAction(visitId);
      load();
    } catch {
      setGateOutError(labels.gateOutFailed);
    } finally {
      setGatingOutId(null);
    }
  }

  const docks = appointments ? groupByDock(appointments) : [];
  const onSite = (visits ?? []).filter((v) => v.status === 'on_site');

  return (
    <div className="flex flex-col gap-6" data-testid="yard-board">
      {state === 'loading' ? (
        <div className="card px-6 py-4 text-sm text-slate-500" data-testid="yard-board-loading">
          {labels.loading}
        </div>
      ) : null}

      {state === 'forbidden' ? (
        <div
          role="note"
          data-testid="yard-board-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          {labels.denied}
        </div>
      ) : null}

      {state === 'error' ? (
        <div
          role="alert"
          data-testid="yard-board-error"
          className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
        >
          {labels.error}
        </div>
      ) : null}

      {state === 'ready' ? (
        <>
          <div className="flex items-center justify-end">
            <Button
              type="button"
              className="btn--primary"
              data-testid="yard-gate-in"
              onClick={() => setGateInOpen(true)}
            >
              {labels.gateIn}
            </Button>
          </div>

          {/* Today's appointments grouped by dock door. */}
          <section className="card" aria-labelledby="yard-appointments-heading" data-testid="yard-appointments">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 id="yard-appointments-heading" className="text-sm font-semibold text-slate-800">
                {labels.appointmentsTitle}
              </h2>
            </div>
            {docks.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-400" data-testid="yard-appointments-empty">
                {labels.appointmentsEmpty}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {docks.map((dock) => (
                  <div key={dock.code} className="px-4 py-3" data-testid={`yard-dock-${dock.code}`}>
                    <div className="mb-2 font-mono text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {labels.dockDoor}: {dock.code}
                    </div>
                    <ul className="flex flex-col gap-2">
                      {dock.rows.map((a) => (
                        <li
                          key={a.id}
                          data-testid={`yard-appointment-${a.id}`}
                          className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                        >
                          <span className="font-mono text-slate-800">{formatTime(a.scheduledAt)}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-700">{labels.directionLabel(a.direction)}</span>
                          <span className="text-slate-700">{a.carrierName ?? labels.noCarrier}</span>
                          {a.reference ? <span className="text-xs text-slate-500">{a.reference}</span> : null}
                          <span className="text-xs text-slate-500">{labels.minutes(a.durationMin)}</span>
                          <span
                            className={`badge ${statusVariant(a.status)} ml-auto`}
                            data-testid={`yard-appointment-status-${a.id}`}
                          >
                            {labels.statusLabel(a.status)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Vehicles currently on site. */}
          <section className="card" aria-labelledby="yard-onsite-heading" data-testid="yard-onsite">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 id="yard-onsite-heading" className="text-sm font-semibold text-slate-800">
                {labels.onSiteTitle}
              </h2>
            </div>
            {gateOutError ? (
              <div role="alert" data-testid="yard-gate-out-error" className="m-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {gateOutError}
              </div>
            ) : null}
            {onSite.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-400" data-testid="yard-onsite-empty">
                {labels.onSiteEmpty}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="yard-onsite-table">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th scope="col" className="px-3 py-2">{labels.vehicleReg}</th>
                      <th scope="col" className="px-3 py-2">{labels.carrier}</th>
                      <th scope="col" className="px-3 py-2">{labels.trailerRef}</th>
                      <th scope="col" className="px-3 py-2">{labels.driverName}</th>
                      <th scope="col" className="px-3 py-2 text-right">{labels.status}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {onSite.map((v) => (
                      <tr key={v.id} data-testid={`yard-visit-${v.id}`}>
                        <td className="px-3 py-2 font-mono font-semibold text-slate-800">{v.vehicleReg}</td>
                        <td className="px-3 py-2 text-slate-700">{v.carrierName ?? labels.noCarrier}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{v.trailerRef ?? '—'}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{v.driverName ?? '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="btn btn--secondary btn-sm"
                              data-testid={`yard-weigh-${v.id}`}
                              onClick={() => setWeighFor(v)}
                            >
                              {labels.weigh}
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost btn-sm"
                              data-testid={`yard-gate-out-${v.id}`}
                              disabled={gatingOutId === v.id}
                              aria-busy={gatingOutId === v.id}
                              onClick={() => void onGateOut(v.id)}
                            >
                              {gatingOutId === v.id ? labels.gateOutPending : labels.gateOut}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {gateInOpen ? (
        <GateInModal
          labels={labels}
          appointments={appointments ?? []}
          carriers={carriers}
          gateInAction={gateInAction}
          onClose={() => setGateInOpen(false)}
          onSaved={() => {
            setGateInOpen(false);
            load();
          }}
        />
      ) : null}

      {weighFor ? (
        <WeighModal
          labels={labels}
          visit={weighFor}
          recordWeighingAction={recordWeighingAction}
          onClose={() => setWeighFor(null)}
          onSaved={() => {
            setWeighFor(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function GateInModal({
  labels,
  appointments,
  carriers,
  gateInAction,
  onClose,
  onSaved,
}: {
  labels: YardBoardLabels;
  appointments: AppointmentRow[];
  carriers: CarrierOption[];
  gateInAction: (input: GateInInput) => Promise<YardVisitRow>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [appointmentId, setAppointmentId] = React.useState('none');
  const [carrierId, setCarrierId] = React.useState('none');
  const [vehicleReg, setVehicleReg] = React.useState('');
  const [trailerRef, setTrailerRef] = React.useState('');
  const [driverName, setDriverName] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const appointmentOptions = [
    { value: 'none', label: labels.noAppointment },
    ...appointments.map((a) => ({
      value: a.id,
      label: `${formatTime(a.scheduledAt)} · ${a.dockDoorCode ?? '—'} · ${a.carrierName ?? labels.noCarrier}`,
    })),
  ];
  const carrierOptions = [
    { value: 'none', label: labels.noCarrier },
    ...carriers.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
  ];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!vehicleReg.trim()) return setFormError(labels.vehicleRegRequired);

    setPending(true);
    try {
      await gateInAction({
        appointmentId: appointmentId === 'none' ? undefined : appointmentId,
        carrierId: carrierId === 'none' ? undefined : carrierId,
        vehicleReg: vehicleReg.trim(),
        trailerRef: trailerRef.trim() || undefined,
        driverName: driverName.trim() || undefined,
      });
      onSaved();
    } catch {
      setFormError(labels.gateInFailed);
      setPending(false);
    }
  }

  return (
    <Modal open onOpenChange={(open) => (!open ? onClose() : undefined)} size="md" modalId="yard_gate_in">
      <Modal.Header title={labels.gateInTitle} />
      <Modal.Body>
        <form id="yard-gate-in-form" onSubmit={onSubmit} data-testid="yard-gate-in-form" className="flex flex-col gap-4">
          {formError ? (
            <div role="alert" data-testid="yard-gate-in-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          ) : null}

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.againstAppointment}</span>
            <Select
              value={appointmentId}
              onValueChange={setAppointmentId}
              aria-label={labels.againstAppointment}
              options={appointmentOptions}
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.vehicleReg}</span>
              <Input type="text" value={vehicleReg} data-testid="yard-vehicle-reg" onChange={(e) => setVehicleReg(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.carrier}</span>
              <Select
                value={carrierId}
                onValueChange={setCarrierId}
                aria-label={labels.carrier}
                options={carrierOptions}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.trailerRef}</span>
              <Input type="text" value={trailerRef} data-testid="yard-trailer-ref" onChange={(e) => setTrailerRef(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.driverName}</span>
              <Input type="text" value={driverName} data-testid="yard-driver-name" onChange={(e) => setDriverName(e.target.value)} />
            </label>
          </div>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="yard-gate-in-cancel" onClick={onClose}>
          {labels.cancel}
        </Button>
        <Button
          type="submit"
          form="yard-gate-in-form"
          className="btn--primary"
          data-testid="yard-gate-in-submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? labels.gateInPending : labels.gateIn}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function WeighModal({
  labels,
  visit,
  recordWeighingAction,
  onClose,
  onSaved,
}: {
  labels: YardBoardLabels;
  visit: YardVisitRow;
  recordWeighingAction: (input: RecordWeighingInput) => Promise<WeighingRow>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [grossKg, setGrossKg] = React.useState('');
  const [tareKg, setTareKg] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const net = computeNet(grossKg, tareKg);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const gross = Number(grossKg);
    const tare = Number(tareKg);
    if (!grossKg.trim() || !Number.isFinite(gross) || gross < 0) return setFormError(labels.weighErrors.grossInvalid);
    if (!tareKg.trim() || !Number.isFinite(tare) || tare < 0) return setFormError(labels.weighErrors.tareInvalid);
    if (tare > gross) return setFormError(labels.weighErrors.netNegative);

    setPending(true);
    try {
      await recordWeighingAction({ yardVisitId: visit.id, grossKg: gross, tareKg: tare });
      onSaved();
    } catch (err) {
      const kind = classifyYardError(err);
      const map = labels.weighErrors as Record<string, string>;
      setFormError(map[kind] ?? labels.weighErrors.persistence_failed);
      setPending(false);
    }
  }

  return (
    <Modal open onOpenChange={(open) => (!open ? onClose() : undefined)} size="sm" modalId="yard_weigh">
      <Modal.Header title={`${labels.weighFormTitle} · ${visit.vehicleReg}`} />
      <Modal.Body>
        <form id="yard-weigh-form" onSubmit={onSubmit} data-testid="yard-weigh-form" className="flex flex-col gap-4">
          {formError ? (
            <div role="alert" data-testid="yard-weigh-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          ) : null}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.grossLabel}</span>
            <Input type="text" inputMode="decimal" value={grossKg} data-testid="yard-weigh-gross" onChange={(e) => setGrossKg(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.tareLabel}</span>
            <Input type="text" inputMode="decimal" value={tareKg} data-testid="yard-weigh-tare" onChange={(e) => setTareKg(e.target.value)} />
          </label>
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="font-medium text-slate-700">{labels.netLabel}</span>
            <span className="font-mono font-semibold text-slate-900" data-testid="yard-weigh-net">{net ?? '—'}</span>
          </div>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="yard-weigh-cancel" onClick={onClose}>
          {labels.cancel}
        </Button>
        <Button
          type="submit"
          form="yard-weigh-form"
          className="btn--primary"
          data-testid="yard-weigh-submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? labels.weighSubmitting : labels.weighSubmit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

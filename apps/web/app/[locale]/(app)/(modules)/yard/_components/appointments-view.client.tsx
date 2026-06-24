'use client';

/**
 * WAVE E5 — Dock appointments calendar/list client view (mig 317).
 *
 * A simple day/week appointment list with a "Book appointment" dialog (dock door
 * + carrier + direction + datetime + duration + reference). Overlap rejection is
 * enforced server-side (bookAppointment THROWS on overlap); the dialog surfaces
 * that inline via classifyYardError → labels.modal.errors.overlap.
 *
 * Prototype note: no yard/dock screen exists under prototypes/design/ —
 * presentation follows the planning/carriers list+dialog pattern
 * (prototype_match=false, spec-driven). Desktop context → @monopilot/ui Select.
 *
 * UI states: loading, permission-denied (amber note), error (red alert), empty,
 * table; dialog idle/pending/inline-error.
 */
import React from 'react';
import { useTranslations } from 'next-intl';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';

import {
  classifyYardError,
  type AppointmentDirection,
  type AppointmentRow,
  type AppointmentStatus,
  type BookAppointmentInput,
  type CarrierOption,
  type DockDoorRow,
  type ListAppointmentsInput,
} from './yard-shared';
import { buildAppointmentsLabels } from './yard-labels';

export type AppointmentsLabels = {
  loading: string;
  denied: string;
  error: string;
  empty: string;
  book: string;
  viewDay: string;
  viewWeek: string;
  previous: string;
  next: string;
  today: string;
  columns: {
    time: string;
    dockDoor: string;
    carrier: string;
    direction: string;
    reference: string;
    duration: string;
    status: string;
  };
  noCarrier: string;
  minutes: (count: number) => string;
  directionLabel: (d: AppointmentDirection) => string;
  statusLabel: (s: AppointmentStatus) => string;
  modal: {
    title: string;
    dockDoorLabel: string;
    carrierLabel: string;
    noCarrier: string;
    directionLabel: string;
    referenceLabel: string;
    scheduledAtLabel: string;
    durationLabel: string;
    submit: string;
    submitting: string;
    cancel: string;
    directionOption: (d: AppointmentDirection) => string;
    errors: {
      dockDoorRequired: string;
      scheduledAtRequired: string;
      durationInvalid: string;
      invalid_input: string;
      forbidden: string;
      not_found: string;
      overlap: string;
      already_exists: string;
      invalid_status: string;
      persistence_failed: string;
    };
  };
};

export type AppointmentsViewProps = {
  dockDoors: DockDoorRow[];
  carriers: CarrierOption[];
  /** Server Action seams (injected from the RSC page). Each THROWS on failure. */
  listAppointmentsAction: (input: ListAppointmentsInput) => Promise<AppointmentRow[]>;
  bookAppointmentAction: (input: BookAppointmentInput) => Promise<AppointmentRow>;
  /** Initial anchor day as an ISO date (YYYY-MM-DD), injected for deterministic tests. */
  initialDate: string;
};

type ViewMode = 'day' | 'week';
type ListState = 'loading' | 'ready' | 'forbidden' | 'error';

function startOfUtcDay(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map((n) => Number(n));
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function windowFor(anchorIso: string, mode: ViewMode): ListAppointmentsInput {
  const start = startOfUtcDay(anchorIso);
  const days = mode === 'day' ? 1 : 7;
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  return { from: start.toISOString(), to: end.toISOString() };
}

function shiftDays(anchorIso: string, delta: number): string {
  const start = startOfUtcDay(anchorIso);
  const next = new Date(start.getTime() + delta * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

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

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

export function AppointmentsView({
  dockDoors,
  carriers,
  listAppointmentsAction,
  bookAppointmentAction,
  initialDate,
}: AppointmentsViewProps) {
  // Labels built client-side from the `Yard` next-intl namespace: they contain
  // function-valued members (minutes/directionLabel/statusLabel/directionOption)
  // which the RSC boundary cannot serialise, so they must NOT be passed as a prop.
  const t = useTranslations('Yard');
  const labels = React.useMemo(() => buildAppointmentsLabels(t), [t]);
  const [anchor, setAnchor] = React.useState(initialDate);
  const [mode, setMode] = React.useState<ViewMode>('day');
  const [appointments, setAppointments] = React.useState<AppointmentRow[] | null>(null);
  const [state, setState] = React.useState<ListState>('loading');
  const [bookOpen, setBookOpen] = React.useState(false);

  const load = React.useCallback(() => {
    setState('loading');
    listAppointmentsAction(windowFor(anchor, mode))
      .then((rows) => {
        setAppointments(rows);
        setState('ready');
      })
      .catch((err: unknown) => {
        setState(classifyYardError(err) === 'forbidden' ? 'forbidden' : 'error');
      });
  }, [listAppointmentsAction, anchor, mode]);

  React.useEffect(() => {
    load();
  }, [load]);

  const sorted = React.useMemo(
    () => [...(appointments ?? [])].sort((l, r) => l.scheduledAt.localeCompare(r.scheduledAt)),
    [appointments],
  );

  return (
    <div className="flex flex-col gap-6" data-testid="yard-appointments-view">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" className="btn--ghost btn-sm" data-testid="appointments-prev" onClick={() => setAnchor(shiftDays(anchor, mode === 'day' ? -1 : -7))}>
            {labels.previous}
          </Button>
          <Button type="button" className="btn--ghost btn-sm" data-testid="appointments-today" onClick={() => setAnchor(initialDate)}>
            {labels.today}
          </Button>
          <Button type="button" className="btn--ghost btn-sm" data-testid="appointments-next" onClick={() => setAnchor(shiftDays(anchor, mode === 'day' ? 1 : 7))}>
            {labels.next}
          </Button>
          <span className="ml-2 font-mono text-sm text-slate-600" data-testid="appointments-anchor">{anchor}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-200">
            <button
              type="button"
              data-testid="appointments-mode-day"
              aria-pressed={mode === 'day'}
              className={`px-3 py-1.5 text-sm ${mode === 'day' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}
              onClick={() => setMode('day')}
            >
              {labels.viewDay}
            </button>
            <button
              type="button"
              data-testid="appointments-mode-week"
              aria-pressed={mode === 'week'}
              className={`px-3 py-1.5 text-sm ${mode === 'week' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}
              onClick={() => setMode('week')}
            >
              {labels.viewWeek}
            </button>
          </div>
          <Button type="button" className="btn--primary" data-testid="appointments-book" onClick={() => setBookOpen(true)}>
            {labels.book}
          </Button>
        </div>
      </div>

      {state === 'loading' ? (
        <div className="card px-6 py-4 text-sm text-slate-500" data-testid="appointments-loading">
          {labels.loading}
        </div>
      ) : null}

      {state === 'forbidden' ? (
        <div role="note" data-testid="appointments-denied" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
          {labels.denied}
        </div>
      ) : null}

      {state === 'error' ? (
        <div role="alert" data-testid="appointments-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
          {labels.error}
        </div>
      ) : null}

      {state === 'ready' && sorted.length === 0 ? (
        <div className="card">
          <div className="px-4 py-8 text-center text-sm text-slate-400" data-testid="appointments-empty">{labels.empty}</div>
        </div>
      ) : null}

      {state === 'ready' && sorted.length > 0 ? (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="appointments-table">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-3 py-2">{labels.columns.time}</th>
                  <th scope="col" className="px-3 py-2">{labels.columns.dockDoor}</th>
                  <th scope="col" className="px-3 py-2">{labels.columns.carrier}</th>
                  <th scope="col" className="px-3 py-2">{labels.columns.direction}</th>
                  <th scope="col" className="px-3 py-2">{labels.columns.reference}</th>
                  <th scope="col" className="px-3 py-2 text-right">{labels.columns.duration}</th>
                  <th scope="col" className="px-3 py-2">{labels.columns.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((a) => (
                  <tr key={a.id} data-testid={`appointment-row-${a.id}`}>
                    <td className="px-3 py-2 font-mono text-slate-800">{formatDateTime(a.scheduledAt)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">{a.dockDoorCode ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-700">{a.carrierName ?? labels.noCarrier}</td>
                    <td className="px-3 py-2 text-slate-700">{labels.directionLabel(a.direction)}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{a.reference ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-mono">{labels.minutes(a.durationMin)}</td>
                    <td className="px-3 py-2">
                      <span className={`badge ${statusVariant(a.status)}`}>{labels.statusLabel(a.status)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {bookOpen ? (
        <BookAppointmentModal
          labels={labels}
          dockDoors={dockDoors}
          carriers={carriers}
          initialDate={anchor}
          bookAppointmentAction={bookAppointmentAction}
          onClose={() => setBookOpen(false)}
          onSaved={() => {
            setBookOpen(false);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

const DIRECTIONS: AppointmentDirection[] = ['inbound', 'outbound'];

function BookAppointmentModal({
  labels,
  dockDoors,
  carriers,
  initialDate,
  bookAppointmentAction,
  onClose,
  onSaved,
}: {
  labels: AppointmentsLabels;
  dockDoors: DockDoorRow[];
  carriers: CarrierOption[];
  initialDate: string;
  bookAppointmentAction: (input: BookAppointmentInput) => Promise<AppointmentRow>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const m = labels.modal;
  const [dockDoorId, setDockDoorId] = React.useState(dockDoors[0]?.id ?? '');
  const [carrierId, setCarrierId] = React.useState('none');
  const [direction, setDirection] = React.useState<AppointmentDirection>('inbound');
  const [reference, setReference] = React.useState('');
  const [scheduledAt, setScheduledAt] = React.useState(`${initialDate}T09:00`);
  const [durationMin, setDurationMin] = React.useState('30');
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const dockOptions = dockDoors.map((d) => ({ value: d.id, label: d.name ? `${d.code} — ${d.name}` : d.code }));
  const carrierOptions = [
    { value: 'none', label: m.noCarrier },
    ...carriers.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
  ];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!dockDoorId) return setFormError(m.errors.dockDoorRequired);
    if (!scheduledAt) return setFormError(m.errors.scheduledAtRequired);
    const duration = Number(durationMin);
    if (!Number.isInteger(duration) || duration <= 0) return setFormError(m.errors.durationInvalid);

    const scheduledIso = new Date(scheduledAt).toISOString();
    if (Number.isNaN(new Date(scheduledAt).getTime())) return setFormError(m.errors.scheduledAtRequired);

    setPending(true);
    try {
      await bookAppointmentAction({
        dockDoorId,
        carrierId: carrierId === 'none' ? undefined : carrierId,
        direction,
        reference: reference.trim() || undefined,
        scheduledAt: scheduledIso,
        durationMin: duration,
      });
      onSaved();
    } catch (err) {
      const kind = classifyYardError(err);
      const map = m.errors as Record<string, string>;
      setFormError(map[kind] ?? m.errors.persistence_failed);
      setPending(false);
    }
  }

  return (
    <Modal open onOpenChange={(open) => (!open ? onClose() : undefined)} size="md" modalId="yard_book_appointment">
      <Modal.Header title={m.title} />
      <Modal.Body>
        <form id="book-appointment-form" onSubmit={onSubmit} data-testid="book-appointment-form" className="flex flex-col gap-4">
          {formError ? (
            <div role="alert" data-testid="book-appointment-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          ) : null}

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{m.dockDoorLabel}</span>
            <Select value={dockDoorId} onValueChange={setDockDoorId} aria-label={m.dockDoorLabel} options={dockOptions} />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{m.carrierLabel}</span>
              <Select value={carrierId} onValueChange={setCarrierId} aria-label={m.carrierLabel} options={carrierOptions} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{m.directionLabel}</span>
              <Select
                value={direction}
                onValueChange={(v) => setDirection(v as AppointmentDirection)}
                aria-label={m.directionLabel}
                options={DIRECTIONS.map((d) => ({ value: d, label: m.directionOption(d) }))}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{m.scheduledAtLabel}</span>
              <Input type="datetime-local" value={scheduledAt} data-testid="book-scheduled-at" onChange={(e) => setScheduledAt(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{m.durationLabel}</span>
              <Input type="text" inputMode="numeric" value={durationMin} data-testid="book-duration" onChange={(e) => setDurationMin(e.target.value)} />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{m.referenceLabel}</span>
            <Input type="text" value={reference} data-testid="book-reference" onChange={(e) => setReference(e.target.value)} />
          </label>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="book-cancel" onClick={onClose}>
          {m.cancel}
        </Button>
        <Button
          type="submit"
          form="book-appointment-form"
          className="btn--primary"
          data-testid="book-submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? m.submitting : m.submit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

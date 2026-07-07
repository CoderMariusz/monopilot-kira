'use client';

/**
 * W8 — SCREEN /planning/schedule — Line schedule board (clickthrough §4: the
 * scheduler was a stub with "Run sequencing" disabled; this is the honest
 * read+light-write replacement, NO auto-sequencing optimizer).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/planning/
 * gantt.jsx:1-160 (SCREEN-08 WO Gantt View) — per-line lanes × 7-day time
 * axis (gantt.jsx:59-111), WO bars positioned by start/end hours
 * (gantt.jsx:91-107), conflict highlight class on bars (gantt.jsx:98 +
 * capacity-conflict alert gantt.jsx:144-148), bar click → detail popover with
 * "Edit schedule" (gantt.jsx:127-156). Deliberate honest deltas: drag&drop and
 * the sequencing/changeover/allergen-legend overlays are NOT built — the
 * popover's "Edit schedule" is a real reschedule form instead, and unscheduled
 * WOs get a side list (the prototype shows only pre-placed demo bars). Pure
 * CSS positioned divs — no gantt library.
 *
 * Server-action seam: rescheduleAction (rescheduleWorkOrder) is injected by
 * the RSC page; RBAC enforced server-side. UI states: empty (no lines / no
 * WOs), error (action error → inline alert), optimistic (pending submit),
 * conflict (overlap on one line → red ring + legend).
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';

import { ListPaginationFooter, type ListPaginationLabels } from '../../../../../../../lib/shared/list-pagination-footer';

import {
  barGeometry,
  barInterval,
  computeConflictIds,
  windowDayKeys,
  type BarInterval,
  type ScheduleBoardData,
  type ScheduleBoardWo,
} from '../_lib/board';
import type { RescheduleWorkOrderResult } from '../_actions/schedule-board';

export type ScheduleBoardLabels = {
  linesCol: string;
  noLine: string;
  emptyLines: string;
  emptyScheduled: string;
  legendConflict: string;
  legendOpenEnd: string;
  status: Record<string, string>;
  unscheduledTitle: string;
  unscheduledEmpty: string;
  scheduleCta: string;
  unscheduledPagination: ListPaginationLabels;
  modal: {
    title: string;
    line: string;
    lineKeep: string;
    start: string;
    end: string;
    item: string;
    statusLabel: string;
    save: string;
    saving: string;
    cancel: string;
    errors: Record<string, string>;
  };
};

type RescheduleAction = (params: {
  woId: string;
  lineId?: string;
  scheduledStart: string;
  scheduledEnd: string;
}) => Promise<RescheduleWorkOrderResult>;

const STATUS_BAR_CLASS: Record<string, string> = {
  DRAFT: 'bg-slate-200 border-slate-400 text-slate-800',
  RELEASED: 'bg-sky-100 border-sky-500 text-sky-900',
  IN_PROGRESS: 'bg-emerald-100 border-emerald-500 text-emerald-900',
};

/** datetime-local input value (local time, minute precision) from ISO. */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const KEEP_LINE = '__keep__';

export function ScheduleBoardView({
  data,
  labels,
  locale,
  rescheduleAction,
}: {
  data: ScheduleBoardData;
  labels: ScheduleBoardLabels;
  locale: string;
  rescheduleAction: RescheduleAction;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<ScheduleBoardWo | null>(null);
  const [pending, setPending] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<string | null>(null);
  const [formStart, setFormStart] = React.useState('');
  const [formEnd, setFormEnd] = React.useState('');
  const [formLine, setFormLine] = React.useState<string>(KEEP_LINE);

  const windowStartMs = Date.parse(data.windowStart);
  const windowEndMs = Date.parse(data.windowEnd);
  const dayKeys = windowDayKeys(data.windowStart);

  const dayFmt = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });

  const intervals = data.scheduled
    .map((wo) => barInterval(wo))
    .filter((bar): bar is BarInterval => bar !== null);
  const intervalById = new Map(intervals.map((bar) => [bar.id, bar]));
  const conflictIds = computeConflictIds(intervals);

  const hasNoLineBars = data.scheduled.some((wo) => wo.productionLineId === null);
  const lanes: Array<{ key: string; label: string; sub: string; lineId: string | null }> = [
    ...data.lines.map((line) => ({ key: line.id, label: line.code, sub: line.name, lineId: line.id as string | null })),
    ...(hasNoLineBars ? [{ key: 'no-line', label: labels.noLine, sub: '', lineId: null }] : []),
  ];

  const statusLabel = (status: string) => labels.status[status.toLowerCase()] ?? status;

  const unscheduledPagination = data.unscheduledPagination;
  const unscheduledShown = unscheduledPagination.offset + data.unscheduled.length;
  const unscheduledPageHref = (page: number) =>
    page <= 1
      ? `/${locale}/planning/schedule`
      : `/${locale}/planning/schedule?uPage=${page}`;

  const openModal = (wo: ScheduleBoardWo) => {
    setSelected(wo);
    setErrorKey(null);
    setFormStart(isoToLocalInput(wo.scheduledStart));
    setFormEnd(isoToLocalInput(wo.scheduledEnd));
    setFormLine(wo.productionLineId ?? KEEP_LINE);
  };

  const closeModal = () => {
    if (pending) return;
    setSelected(null);
    setErrorKey(null);
  };

  const submit = async () => {
    if (!selected) return;
    const startIso = localInputToIso(formStart);
    const endIso = localInputToIso(formEnd);
    if (!startIso || !endIso) {
      setErrorKey('invalid_input');
      return;
    }
    setPending(true);
    setErrorKey(null);
    const result = await rescheduleAction({
      woId: selected.id,
      ...(formLine !== KEEP_LINE ? { lineId: formLine } : {}),
      scheduledStart: startIso,
      scheduledEnd: endIso,
    });
    setPending(false);
    if (result.ok) {
      setSelected(null);
      router.refresh();
    } else {
      setErrorKey(result.error);
    }
  };

  const lineOptions = [
    { value: KEEP_LINE, label: labels.modal.lineKeep },
    ...data.lines.map((line) => ({ value: line.id, label: `${line.code} — ${line.name}` })),
  ];

  return (
    <div className="flex flex-col gap-6" data-testid="planning-schedule-board">
      {/* Legend (honest subset of gantt.jsx:48-57 — conflict + open-end only). */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border-2 border-red-500 bg-red-100" aria-hidden />
          {labels.legendConflict}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-dashed border-slate-400 bg-slate-100" aria-hidden />
          {labels.legendOpenEnd}
        </span>
        {(['DRAFT', 'RELEASED', 'IN_PROGRESS'] as const).map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-sm border ${STATUS_BAR_CLASS[status]}`} aria-hidden />
            {statusLabel(status)}
          </span>
        ))}
      </div>

      {/* Board grid — gantt.jsx:59-111 lanes × 7-day axis, CSS only. */}
      {lanes.length === 0 ? (
        <p
          className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500"
          data-testid="schedule-empty-lines"
        >
          {labels.emptyLines}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="min-w-[960px]">
            {/* Day header */}
            <div className="grid border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600" style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}>
              <div className="border-r border-slate-200 px-3 py-2">{labels.linesCol}</div>
              {dayKeys.map((day) => (
                <div key={day} className="border-r border-slate-100 px-2 py-2 text-center" data-testid={`schedule-day-${day}`}>
                  {dayFmt.format(new Date(`${day}T00:00:00Z`))}
                </div>
              ))}
            </div>

            {lanes.map((lane) => {
              const laneBars = data.scheduled.filter((wo) => wo.productionLineId === lane.lineId);
              return (
                <div
                  key={lane.key}
                  className="grid border-b border-slate-100 last:border-b-0"
                  style={{ gridTemplateColumns: '180px 1fr' }}
                  data-testid={`schedule-lane-${lane.label}`}
                >
                  <div className="border-r border-slate-200 px-3 py-3">
                    <div className="text-sm font-semibold text-slate-900">{lane.label}</div>
                    {lane.sub ? <div className="text-xs text-slate-500">{lane.sub}</div> : null}
                  </div>
                  <div className="relative min-h-16 py-2">
                    {/* Day gridlines */}
                    {dayKeys.slice(1).map((day, i) => (
                      <div
                        key={day}
                        aria-hidden
                        className="absolute inset-y-0 border-l border-slate-100"
                        style={{ left: `${((i + 1) / 7) * 100}%` }}
                      />
                    ))}
                    {laneBars.map((wo) => {
                      const interval = intervalById.get(wo.id);
                      if (!interval) return null;
                      const geometry = barGeometry(interval.startMs, interval.endMs, windowStartMs, windowEndMs);
                      if (!geometry) return null;
                      const conflict = conflictIds.has(wo.id);
                      const openEnded = wo.scheduledEnd === null;
                      return (
                        <button
                          key={wo.id}
                          type="button"
                          onClick={() => openModal(wo)}
                          data-testid={`schedule-bar-${wo.woNumber}`}
                          data-conflict={conflict ? 'true' : 'false'}
                          title={`${wo.woNumber} · ${wo.itemCode ?? ''} · ${statusLabel(wo.status)}`}
                          className={[
                            'absolute top-2 h-12 overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-tight',
                            STATUS_BAR_CLASS[wo.status] ?? 'bg-slate-100 border-slate-300 text-slate-700',
                            conflict ? 'border-2 border-red-500 ring-2 ring-red-200' : '',
                            openEnded ? 'border-dashed' : '',
                          ].join(' ')}
                          style={{ left: `${geometry.leftPct}%`, width: `${geometry.widthPct}%` }}
                        >
                          <span className="block truncate font-mono font-semibold">{wo.woNumber}</span>
                          <span className="block truncate">{wo.itemCode ?? wo.itemName ?? ''}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.scheduled.length === 0 && lanes.length > 0 ? (
        <p className="text-sm text-slate-500" data-testid="schedule-empty-scheduled">
          {labels.emptyScheduled}
        </p>
      ) : null}

      {/* Unscheduled side list — honest delta: prototype has no backlog list. */}
      <section className="rounded-xl border border-slate-200 bg-white" data-testid="schedule-unscheduled">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
          {labels.unscheduledTitle}
          <span className="ml-2 rounded bg-slate-100 px-1.5 text-xs font-normal text-slate-600">
            {unscheduledPagination.total}
          </span>
        </h2>
        {data.unscheduled.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">{labels.unscheduledEmpty}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.unscheduled.map((wo) => (
              <li
                key={wo.id}
                className="flex items-center gap-3 px-4 py-2.5 text-sm"
                data-testid={`schedule-unscheduled-${wo.woNumber}`}
              >
                <span className="font-mono font-semibold text-slate-900">{wo.woNumber}</span>
                <span className="truncate text-slate-600">{wo.itemCode ?? wo.itemName ?? '—'}</span>
                <span className="text-xs text-slate-500">{statusLabel(wo.status)}</span>
                <span className="ml-auto" />
                <Button type="button" className="btn-sm" onClick={() => openModal(wo)}>
                  {labels.scheduleCta}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <ListPaginationFooter
          shown={unscheduledShown}
          total={unscheduledPagination.total}
          previousHref={
            unscheduledPagination.page > 1 ? unscheduledPageHref(unscheduledPagination.page - 1) : null
          }
          nextHref={
            unscheduledPagination.hasMore ? unscheduledPageHref(unscheduledPagination.page + 1) : null
          }
          labels={labels.unscheduledPagination}
          testId="schedule-unscheduled-pagination"
        />
      </section>

      {/* Reschedule modal — the honest replacement for gantt.jsx:152 "Edit schedule". */}
      <Modal open={selected !== null} onOpenChange={(open) => { if (!open) closeModal(); }} size="sm" modalId="schedule-reschedule-modal">
        {selected ? (
          <>
            <Modal.Header title={`${labels.modal.title} — ${selected.woNumber}`} />
            <Modal.Body>
              <div className="flex flex-col gap-4 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">{labels.modal.item}</span>
                  <span className="font-mono">{selected.itemCode ?? selected.itemName ?? '—'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">{labels.modal.statusLabel}</span>
                  <span>{statusLabel(selected.status)}</span>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-600">{labels.modal.start}</span>
                  <Input
                    type="datetime-local"
                    value={formStart}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormStart(e.target.value)}
                    data-testid="reschedule-start"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-600">{labels.modal.end}</span>
                  <Input
                    type="datetime-local"
                    value={formEnd}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormEnd(e.target.value)}
                    data-testid="reschedule-end"
                  />
                </label>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-600">{labels.modal.line}</span>
                  <Select
                    value={formLine}
                    onValueChange={setFormLine}
                    options={lineOptions}
                    aria-label={labels.modal.line}
                    data-testid="reschedule-line"
                  />
                </div>
                {errorKey ? (
                  <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" data-testid="reschedule-error">
                    {labels.modal.errors[errorKey] ?? labels.modal.errors.persistence_failed}
                  </p>
                ) : null}
                {selected.scheduledStart ? (
                  <p className="text-xs text-slate-400">
                    {timeFmt.format(new Date(selected.scheduledStart))}
                    {selected.scheduledEnd ? ` – ${timeFmt.format(new Date(selected.scheduledEnd))}` : ''}
                  </p>
                ) : null}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button type="button" onClick={closeModal} disabled={pending}>
                {labels.modal.cancel}
              </Button>
              <Button type="button" className="btn--primary" onClick={submit} disabled={pending} data-testid="reschedule-save">
                {pending ? labels.modal.saving : labels.modal.save}
              </Button>
            </Modal.Footer>
          </>
        ) : null}
      </Modal>
    </div>
  );
}

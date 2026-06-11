'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { PageHead, Section } from '../_components';
import type {
  CalendarDayRow,
  CreateShiftPatternInput,
  DeleteShiftPatternInput,
  ShiftLineOption,
  ShiftPatternDeleteResult,
  ShiftPatternMutationResult,
  ShiftPatternRow,
  ShiftSiteOption,
  UpdateShiftPatternInput,
} from './_actions/shifts';

/**
 * Shifts & calendar settings screen.
 *
 * Prototype parity:
 * prototypes/design/Monopilot Design System/settings/org-screens.jsx:255-306
 * (ShiftsScreen) — shift-patterns table + monthly calendar with
 * working / weekend / holiday legend + "+ New shift" head action.
 *
 * Built from the shared settings primitives (`PageHead`, `Section`) so the
 * `.sg-*` structure stays in parity with the prototype. The calendar grid is a
 * custom layout that lives inside a `Section`. All data is real (Supabase rows
 * loaded server-side via `_actions/shifts.ts`); no mocks.
 */

export type ShiftsScreenLabels = {
  title: string;
  subtitle: string;
  newShift: string;
  patternsTitle: string;
  patternsSubtitle: string;
  emptyPatterns: string;
  calendarTitle: string;
  calendarSubtitle: string;
  legendWorking: string;
  legendWeekend: string;
  legendHoliday: string;
  columns: {
    name: string;
    time: string;
    days: string;
    site: string;
    line: string;
    status: string;
  };
  statusActive: string;
  weekdayShort: [string, string, string, string, string, string, string];
  dialogTitle: string;
  fieldName: string;
  fieldStart: string;
  fieldEnd: string;
  fieldDays: string;
  fieldSite: string;
  fieldLine: string;
  allSites: string;
  noLine: string;
  cancel: string;
  save: string;
  saving: string;
  createFailed: string;
  actionsColumn: string;
  editShift: string;
  deleteShift: string;
  editDialogTitle: string;
  deleteConfirmTitle: string;
  deleteConfirmBody: string;
  deleteConfirm: string;
  deleting: string;
  updateFailed: string;
  deleteFailed: string;
};

export type ShiftsScreenProps = {
  shiftPatterns: ShiftPatternRow[];
  calendarDays: CalendarDayRow[];
  year: number;
  month: number;
  canEdit?: boolean;
  sites?: ShiftSiteOption[];
  lines?: ShiftLineOption[];
  labels: ShiftsScreenLabels;
  createShiftAction?: (input: CreateShiftPatternInput) => Promise<ShiftPatternMutationResult>;
  updateShiftAction?: (input: UpdateShiftPatternInput) => Promise<ShiftPatternMutationResult>;
  deleteShiftAction?: (input: DeleteShiftPatternInput) => Promise<ShiftPatternDeleteResult>;
};

const PROTOTYPE_SOURCE = 'prototypes/design/Monopilot Design System/settings/org-screens.jsx:255-306';

// Order matches the prototype calendar header (Mon-first week).
const DAY_ORDER = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const;

type Weekday = (typeof DAY_ORDER)[number];

function formatTimeRange(start: string, end: string): string {
  // Loader normalises to HH:MM:SS — show HH:MM for readability.
  return `${start.slice(0, 5)} – ${end.slice(0, 5)}`;
}

function formatDays(
  days: ShiftPatternRow['days_of_week'],
  weekdayShort: ShiftsScreenLabels['weekdayShort'],
): string {
  const present = new Set(days.map((day) => day.toLowerCase()));
  return DAY_ORDER.filter((day) => present.has(day))
    .map((day) => weekdayShort[DAY_ORDER.indexOf(day)])
    .join(', ');
}

function lineDisplay(pattern: ShiftPatternRow): string {
  if (pattern.line_label?.trim()) return pattern.line_label;
  return pattern.line_id ?? '—';
}

/**
 * Day-of-week (0=Mon … 6=Sun) of the first day of the month, so the calendar
 * grid can pad leading blank cells. Uses UTC to match the loader's date math.
 */
function leadingBlankCount(year: number, month: number): number {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  // getUTCDay: 0=Sun..6=Sat -> convert to Mon-first 0=Mon..6=Sun.
  return (firstWeekday + 6) % 7;
}

function dayCellStyle(kind: CalendarDayRow['kind']): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: 6,
    textAlign: 'center',
    fontSize: 11,
    borderRadius: 3,
    border: '1px solid var(--border)',
  };
  if (kind === 'holiday') {
    return {
      ...base,
      background: 'var(--red-050)',
      color: 'var(--red-700)',
      fontWeight: 600,
      border: '1px solid var(--red-300, #fca5a5)',
    };
  }
  if (kind === 'weekend') {
    return { ...base, background: 'var(--gray-050)', color: 'var(--muted)' };
  }
  return { ...base, background: '#fff', color: 'var(--text)' };
}

function LegendSwatch({ background, border }: { background: string; border: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: 10, height: 10, background, borderRadius: 2, border }}
    />
  );
}

export default function ShiftsScreen({
  shiftPatterns,
  calendarDays,
  year,
  month,
  canEdit = false,
  sites = [],
  lines = [],
  labels,
  createShiftAction,
  updateShiftAction,
  deleteShiftAction,
}: ShiftsScreenProps) {
  const router = useRouter();
  const leadingBlanks = leadingBlankCount(year, month);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  // null = create mode; an id = editing that existing pattern.
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ShiftPatternRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const defaultSiteId = sites.find((site) => site.is_default)?.id ?? sites[0]?.id ?? '';
  const emptyDraft = React.useCallback(
    () => ({
      name: '',
      start_time: '06:00',
      end_time: '14:00',
      days_of_week: ['mon', 'tue', 'wed', 'thu', 'fri'] as Weekday[],
      site_id: defaultSiteId,
      line_id: '',
    }),
    [defaultSiteId],
  );
  const [draft, setDraft] = React.useState(emptyDraft);
  const canDelete = canEdit && Boolean(deleteShiftAction);

  React.useEffect(() => {
    setDraft((current) => ({
      ...current,
      site_id: current.site_id || defaultSiteId,
    }));
  }, [defaultSiteId]);

  const lineOptions = React.useMemo(
    () => lines.filter((line) => !draft.site_id || !line.site_id || line.site_id === draft.site_id),
    [draft.site_id, lines],
  );

  const toggleDay = (day: Weekday, checked: boolean) => {
    setDraft((current) => {
      const nextDays = checked
        ? [...new Set([...current.days_of_week, day])]
        : current.days_of_week.filter((currentDay) => currentDay !== day);
      return { ...current, days_of_week: nextDays };
    });
  };

  const openCreate = () => {
    if (!canEdit || !createShiftAction) return;
    setEditingId(null);
    setError(null);
    setDraft(emptyDraft());
    setDialogOpen(true);
  };

  const openEdit = (pattern: ShiftPatternRow) => {
    if (!canEdit || !updateShiftAction) return;
    setEditingId(pattern.id);
    setError(null);
    setDraft({
      name: pattern.name,
      start_time: pattern.start_time.slice(0, 5),
      end_time: pattern.end_time.slice(0, 5),
      days_of_week: pattern.days_of_week.map((day) => day.toLowerCase()) as Weekday[],
      site_id: pattern.site_id ?? '',
      line_id: pattern.line_id ?? '',
    });
    setDialogOpen(true);
  };

  const submitShift = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || pending) return;

    const payload = {
      name: draft.name,
      start_time: draft.start_time,
      end_time: draft.end_time,
      days_of_week: draft.days_of_week,
      site_id: draft.site_id || null,
      line_id: draft.line_id || null,
    };

    setPending(true);
    setError(null);
    const result =
      editingId && updateShiftAction
        ? await updateShiftAction({ ...payload, id: editingId })
        : createShiftAction
          ? await createShiftAction(payload)
          : null;
    setPending(false);

    if (!result) return;
    if (!result.ok) {
      setError(editingId ? labels.updateFailed : labels.createFailed);
      return;
    }

    setDialogOpen(false);
    setEditingId(null);
    setDraft(emptyDraft());
    router.refresh();
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !canDelete || !deleteShiftAction || deleting) return;
    setDeleting(true);
    setError(null);
    const result = await deleteShiftAction({ id: deleteTarget.id });
    setDeleting(false);

    if (!result.ok) {
      setError(labels.deleteFailed);
      return;
    }
    setDeleteTarget(null);
    router.refresh();
  };

  return (
    <main
      aria-label={labels.title}
      className="mx-auto grid max-w-5xl gap-3 p-6"
      data-prototype-source={PROTOTYPE_SOURCE}
    >
      <PageHead
        title={labels.title}
        sub={labels.subtitle}
        actions={
          <button
            className="btn btn-primary"
            type="button"
            disabled={!canEdit || !createShiftAction}
            onClick={openCreate}
          >
            {labels.newShift}
          </button>
        }
      />

      <Section title={labels.patternsTitle} sub={labels.patternsSubtitle}>
        {shiftPatterns.length === 0 ? (
          <div className="muted" data-testid="shifts-patterns-empty" role="status">
            {labels.emptyPatterns}
          </div>
        ) : (
          <table data-testid="shifts-patterns-table">
            <thead>
              <tr>
                <th>{labels.columns.name}</th>
                <th>{labels.columns.time}</th>
                <th>{labels.columns.days}</th>
                <th>{labels.columns.site}</th>
                <th>{labels.columns.line}</th>
                <th>{labels.columns.status}</th>
                <th>{labels.actionsColumn}</th>
              </tr>
            </thead>
            <tbody>
              {shiftPatterns.map((pattern) => (
                <tr key={pattern.id}>
                  <td style={{ fontWeight: 500 }}>{pattern.name}</td>
                  <td className="mono">{formatTimeRange(pattern.start_time, pattern.end_time)}</td>
                  <td>{formatDays(pattern.days_of_week, labels.weekdayShort)}</td>
                  <td>{pattern.site_name ?? '—'}</td>
                  <td>{lineDisplay(pattern)}</td>
                  <td>
                    <span className="badge badge-green">● {labels.statusActive}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }} data-testid={`shift-row-actions-${pattern.id}`}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        data-testid={`shift-edit-${pattern.id}`}
                        disabled={!canEdit || !updateShiftAction}
                        onClick={() => openEdit(pattern)}
                      >
                        {labels.editShift}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        data-testid={`shift-delete-${pattern.id}`}
                        disabled={!canDelete}
                        onClick={() => {
                          if (!canDelete) return;
                          setError(null);
                          setDeleteTarget(pattern);
                        }}
                      >
                        {labels.deleteShift}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={labels.calendarTitle} sub={labels.calendarSubtitle}>
        <div
          data-testid="shifts-calendar-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 4,
            maxWidth: 540,
            marginBottom: 12,
          }}
        >
          {labels.weekdayShort.map((weekday) => (
            <div
              key={weekday}
              style={{
                fontSize: 10,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                textAlign: 'center',
                padding: 4,
              }}
            >
              {weekday}
            </div>
          ))}
          {Array.from({ length: leadingBlanks }).map((_, index) => (
            <div key={`blank-${index}`} aria-hidden="true" style={{ padding: 6 }} />
          ))}
          {calendarDays.map((calendarDay) => (
            <div
              key={calendarDay.date}
              data-testid="shifts-calendar-day"
              data-kind={calendarDay.kind}
              title={calendarDay.reason ?? undefined}
              style={dayCellStyle(calendarDay.kind)}
            >
              {calendarDay.day}
            </div>
          ))}
        </div>
        <div data-testid="shifts-calendar-legend" style={{ display: 'flex', gap: 14, fontSize: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <LegendSwatch background="#fff" border="1px solid var(--border)" />
            {labels.legendWorking}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <LegendSwatch background="var(--gray-050)" border="1px solid var(--border)" />
            {labels.legendWeekend}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <LegendSwatch background="var(--red-050)" border="1px solid var(--red-300, #fca5a5)" />
            {labels.legendHoliday}
          </span>
        </div>
      </Section>

      {dialogOpen ? (
        <div role="dialog" aria-modal="true" aria-labelledby="new-shift-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <h2 id="new-shift-title" className="text-lg font-semibold text-slate-950">{editingId ? labels.editDialogTitle : labels.dialogTitle}</h2>
              <button type="button" className="btn btn-secondary" onClick={() => setDialogOpen(false)} disabled={pending}>
                {labels.cancel}
              </button>
            </div>
            <form data-testid="shifts-new-shift-form" className="mt-4 space-y-4" onSubmit={(event) => void submitShift(event)}>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="shift-name">
                {labels.fieldName}
                <input
                  id="shift-name"
                  className="input"
                  value={draft.name}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDraft((current) => ({ ...current, name: value }));
                  }}
                  required
                  disabled={pending}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="shift-start">
                  {labels.fieldStart}
                  <input
                    id="shift-start"
                    className="input"
                    type="time"
                    value={draft.start_time}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setDraft((current) => ({ ...current, start_time: value }));
                    }}
                    required
                    disabled={pending}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="shift-end">
                  {labels.fieldEnd}
                  <input
                    id="shift-end"
                    className="input"
                    type="time"
                    value={draft.end_time}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setDraft((current) => ({ ...current, end_time: value }));
                    }}
                    required
                    disabled={pending}
                  />
                </label>
              </div>
              <fieldset className="grid gap-2 rounded-lg border border-slate-200 p-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.fieldDays}</legend>
                <div className="grid grid-cols-7 gap-2">
                  {DAY_ORDER.map((day) => (
                    <label key={day} className="flex items-center gap-1 text-xs text-slate-800">
                      <input
                        type="checkbox"
                        checked={draft.days_of_week.includes(day)}
                        onChange={(event) => toggleDay(day, event.currentTarget.checked)}
                        disabled={pending}
                      />
                      {labels.weekdayShort[DAY_ORDER.indexOf(day)]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>{labels.fieldSite}</span>
                <Select
                  value={draft.site_id || '__all__'}
                  onValueChange={(value) => setDraft((current) => ({ ...current, site_id: value === '__all__' ? '' : value, line_id: '' }))}
                >
                  <SelectTrigger aria-label={labels.fieldSite}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{labels.allSites}</SelectItem>
                    {sites.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.code} - {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>{labels.fieldLine}</span>
                <Select value={draft.line_id || '__none__'} onValueChange={(value) => setDraft((current) => ({ ...current, line_id: value === '__none__' ? '' : value }))}>
                  <SelectTrigger aria-label={labels.fieldLine}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{labels.noLine}</SelectItem>
                    {lineOptions.map((line) => (
                      <SelectItem key={line.id} value={line.id}>
                        {line.code} - {line.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {error ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setDialogOpen(false)} disabled={pending}>{labels.cancel}</button>
                <button type="submit" className="btn btn-primary" disabled={pending || draft.days_of_week.length === 0}>
                  {pending ? labels.saving : labels.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-shift-title"
          data-testid="shifts-delete-dialog"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4"
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
            <h2 id="delete-shift-title" className="text-lg font-semibold text-slate-950">{labels.deleteConfirmTitle}</h2>
            <p className="mt-2 text-sm text-slate-700">
              {labels.deleteConfirmBody}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">{deleteTarget.name}</p>
            {error ? (
              <div role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                {labels.cancel}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                data-testid="shifts-delete-confirm"
                onClick={() => void confirmDelete()}
                disabled={deleting}
              >
                {deleting ? labels.deleting : labels.deleteConfirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

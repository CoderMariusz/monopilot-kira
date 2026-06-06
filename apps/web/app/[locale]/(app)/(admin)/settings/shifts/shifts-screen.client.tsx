'use client';

import React from 'react';

import { PageHead, Section } from '../_components';
import type { CalendarDayRow, ShiftPatternRow } from './_actions/shifts';

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
};

export type ShiftsScreenProps = {
  shiftPatterns: ShiftPatternRow[];
  calendarDays: CalendarDayRow[];
  year: number;
  month: number;
  canEdit?: boolean;
  labels: ShiftsScreenLabels;
  onNewShift?: () => void;
};

const PROTOTYPE_SOURCE = 'prototypes/design/Monopilot Design System/settings/org-screens.jsx:255-306';

// Order matches the prototype calendar header (Mon-first week).
const DAY_ORDER: ReadonlyArray<ShiftPatternRow['days_of_week'][number]> = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
];

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
  labels,
  onNewShift,
}: ShiftsScreenProps) {
  const leadingBlanks = leadingBlankCount(year, month);

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
            disabled={!canEdit}
            onClick={() => onNewShift?.()}
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
              </tr>
            </thead>
            <tbody>
              {shiftPatterns.map((pattern) => (
                <tr key={pattern.id}>
                  <td style={{ fontWeight: 500 }}>{pattern.name}</td>
                  <td className="mono">{formatTimeRange(pattern.start_time, pattern.end_time)}</td>
                  <td>{formatDays(pattern.days_of_week, labels.weekdayShort)}</td>
                  <td className="mono">{pattern.site_id ?? '—'}</td>
                  <td className="mono">{pattern.line_id ?? '—'}</td>
                  <td>
                    <span className="badge badge-green">● {labels.statusActive}</span>
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
    </main>
  );
}

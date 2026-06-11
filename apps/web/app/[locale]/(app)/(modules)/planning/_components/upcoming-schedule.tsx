/**
 * P-L5 / W9-M2 — Planning Dashboard upcoming schedule (parity: dashboard.jsx:138-231).
 *
 * The prototype renders tabbed "upcoming" lists (PO calendar / WO schedule / TO
 * timeline / Cascade). The WO schedule is live (real work_orders, 7-day window
 * grouped by day); the PO/TO tabs link to the live PO/TO list screens (migs
 * 262/263) — the in-dashboard PO calendar / TO timeline views are not built yet,
 * so the tabs navigate instead of pretending the modules are not live.
 *
 * Pure presentational + empty-state safe. The day grouping itself is computed
 * upstream by `groupScheduleByDay` (unit-tested in dashboard-data.ts).
 */
import Link from "next/link";

export type ScheduleDayView = {
  /** Pre-formatted day heading (e.g. "Mon, Jun 9"). */
  label: string;
  /** Raw YYYY-MM-DD key (stable test id / React key). */
  dateKey: string;
  rows: Array<{
    id: string;
    woNumber: string;
    statusLabel: string;
    /** Pre-formatted time-of-day. */
    time: string;
    href: string;
  }>;
};

export type UpcomingScheduleLabels = {
  woTab: string;
  poTab: string;
  toTab: string;
  /** Title/aria text for the PO tab link (opens the live PO list). */
  openPos: string;
  /** Title/aria text for the TO tab link (opens the live TO list). */
  openTos: string;
  empty: string;
  woCol: string;
  statusCol: string;
  timeCol: string;
};

export function UpcomingSchedule({
  days,
  scheduledCount,
  poListHref,
  toListHref,
  labels,
}: {
  days: ScheduleDayView[];
  scheduledCount: number;
  /** Locale-prefixed href of the live PO list screen. */
  poListHref: string;
  /** Locale-prefixed href of the live TO list screen. */
  toListHref: string;
  labels: UpcomingScheduleLabels;
}) {
  return (
    <div className="card" data-testid="planning-upcoming">
      {/* Tab strip — WO schedule renders inline; PO/TO tabs navigate to the live lists. */}
      <div className="card-head">
        <div role="tablist" aria-label={labels.woTab} className="flex flex-wrap gap-2">
          <span
            role="tab"
            aria-selected="true"
            data-testid="planning-upcoming-tab-wos"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            {labels.woTab}
            <span className="ml-1.5 rounded bg-white/20 px-1.5 text-xs">{scheduledCount}</span>
          </span>
          <Link
            href={poListHref}
            prefetch={false}
            data-testid="planning-upcoming-tab-pos"
            title={labels.openPos}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:border-slate-300 hover:bg-slate-50"
          >
            {labels.poTab} →
          </Link>
          <Link
            href={toListHref}
            prefetch={false}
            data-testid="planning-upcoming-tab-tos"
            title={labels.openTos}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:border-slate-300 hover:bg-slate-50"
          >
            {labels.toTab} →
          </Link>
        </div>
      </div>

      {scheduledCount === 0 ? (
        <div className="empty-state" data-testid="planning-upcoming-empty">
          <div className="empty-state-icon" aria-hidden>
            🗓
          </div>
          <div className="empty-state-body">{labels.empty}</div>
        </div>
      ) : (
        <div className="space-y-4" data-testid="planning-upcoming-days">
          {days
            .filter((day) => day.rows.length > 0)
            .map((day) => (
              <div key={day.dateKey} data-testid={`planning-schedule-day-${day.dateKey}`}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {day.label}
                </div>
                <ul className="divide-y divide-slate-100 rounded-md border border-slate-100">
                  {day.rows.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                      data-testid={`planning-schedule-row-${row.id}`}
                    >
                      <Link
                        href={row.href}
                        prefetch={false}
                        className="font-mono font-semibold text-slate-800 hover:underline"
                      >
                        {row.woNumber}
                      </Link>
                      <span className="badge badge-gray">{row.statusLabel}</span>
                      <span className="font-mono text-xs text-slate-500">{row.time}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

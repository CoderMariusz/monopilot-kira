'use client';

/**
 * Recall Drills list (Wave E2A, client island).
 *
 * Spec-driven DS conformance (nearest reusable pattern = the sibling quality
 * list screens): a table of recall drills with the KPI duration (start→complete,
 * formatted) compared to a 4h target badge, the input ref, direction and date; a
 * [New drill] CTA → /quality/trace; each row deep-links to the drill detail.
 *
 * Presentational only — no data fetching, no permission logic (both resolved
 * server-side). The drill list + labels + the new-drill href are passed in as
 * props. Rule 0.11: the row renders the human input ref + direction + date only;
 * the drill id is used ONLY for the detail href, never as visible text.
 */

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';

import type { RecallDrill } from '../../trace/_components/trace-contracts';
import {
  formatDuration,
  RECALL_TARGET_MS,
  type RecallDrillsLabels,
  type Translator,
} from '../../trace/_components/labels';

type TargetStatus = 'within' | 'over' | 'in_progress';

function targetStatus(drill: RecallDrill): TargetStatus {
  if (drill.completedAt === null || drill.durationMs === null) return 'in_progress';
  return drill.durationMs <= RECALL_TARGET_MS ? 'within' : 'over';
}

const BADGE_VARIANT: Record<TargetStatus, BadgeVariant> = {
  within: 'success',
  over: 'danger',
  in_progress: 'muted',
};

function badgeLabel(status: TargetStatus, labels: RecallDrillsLabels): string {
  if (status === 'within') return labels.withinTarget;
  if (status === 'over') return labels.overTarget;
  return labels.inProgress;
}

/** Formats an ISO timestamp as `YYYY-MM-DD HH:mm` (no locale tz drift in tests). */
function formatStarted(iso: string): string {
  if (!iso) return '—';
  return iso.slice(0, 16).replace('T', ' ');
}

export function RecallDrillsList({
  drills,
  labels,
  locale,
  newDrillHref,
  t,
}: {
  drills: RecallDrill[];
  labels: RecallDrillsLabels;
  locale: string;
  newDrillHref: string;
  t: Translator;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {labels.targetBadge}
        </span>
        <a
          href={newDrillHref}
          data-testid="recall-drills-new"
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          + {labels.newDrill}
        </a>
      </div>

      {drills.length === 0 ? (
        <div
          data-testid="recall-drills-empty"
          data-state="empty"
          className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center"
        >
          <span className="text-base font-semibold text-slate-700">{labels.states.emptyTitle}</span>
          <span className="max-w-md text-sm text-slate-500">{labels.states.emptyBody}</span>
          <a
            href={newDrillHref}
            data-testid="recall-drills-empty-cta"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            {labels.states.emptyCta}
          </a>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table data-testid="recall-drills-table" className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-2 text-left font-medium text-slate-500">{labels.col.ref}</th>
                <th scope="col" className="px-4 py-2 text-left font-medium text-slate-500">{labels.col.type}</th>
                <th scope="col" className="px-4 py-2 text-left font-medium text-slate-500">{labels.col.direction}</th>
                <th scope="col" className="px-4 py-2 text-left font-medium text-slate-500">{labels.col.started}</th>
                <th scope="col" className="px-4 py-2 text-left font-medium text-slate-500">{labels.col.duration}</th>
                <th scope="col" className="px-4 py-2 text-left font-medium text-slate-500">{labels.col.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {drills.map((drill) => {
                const status = targetStatus(drill);
                return (
                  <tr
                    key={drill.id}
                    data-testid={`recall-drill-row-${drill.id}`}
                    className="transition hover:bg-slate-50"
                  >
                    <td className="px-4 py-2">
                      <a
                        href={`/${locale}/quality/recall-drills/${drill.id}`}
                        data-testid={`recall-drill-link-${drill.id}`}
                        className="font-mono font-medium text-sky-700 hover:underline"
                      >
                        {drill.inputRef}
                      </a>
                    </td>
                    <td className="px-4 py-2 text-slate-700">{labels.inputType[drill.inputType]}</td>
                    <td className="px-4 py-2 text-slate-700">{labels.direction[drill.direction]}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">{formatStarted(drill.startedAt)}</td>
                    <td
                      className="px-4 py-2 tabular-nums text-slate-700"
                      data-testid={`recall-drill-duration-${drill.id}`}
                    >
                      {formatDuration(t, drill.durationMs)}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={BADGE_VARIANT[status]} data-testid={`recall-drill-badge-${drill.id}`}>
                        {badgeLabel(status, labels)}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

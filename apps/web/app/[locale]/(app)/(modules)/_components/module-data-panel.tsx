import type { ModuleCountResult } from '../_actions/skeleton-data';

type ModuleDataPanelProps = {
  /** Already-localized "Live · Supabase" badge text. */
  liveBadge: string;
  /** Already-localized RLS footnote. */
  rlsNote: string;
  /** Already-localized "unavailable" copy for failed reads. */
  unavailableLabel: string;
  /** Renders the localized record-count string for a successful read. */
  formatCount: (count: number) => string;
  /** Org-scoped count result from `getModuleCount`. */
  result: ModuleCountResult;
};

/**
 * Renders the live, org-scoped record count for a Walking Skeleton module
 * landing page. Presentational only — all strings arrive pre-localized so the
 * panel stays a plain (cacheable) Server Component.
 */
export function ModuleDataPanel({
  liveBadge,
  rlsNote,
  unavailableLabel,
  formatCount,
  result,
}: ModuleDataPanelProps) {
  return (
    <div
      data-testid="module-live-data"
      className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/60 p-5"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {liveBadge}
      </span>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
        {result.ok ? formatCount(result.count) : unavailableLabel}
      </p>
      <p className="mt-1 text-xs text-slate-500">{rlsNote}</p>
    </div>
  );
}

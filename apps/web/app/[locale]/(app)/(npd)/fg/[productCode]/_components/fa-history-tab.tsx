'use client';

/**
 * T-027 — FaHistoryTab (SCR-03i FA detail History tab).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:938-968 (FAHistoryTab)
 *   (prototype-index-npd.json#fa_history_tab declares range 921-950; the actual
 *    component body is 938-968 — same labelled region. See the closeout deviation log.)
 *
 * Translation notes applied (translation-notes-npd.md → fa_history_tab):
 *   - window.NPD_HISTORY[fa.fa_code] (mock) → REAL org-scoped read via
 *     packages/queries listFaHistory(productCode); union of public.outbox_events
 *     (fa.* events) + public.audit_events. RLS scopes to the org; the loader
 *     (page side) never trusts the client. NO mock data anywhere here.
 *   - client-side filter by event type → shadcn Select (NEVER raw <select>).
 *   - emoji icons → text-glyph icon paired with an aria-label + the event Badge
 *     text label, so severity/category is never color/icon-only (a11y).
 *   - timeline feed (flex + borderBottom) → Card + per-row timeline items.
 *   - type badge as mono text → shadcn Badge (variant 'outline') + mono event id.
 *   - who + when → Intl.DateTimeFormat (relative-ish absolute) + full ISO on hover
 *     via <time dateTime title>.
 *
 * AC3: a row whose payload carries a diff renders a native <details> "Details"
 * disclosure that reveals pretty-printed JSON (keyboard-operable, no extra dep).
 *
 * Red lines (T-027): read-only (no edit/delete controls); does not bypass RLS
 * (data is loaded server-side); never shows other FAs (loader pins productCode).
 */

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Card, CardContent, CardHeader } from '@monopilot/ui/Card';
import { EmptyState } from '@monopilot/ui/EmptyState';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@monopilot/ui/Select';

export type FaHistoryPageState =
  | 'ready'
  | 'loading'
  | 'empty'
  | 'error'
  | 'permission_denied';

export type FaHistoryRowSource = 'outbox' | 'audit';

export type FaHistoryRow = {
  /** Stable composite id (source:nativeId) for React keys + test ids. */
  id: string;
  source: FaHistoryRowSource;
  /** Raw event type, e.g. 'fa.created'. */
  eventType: string;
  /** ISO-8601 timestamp. */
  occurredAt: string;
  /** Resolved actor display name (null → system/unknown). */
  actorName: string | null;
  actorUserId: string | null;
  /** Structured payload / diff; null when the event has no body. */
  payload: unknown;
};

export type FaHistoryLabels = {
  title: string;
  subtitle: string;
  filterLabel: string;
  filterAll: string;
  colWhen: string;
  colActor: string;
  colEvent: string;
  detailsToggle: string;
  detailsHide: string;
  systemActor: string;
  unknownActor: string;
  loading: string;
  empty: string;
  emptyBody: string;
  emptyFiltered: string;
  emptyFilteredBody: string;
  clearFilter: string;
  error: string;
  forbidden: string;
  /** Per-event-type human label, keyed by the type SUFFIX (e.g. 'dept_closed'). */
  eventLabels: Record<string, string>;
};

/** Text-glyph icon per event-type suffix (never the sole signal — paired with Badge text). */
const EVENT_ICON: Record<string, string> = {
  created: '+',
  field_edit: '✎',
  edit: '✎',
  dept_closed: '🔒',
  core_closed: '🔒',
  dept_reopened: '↺',
  built: '⚡',
  built_reset: '↺',
  allergens_changed: '⚠',
  intermediate_code_changed: '#',
  recipe_changed: '✎',
  template_applied: '▤',
  cascade: '⚠',
  deleted: '×',
};

/** Strip the leading domain prefix ('fa.', 'fg.') from an event type → suffix key. */
function eventSuffix(eventType: string): string {
  const dot = eventType.lastIndexOf('.');
  return dot >= 0 ? eventType.slice(dot + 1) : eventType;
}

function eventIcon(eventType: string): string {
  return EVENT_ICON[eventSuffix(eventType)] ?? '•';
}

function eventDisplayLabel(eventType: string, labels: FaHistoryLabels): string {
  const suffix = eventSuffix(eventType);
  return labels.eventLabels[suffix] ?? eventType;
}

function hasPayload(payload: unknown): boolean {
  if (payload === null || payload === undefined) return false;
  if (typeof payload === 'object') {
    // Treat an all-null/empty audit {before:null, after:null} wrapper as empty.
    const values = Object.values(payload as Record<string, unknown>);
    if (values.length === 0) return false;
    return values.some((v) => v !== null && v !== undefined);
  }
  return true;
}

function prettyJson(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function formatWhen(iso: string): { display: string; iso: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { display: iso, iso };
  try {
    const display = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
    return { display, iso: date.toISOString() };
  } catch {
    return { display: date.toISOString(), iso: date.toISOString() };
  }
}

function StateNotice({ state, labels }: { state: FaHistoryPageState; labels: FaHistoryLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="p-6 text-sm text-slate-600">
        {labels.loading}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="p-6 text-sm text-red-700">
        {labels.error}
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="p-6 text-sm text-red-700">
        {labels.forbidden}
      </div>
    );
  }
  return null;
}

function HistoryRow({ row, labels }: { row: FaHistoryRow; labels: FaHistoryLabels }) {
  const when = formatWhen(row.occurredAt);
  const actor = row.actorName ?? labels.unknownActor;
  const showDetails = hasPayload(row.payload);

  return (
    <li
      data-testid={`fa-history-row-${row.id}`}
      data-event-type={row.eventType}
      data-source={row.source}
      className="flex items-start gap-3 border-b border-slate-100 py-3 last:border-b-0"
    >
      <span
        data-testid="fa-history-icon"
        aria-hidden="true"
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-700"
      >
        {eventIcon(row.eventType)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-900">
          <Badge variant="outline" aria-label={eventDisplayLabel(row.eventType, labels)}>
            {eventDisplayLabel(row.eventType, labels)}
          </Badge>
          <span className="font-mono text-xs text-slate-500">{row.eventType}</span>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          <time dateTime={when.iso} title={when.iso}>
            {when.display}
          </time>
          {' · '}
          <span className="font-medium text-slate-700">{actor}</span>
        </div>
        {showDetails ? (
          <details data-testid="fa-history-details" className="mt-2 text-xs">
            <summary
              role="button"
              className="cursor-pointer select-none text-slate-600 hover:text-slate-900"
            >
              {labels.detailsToggle}
            </summary>
            <pre
              data-testid="fa-history-payload"
              className="mt-2 overflow-auto rounded-md bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-700"
            >
              {prettyJson(row.payload)}
            </pre>
          </details>
        ) : null}
      </div>
    </li>
  );
}

export function FaHistoryTab({
  productCode,
  rows,
  labels,
  state = 'ready',
}: {
  productCode: string;
  rows: FaHistoryRow[];
  labels: FaHistoryLabels;
  state?: FaHistoryPageState;
}) {
  const [typeFilter, setTypeFilter] = React.useState('all');

  const dataLoaded = state === 'ready' || state === 'empty';

  // Distinct event types present, for the filter — driven by the real data set.
  const typeOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      if (!seen.has(row.eventType)) {
        seen.set(row.eventType, eventDisplayLabel(row.eventType, labels));
      }
    }
    return [
      { value: 'all', label: labels.filterAll },
      ...Array.from(seen.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [rows, labels]);

  const filtered = React.useMemo(
    () => (typeFilter === 'all' ? rows : rows.filter((r) => r.eventType === typeFilter)),
    [rows, typeFilter],
  );

  return (
    <section
      data-testid="fa-history-tab"
      aria-labelledby="fa-history-title"
      className="space-y-3"
    >
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="fa-history-title" className="text-base font-semibold text-slate-900">
              {labels.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">{labels.subtitle}</p>
          </div>
          {dataLoaded && rows.length > 0 ? (
            <div className="grid gap-1 text-xs font-medium text-slate-700">
              <span id="fa-history-filter-label">{labels.filterLabel}</span>
              <Select
                value={typeFilter}
                onValueChange={setTypeFilter}
                options={typeOptions}
                aria-labelledby="fa-history-filter-label"
              >
                <SelectTrigger aria-label={labels.filterLabel}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          {!dataLoaded ? (
            <StateNotice state={state} labels={labels} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="🕑"
              title={labels.empty}
              body={labels.emptyBody}
              action={
                <a href={`?tab=history`} aria-label={labels.title}>
                  {labels.title}
                </a>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="🔍"
              title={labels.emptyFiltered}
              body={labels.emptyFilteredBody}
              action={{ label: labels.clearFilter, onClick: () => setTypeFilter('all') }}
            />
          ) : (
            <ul aria-label={labels.title} className="divide-slate-100">
              {filtered.map((row) => (
                <HistoryRow key={row.id} row={row} labels={labels} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <span className="sr-only">{productCode}</span>
    </section>
  );
}

export default FaHistoryTab;

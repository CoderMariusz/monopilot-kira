'use client';

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Card, CardContent } from '@monopilot/ui/Card';

import { loadDocumentAuditTimeline } from '../../_actions/load-document-audit-timeline';
import type { DocumentAuditEntityType, DocumentAuditTimelineRow } from '../../_actions/document-audit-timeline.types';
import type { AuditTimelineLabels } from './audit-timeline-labels';

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

function prettyJson(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function hasPayload(payload: unknown): boolean {
  if (payload === null || payload === undefined) return false;
  if (typeof payload === 'object') {
    const values = Object.values(payload as Record<string, unknown>);
    if (values.length === 0) return false;
    return values.some((v) => v !== null && v !== undefined);
  }
  return true;
}

function TimelineRow({ row, labels }: { row: DocumentAuditTimelineRow; labels: AuditTimelineLabels }) {
  const when = formatWhen(row.occurredAt);
  const actor = row.actorName ?? labels.unknownActor;
  const showDetails = hasPayload(row.details);

  return (
    <li
      data-testid={`document-audit-row-${row.id}`}
      data-source={row.source}
      className="flex items-start gap-3 border-b border-slate-100 py-3 last:border-b-0"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-900">
          <Badge variant="outline">{labels.source[row.source]}</Badge>
          <span className="font-medium">{row.action}</span>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          <time dateTime={when.iso} title={when.iso}>
            {when.display}
          </time>
          {' · '}
          <span className="font-medium text-slate-700">{actor}</span>
        </div>
        {showDetails ? (
          <details data-testid="document-audit-details" className="mt-2 text-xs">
            <summary className="cursor-pointer select-none text-slate-600 hover:text-slate-900">
              {labels.detailsToggle}
            </summary>
            <pre
              data-testid="document-audit-payload"
              className="mt-2 overflow-auto rounded-md bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-700"
            >
              {prettyJson(row.details)}
            </pre>
          </details>
        ) : null}
      </div>
    </li>
  );
}

export function DocumentAuditTimelinePanel({
  entityType,
  entityId,
  initialRows,
  initialHasMore,
  labels,
}: {
  entityType: DocumentAuditEntityType;
  entityId: string;
  initialRows: DocumentAuditTimelineRow[];
  initialHasMore: boolean;
  labels: AuditTimelineLabels;
}) {
  const [rows, setRows] = React.useState(initialRows);
  const [hasMore, setHasMore] = React.useState(initialHasMore);
  const [loadingMore, setLoadingMore] = React.useState(false);

  React.useEffect(() => {
    setRows(initialRows);
    setHasMore(initialHasMore);
  }, [entityType, entityId, initialRows, initialHasMore]);

  async function onShowMore() {
    setLoadingMore(true);
    try {
      const result = await loadDocumentAuditTimeline({
        entityType,
        entityId,
        limit: 50,
        offset: rows.length,
      });
      if (!result.ok) return;
      setRows((prev) => [...prev, ...result.data.rows]);
      setHasMore(result.data.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <details
      data-testid="document-audit-timeline"
      className="group rounded-xl border border-slate-200 bg-white"
      open={rows.length > 0}
    >
      <summary className="cursor-pointer list-none px-4 py-3 marker:content-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{labels.title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{labels.subtitle}</p>
          </div>
          <span className="text-xs text-slate-400 group-open:rotate-180" aria-hidden>
            ▾
          </span>
        </div>
      </summary>
      <Card className="border-0 shadow-none">
        <CardContent className="px-4 pb-4 pt-0">
          {rows.length === 0 ? (
            <div data-testid="document-audit-empty" className="px-4 py-10 text-center text-sm text-slate-500">
              <p className="font-medium text-slate-700">{labels.empty}</p>
              <p className="mt-1 text-xs text-slate-500">{labels.emptyBody}</p>
            </div>
          ) : (
            <>
              <ul aria-label={labels.title}>
                {rows.map((row) => (
                  <TimelineRow key={row.id} row={row} labels={labels} />
                ))}
              </ul>
              {hasMore ? (
                <button
                  type="button"
                  data-testid="document-audit-show-more"
                  className="mt-3 text-sm font-medium text-sky-700 hover:underline disabled:opacity-60"
                  disabled={loadingMore}
                  onClick={() => void onShowMore()}
                >
                  {loadingMore ? labels.loadingMore : labels.showMore}
                </button>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </details>
  );
}

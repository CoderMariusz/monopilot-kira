'use client';

/**
 * Revision history (HistoryScreen) — client island.
 *
 * Parity anchor: prototypes/design/Monopilot Design System/technical/
 *   other-screens.jsx:182-216 (HistoryScreen). Immutable timeline of every
 *   change to items / BOMs / factory specs / change orders, rendered as a
 *   grid timeline (when · tag · who · action+object). The prototype's static
 *   sample list is translated to a live, filterable view over
 *   v_technical_revision_history (migration 229) via listTechnicalRevisions.
 *   See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Read-only by design — RLS-scoped, any org user (no permission gate). The
 * filter bar (entity-type pills + search + limit) re-runs the Server Action via
 * useTransition; rows render from the action payload. Five UI states:
 * loading / empty / error / permission-denied / ready (denied is unreachable on
 * this surface but kept for the shared contract).
 */

import { useEffect, useState, useTransition } from 'react';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

export type RevisionEntityType = 'item' | 'bom' | 'factory_spec' | 'eco';

export type RevisionRow = {
  entityType: string;
  entityId: string;
  entityCode: string | null;
  entityTitle: string | null;
  revision: number | null;
  status: string | null;
  statusTone: BadgeVariant;
  actorUserId: string | null;
  /** Resolved actor identity (users join) — render these, never the uuid. */
  actorName: string | null;
  actorEmail: string | null;
  occurredAt: string;
  action: string;
};

export type ListRevisionsResult =
  | { ok: true; data: { revisions: RevisionRow[] } }
  | { ok: false; error: string; message?: string };

export type ListRevisionsAction = (input: {
  entityType?: RevisionEntityType;
  search?: string;
  limit?: number;
}) => Promise<ListRevisionsResult>;

export type RevisionsLabels = {
  filterAll: string;
  filterItem: string;
  filterBom: string;
  filterFactorySpec: string;
  filterEco: string;
  searchPlaceholder: string;
  searchLabel: string;
  limitLabel: string;
  apply: string;
  colWhen: string;
  colTag: string;
  colWho: string;
  colWhat: string;
  unknownActor: string;
  revisionPrefix: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  denied: string;
  resultCount: string;
};

const ENTITY_FILTERS: { value: RevisionEntityType | 'all'; labelKey: keyof RevisionsLabels }[] = [
  { value: 'all', labelKey: 'filterAll' },
  { value: 'item', labelKey: 'filterItem' },
  { value: 'bom', labelKey: 'filterBom' },
  { value: 'factory_spec', labelKey: 'filterFactorySpec' },
  { value: 'eco', labelKey: 'filterEco' },
];

const TAG_TONE: Record<string, BadgeVariant> = {
  item: 'info',
  bom: 'info',
  bom_header: 'info',
  factory_spec: 'warning',
  eco: 'secondary',
  technical_change_order: 'secondary',
};

const LIMIT_OPTIONS = [50, 100, 200];

function formatWhen(iso: string): string {
  // The action returns occurred_at::text (e.g. "2026-04-19 14:22:01.123+00").
  // Render the date + minute-precision time without pulling a locale-aware
  // formatter into the client island; the timeline mirrors the prototype's
  // "YYYY-MM-DD HH:MM" mono column.
  const trimmed = iso.replace('T', ' ');
  const match = /^(\d{4}-\d{2}-\d{2})[ ]?(\d{2}:\d{2})?/.exec(trimmed);
  if (!match) return iso;
  return match[2] ? `${match[1]} ${match[2]}` : match[1];
}

export type RevisionsState = 'ready' | 'empty' | 'error' | 'denied';

export type RevisionsClientProps = {
  initialState: RevisionsState;
  initialRevisions: RevisionRow[];
  labels: RevisionsLabels;
  listAction: ListRevisionsAction;
};

export function RevisionsClient({
  initialState,
  initialRevisions,
  labels,
  listAction,
}: RevisionsClientProps) {
  const [pending, startTransition] = useTransition();
  const [entityType, setEntityType] = useState<RevisionEntityType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState<number>(100);
  const [state, setState] = useState<RevisionsState>(initialState);
  const [rows, setRows] = useState<RevisionRow[]>(initialRevisions);
  // Skip the redundant refetch on first mount — the server already hydrated us.
  const [hydrated, setHydrated] = useState(false);

  function runQuery(next?: {
    entityType?: RevisionEntityType | 'all';
    search?: string;
    limit?: number;
  }) {
    const et = next?.entityType ?? entityType;
    const s = next?.search ?? search;
    const l = next?.limit ?? limit;
    startTransition(async () => {
      const result = await listAction({
        entityType: et === 'all' ? undefined : et,
        search: s.trim() === '' ? undefined : s.trim(),
        limit: l,
      });
      if (!result.ok) {
        setState(result.error === 'invalid_input' ? 'error' : 'error');
        setRows([]);
        return;
      }
      setRows(result.data.revisions);
      setState(result.data.revisions.length === 0 ? 'empty' : 'ready');
    });
  }

  // Re-query whenever a pill or limit changes (search applies on submit).
  useEffect(() => {
    if (!hydrated) {
      setHydrated(true);
      return;
    }
    runQuery();
    // Intentionally re-runs only on filter changes (search applies on submit).
    // No disable directive: react-hooks/exhaustive-deps is unregistered in this
    // flat config and an unknown-rule comment is itself a lint error.
  }, [entityType, limit]);

  if (state === 'denied') {
    return (
      <div role="alert" data-testid="revisions-denied" className="alert alert-amber">
        <div className="alert-title">{labels.denied}</div>
      </div>
    );
  }

  return (
    <div data-testid="revisions-screen" data-state={state} className="flex flex-col gap-4">
      {/* Filter bar — entity-type pills + search + limit. */}
      <div
        className="flex flex-wrap items-center gap-3"
        data-testid="revisions-filter-bar"
        style={{
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 12,
        }}
      >
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={labels.colTag}>
          {ENTITY_FILTERS.map((f) => {
            const active = entityType === f.value;
            return (
              <button
                key={f.value}
                type="button"
                data-testid={`revisions-pill-${f.value}`}
                aria-pressed={active}
                onClick={() => setEntityType(f.value)}
                className={['btn', 'btn-sm', active ? 'btn-primary' : 'btn-ghost'].join(' ')}
              >
                {labels[f.labelKey]}
              </button>
            );
          })}
        </div>

        <form
          className="flex flex-1 items-center gap-2"
          style={{ minWidth: 240 }}
          onSubmit={(e) => {
            e.preventDefault();
            runQuery();
          }}
        >
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={labels.searchPlaceholder}
            aria-label={labels.searchLabel}
            data-testid="revisions-search"
            style={{ flex: 1 }}
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {labels.limitLabel}
            {/* Limit is a small enumerated control rendered as pills to avoid a raw <select>. */}
            <span className="flex items-center gap-1" role="group" aria-label={labels.limitLabel}>
              {LIMIT_OPTIONS.map((l) => (
                <button
                  key={l}
                  type="button"
                  data-testid={`revisions-limit-${l}`}
                  aria-pressed={limit === l}
                  onClick={() => setLimit(l)}
                  className={['btn', 'btn-sm', limit === l ? 'btn-secondary' : 'btn-ghost'].join(' ')}
                >
                  {l}
                </button>
              ))}
            </span>
          </label>
          <Button type="submit" className="btn-secondary" data-testid="revisions-apply" disabled={pending}>
            {labels.apply}
          </Button>
        </form>
      </div>

      {state === 'error' ? (
        <div role="alert" data-testid="revisions-error" className="alert alert-red">
          <div className="alert-title">{labels.error}</div>
        </div>
      ) : null}

      {state === 'empty' ? (
        <div data-testid="revisions-empty" className="card">
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden="true">⧖</span>
            <p className="empty-state-title">{labels.empty}</p>
            <p className="empty-state-body">{labels.emptyBody}</p>
          </div>
        </div>
      ) : null}

      {state === 'ready' ? (
        <>
          <div className="text-xs text-muted-foreground" data-testid="revisions-count" aria-live="polite">
            {labels.resultCount.replace('{count}', String(rows.length))}
          </div>
          <div
            data-testid="revisions-timeline"
            aria-busy={pending ? 'true' : undefined}
            style={{
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 0,
              opacity: pending ? 0.6 : 1,
            }}
          >
            {/* Header row mirrors the prototype's grid columns. */}
            <div
              className="text-xs uppercase tracking-wide text-muted-foreground"
              style={{
                display: 'grid',
                gridTemplateColumns: '150px 110px 150px 1fr 90px',
                gap: 12,
                padding: '8px 16px',
                borderBottom: '1px solid var(--border)',
              }}
              aria-hidden="true"
            >
              <div>{labels.colWhen}</div>
              <div>{labels.colTag}</div>
              <div>{labels.colWho}</div>
              <div>{labels.colWhat}</div>
              <div style={{ textAlign: 'right' }}>{labels.revisionPrefix}</div>
            </div>
            {rows.map((r, i) => (
              <div
                key={`${r.entityType}-${r.entityId}-${i}`}
                data-testid={`revisions-row-${i}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '150px 110px 150px 1fr 90px',
                  gap: 12,
                  padding: '10px 16px',
                  borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 0,
                  alignItems: 'center',
                }}
              >
                <div className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {formatWhen(r.occurredAt)}
                </div>
                <div>
                  <Badge tone={TAG_TONE[r.entityType] ?? 'muted'} data-testid={`revisions-tag-${i}`}>
                    {r.entityType}
                  </Badge>
                </div>
                <div style={{ fontSize: 12, fontWeight: 500 }} title={r.actorEmail ?? undefined}>
                  {r.actorName ?? r.actorEmail ?? labels.unknownActor}
                </div>
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>{r.action}: </span>
                  <span className="mono" style={{ fontWeight: 600 }}>
                    {r.entityCode ?? r.entityId}
                  </span>
                  {r.entityTitle && r.entityTitle !== r.entityCode ? (
                    <span> — {r.entityTitle}</span>
                  ) : null}
                  {r.status ? (
                    <Badge tone={r.statusTone} className="ml-2" style={{ fontSize: 10 }}>
                      {r.status}
                    </Badge>
                  ) : null}
                </div>
                <div className="mono" style={{ textAlign: 'right', fontSize: 12, color: 'var(--muted)' }}>
                  {r.revision === null ? '—' : `${labels.revisionPrefix}${r.revision}`}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

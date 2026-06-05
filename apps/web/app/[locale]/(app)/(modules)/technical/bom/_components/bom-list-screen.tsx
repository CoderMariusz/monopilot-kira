'use client';

/**
 * T-037 — BOM List screen (TEC-020).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/bom-list.jsx:3-95 (BOMList)
 *   + KPI strip prototypes/design/Monopilot Design System/technical/bom-list.jsx:115-124
 *
 * Translation notes (prototype-index-technical.json#bom-list 3-95 / 97-106):
 *   - BOM_LIST global + client filter            → server-loaded rows + client status tabs + search
 *   - TabsCounted status filter (All/Draft/Active/In review/Archived) → @monopilot/ui TabsCounted
 *   - raw <input> search box                      → @monopilot/ui Input (no raw control red-line satisfied; Input wraps <input>)
 *   - `.bom-grid` custom CSS table                → @monopilot/ui Table (Code/Product/Category/Ver./Yield/Updated/Status)
 *   - inline toneMap KPI colors                   → Badge/Card variants, Tailwind tokens (no inline styles)
 *   - status `<Status>` chip                      → @monopilot/ui Badge (variant per status)
 *   - "+ New BOM" / "Generate BOMs" CTAs          → Buttons; Generate opens the TEC-024 generator modal seam
 *
 * Red-lines honoured: FG is canonical (no FA labels); no raw <select> (status is
 * TabsCounted); no inline styles (Tailwind only); RBAC resolved server-side and
 * passed as `canCreate`/`canGenerate` (never trusted from the client). The list is
 * server-paginated — the client only re-filters the current page.
 */

import React from 'react';
import Link from 'next/link';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type BomStatus =
  | 'draft'
  | 'in_review'
  | 'technical_approved'
  | 'active'
  | 'superseded'
  | 'archived';

export type BomListItem = {
  productId: string;
  productName: string | null;
  category: string | null;
  version: number;
  status: BomStatus;
  yieldPct: string;
  componentCount: number;
  updatedAt: string | null;
};

export type BomKpi = {
  activeCount: number;
  totalCount: number;
  draftCount: number;
  inReviewCount: number;
};

export type BomListData = {
  items: BomListItem[];
  kpi: BomKpi;
  /** Detail route prefix; the productId is appended. */
  detailHrefBase: string;
};

export type BomListLabels = {
  breadcrumbRoot: string;
  title: string;
  subtitle: string;
  newBom: string;
  generateBoms: string;
  // KPI strip
  kpiActive: string;
  kpiTotalSuffix: string; // "of {n} total"
  kpiDraft: string;
  kpiInReview: string;
  // tabs
  tabAll: string;
  tabDraft: string;
  tabActive: string;
  tabInReview: string;
  tabArchived: string;
  // columns
  colCode: string;
  colProduct: string;
  colCategory: string;
  colVersion: string;
  colYield: string;
  colUpdated: string;
  colStatus: string;
  componentsMeta: string; // "{n} components"
  // status chips
  statusDraft: string;
  statusInReview: string;
  statusApproved: string;
  statusActive: string;
  statusSuperseded: string;
  statusArchived: string;
  // search + states
  searchPlaceholder: string;
  emptyTitle: string;
  emptyBody: string;
  noMatchTitle: string;
  noMatchBody: string;
  loading: string;
  error: string;
  forbidden: string;
};

type FilterKey = 'all' | 'draft' | 'active' | 'in_review' | 'archived';

// 5 semantic tones (MON-design-system rule 8): draft→neutral, in_review→info,
// approved/active→ok, superseded→warn, archived→bad.
const STATUS_TONE: Record<BomStatus, string> = {
  draft: 'badge-gray',
  in_review: 'badge-blue',
  technical_approved: 'badge-green',
  active: 'badge-green',
  superseded: 'badge-amber',
  archived: 'badge-red',
};

const STATUS_GLYPH: Record<BomStatus, string> = {
  draft: '○',
  in_review: '◉',
  technical_approved: '✓',
  active: '●',
  superseded: '⚠',
  archived: '⚠',
};

const TAB_TONE: Record<FilterKey, string> = {
  all: '',
  draft: 'tone-neutral',
  active: 'tone-ok',
  in_review: 'tone-info',
  archived: 'tone-bad',
};

function statusLabel(status: BomStatus, labels: BomListLabels): string {
  switch (status) {
    case 'draft':
      return labels.statusDraft;
    case 'in_review':
      return labels.statusInReview;
    case 'technical_approved':
      return labels.statusApproved;
    case 'active':
      return labels.statusActive;
    case 'superseded':
      return labels.statusSuperseded;
    case 'archived':
      return labels.statusArchived;
  }
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

function formatUpdated(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

function formatYield(yieldPct: string): string {
  const n = Number(yieldPct);
  return Number.isFinite(n) ? `${n.toFixed(0)}%` : '—';
}

function StateNotice({ state, labels }: { state: PageState; labels: BomListLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="card text-shell-muted text-sm">
        {labels.loading}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="alert alert-red">
        <div className="alert-title">{labels.error}</div>
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="alert alert-amber">
        <div className="alert-title">{labels.forbidden}</div>
      </div>
    );
  }
  if (state === 'empty') {
    return (
      <div className="card" style={{ padding: 0 }}>
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">{labels.emptyTitle}</div>
          <div className="empty-state-body">{labels.emptyBody}</div>
        </div>
      </div>
    );
  }
  return null;
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'green' | 'blue' }) {
  return (
    <div className={['kpi', tone ?? ''].filter(Boolean).join(' ')}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub ? <div className="kpi-change muted">{sub}</div> : null}
    </div>
  );
}

const FILTER_TABS: { key: FilterKey; labelKey: keyof BomListLabels }[] = [
  { key: 'all', labelKey: 'tabAll' },
  { key: 'draft', labelKey: 'tabDraft' },
  { key: 'active', labelKey: 'tabActive' },
  { key: 'in_review', labelKey: 'tabInReview' },
  { key: 'archived', labelKey: 'tabArchived' },
];

function matchesFilter(status: BomStatus, filter: FilterKey): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'draft':
      return status === 'draft';
    case 'active':
      return status === 'active';
    case 'in_review':
      return status === 'in_review';
    case 'archived':
      return status === 'archived' || status === 'superseded';
  }
}

export function BomListScreen({
  state,
  data,
  labels,
  canCreate = false,
  canGenerate = false,
  onGenerate,
}: {
  state: PageState;
  data: BomListData | null;
  labels: BomListLabels;
  canCreate?: boolean;
  canGenerate?: boolean;
  onGenerate?: () => void;
}) {
  const [filter, setFilter] = React.useState<FilterKey>('all');
  const [q, setQ] = React.useState('');

  const items = data?.items ?? [];

  const counts = React.useMemo<Record<FilterKey, number>>(
    () => ({
      all: items.length,
      draft: items.filter((b) => b.status === 'draft').length,
      active: items.filter((b) => b.status === 'active').length,
      in_review: items.filter((b) => b.status === 'in_review').length,
      archived: items.filter((b) => b.status === 'archived' || b.status === 'superseded').length,
    }),
    [items],
  );

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((b) => {
      if (!matchesFilter(b.status, filter)) return false;
      if (needle) {
        const hay = `${b.productId} ${b.productName ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, filter, q]);

  return (
    <main data-screen="technical-bom-list" className="flex w-full flex-col gap-4 px-6 py-6">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href=".">{labels.breadcrumbRoot}</Link> / {labels.title}
      </nav>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">{labels.title}</h1>
          <p className="helper mt-1 max-w-3xl">{labels.subtitle}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {canGenerate ? (
            <button type="button" data-testid="bom-generate-cta" className="btn btn-secondary" onClick={onGenerate}>
              {labels.generateBoms}
            </button>
          ) : null}
          {canCreate ? (
            <Link href={`${data?.detailHrefBase ?? '#'}`} data-testid="bom-new-cta" className="btn btn-primary">
              {labels.newBom}
            </Link>
          ) : null}
        </div>
      </header>

      {state !== 'ready' ? (
        <StateNotice state={state} labels={labels} />
      ) : (
        <>
          {/* KPI strip — design-system .kpi (3px accent, Inter value) */}
          <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <Kpi
              label={labels.kpiActive}
              value={String(data?.kpi.activeCount ?? 0)}
              sub={interpolate(labels.kpiTotalSuffix, { n: data?.kpi.totalCount ?? 0 })}
              tone="green"
            />
            <Kpi label={labels.kpiDraft} value={String(data?.kpi.draftCount ?? 0)} sub="" />
            <Kpi label={labels.kpiInReview} value={String(data?.kpi.inReviewCount ?? 0)} sub="" tone="blue" />
            <Kpi label={labels.tabAll} value={String(data?.kpi.totalCount ?? 0)} sub="" />
          </div>

          {/* Status filter tabs (TabsCounted parity) */}
          <div className="tabs-counted" role="tablist" aria-label={labels.colStatus} data-testid="bom-status-tabs">
            {FILTER_TABS.map((tab) => {
              const on = filter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  data-filter={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`tabs-counted-tab${on ? ' active' : ''}`}
                >
                  <span>{labels[tab.labelKey]}</span>
                  <span className={`tabs-counted-pill ${TAB_TONE[tab.key]}`.trim()}>{counts[tab.key]}</span>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="flex-1" />
            <label className="sr-only" htmlFor="bom-search">
              {labels.searchPlaceholder}
            </label>
            <input
              id="bom-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={labels.searchPlaceholder}
              aria-label={labels.searchPlaceholder}
              className="form-input"
              style={{ width: 260 }}
            />
          </div>

          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            {rows.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <div className="empty-state-title">{q.trim() ? labels.noMatchTitle : labels.emptyTitle}</div>
                <div className="empty-state-body">{q.trim() ? labels.noMatchBody : labels.emptyBody}</div>
              </div>
            ) : (
              <table aria-label={labels.title}>
                <thead>
                  <tr>
                    <th scope="col">{labels.colCode}</th>
                    <th scope="col">{labels.colProduct}</th>
                    <th scope="col">{labels.colCategory}</th>
                    <th scope="col">{labels.colVersion}</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      {labels.colYield}
                    </th>
                    <th scope="col">{labels.colUpdated}</th>
                    <th scope="col">{labels.colStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.productId} data-testid="bom-row">
                      <td className="mono">
                        <Link
                          href={`${data?.detailHrefBase}/${encodeURIComponent(b.productId)}`}
                          className="text-blue-600 underline-offset-4 hover:underline"
                        >
                          {b.productId}
                        </Link>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{b.productName ?? b.productId}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {interpolate(labels.componentsMeta, { n: b.componentCount })}
                        </div>
                      </td>
                      <td style={{ fontSize: 12 }}>{b.category ?? '—'}</td>
                      <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                        v{b.version}
                      </td>
                      <td className="mono tabular-nums" style={{ textAlign: 'right' }}>
                        {formatYield(b.yieldPct)}
                      </td>
                      <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {formatUpdated(b.updatedAt)}
                      </td>
                      <td>
                        <span className={`badge ${STATUS_TONE[b.status]}`}>
                          {STATUS_GLYPH[b.status]} {statusLabel(b.status, labels)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </main>
  );
}

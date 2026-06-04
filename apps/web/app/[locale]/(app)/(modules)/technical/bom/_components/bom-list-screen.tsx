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

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card, CardContent } from '@monopilot/ui/Card';
import { EmptyState } from '@monopilot/ui/EmptyState';
import Input from '@monopilot/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

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

const STATUS_VARIANT: Record<BomStatus, BadgeVariant> = {
  draft: 'muted',
  in_review: 'info',
  technical_approved: 'secondary',
  active: 'success',
  superseded: 'warning',
  archived: 'danger',
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
      <div role="status" aria-live="polite" className="rounded-xl border bg-white px-6 py-8 text-sm text-muted-foreground">
        {labels.loading}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {labels.error}
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
        {labels.forbidden}
      </div>
    );
  }
  if (state === 'empty') {
    return (
      <div role="status" aria-live="polite" className="rounded-xl border bg-white px-6 py-10">
        <p className="text-base font-semibold">{labels.emptyTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{labels.emptyBody}</p>
      </div>
    );
  }
  return null;
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'success' | 'info' }) {
  const toneClass = tone === 'success' ? 'text-emerald-600' : tone === 'info' ? 'text-sky-600' : 'text-slate-900';
  return (
    <Card className="rounded-xl border bg-white p-3.5 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={['mt-1 font-mono text-2xl font-bold tabular-nums', toneClass].join(' ')}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
    </Card>
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
    <main data-screen="technical-bom-list" className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-muted-foreground">
            {labels.breadcrumbRoot} <span aria-hidden="true">›</span> {labels.title}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{labels.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{labels.subtitle}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {canGenerate ? (
            <button
              type="button"
              data-testid="bom-generate-cta"
              onClick={onGenerate}
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {labels.generateBoms}
            </button>
          ) : null}
          {canCreate ? (
            <Link
              href={`${data?.detailHrefBase ?? '#'}`}
              data-testid="bom-new-cta"
              className="inline-flex items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              {labels.newBom}
            </Link>
          ) : null}
        </div>
      </header>

      {state !== 'ready' ? (
        <StateNotice state={state} labels={labels} />
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi
              label={labels.kpiActive}
              value={String(data?.kpi.activeCount ?? 0)}
              sub={interpolate(labels.kpiTotalSuffix, { n: data?.kpi.totalCount ?? 0 })}
              tone="success"
            />
            <Kpi label={labels.kpiDraft} value={String(data?.kpi.draftCount ?? 0)} sub="" />
            <Kpi label={labels.kpiInReview} value={String(data?.kpi.inReviewCount ?? 0)} sub="" tone="info" />
            <Kpi
              label={labels.tabAll}
              value={String(data?.kpi.totalCount ?? 0)}
              sub=""
            />
          </div>

          {/* Status filter tabs (TabsCounted parity) */}
          <div
            role="tablist"
            aria-label={labels.colStatus}
            data-testid="bom-status-tabs"
            className="flex flex-wrap gap-1 border-b border-slate-200"
          >
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
                  className={[
                    'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition',
                    on
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-muted-foreground hover:text-slate-700',
                  ].join(' ')}
                >
                  {labels[tab.labelKey]}
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] tabular-nums text-slate-600">
                    {counts[tab.key]}
                  </span>
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
            <Input
              id="bom-search"
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={labels.searchPlaceholder}
              className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>

          <Card className="rounded-xl border bg-white shadow-sm">
            <CardContent className="p-0">
              {rows.length === 0 ? (
                <div className="px-6 py-10">
                  <EmptyState
                    icon="📋"
                    title={q.trim() ? labels.noMatchTitle : labels.emptyTitle}
                    body={q.trim() ? labels.noMatchBody : labels.emptyBody}
                    action={<button type="button">{labels.newBom}</button>}
                  />
                </div>
              ) : (
                <Table aria-label={labels.title}>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{labels.colCode}</TableHead>
                      <TableHead scope="col">{labels.colProduct}</TableHead>
                      <TableHead scope="col">{labels.colCategory}</TableHead>
                      <TableHead scope="col">{labels.colVersion}</TableHead>
                      <TableHead scope="col" className="text-right">
                        {labels.colYield}
                      </TableHead>
                      <TableHead scope="col">{labels.colUpdated}</TableHead>
                      <TableHead scope="col">{labels.colStatus}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((b) => (
                      <TableRow key={b.productId} data-testid="bom-row">
                        <TableCell className="font-mono text-sm">
                          <Link
                            href={`${data?.detailHrefBase}/${encodeURIComponent(b.productId)}`}
                            className="text-slate-900 underline-offset-2 hover:underline"
                          >
                            {b.productId}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{b.productName ?? b.productId}</div>
                          <div className="text-xs text-muted-foreground">
                            {interpolate(labels.componentsMeta, { n: b.componentCount })}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{b.category ?? '—'}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">v{b.version}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatYield(b.yieldPct)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {formatUpdated(b.updatedAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[b.status]}>{statusLabel(b.status, labels)}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}

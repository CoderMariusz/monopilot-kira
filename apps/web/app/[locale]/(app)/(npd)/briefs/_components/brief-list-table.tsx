'use client';

/**
 * T-119 — Brief list table (NPD briefs).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/brief-screens.jsx:7-82 (BriefList)
 *
 * Translation notes (from the prototype / prototype-index-npd.json#brief_list):
 *   - window.NPD_BRIEFS in-memory filter → server-side withOrgContext read of
 *     public.brief joined to public.npd_projects (page.tsx); filters kept client-side.
 *   - statusBadge helper              → BriefStatusBadge (shadcn Badge variants).
 *   - row click → onOpenBrief(id)     → next/link row navigation to /<locale>/briefs/[briefId]
 *     (T-121 wiring: detail route consolidated under briefs/[briefId]; locale-prefixed).
 *   - openModal('briefCreate')        → router.push(?modal=briefCreate); gated by canCreate.
 *   - Convert (status==='complete')   → router.push(?modal=briefConvert&brief=…); gated by canConvert.
 *   - raw <select> status/template    → shadcn Select (raw <select> is a red-line).
 *   - Linked FA column (e2e-spine patch) → Linked PROJECT: DEV-NNN + current_gate,
 *     links to the Stage-Gate project detail (/pipeline/[projectId]), never an FA.
 *   - EmptyState (§3.8)               → shadcn EmptyState with clear-filters action.
 *
 * RBAC: `canCreate` / `canConvert` are resolved server-side (page.tsx) and never
 * trusted from the client — the actions are omitted entirely when false (no
 * render-then-disable, no info leak).
 */

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type BriefStatus = 'draft' | 'complete' | 'converted' | 'abandoned';
export type BriefTemplate = 'single_component' | 'multi_component';
export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type BriefListRow = {
  briefId: string;
  devCode: string;
  productName: string | null;
  template: BriefTemplate | string;
  status: BriefStatus | string;
  createdAt: string | null;
  owner: string | null;
  /** e2e-spine: linked Stage-Gate project (canonical next artefact, not FA). */
  projectCode: string | null;
  projectGate: string | null;
  projectId: string | null;
};

export type BriefListLabels = {
  title: string;
  subtitle: string;
  createBrief: string;
  searchPlaceholder: string;
  filterStatus: string;
  filterTemplate: string;
  clearFilters: string;
  statusAll: string;
  templateAll: string;
  colDevCode: string;
  colProductName: string;
  colTemplate: string;
  colStatus: string;
  colLinkedProject: string;
  colCreated: string;
  colOwner: string;
  colActions: string;
  open: string;
  convert: string;
  templateSingle: string;
  templateMulti: string;
  statusDraft: string;
  statusComplete: string;
  statusConverted: string;
  statusAbandoned: string;
  noProject: string;
  noOwner: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
};

const STATUS_VALUES: BriefStatus[] = ['draft', 'complete', 'converted', 'abandoned'];
const TEMPLATE_VALUES: BriefTemplate[] = ['single_component', 'multi_component'];

const SUPPORTED_LOCALES = new Set(['pl', 'en', 'uk', 'ro']);

/**
 * T-121 (wiring): derive the active locale segment from the pathname so row links
 * resolve directly to `/<locale>/briefs/<id>` (next-intl localePrefix='always')
 * instead of relying on a redirect hop.
 */
function localePrefixFrom(pathname: string | null): string {
  const segment = (pathname ?? '/').split('/')[1] ?? '';
  return SUPPORTED_LOCALES.has(segment) ? `/${segment}` : '';
}

function statusLabel(status: string, labels: BriefListLabels): string {
  switch (status) {
    case 'complete':
      return labels.statusComplete;
    case 'converted':
      return labels.statusConverted;
    case 'abandoned':
      return labels.statusAbandoned;
    default:
      return labels.statusDraft;
  }
}

function templateLabel(template: string, labels: BriefListLabels): string {
  return template === 'multi_component' ? labels.templateMulti : labels.templateSingle;
}

/**
 * Status pill — design-system 5-tone badge (`.badge .badge-*`), color paired with
 * text (a11y: color is never the sole signal). The `@monopilot/ui` Badge emits an
 * unstyled BEM `badge--*` that has no token mapping in globals.css, so the
 * design-system `badge-{tone}` class is applied directly (presentation-only fix).
 */
function statusBadgeTone(status: string): string {
  switch (status) {
    case 'complete':
      return 'badge-amber';
    case 'converted':
      return 'badge-green';
    default:
      return 'badge-gray';
  }
}

function BriefStatusBadge({ status, labels }: { status: string; labels: BriefListLabels }) {
  const text = statusLabel(status, labels);
  return (
    <span data-slot="badge" className={`badge ${statusBadgeTone(status)}`} aria-label={text}>
      {text}
    </span>
  );
}

function StateNotice({ state, labels }: { state: PageState; labels: BriefListLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="muted" style={{ padding: '24px', fontSize: 13 }}>
        {labels.loading}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="alert alert-red" style={{ margin: 16 }}>
        {labels.error}
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="alert alert-red" style={{ margin: 16 }}>
        {labels.forbidden}
      </div>
    );
  }
  return null;
}

export function BriefListTable({
  rows,
  labels,
  canCreate,
  canConvert = false,
  state = 'ready',
}: {
  rows: BriefListRow[];
  labels: BriefListLabels;
  canCreate: boolean;
  canConvert?: boolean;
  state?: PageState;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const localePrefix = localePrefixFrom(pathname);
  const briefHref = (briefId: string) => `${localePrefix}/briefs/${briefId}`;

  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [templateFilter, setTemplateFilter] = React.useState('all');

  const filtered = React.useMemo(() => {
    return rows.filter((row) => {
      if (search) {
        const haystack = `${row.devCode} ${row.productName ?? ''}`.toLowerCase();
        if (!haystack.includes(search.toLowerCase())) return false;
      }
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (templateFilter !== 'all' && row.template !== templateFilter) return false;
      return true;
    });
  }, [rows, search, statusFilter, templateFilter]);

  function clearFilters() {
    setSearch('');
    setStatusFilter('all');
    setTemplateFilter('all');
  }

  function openModal(modal: string, extra?: Record<string, string>) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('modal', modal);
    if (extra) {
      for (const [key, value] of Object.entries(extra)) params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const statusOptions = [
    { value: 'all', label: labels.statusAll },
    ...STATUS_VALUES.map((value) => ({ value, label: statusLabel(value, labels) })),
  ];
  const templateOptions = [
    { value: 'all', label: labels.templateAll },
    ...TEMPLATE_VALUES.map((value) => ({ value, label: templateLabel(value, labels) })),
  ];

  return (
    <main data-testid="brief-list-screen" aria-labelledby="brief-list-title">
      <nav aria-label="breadcrumb" className="breadcrumb">
        NPD / {labels.title}
      </nav>
      <header className="page-head" data-region="page-head">
        <div>
          <h1 id="brief-list-title" className="page-title">
            {labels.title}
          </h1>
          <p className="muted" style={{ fontSize: 12 }}>
            {filtered.length} of {rows.length} visible · {labels.subtitle}
          </p>
        </div>
        {canCreate ? (
          <Button
            type="button"
            className="btn-primary"
            aria-label={labels.createBrief}
            onClick={() => openModal('briefCreate')}
          >
            {labels.createBrief}
          </Button>
        ) : null}
      </header>

      {/* Filter region above the table — prototype lines 46-56 (search + status + template). */}
      <section
        className="card"
        style={{ padding: '10px 14px' }}
        aria-labelledby="brief-list-title"
        role="group"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="ff" style={{ flex: '1 1 240px', marginBottom: 0 }}>
            <label htmlFor="brief-list-search">{labels.searchPlaceholder}</label>
            <input
              id="brief-list-search"
              type="search"
              className="form-input"
              placeholder={labels.searchPlaceholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="ff" style={{ marginBottom: 0 }}>
            <label id="brief-list-status-label">{labels.filterStatus}</label>
            <Select value={statusFilter} onValueChange={setStatusFilter} options={statusOptions}>
              <SelectTrigger aria-label={labels.filterStatus}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ff" style={{ marginBottom: 0 }}>
            <label id="brief-list-template-label">{labels.filterTemplate}</label>
            <Select
              value={templateFilter}
              onValueChange={setTemplateFilter}
              options={templateOptions}
            >
              <SelectTrigger aria-label={labels.filterTemplate}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {templateOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" className="btn-secondary" onClick={clearFilters}>
            {labels.clearFilters}
          </Button>
        </div>
      </section>

      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {state !== 'ready' && state !== 'empty' ? (
          <StateNotice state={state} labels={labels} />
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📝</div>
            <div className="empty-state-title">{labels.empty}</div>
            <div className="empty-state-body">{labels.emptyBody}</div>
            <div className="empty-state-action">
              <Button type="button" className="btn-primary" onClick={clearFilters}>
                {labels.clearFilters}
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-auto">
            <Table aria-label={labels.title} className="w-full text-left">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="px-3 py-3">
                    {labels.colDevCode}
                  </TableHead>
                  <TableHead scope="col" className="px-3 py-3">
                    {labels.colProductName}
                  </TableHead>
                  <TableHead scope="col" className="px-3 py-3">
                    {labels.colTemplate}
                  </TableHead>
                  <TableHead scope="col" className="px-3 py-3">
                    {labels.colStatus}
                  </TableHead>
                  <TableHead scope="col" className="px-3 py-3">
                    {labels.colLinkedProject}
                  </TableHead>
                  <TableHead scope="col" className="px-3 py-3">
                    {labels.colCreated}
                  </TableHead>
                  <TableHead scope="col" className="px-3 py-3">
                    {labels.colOwner}
                  </TableHead>
                  <TableHead scope="col" className="px-3 py-3">
                    {labels.colActions}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => {
                  const status = String(row.status ?? 'draft');
                  return (
                    <TableRow
                      key={row.briefId}
                      data-testid={`brief-list-row-${row.devCode}`}
                      data-status={status}
                    >
                      <TableCell className="mono">
                        <Link href={briefHref(row.briefId)} prefetch style={{ color: 'var(--blue)' }}>
                          {row.devCode}
                        </Link>
                      </TableCell>
                      <TableCell style={{ fontWeight: 500 }}>
                        {row.productName ?? <span className="muted">—</span>}
                      </TableCell>
                      <TableCell>
                        <span
                          data-slot="badge"
                          className={`badge ${row.template === 'multi_component' ? 'badge-blue' : 'badge-gray'}`}
                        >
                          {templateLabel(String(row.template), labels)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <BriefStatusBadge status={status} labels={labels} />
                      </TableCell>
                      <TableCell className="mono">
                        {row.projectCode && row.projectId ? (
                          <Link href={`/pipeline/${row.projectId}`} prefetch style={{ color: 'var(--blue)' }}>
                            {row.projectCode}
                            {row.projectGate ? (
                              <span className="muted" style={{ marginLeft: 4 }}>
                                · {row.projectGate}
                              </span>
                            ) : null}
                          </Link>
                        ) : (
                          <span className="muted">{labels.noProject}</span>
                        )}
                      </TableCell>
                      <TableCell className="mono">
                        {row.createdAt ?? <span className="muted">—</span>}
                      </TableCell>
                      <TableCell>
                        {row.owner ?? <span className="muted">{labels.noOwner}</span>}
                      </TableCell>
                      <TableCell style={{ whiteSpace: 'nowrap' }}>
                        <div className="flex items-center gap-2">
                          <Link href={briefHref(row.briefId)} prefetch className="btn btn-ghost btn-sm">
                            {labels.open}
                          </Link>
                          {status === 'complete' && canConvert ? (
                            <Button
                              type="button"
                              className="btn-secondary btn-sm"
                              aria-label={labels.convert}
                              onClick={() => openModal('briefConvert', { brief: row.briefId })}
                            >
                              {labels.convert}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </main>
  );
}

export default BriefListTable;

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
 *   - row click → onOpenBrief(id)     → next/link row navigation to /briefs/[briefId].
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

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { EmptyState } from '@monopilot/ui/EmptyState';
import Input from '@monopilot/ui/Input';
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

function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'complete':
      return 'warning';
    case 'converted':
      return 'success';
    case 'abandoned':
      return 'muted';
    default:
      return 'muted';
  }
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

/** Status pill — color is paired with text (a11y: color is never the sole signal). */
function BriefStatusBadge({ status, labels }: { status: string; labels: BriefListLabels }) {
  const text = statusLabel(status, labels);
  return (
    <Badge variant={statusVariant(status)} aria-label={text}>
      {text}
    </Badge>
  );
}

function StateNotice({ state, labels }: { state: PageState; labels: BriefListLabels }) {
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
    <main
      data-testid="brief-list-screen"
      aria-labelledby="brief-list-title"
      className="mx-auto w-full max-w-7xl space-y-4 p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-4" data-region="page-head">
        <div>
          <nav aria-label="breadcrumb" className="text-xs text-slate-500">
            NPD / {labels.title}
          </nav>
          <h1
            id="brief-list-title"
            className="mt-1 text-2xl font-bold tracking-tight text-slate-950"
          >
            {labels.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {labels.subtitle} · {filtered.length}/{rows.length}
          </p>
        </div>
        {canCreate ? (
          <Button
            type="button"
            aria-label={labels.createBrief}
            onClick={() => openModal('briefCreate')}
          >
            {labels.createBrief}
          </Button>
        ) : null}
      </header>

      {/* Filter region above the table — prototype lines 39-49 (search + status + template). */}
      <section
        className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
        aria-labelledby="brief-list-title"
        role="group"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid flex-1 gap-1 text-sm font-medium text-slate-700">
            <label htmlFor="brief-list-search">{labels.searchPlaceholder}</label>
            <Input
              id="brief-list-search"
              type="search"
              placeholder={labels.searchPlaceholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="grid gap-1 text-sm font-medium text-slate-700">
            <span id="brief-list-status-label">{labels.filterStatus}</span>
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
          <div className="grid gap-1 text-sm font-medium text-slate-700">
            <span id="brief-list-template-label">{labels.filterTemplate}</span>
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
          <Button type="button" onClick={clearFilters}>
            {labels.clearFilters}
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {state !== 'ready' && state !== 'empty' ? (
          <StateNotice state={state} labels={labels} />
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon="📝"
              title={labels.empty}
              body={labels.emptyBody}
              action={{ label: labels.clearFilters, onClick: clearFilters }}
            />
          </div>
        ) : (
          <div className="overflow-auto">
            <Table aria-label={labels.title} className="w-full border-collapse text-left text-sm">
              <TableHeader className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
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
              <TableBody className="divide-y divide-slate-100">
                {filtered.map((row) => {
                  const status = String(row.status ?? 'draft');
                  return (
                    <TableRow
                      key={row.briefId}
                      data-testid={`brief-list-row-${row.devCode}`}
                      data-status={status}
                      className="align-middle hover:bg-slate-50"
                    >
                      <TableCell className="px-3 py-2 font-mono text-xs">
                        <Link
                          href={`/briefs/${row.briefId}`}
                          prefetch
                          className="text-blue-600 hover:underline"
                        >
                          {row.devCode}
                        </Link>
                      </TableCell>
                      <TableCell className="px-3 py-2 font-medium text-slate-950">
                        {row.productName ?? <span className="muted text-slate-400">—</span>}
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <Badge variant={row.template === 'multi_component' ? 'info' : 'muted'}>
                          {templateLabel(String(row.template), labels)}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <BriefStatusBadge status={status} labels={labels} />
                      </TableCell>
                      <TableCell className="px-3 py-2 font-mono text-xs">
                        {row.projectCode && row.projectId ? (
                          <Link
                            href={`/pipeline/${row.projectId}`}
                            prefetch
                            className="text-blue-600 hover:underline"
                          >
                            {row.projectCode}
                            {row.projectGate ? (
                              <span className="ml-1 text-slate-500">· {row.projectGate}</span>
                            ) : null}
                          </Link>
                        ) : (
                          <span className="muted text-slate-400">{labels.noProject}</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-2 font-mono text-xs text-slate-600">
                        {row.createdAt ?? <span className="muted text-slate-400">—</span>}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-slate-700">
                        {row.owner ?? <span className="muted text-slate-400">{labels.noOwner}</span>}
                      </TableCell>
                      <TableCell className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/briefs/${row.briefId}`}
                            prefetch
                            className="text-sm text-blue-600 hover:underline"
                          >
                            {labels.open}
                          </Link>
                          {status === 'complete' && canConvert ? (
                            <Button
                              type="button"
                              aria-label={labels.convert}
                              onClick={() =>
                                openModal('briefConvert', { brief: row.briefId })
                              }
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

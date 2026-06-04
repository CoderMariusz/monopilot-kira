'use client';

/**
 * T-019 — FA list table (Factory Articles).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:177-297 (FAList)
 *
 * Translation notes (from the prototype):
 *   - window.NPD_FAS                 → server-side withOrgContext read of public.product (page.tsx)
 *   - openModal('faCreate')          → router.push(?modal=faCreate); the FaCreateHost
 *                                       (mounted by page.tsx) maps that URL state to the
 *                                       injected FaCreateModal (G-1 wiring); gated by
 *                                       server-supplied canCreate
 *   - onOpenFA(code)                 → next/link row navigation to /(npd)/fa/[productCode]
 *   - inline status badge helper     → shadcn Badge variants (status pill)
 *   - dept ✓/◐/⊘/– glyphs            → accessible dept indicator (icon + sr-only label, color is never sole signal)
 *   - raw <select> dept/status       → shadcn Select (raw <select> is a red-line)
 *   - search/dept/status local state → kept client-side; URL-persistence handled in page.tsx defaults
 *
 * RBAC: `canCreate` is resolved server-side (page.tsx) and never trusted from the
 * client — the Create button is omitted entirely when false (no render-then-disable).
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

export type FaStatusOverall = 'Built' | 'Complete' | 'Alert' | 'InProgress' | 'Pending';
export type DeptState = 'done' | 'inprog' | 'blocked' | 'pending';
export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type FaDeptStates = {
  core: DeptState;
  planning: DeptState;
  commercial: DeptState;
  production: DeptState;
  technical: DeptState;
  mrp: DeptState;
  procurement: DeptState;
};

export type FaListRow = {
  productCode: string;
  productName: string | null;
  packSize: string | null;
  statusOverall: FaStatusOverall | string | null;
  launchDate?: string | null;
  daysToLaunch: number | null;
  built: boolean;
  dept: FaDeptStates;
};

export type FaListLabels = {
  title: string;
  subtitle: string;
  createFa: string;
  searchPlaceholder: string;
  filterDept: string;
  filterStatus: string;
  clearFilters: string;
  showClosed: string;
  deptAll: string;
  statusAll: string;
  colProductCode: string;
  colProductName: string;
  colPackSize: string;
  colStatus: string;
  colLaunch: string;
  colDaysToLaunch: string;
  colBuilt: string;
  colActions: string;
  open: string;
  deptCore: string;
  deptPlanning: string;
  deptCommercial: string;
  deptProduction: string;
  deptTechnical: string;
  deptMrp: string;
  deptProcurement: string;
  statusBuilt: string;
  statusComplete: string;
  statusAlert: string;
  statusInProgress: string;
  statusPending: string;
  noDate: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
};

const DEPT_KEYS: Array<{ key: keyof FaDeptStates; label: keyof FaListLabels }> = [
  { key: 'core', label: 'deptCore' },
  { key: 'planning', label: 'deptPlanning' },
  { key: 'commercial', label: 'deptCommercial' },
  { key: 'production', label: 'deptProduction' },
  { key: 'technical', label: 'deptTechnical' },
  { key: 'mrp', label: 'deptMrp' },
  { key: 'procurement', label: 'deptProcurement' },
];

const STATUS_VALUES: FaStatusOverall[] = ['Pending', 'InProgress', 'Alert', 'Complete', 'Built'];

function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'Complete':
      return 'success';
    case 'Built':
      return 'info';
    case 'InProgress':
      return 'warning';
    case 'Alert':
      return 'danger';
    default:
      return 'muted';
  }
}

function statusLabel(status: string, labels: FaListLabels): string {
  switch (status) {
    case 'Built':
      return labels.statusBuilt;
    case 'Complete':
      return labels.statusComplete;
    case 'Alert':
      return labels.statusAlert;
    case 'InProgress':
      return labels.statusInProgress;
    default:
      return labels.statusPending;
  }
}

/** Dept readiness indicator — color is paired with a glyph + sr-only label (a11y). */
function DeptIndicator({ state, label }: { state: DeptState; label: string }) {
  const glyph = state === 'done' ? '✓' : state === 'inprog' ? '◐' : state === 'blocked' ? '⊘' : '–';
  const tone =
    state === 'done'
      ? 'text-emerald-600'
      : state === 'inprog'
        ? 'text-amber-700'
        : state === 'blocked'
          ? 'text-red-600'
          : 'text-slate-300';
  return (
    <span className={`font-semibold ${tone}`} data-dept-state={state}>
      <span aria-hidden="true">{glyph}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function DaysCell({ days, labels }: { days: number | null; labels: FaListLabels }) {
  if (days === null || days === undefined) {
    return <span className="muted text-slate-500">{labels.noDate}</span>;
  }
  const tone = days <= 10 ? 'text-red-600' : days <= 21 ? 'text-amber-700' : 'text-slate-600';
  const weight = days <= 21 ? 'font-semibold' : '';
  const text = days < 0 ? `overdue ${Math.abs(days)}d` : `${days}d`;
  return <span className={`font-mono ${tone} ${weight}`}>{text}</span>;
}

function StateNotice({ state, labels }: { state: PageState; labels: FaListLabels }) {
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

export function FaListTable({
  rows,
  labels,
  canCreate,
  state = 'ready',
}: {
  rows: FaListRow[];
  labels: FaListLabels;
  canCreate: boolean;
  state?: PageState;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState('');
  const [deptFilter, setDeptFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');

  const filtered = React.useMemo(() => {
    return rows.filter((row) => {
      if (search) {
        const haystack = `${row.productCode} ${row.productName ?? ''}`.toLowerCase();
        if (!haystack.includes(search.toLowerCase())) return false;
      }
      if (statusFilter !== 'all' && row.statusOverall !== statusFilter) return false;
      if (deptFilter !== 'all') {
        // Dept filter selects FAs where that dept still has missing data
        // (not done — pending / inprog / blocked). Mirrors AC2 (?dept=mrp).
        const deptState = row.dept[deptFilter as keyof FaDeptStates];
        if (deptState === 'done') return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, deptFilter]);

  function clearFilters() {
    setSearch('');
    setDeptFilter('all');
    setStatusFilter('all');
  }

  // G-1 wiring: the "+ Create FG" button opens the FaCreateModal via the
  // `?modal=faCreate` query trigger (mirrors the brief openModal pattern). The
  // FaCreateHost mounted by page.tsx maps this URL state to the injected modal.
  function openModal(modal: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('modal', modal);
    router.push(`${pathname}?${params.toString()}`);
  }

  const deptOptions = [
    { value: 'all', label: labels.deptAll },
    ...DEPT_KEYS.map(({ key, label }) => ({ value: key, label: labels[label] })),
  ];
  const statusOptions = [
    { value: 'all', label: labels.statusAll },
    ...STATUS_VALUES.map((value) => ({ value, label: statusLabel(value, labels) })),
  ];

  return (
    <main
      data-testid="fa-list-screen"
      aria-labelledby="fa-list-title"
      className="mx-auto w-full max-w-7xl space-y-4 p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-4" data-region="page-head">
        <div>
          <nav aria-label="breadcrumb" className="text-xs text-slate-500">
            NPD / {labels.title}
          </nav>
          <h1 id="fa-list-title" className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
            {labels.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {labels.subtitle} · {filtered.length}/{rows.length}
          </p>
        </div>
        {canCreate ? (
          <Button type="button" aria-label={labels.createFa} onClick={() => openModal('faCreate')}>
            {labels.createFa}
          </Button>
        ) : null}
      </header>

      {/* Filter chip region above the table — prototype lines 209-221 */}
      <section
        className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
        aria-labelledby="fa-list-title"
        role="group"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid flex-1 gap-1 text-sm font-medium text-slate-700">
            <label htmlFor="fa-list-search">{labels.searchPlaceholder}</label>
            <Input
              id="fa-list-search"
              type="search"
              placeholder={labels.searchPlaceholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="grid gap-1 text-sm font-medium text-slate-700">
            <span id="fa-list-dept-label">{labels.filterDept}</span>
            <Select value={deptFilter} onValueChange={setDeptFilter} options={deptOptions}>
              <SelectTrigger aria-label={labels.filterDept}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {deptOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1 text-sm font-medium text-slate-700">
            <span id="fa-list-status-label">{labels.filterStatus}</span>
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
              icon="⭐"
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
                  <TableHead scope="col" className="px-3 py-3">{labels.colProductCode}</TableHead>
                  <TableHead scope="col" className="px-3 py-3">{labels.colProductName}</TableHead>
                  <TableHead scope="col" className="px-3 py-3">{labels.colPackSize}</TableHead>
                  <TableHead scope="col" className="px-3 py-3">{labels.colStatus}</TableHead>
                  <TableHead scope="col" className="px-3 py-3">{labels.colLaunch}</TableHead>
                  <TableHead scope="col" className="px-3 py-3">{labels.colDaysToLaunch}</TableHead>
                  {DEPT_KEYS.map(({ key, label }) => (
                    <TableHead key={key} scope="col" className="px-2 py-3 text-center" title={labels[label]}>
                      <span aria-hidden="true">{labels[label].slice(0, 2)}</span>
                      <span className="sr-only">{labels[label]}</span>
                    </TableHead>
                  ))}
                  <TableHead scope="col" className="px-3 py-3 text-center">{labels.colBuilt}</TableHead>
                  <TableHead scope="col" className="px-3 py-3">{labels.colActions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {filtered.map((row) => {
                  const status = String(row.statusOverall ?? 'Pending');
                  return (
                    <TableRow
                      key={row.productCode}
                      data-testid={`fa-list-row-${row.productCode}`}
                      data-status={status}
                      className="align-middle hover:bg-slate-50"
                    >
                      <TableCell className="px-3 py-2 font-mono text-xs">
                        <Link
                          href={`/fa/${row.productCode}`}
                          prefetch
                          className="text-blue-600 hover:underline"
                        >
                          {row.productCode}
                        </Link>
                      </TableCell>
                      <TableCell className="px-3 py-2 font-medium text-slate-950">
                        {row.productName ?? <span className="muted text-slate-400">—</span>}
                      </TableCell>
                      <TableCell className="px-3 py-2 font-mono text-xs text-slate-600">
                        {row.packSize ?? <span className="muted text-slate-400">—</span>}
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <Badge variant={statusVariant(status)} aria-label={statusLabel(status, labels)}>
                          {statusLabel(status, labels)}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 py-2 font-mono text-xs text-slate-600">
                        {row.launchDate ?? <span className="muted text-slate-400">—</span>}
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <DaysCell days={row.daysToLaunch} labels={labels} />
                      </TableCell>
                      {DEPT_KEYS.map(({ key, label }) => (
                        <TableCell key={key} className="px-2 py-2 text-center">
                          <DeptIndicator state={row.dept[key]} label={labels[label]} />
                        </TableCell>
                      ))}
                      <TableCell className="px-3 py-2 text-center">
                        {row.built ? (
                          <span className="font-semibold text-blue-600" title={labels.colBuilt}>
                            <span aria-hidden="true">⚡</span>
                            <span className="sr-only">{labels.colBuilt}</span>
                          </span>
                        ) : (
                          <span className="muted text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-2 whitespace-nowrap">
                        <Link
                          href={`/fa/${row.productCode}`}
                          prefetch
                          className="text-sm text-blue-600 hover:underline"
                        >
                          {labels.open}
                        </Link>
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

export default FaListTable;

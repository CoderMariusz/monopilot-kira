'use client';

/**
 * T-019 — FA list table (Finished Goods).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:177-297 (FAList)
 *
 * Translation notes (from the prototype):
 *   - window.NPD_FAS                 → server-side withOrgContext read of public.product (page.tsx)
 *   - openModal('faCreate')          → local React state (useState) opens the inlined
 *                                       FaCreateModal in THIS client island. See the
 *                                       "Robust open mechanism" note below — the modal is
 *                                       rendered here (not in a separate `?modal=` island)
 *                                       so the "+ Create FG" button works on a fresh hard
 *                                       load, not only after an SPA navigation. The URL
 *                                       `?modal=faCreate` is still honoured as a deep-link
 *                                       seed. Gated by server-supplied canCreate.
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

import { Button } from '@monopilot/ui/Button';
import { EmptyState } from '@monopilot/ui/EmptyState';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

import { FaCreateModal, type CreateFaAction, type FaCreateLabels } from './fa-create-modal';

const LOCALES = ['en', 'pl', 'ro', 'uk'];

function localePrefixFrom(pathname: string | null): string {
  const segment = (pathname ?? '/').split('/')[1] ?? '';
  return LOCALES.includes(segment) ? `/${segment}` : '';
}

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
  /** View-toggle pills (prototype lines 208-211). Optional so existing callers compile. */
  viewTable?: string;
  viewKanban?: string;
  /** Kanban card meta (prototype lines 296-298). */
  kanbanDepts?: string;
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

/**
 * Map the FG status to a design-system badge class (5 semantic tones). The
 * `@monopilot/ui` <Badge> primitive only emits `.badge--<variant>`, but globals.css
 * defines `.badge-<tone>` (single dash) — so we pass the design-system class through
 * className. This is the documented fix for the "unstyled badge" drift.
 */
function statusBadgeClass(status: string): string {
  switch (status) {
    case 'Complete':
      return 'badge-green';
    case 'Built':
      return 'badge-blue';
    case 'InProgress':
      return 'badge-amber';
    case 'Alert':
      return 'badge-red';
    default:
      return 'badge-gray';
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
  const color =
    state === 'done'
      ? 'var(--green)'
      : state === 'inprog'
        ? 'var(--amber)'
        : state === 'blocked'
          ? 'var(--red)'
          : 'var(--gray-300, #cbd5e1)';
  return (
    <span style={{ color, fontWeight: 600 }} data-dept-state={state}>
      <span aria-hidden="true">{glyph}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function DaysCell({ days, labels }: { days: number | null; labels: FaListLabels }) {
  if (days === null || days === undefined) {
    return <span className="muted">{labels.noDate}</span>;
  }
  const color = days <= 10 ? 'var(--red)' : days <= 21 ? 'var(--amber-700)' : 'var(--gray-600)';
  const weight = days <= 21 ? 600 : 400;
  const text = days < 0 ? `overdue ${Math.abs(days)}d` : `${days}d`;
  return <span className="mono" style={{ color, fontWeight: weight }}>{text}</span>;
}

function StateNotice({ state, labels }: { state: PageState; labels: FaListLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="muted" style={{ padding: 24, fontSize: 13 }}>
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

export function FaListTable({
  rows,
  labels,
  canCreate,
  state = 'ready',
  createModalLabels,
  createFaAction,
}: {
  rows: FaListRow[];
  labels: FaListLabels;
  canCreate: boolean;
  state?: PageState;
  /**
   * FaCreateModal labels, server-resolved (next-intl) by page.tsx. When present
   * the "+ Create FG" modal is rendered inline in this client island.
   */
  createModalLabels?: FaCreateLabels;
  /**
   * Real createFa Server Action (T-008), injected by page.tsx ONLY when the
   * caller may create (RBAC resolved server-side). Absent ⇒ Create is disabled;
   * RBAC is never decided or trusted on the client.
   */
  createFaAction?: CreateFaAction;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState('');
  const [deptFilter, setDeptFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  // Table ⇄ Kanban view toggle (prototype lines 208-211, 281-307).
  const [view, setView] = React.useState<'table' | 'kanban'>('table');

  // Robust open mechanism (NF root-cause fix):
  //   The modal open state lives HERE, in the same client island as the button.
  //   The button's onClick flips local state synchronously — it never depends on
  //   a router round-trip reaching a separate `?modal=` island. This guarantees
  //   the button works on a fresh HARD LOAD (the previous split-island wiring was
  //   dead for real users on first paint and only worked after an SPA nav).
  //   The URL `?modal=faCreate` is honoured purely as a deep-link/SSR SEED so the
  //   dialog also mounts open on initial paint when linked directly.
  const seedOpen = (searchParams?.get('modal') ?? null) === 'faCreate';
  const [createOpen, setCreateOpen] = React.useState(seedOpen);

  function openCreate() {
    setCreateOpen(true);
    // Reflect the open state in the URL so a deep link / refresh re-opens it and
    // back-button closes it — best-effort, never required for the dialog to open.
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('modal', 'faCreate');
    router.push(`${pathname}?${params.toString()}`);
  }

  function closeCreate() {
    setCreateOpen(false);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.delete('modal');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : (pathname ?? '/'));
  }

  function onCreated(productCode: string) {
    setCreateOpen(false);
    // Canonical FA detail route: /[locale]/fa/[productCode].
    const localePrefix = localePrefixFrom(pathname);
    router.push(`${localePrefix}/fa/${productCode}`);
  }

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

  const deptOptions = [
    { value: 'all', label: labels.deptAll },
    ...DEPT_KEYS.map(({ key, label }) => ({ value: String(key), label: labels[label] ?? '' })),
  ];
  const statusOptions = [
    { value: 'all', label: labels.statusAll },
    ...STATUS_VALUES.map((value) => ({ value, label: statusLabel(value, labels) })),
  ];

  const viewTableLabel = labels.viewTable ?? 'Table';
  const viewKanbanLabel = labels.viewKanban ?? 'Kanban';
  const isEmpty = filtered.length === 0;
  const showStateNotice = state !== 'ready' && state !== 'empty';
  const kanbanCols: FaStatusOverall[] = STATUS_VALUES;

  return (
    <main
      data-testid="fa-list-screen"
      aria-labelledby="fa-list-title"
      className="flex w-full flex-col gap-3 px-6 py-6"
    >
      {/* breadcrumb + page-head — prototype lines 201-214 */}
      <nav aria-label="breadcrumb" className="breadcrumb">
        NPD / {labels.title}
      </nav>
      <div className="page-head" data-region="page-head">
        <div>
          <h1 id="fa-list-title" className="page-title">
            {labels.title}
          </h1>
          <div className="muted" style={{ fontSize: 12 }}>
            {labels.subtitle} · {filtered.length}/{rows.length}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="pills" role="group" aria-label={viewTableLabel + ' / ' + viewKanbanLabel}>
            <button
              type="button"
              className={`pill ${view === 'table' ? 'on' : ''}`}
              aria-pressed={view === 'table'}
              onClick={() => setView('table')}
            >
              ≡ {viewTableLabel}
            </button>
            <button
              type="button"
              className={`pill ${view === 'kanban' ? 'on' : ''}`}
              aria-pressed={view === 'kanban'}
              onClick={() => setView('kanban')}
            >
              ▦ {viewKanbanLabel}
            </button>
          </div>
          {canCreate ? (
            <Button
              type="button"
              className="btn-primary"
              aria-label={labels.createFa}
              onClick={openCreate}
            >
              {labels.createFa}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Filter chip region above the table — prototype lines 216-228 */}
      <div className="card" style={{ padding: '10px 14px' }} role="group" aria-label={labels.title}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px', minWidth: 240, display: 'grid', gap: 4 }}>
            <label htmlFor="fa-list-search" className="muted" style={{ fontSize: 11 }}>
              {labels.searchPlaceholder}
            </label>
            <Input
              id="fa-list-search"
              type="search"
              className="form-input"
              placeholder={labels.searchPlaceholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <span id="fa-list-dept-label" className="muted" style={{ fontSize: 11 }}>
              {labels.filterDept}
            </span>
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
          <div style={{ display: 'grid', gap: 4 }}>
            <span id="fa-list-status-label" className="muted" style={{ fontSize: 11 }}>
              {labels.filterStatus}
            </span>
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
          <Button type="button" className="btn-ghost btn-sm" onClick={clearFilters}>
            {labels.clearFilters}
          </Button>
        </div>
      </div>

      {showStateNotice ? (
        <div className="card" style={{ padding: 0 }}>
          <StateNotice state={state} labels={labels} />
        </div>
      ) : isEmpty ? (
        <div className="card" style={{ padding: 0 }}>
          <EmptyState
            icon="⭐"
            title={labels.empty}
            body={labels.emptyBody}
            action={{ label: labels.clearFilters, onClick: clearFilters }}
          />
        </div>
      ) : view === 'table' ? (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="table" aria-label={labels.title}>
            <thead>
              <tr>
                <th scope="col">{labels.colProductCode}</th>
                <th scope="col">{labels.colProductName}</th>
                <th scope="col">{labels.colPackSize}</th>
                <th scope="col">{labels.colStatus}</th>
                <th scope="col">{labels.colLaunch}</th>
                <th scope="col">{labels.colDaysToLaunch}</th>
                {DEPT_KEYS.map(({ key, label }) => (
                  <th key={key} scope="col" style={{ textAlign: 'center' }} title={labels[label]}>
                    <span aria-hidden="true">{(labels[label] ?? '').slice(0, 2)}</span>
                    <span className="sr-only">{labels[label]}</span>
                  </th>
                ))}
                <th scope="col" style={{ textAlign: 'center' }}>{labels.colBuilt}</th>
                <th scope="col">{labels.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const status = String(row.statusOverall ?? 'Pending');
                return (
                  <tr key={row.productCode} data-testid={`fa-list-row-${row.productCode}`} data-status={status}>
                    <td className="mono">
                      <Link href={`/fa/${row.productCode}`} prefetch style={{ color: 'var(--blue)' }}>
                        {row.productCode}
                      </Link>
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      {row.productName ?? <span className="muted">—</span>}
                    </td>
                    <td className="mono">
                      {row.packSize ?? <span className="muted">—</span>}
                    </td>
                    <td>
                      <span className={`badge ${statusBadgeClass(status)}`} aria-label={statusLabel(status, labels)}>
                        {statusLabel(status, labels)}
                      </span>
                    </td>
                    <td className="mono">
                      {row.launchDate ?? <span className="muted">—</span>}
                    </td>
                    <td>
                      <DaysCell days={row.daysToLaunch} labels={labels} />
                    </td>
                    {DEPT_KEYS.map(({ key, label }) => (
                      <td key={key} style={{ textAlign: 'center' }}>
                        <DeptIndicator state={row.dept[key]} label={labels[label] ?? ''} />
                      </td>
                    ))}
                    <td style={{ textAlign: 'center' }}>
                      {row.built ? (
                        <span style={{ color: 'var(--blue)', fontWeight: 700 }} title={labels.colBuilt}>
                          <span aria-hidden="true">⚡</span>
                          <span className="sr-only">{labels.colBuilt}</span>
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Link
                        href={`/fa/${row.productCode}`}
                        prefetch
                        className="btn btn-ghost btn-sm"
                        style={{ textDecoration: 'none' }}
                      >
                        {labels.open}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        // Kanban view — prototype lines 281-307. Status columns; cards lead with
        // the FG code (mono) + name. `.kanban` has no global class, styled inline
        // from design tokens (this lane cannot touch globals.css).
        <div
          data-testid="fa-list-kanban"
          style={{ display: 'grid', gridTemplateColumns: `repeat(${kanbanCols.length}, minmax(180px, 1fr))`, gap: 10, overflowX: 'auto' }}
        >
          {kanbanCols.map((col) => {
            const items = filtered.filter((f) => String(f.statusOverall ?? 'Pending') === col);
            return (
              <div
                key={col}
                data-kanban-col={col}
                style={{ background: 'var(--gray-050)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 8 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '2px 4px' }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{statusLabel(col, labels)}</span>
                  <span className="badge badge-gray" style={{ fontSize: 10 }}>{items.length}</span>
                </div>
                {items.map((f) => {
                  const doneCount = DEPT_KEYS.filter(({ key }) => f.dept[key] === 'done').length;
                  return (
                    <Link
                      key={f.productCode}
                      href={`/fa/${f.productCode}`}
                      prefetch
                      data-testid={`fa-kanban-card-${f.productCode}`}
                      style={{
                        display: 'block',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: 10,
                        marginBottom: 8,
                        textDecoration: 'none',
                        color: 'inherit',
                      }}
                    >
                      <div className="muted mono" style={{ fontSize: 10 }}>{f.productCode}</div>
                      <div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>
                        {f.productName ?? f.productCode}
                      </div>
                      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                        {f.packSize ?? '—'}
                      </div>
                      <div className="muted" style={{ fontSize: 11, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                        <span>{doneCount}/{DEPT_KEYS.length} {labels.kanbanDepts ?? 'depts'}</span>
                        <DaysCell days={f.daysToLaunch} labels={labels} />
                      </div>
                    </Link>
                  );
                })}
                {items.length === 0 ? (
                  <div className="muted" style={{ textAlign: 'center', fontSize: 12, padding: 12 }}>—</div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/*
        Robust create modal — rendered INLINE in this client island so the
        "+ Create FG" button (above) opens it via local state on a fresh hard
        load. RBAC: only present when the caller may create (canCreate) AND the
        server-resolved labels are supplied; the real createFa action is injected
        by page.tsx only when permitted (absent ⇒ Create disabled). Never trusted
        from the client.
      */}
      {canCreate && createModalLabels ? (
        <FaCreateModal
          open={createOpen}
          labels={createModalLabels}
          createFaAction={createFaAction}
          onCreated={onCreated}
          onClose={closeCreate}
        />
      ) : null}
    </main>
  );
}

export default FaListTable;

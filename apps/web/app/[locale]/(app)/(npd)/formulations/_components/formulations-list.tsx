'use client';

/**
 * Formulations list (module-level, cross-FG) — client table.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/formulation-screens.jsx:7-76
 *   (FormulationList — cross-FA flattened version table: FG, Version, Status,
 *    Effective from/to, Items, Allergens, + Open FA action, with an FG filter
 *    and a Status filter.)
 *
 * Translation notes (from prototype-index-npd.json → formulation_list):
 *   - window.NPD_FORMULATION_VERSIONS flatten   → server-side withOrgContext read (page.tsx),
 *                                                  rows arrive as props (no synthesized stubs).
 *   - raw <select> FA / Status filters           → shadcn Select (raw <select> is a red-line);
 *                                                  local React state, search added for parity
 *                                                  with the other NPD list screens.
 *   - "🔒 Locked" / "Draft" inline badges        → design-system Badge tones (.badge-*).
 *   - onOpenFA(code) row action                  → next/link to the existing per-project
 *                                                  formulation editor (/[locale]/pipeline/[projectId]/formulation).
 *   - effective_to null → "current" label        → conditional muted text.
 *
 * RBAC: read permission is resolved server-side (page.tsx) and surfaced only as
 * the `permission_denied` state — never trusted from the client.
 */

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';
import { EmptyState } from '@monopilot/ui/EmptyState';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

const LOCALES = ['en', 'pl', 'ro', 'uk'];

function localePrefixFrom(pathname: string | null): string {
  const segment = (pathname ?? '/').split('/')[1] ?? '';
  return LOCALES.includes(segment) ? `/${segment}` : '';
}

export type FormulationStatus = 'draft' | 'submitted_for_trial' | 'locked';
export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type FormulationListRow = {
  /** formulation_versions.id — stable React key. */
  versionId: string;
  /** npd_projects.id — resolves the editor href. */
  projectId: string;
  /** product.product_code (FG canonical code). May be null for unmapped drafts. */
  fgCode: string | null;
  /** product.product_name (FG name). */
  fgName: string | null;
  /** "v{n}" display version (formulation_versions.version_number). */
  version: string;
  status: FormulationStatus | string;
  /** effective_from = formulation_versions.created_at (ISO date). */
  effectiveFrom: string | null;
  /** effective_to (ISO date) or null ⇒ "current". */
  effectiveTo: string | null;
  /** ingredient (item) count for the version. */
  itemCount: number;
  /** allergen summary string (union of inherited allergen codes) or null. */
  allergenSummary: string | null;
};

export type FormulationsListLabels = {
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  filterFg: string;
  filterStatus: string;
  clearFilters: string;
  fgAll: string;
  statusAll: string;
  statusDraft: string;
  statusSubmitted: string;
  statusLocked: string;
  colFg: string;
  colVersion: string;
  colStatus: string;
  colEffectiveFrom: string;
  colEffectiveTo: string;
  colItems: string;
  colAllergens: string;
  colActions: string;
  open: string;
  current: string;
  none: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
};

const STATUS_VALUES: FormulationStatus[] = ['draft', 'submitted_for_trial', 'locked'];

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'locked':
      return 'badge-green';
    case 'submitted_for_trial':
      return 'badge-blue';
    default:
      return 'badge-amber';
  }
}

function statusLabel(status: string, labels: FormulationsListLabels): string {
  switch (status) {
    case 'locked':
      return labels.statusLocked;
    case 'submitted_for_trial':
      return labels.statusSubmitted;
    default:
      return labels.statusDraft;
  }
}

function StateNotice({ state, labels }: { state: PageState; labels: FormulationsListLabels }) {
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

export function FormulationsList({
  rows,
  labels,
  state = 'ready',
}: {
  rows: FormulationListRow[];
  labels: FormulationsListLabels;
  state?: PageState;
}) {
  const pathname = usePathname();
  const localePrefix = localePrefixFrom(pathname);

  const [search, setSearch] = React.useState('');
  const [fgFilter, setFgFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');

  // Distinct FG codes present in the data → the FG filter options (prototype:
  // SELECT DISTINCT fa_code; here derived from the already-org-scoped rows).
  const fgOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      if (row.fgCode && !seen.has(row.fgCode)) {
        seen.set(row.fgCode, row.fgName ? `${row.fgCode} — ${row.fgName}` : row.fgCode);
      }
    }
    return [
      { value: 'all', label: labels.fgAll },
      ...[...seen.entries()].map(([value, label]) => ({ value, label })),
    ];
  }, [rows, labels.fgAll]);

  const statusOptions = [
    { value: 'all', label: labels.statusAll },
    ...STATUS_VALUES.map((value) => ({ value, label: statusLabel(value, labels) })),
  ];

  const filtered = React.useMemo(() => {
    return rows.filter((row) => {
      if (search) {
        const haystack = `${row.fgCode ?? ''} ${row.fgName ?? ''} ${row.version}`.toLowerCase();
        if (!haystack.includes(search.toLowerCase())) return false;
      }
      if (fgFilter !== 'all' && row.fgCode !== fgFilter) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      return true;
    });
  }, [rows, search, fgFilter, statusFilter]);

  function clearFilters() {
    setSearch('');
    setFgFilter('all');
    setStatusFilter('all');
  }

  const isEmpty = filtered.length === 0;
  const showStateNotice = state !== 'ready' && state !== 'empty';

  return (
    <main
      data-testid="formulations-list-screen"
      aria-labelledby="formulations-list-title"
      className="flex w-full flex-col gap-3 px-6 py-6"
    >
      {/* breadcrumb + page-head — prototype lines 31-37 */}
      <nav aria-label="breadcrumb" className="breadcrumb">
        NPD / {labels.title}
      </nav>
      <div className="page-head" data-region="page-head">
        <div>
          <h1 id="formulations-list-title" className="page-title">
            {labels.title}
          </h1>
          <div className="muted" style={{ fontSize: 12 }}>
            {labels.subtitle} · {filtered.length}/{rows.length}
          </div>
        </div>
      </div>

      {/* Filter region above the table — prototype lines 39-51 */}
      <div className="card" style={{ padding: '10px 14px' }} role="group" aria-label={labels.title}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px', minWidth: 240, display: 'grid', gap: 4 }}>
            <label htmlFor="formulations-search" className="muted" style={{ fontSize: 11 }}>
              {labels.searchPlaceholder}
            </label>
            <Input
              id="formulations-search"
              type="search"
              className="form-input"
              placeholder={labels.searchPlaceholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <span id="formulations-fg-label" className="muted" style={{ fontSize: 11 }}>
              {labels.filterFg}
            </span>
            <Select value={fgFilter} onValueChange={setFgFilter} options={fgOptions}>
              <SelectTrigger aria-label={labels.filterFg}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fgOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <span id="formulations-status-label" className="muted" style={{ fontSize: 11 }}>
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
            icon="🧪"
            title={labels.empty}
            body={labels.emptyBody}
            action={{ label: labels.clearFilters, onClick: clearFilters }}
          />
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="table" aria-label={labels.title}>
            <thead>
              <tr>
                <th scope="col">{labels.colFg}</th>
                <th scope="col">{labels.colVersion}</th>
                <th scope="col">{labels.colStatus}</th>
                <th scope="col">{labels.colEffectiveFrom}</th>
                <th scope="col">{labels.colEffectiveTo}</th>
                <th scope="col" style={{ textAlign: 'right' }}>{labels.colItems}</th>
                <th scope="col">{labels.colAllergens}</th>
                <th scope="col">{labels.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const status = String(row.status ?? 'draft');
                const editorHref = `${localePrefix}/pipeline/${row.projectId}/formulation`;
                return (
                  <tr key={row.versionId} data-testid={`formulations-row-${row.versionId}`} data-status={status}>
                    <td className="mono">
                      {row.fgCode ? (
                        <Link href={editorHref} prefetch style={{ color: 'var(--blue)' }}>
                          {row.fgName ? `${row.fgCode} — ${row.fgName}` : row.fgCode}
                        </Link>
                      ) : (
                        <span className="muted">{labels.none}</span>
                      )}
                    </td>
                    <td className="mono" style={{ fontWeight: 600 }}>{row.version}</td>
                    <td>
                      <span className={`badge ${statusBadgeClass(status)}`} aria-label={statusLabel(status, labels)}>
                        {statusLabel(status, labels)}
                      </span>
                    </td>
                    <td className="mono">
                      {row.effectiveFrom ?? <span className="muted">—</span>}
                    </td>
                    <td className="mono">
                      {row.effectiveTo ?? <span className="muted">{labels.current}</span>}
                    </td>
                    <td className="mono num" style={{ textAlign: 'right' }}>{row.itemCount}</td>
                    <td>{row.allergenSummary ?? <span className="muted">{labels.none}</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Link
                        href={editorHref}
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
      )}
    </main>
  );
}

export default FormulationsList;

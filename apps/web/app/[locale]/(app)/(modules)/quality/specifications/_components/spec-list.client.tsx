'use client';

/**
 * QA-003 — Specifications list (client island).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   specs-screens.jsx:1-79 (QaSpecsList):
 *     status filter pills (all/active/draft/under_review/
 *       expired/superseded)                               → specs-screens.jsx:29-33
 *     applies-to filter pills (all/incoming/inprocess/final) → specs-screens.jsx:34-38
 *     search box (product / spec code)                    → specs-screens.jsx:28
 *     "Clear" + visible-row count                         → specs-screens.jsx:40-41
 *     "+ Create Specification" action opens the create modal → specs-screens.jsx:23
 *     dense table: spec code (mono link), version badge
 *       (line-through when superseded), product, status
 *       badge, approved by/at                              → specs-screens.jsx:44-76
 *     superseded rows dimmed (opacity 0.6)                → specs-screens.jsx:58
 *     empty state                                         → specs-screens.jsx:211 pattern
 *
 * Owns ONLY client filter/search state + the create-modal open state. No data
 * fetching, no permission logic — both resolved server-side; the createSpec action
 * is passed in as a prop (imported from _actions, never authored here).
 *
 * DEVIATIONS (documented per UI-PROTOTYPE-PARITY-POLICY.md, ADAPTED to the landed
 * listSpecs contract — id/productId/productCode?/productName?/specCode/version/
 * status/approvedBy?/approvedAt?/supersededBy/createdAt):
 *   - The prototype's APPLIES-TO filter pills (specs-screens.jsx:34-38) are OMITTED
 *     because listSpecs rows do NOT carry applies_to; the status filter (which IS
 *     supported) is kept. applies_to is shown on the detail screen instead.
 *   - The PARAMETER-COUNT column + Effective-from/until / Regulation / per-row
 *     "View" columns (specs-screens.jsx:49-50,63-67) are OUT OF SCOPE for the
 *     listSpecs contract (no count field); the whole row links to the detail page.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { SpecCreateModal, type SpecCreateLabels } from './spec-create-modal.client';
import type { ItemSearchFn } from '../../../../(npd)/_components/item-picker';
import type { CreateSpecFn, SpecListRow, SpecStatus } from './spec-actions-contract';

export const SPEC_STATUS_FILTERS: Array<SpecStatus | 'all'> = [
  'all',
  'active',
  'draft',
  'under_review',
  'expired',
  'superseded',
];

const STATUS_VARIANT: Record<SpecStatus, BadgeVariant> = {
  draft: 'muted',
  under_review: 'warning',
  active: 'success',
  expired: 'danger',
  superseded: 'muted',
};

export type SpecListLabels = {
  createSpec: string;
  searchPlaceholder: string;
  searchLabel: string;
  rowsLabel: string;
  statusFilterLabel: string;
  clear: string;
  emptyAll: string;
  emptyFiltered: string;
  noApprover: string;
  noProduct: string;
  statusAll: string;
  statusValues: Record<SpecStatus, string>;
  columns: {
    product: string;
    specCode: string;
    version: string;
    status: string;
    approvedBy: string;
  };
};

export function SpecListClient({
  rows,
  labels,
  createLabels,
  locale,
  createSpecAction,
  searchItemsAction,
}: {
  rows: SpecListRow[];
  labels: SpecListLabels;
  createLabels: SpecCreateLabels;
  locale: string;
  createSpecAction: CreateSpecFn;
  searchItemsAction: ItemSearchFn<'fg' | 'intermediate' | 'rm' | 'ingredient' | 'packaging'>;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<SpecStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (status === 'all' || r.status === status) &&
        (q === '' ||
          r.specCode.toLowerCase().includes(q) ||
          (r.productCode ?? '').toLowerCase().includes(q) ||
          (r.productName ?? '').toLowerCase().includes(q)),
    );
  }, [rows, status, search]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header action — opens the create modal (parity specs-screens.jsx:23). */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          data-testid="spec-create-open"
          onClick={() => setCreateOpen(true)}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          + {labels.createSpec}
        </button>
      </div>

      {/* Filter bar (parity specs-screens.jsx:27-42). */}
      <Card className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchLabel}
          data-testid="spec-list-search"
          className="w-full max-w-xs rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
        />

        {/* Status pills (parity specs-screens.jsx:29-33). */}
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label={labels.statusFilterLabel}>
          {SPEC_STATUS_FILTERS.map((s) => {
            const on = status === s;
            const text = s === 'all' ? labels.statusAll : labels.statusValues[s];
            return (
              <button
                key={s}
                type="button"
                data-testid={`spec-status-${s}`}
                aria-pressed={on}
                onClick={() => setStatus(s)}
                className={[
                  'rounded-full border px-2.5 py-1 text-xs transition',
                  on
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-300 text-slate-600 hover:border-slate-400',
                ].join(' ')}
              >
                {text}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          data-testid="spec-list-clear"
          onClick={() => {
            setSearch('');
            setStatus('all');
          }}
          className="text-xs text-slate-500 underline-offset-2 hover:underline"
        >
          {labels.clear}
        </button>
        <span className="ml-auto text-xs text-slate-500" data-testid="spec-list-rows">
          {labels.rowsLabel.replace('{count}', String(visible.length))}
        </span>
      </Card>

      {/* Table / empty states (parity specs-screens.jsx:44-76). */}
      <Card
        data-testid="spec-list-table-card"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        {rows.length === 0 ? (
          <p data-testid="spec-list-empty" data-state="empty" className="px-4 py-10 text-center text-sm text-slate-500">
            {labels.emptyAll}
          </p>
        ) : visible.length === 0 ? (
          <p data-testid="spec-list-empty-filtered" className="px-4 py-10 text-center text-sm text-slate-500">
            {labels.emptyFiltered}
          </p>
        ) : (
          <Table aria-label={labels.columns.specCode}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.columns.product}</TableHead>
                <TableHead scope="col">{labels.columns.specCode}</TableHead>
                <TableHead scope="col">{labels.columns.version}</TableHead>
                <TableHead scope="col">{labels.columns.status}</TableHead>
                <TableHead scope="col">{labels.columns.approvedBy}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => {
                const superseded = r.status === 'superseded';
                return (
                  <TableRow
                    key={r.id}
                    data-testid={`spec-row-${r.id}`}
                    style={superseded ? { opacity: 0.6 } : undefined}
                  >
                    <TableCell className="text-xs text-slate-700">
                      {r.productCode || r.productName ? (
                        <>
                          <span className="font-mono text-[11px] text-sky-700">{r.productCode ?? ''}</span>
                          {r.productName ? <span className="ml-2">{r.productName}</span> : null}
                        </>
                      ) : (
                        <span className="text-slate-400">{labels.noProduct}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-semibold text-sky-700">
                      <Link
                        href={`/${locale}/quality/specifications/${r.id}`}
                        data-testid={`spec-link-${r.id}`}
                        className="hover:underline"
                      >
                        {r.specCode}
                      </Link>
                    </TableCell>
                    <TableCell
                      className="font-mono text-sm font-semibold"
                      style={superseded ? { textDecoration: 'line-through' } : undefined}
                    >
                      v{r.version}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[r.status] ?? 'muted'} data-testid={`spec-status-badge-${r.id}`}>
                        {labels.statusValues[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {r.approvedBy ? (
                        <>
                          <div>{r.approvedBy}</div>
                          {r.approvedAt && <div className="text-[10px] text-slate-400">{r.approvedAt.slice(0, 10)}</div>}
                        </>
                      ) : (
                        <span className="text-slate-400">{labels.noApprover}</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <SpecCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        labels={createLabels}
        locale={locale}
        createSpecAction={createSpecAction}
        searchItemsAction={searchItemsAction}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}

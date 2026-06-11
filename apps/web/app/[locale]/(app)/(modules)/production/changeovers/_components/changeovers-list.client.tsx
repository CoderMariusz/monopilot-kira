'use client';

/**
 * B-2 — Changeover dual-sign register (client island): filter chips + table +
 * "+ New changeover" modal + per-row dual-sign drawer.
 *
 * Prototype parity (1:1):
 *   production/other-screens.jsx:298-397 (ChangeoverScreen) — page region, the
 *     dual sign-off requirement note (312-318), status section + risk (304), and
 *     the dual-sign gate slots (364-385);
 *   production/dashboard.jsx:249-267 — the "Open changeover / Open wizard" entry
 *     this list is reached from.
 *
 * Filter chips map to the contract dualSignOffStatus values
 * (pending / first_signed / complete) + an "all" reset. Each row expands into the
 * <ChangeoverSignPanel> drawer (two slots + e-sign). Mutations go through the C4
 * action seam; on success the page is refreshed.
 */

import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';

import { ChangeoverCreateModal } from './changeover-create-modal.client';
import { ChangeoverSignPanel } from './changeover-sign-panel.client';
import type {
  ChangeoverDualSignStatus,
  ChangeoverLineOption,
  ChangeoverListRow,
  CreateChangeoverFn,
  SignChangeoverFn,
} from './changeovers-contract';
import type { ChangeoverFilterStatus, ChangeoverListLabels, ChangeoverCreateLabels, ChangeoverSignLabels } from './labels';
import type { ItemSearchFn } from '../../../../(npd)/_components/item-picker';

const STATUS_VARIANT: Record<ChangeoverDualSignStatus, BadgeVariant> = {
  pending: 'muted',
  first_signed: 'warning',
  complete: 'success',
};

const FILTERS: ChangeoverFilterStatus[] = ['all', 'pending', 'first_signed', 'complete'];

export function ChangeoversList({
  rows,
  lines,
  initialFilter,
  labels,
  createLabels,
  signLabels,
  createChangeoverAction,
  signChangeoverAction,
  searchItemsAction,
}: {
  rows: ChangeoverListRow[];
  lines: ChangeoverLineOption[];
  initialFilter: ChangeoverFilterStatus;
  labels: ChangeoverListLabels;
  createLabels: ChangeoverCreateLabels;
  signLabels: ChangeoverSignLabels;
  createChangeoverAction: CreateChangeoverFn;
  signChangeoverAction: SignChangeoverFn;
  searchItemsAction: ItemSearchFn<'fg'>;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<ChangeoverFilterStatus>(initialFilter);
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visible = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.dualSignOffStatus === filter)),
    [rows, filter],
  );

  function refresh() {
    setCreateOpen(false);
    router.refresh();
  }

  const productLabel = (p?: { code: string; name: string }) => (p ? p.code : labels.none);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={labels.title} className="flex flex-wrap gap-2" data-testid="changeover-filters">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              data-testid={`changeover-filter-${f}`}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                filter === f
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {labels.filters[f]}
            </button>
          ))}
        </div>
        <button
          type="button"
          data-testid="changeover-new"
          onClick={() => setCreateOpen(true)}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          {labels.newButton}
        </button>
      </div>

      {visible.length === 0 ? (
        <div
          data-testid="changeover-empty"
          className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500"
        >
          {labels.empty}
        </div>
      ) : (
        <div data-testid="changeover-table" className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-3 py-2 font-semibold">{labels.col.line}</th>
                <th scope="col" className="px-3 py-2 font-semibold">{labels.col.transition}</th>
                <th scope="col" className="px-3 py-2 font-semibold">{labels.col.cleaning}</th>
                <th scope="col" className="px-3 py-2 font-semibold">{labels.col.atp}</th>
                <th scope="col" className="px-3 py-2 font-semibold">{labels.col.status}</th>
                <th scope="col" className="px-3 py-2 font-semibold">{labels.col.signers}</th>
                <th scope="col" className="px-3 py-2 font-semibold text-right" />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const isExpanded = expandedId === r.id;
                const signers =
                  [r.firstSigner?.name, r.secondSigner?.name].filter(Boolean).join(', ') || labels.signerNone;
                return (
                  <Fragment key={r.id}>
                    <tr
                      data-testid={`changeover-row-${r.id}`}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-3 py-2 font-mono text-slate-700">{r.lineCode}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">
                        {productLabel(r.fromProduct)} → {r.toProduct.code}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          data-testid={`changeover-cleaning-${r.id}`}
                          className={r.cleaningCompleted ? 'text-emerald-600' : 'text-slate-400'}
                        >
                          {r.cleaningCompleted ? `✓ ${labels.cleaningYes}` : `✗ ${labels.cleaningNo}`}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.atpResult ?? labels.none}</td>
                      <td className="px-3 py-2">
                        <Badge variant={STATUS_VARIANT[r.dualSignOffStatus]} data-testid={`changeover-status-${r.id}`}>
                          {labels.status[r.dualSignOffStatus]}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">{signers}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          data-testid={`changeover-review-${r.id}`}
                          aria-expanded={isExpanded}
                          onClick={() => setExpandedId(isExpanded ? null : r.id)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          {labels.reviewButton}
                        </button>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr data-testid={`changeover-row-panel-${r.id}`}>
                        <td colSpan={7} className="bg-slate-50 px-3 py-3">
                          <ChangeoverSignPanel
                            row={r}
                            labels={signLabels}
                            signChangeoverAction={signChangeoverAction}
                            onSigned={() => router.refresh()}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ChangeoverCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={refresh}
        lines={lines}
        labels={createLabels}
        createChangeoverAction={createChangeoverAction}
        searchItemsAction={searchItemsAction}
      />
    </div>
  );
}

'use client';

/**
 * 03-technical Cost History + Cost Edit client island (TEC-050, T-050).
 *
 * Prototype parity:
 *   - prototypes/design/Monopilot Design System/technical/other-screens.jsx:633-692
 *     (`CostHistoryScreen`, TEC-015): sparkline of std cost (zł) + a
 *     Date / Version(source) / Cost (zł) / Δ% / Reason table.
 *   - prototypes/design/Monopilot Design System/technical/other-screens.jsx:536-585
 *     (`CostingScreen`, TEC-013): the "Recompute"/edit cost CTA that opens the
 *     cost-edit modal recording a new cost roll.
 * Item picker = shadcn `<Select>` (raw `<select>` is a red-line).
 *
 * NUMERIC-exact: every cost value is a string from the Server Action (SQL
 * NUMERIC) and is displayed verbatim — Δ% is computed in SQL-free integer-safe
 * decimal arithmetic on the string digits, never via JS float on the cost. The
 * >20% high-variance approver gate is enforced server-side (postCost / V-TEC-53);
 * this UI surfaces the `approver_required` result and reveals the approver field.
 *
 * Local Dialog primitive (not the Radix-backed @monopilot/ui Modal) — the exact
 * established deviation used by technical/items items-manager.client.tsx (React
 * 18 peer Radix vs apps/web React 19 crashes the jsdom unit test). Production
 * dialog semantics (role=dialog, aria-modal, focus-on-open, Escape + backdrop
 * close, labelled title) are preserved.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';
import { Select } from '@monopilot/ui/Select';

import { listCostHistory } from '../_actions/list-cost-history';
import { postCost } from '../_actions/post-cost';
import { COST_SOURCES, type CostActionError, type CostEditableSource, type CostHistoryRow } from '../_actions/shared';
import type { CostItemOption } from '../_actions/list-cost-items';
import { deltaPctExact, formatCost } from './numeric';

// i18n copy contract. All strings are passed from the RSC page (next-intl); the
// DEFAULT_COPY below keeps the component renderable in isolation (RTL tests) and
// supplies the canonical English so no inline-string drift can ship.
export type CostManagerCopy = {
  itemLabel: string;
  itemPlaceholder: string;
  editCost: string;
  selectPrompt: string;
  loading: string;
  loadError: string;
  /** Template with a `{code}` placeholder — functions cannot cross the RSC boundary. */
  noHistory: string;
  noHistoryCanEdit: string;
  readOnlyNotice: string;
  tableAriaLabel: string;
  colDate: string;
  colSource: string;
  colCost: string;
  colDelta: string;
  colReason: string;
  sparklineTitle: string;
  min: string;
  max: string;
  /** Template with a `{code}` placeholder — functions cannot cross the RSC boundary. */
  modalTitle: string;
  modalIntro: string;
  fieldNewCost: string;
  fieldCurrency: string;
  fieldSource: string;
  fieldReason: string;
  fieldReasonPlaceholder: string;
  fieldApprover: string;
  fieldApproverPlaceholder: string;
  cancel: string;
  record: string;
  source: Record<CostEditableSource, string>;
  err: Record<CostActionError, string>;
};

const DEFAULT_COPY: CostManagerCopy = {
  itemLabel: 'Item',
  itemPlaceholder: 'Select an item…',
  editCost: 'Edit cost',
  selectPrompt: 'Select an item to view its cost history.',
  loading: 'Loading cost history',
  loadError: 'Unable to load cost history. Please try again.',
  noHistory: 'No cost history yet for {code}.',
  noHistoryCanEdit: ' Record the first cost roll to start the timeline.',
  readOnlyNotice: 'You can view cost history but do not have permission to edit master cost (technical.cost.edit).',
  tableAriaLabel: 'Cost history',
  colDate: 'Date',
  colSource: 'Source',
  colCost: 'Cost / kg',
  colDelta: 'Δ%',
  // item_cost_history has no notes/reason column (the reason is written to
  // audit_log only — see _actions/shared.ts). The last cell carries the currency.
  colReason: 'Currency',
  sparklineTitle: 'Sparkline · cost / kg',
  min: 'min',
  max: 'max',
  modalTitle: 'Edit cost · {code}',
  modalIntro:
    'Recording a new cost closes the active row and writes a history entry. Changes > 20% require an approver (V-TEC-53).',
  fieldNewCost: 'New cost / kg',
  fieldCurrency: 'Currency',
  fieldSource: 'Source',
  fieldReason: 'Reason',
  fieldReasonPlaceholder: 'Why is the cost changing?',
  fieldApprover: 'Approver (user id)',
  fieldApproverPlaceholder: 'approver user UUID',
  cancel: 'Cancel',
  record: 'Record cost',
  source: {
    manual: 'Manual',
    d365_sync: 'D365 sync',
    supplier_update: 'Supplier update',
    variance_roll: 'Variance roll',
  },
  err: {
    forbidden: 'You do not have permission to record a cost change.',
    invalid_input: 'Please check the values and try again.',
    not_found: 'That item no longer exists.',
    approver_required: 'This cost change exceeds 20%. Enter an approver to record it (V-TEC-53).',
    persistence_failed: 'Could not save the cost change. Please try again.',
  },
};

// ── Local accessible dialog (same pattern as items-manager.client.tsx) ─────────
function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    contentRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="modal-box outline-none"
      >
        <div className="modal-head">
          <div id={titleId} className="modal-title">
            {title}
          </div>
          <button type="button" aria-label="Close" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

// ── Sparkline (CostHistoryScreen:650-664) — pure SVG over the NUMERIC strings ───
function Sparkline({ rows, copy }: { rows: CostHistoryRow[]; copy: CostManagerCopy }) {
  const costs = rows.map((r) => Number(r.costPerKg)).filter((n) => Number.isFinite(n));
  if (costs.length < 2) return null;
  const max = Math.max(...costs);
  const min = Math.min(...costs);
  const range = max - min || 1;
  // Oldest → newest left-to-right (history is returned newest-first).
  const ordered = [...costs].reverse();
  const pt = (cost: number, i: number) => {
    const x = (i / (ordered.length - 1)) * 680 + 10;
    const y = 80 - ((cost - min) / range) * 70;
    return { x, y };
  };
  return (
    <div className="card">
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <strong className="text-sm">{copy.sparklineTitle}</strong>
          <div className="text-xs text-muted-foreground">
            <span>
              {copy.min}{' '}
              <b className="font-mono" style={{ color: 'var(--green-700)' }}>
                {formatCost(String(min))}
              </b>
            </span>
            <span className="ml-3.5">
              {copy.max}{' '}
              <b className="font-mono" style={{ color: 'var(--red-700)' }}>
                {formatCost(String(max))}
              </b>
            </span>
          </div>
        </div>
        <svg
          width="100%"
          height="90"
          viewBox="0 0 700 90"
          preserveAspectRatio="none"
          role="img"
          aria-label="Cost per kg sparkline"
        >
          {ordered.map((cost, i) => {
            if (i === 0) return null;
            const a = pt(ordered[i - 1]!, i - 1);
            const b = pt(cost, i);
            return <line key={`l-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--blue)" strokeWidth="2" />;
          })}
          {ordered.map((cost, i) => {
            const { x, y } = pt(cost, i);
            return <circle key={`c-${i}`} cx={x} cy={y} r="4" fill="#fff" stroke="var(--blue)" strokeWidth="2" />;
          })}
        </svg>
      </div>
    </div>
  );
}

// ── Cost edit modal — records a new cost roll via postCost (NUMERIC-exact) ──────
function CostEditModal({
  item,
  copy,
  onClose,
  onSaved,
}: {
  item: CostItemOption;
  copy: CostManagerCopy;
  onClose: () => void;
  onSaved: () => void;
}) {
  const sourceOptions = COST_SOURCES.map((value) => ({ value, label: copy.source[value] }));
  const [costPerKg, setCostPerKg] = React.useState('');
  const [currency, setCurrency] = React.useState('PLN');
  const [source, setSource] = React.useState<CostEditableSource>('manual');
  const [notes, setNotes] = React.useState('');
  const [approver, setApprover] = React.useState('');
  const [needsApprover, setNeedsApprover] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await postCost({
        itemId: item.id,
        costPerKg,
        currency,
        source,
        notes: notes || undefined,
        approverUserId: approver || undefined,
      });
      if (result.ok) {
        onSaved();
      } else {
        if (result.error === 'approver_required') setNeedsApprover(true);
        setError(copy.err[result.error]);
      }
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={copy.modalTitle.replace('{code}', item.itemCode)}
      footer={
        <>
          <Button type="button" className="btn-secondary" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button type="submit" className="btn-primary" form="technical-cost-edit-form" disabled={pending}>
            {copy.record}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        {copy.colCost}: <span className="font-mono tabular-nums">{formatCost(item.costPerKg)}</span>. {copy.modalIntro}
      </p>
      <form id="technical-cost-edit-form" onSubmit={onSubmit}>
        <div className="ff">
          <label>
            {copy.fieldNewCost}
            <span className="req">*</span>
            <input
              name="costPerKg"
              required
              inputMode="decimal"
              className="font-mono"
              placeholder="0.0000"
              value={costPerKg}
              onChange={(event) => setCostPerKg(event.currentTarget.value)}
            />
          </label>
        </div>
        <div className="ff-inline">
          <div className="ff">
            <label>
              {copy.fieldCurrency}
              <input
                name="currency"
                maxLength={3}
                className="font-mono uppercase"
                value={currency}
                onChange={(event) => setCurrency(event.currentTarget.value.toUpperCase())}
              />
            </label>
          </div>
          <div className="ff">
            <label>{copy.fieldSource}</label>
            <Select
              value={source}
              onValueChange={(v) => setSource(v as CostEditableSource)}
              options={sourceOptions}
              aria-label={copy.fieldSource}
            />
          </div>
        </div>
        <div className="ff">
          <label>
            {copy.fieldReason}
            <input
              name="notes"
              maxLength={2000}
              placeholder={copy.fieldReasonPlaceholder}
              value={notes}
              onChange={(event) => setNotes(event.currentTarget.value)}
            />
          </label>
        </div>
        {needsApprover ? (
          <div className="ff">
            <label>
              {copy.fieldApprover}
              <input
                name="approverUserId"
                className="font-mono"
                placeholder={copy.fieldApproverPlaceholder}
                value={approver}
                onChange={(event) => setApprover(event.currentTarget.value)}
              />
            </label>
          </div>
        ) : null}
      </form>
      {error ? (
        <p role="alert" className="ff-error">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

// ── History table (CostHistoryScreen:666-689) ──────────────────────────────────
function HistoryTable({ rows, copy }: { rows: CostHistoryRow[]; copy: CostManagerCopy }) {
  return (
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <table aria-label={copy.tableAriaLabel}>
        <thead>
          <tr>
            <th scope="col" style={{ width: 120 }}>
              {copy.colDate}
            </th>
            <th scope="col" style={{ width: 140 }}>
              {copy.colSource}
            </th>
            <th scope="col" style={{ textAlign: 'right', width: 130 }}>
              {copy.colCost}
            </th>
            <th scope="col" style={{ textAlign: 'right', width: 100 }}>
              {copy.colDelta}
            </th>
            <th scope="col">{copy.colReason}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            // Δ% vs the chronologically-previous (older) row, i.e. the NEXT row
            // in the newest-first list. Exact decimal-string math (no JS float).
            const prev = rows[i + 1];
            const delta = prev ? deltaPctExact(prev.costPerKg, row.costPerKg) : null;
            const deltaColor =
              delta === null || delta === '0.0'
                ? 'var(--muted)'
                : delta.startsWith('-')
                  ? 'var(--green-700)'
                  : 'var(--red-700)';
            return (
              <tr key={row.id}>
                <td className="mono text-xs" style={{ color: 'var(--muted)' }}>
                  {row.effectiveFrom}
                </td>
                <td>
                  <span className="badge badge-gray">
                    {row.source ? (copy.source[row.source as CostEditableSource] ?? row.source) : '—'}
                  </span>
                </td>
                <td className="num mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                  {formatCost(row.costPerKg)}
                </td>
                <td className="num mono" style={{ textAlign: 'right', fontWeight: 600, color: deltaColor }}>
                  {delta === null ? '—' : `${delta.startsWith('-') ? '' : '+'}${delta}%`}
                </td>
                <td className="text-sm">{row.currency}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CostManager({
  items,
  canEdit,
  copy = DEFAULT_COPY,
}: {
  items: CostItemOption[];
  canEdit: boolean;
  copy?: CostManagerCopy;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = React.useState<string>(items[0]?.id ?? '');
  const [rows, setRows] = React.useState<CostHistoryRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);

  const selected = items.find((it) => it.id === selectedId) ?? null;

  const loadHistory = React.useCallback((itemId: string) => {
    if (!itemId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setLoadError(false);
    void listCostHistory({ itemId })
      .then((result) => {
        if (result.ok) setRows(result.data.rows);
        else setLoadError(true);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    loadHistory(selectedId);
  }, [selectedId, loadHistory]);

  const itemOptions = items.map((it) => ({ value: it.id, label: `${it.itemCode} · ${it.name}` }));

  return (
    <div className="flex flex-col gap-4">
      <div className="card">
        <div className="flex flex-wrap items-end justify-between gap-4 p-4">
          <label className="label block">
            {copy.itemLabel}
            <div className="mt-1 w-80">
              <Select
                value={selectedId}
                onValueChange={setSelectedId}
                options={itemOptions}
                placeholder={copy.itemPlaceholder}
                aria-label={copy.itemLabel}
              />
            </div>
          </label>
          {canEdit && selected ? (
            <Button type="button" className="btn-primary" data-modal-id="TEC-COST-EDIT" onClick={() => setEditOpen(true)}>
              {copy.editCost}
            </Button>
          ) : null}
        </div>
      </div>

      {!selected ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">💰</div>
            <div className="empty-state-body">{copy.selectPrompt}</div>
          </div>
        </div>
      ) : loading ? (
        <div className="card">
          <div className="px-6 py-8">
            <div
              className="h-24 animate-pulse rounded-md"
              style={{ background: 'var(--gray-100)' }}
              aria-label={copy.loading}
            />
          </div>
        </div>
      ) : loadError ? (
        <div role="alert" className="alert alert-red">
          <div className="alert-title">{copy.loadError}</div>
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📈</div>
            <div className="empty-state-body">
              {copy.noHistory.replace('{code}', selected.itemCode)}
              {canEdit ? copy.noHistoryCanEdit : ''}
            </div>
          </div>
        </div>
      ) : (
        <>
          <Sparkline rows={rows} copy={copy} />
          <HistoryTable rows={rows} copy={copy} />
        </>
      )}

      {!canEdit ? (
        <div role="alert" className="alert alert-amber">
          {copy.readOnlyNotice}
        </div>
      ) : null}

      {editOpen && selected ? (
        <CostEditModal
          item={selected}
          copy={copy}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            loadHistory(selectedId);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

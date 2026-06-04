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

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { listCostHistory } from '../_actions/list-cost-history';
import { postCost } from '../_actions/post-cost';
import { COST_SOURCES, type CostActionError, type CostHistoryRow, type CostSource } from '../_actions/shared';
import type { CostItemOption } from '../_actions/list-cost-items';
import { deltaPctExact, formatCost } from './numeric';

const SOURCE_LABELS: Record<CostSource, string> = {
  manual: 'Manual',
  d365_sync: 'D365 sync',
  supplier_update: 'Supplier update',
  variance_roll: 'Variance roll',
};

const SOURCE_OPTIONS = COST_SOURCES.map((value) => ({ value, label: SOURCE_LABELS[value] }));

function errorLabel(error: CostActionError): string {
  switch (error) {
    case 'forbidden':
      return 'You do not have permission to record a cost change.';
    case 'invalid_input':
      return 'Please check the values and try again.';
    case 'not_found':
      return 'That item no longer exists.';
    case 'approver_required':
      return 'This cost change exceeds 20%. Enter an approver to record it (V-TEC-53).';
    default:
      return 'Could not save the cost change. Please try again.';
  }
}

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
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24"
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
        className="w-full max-w-lg rounded-xl border bg-white p-5 text-sm shadow-lg outline-none"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <button type="button" aria-label="Close" className="text-muted-foreground" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
        <div className="mt-4 flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}

// ── Sparkline (CostHistoryScreen:650-664) — pure SVG over the NUMERIC strings ───
function Sparkline({ rows }: { rows: CostHistoryRow[] }) {
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
    <Card className="rounded-xl border bg-white shadow-sm">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <strong className="text-sm">Sparkline · cost / kg</strong>
          <div className="text-xs text-muted-foreground">
            <span>
              min <b className="font-mono text-green-700">{formatCost(String(min))}</b>
            </span>
            <span className="ml-3.5">
              max <b className="font-mono text-red-700">{formatCost(String(max))}</b>
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
            return <line key={`l-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#2563eb" strokeWidth="2" />;
          })}
          {ordered.map((cost, i) => {
            const { x, y } = pt(cost, i);
            return <circle key={`c-${i}`} cx={x} cy={y} r="4" fill="#fff" stroke="#2563eb" strokeWidth="2" />;
          })}
        </svg>
      </CardContent>
    </Card>
  );
}

// ── Cost edit modal — records a new cost roll via postCost (NUMERIC-exact) ──────
function CostEditModal({
  item,
  onClose,
  onSaved,
}: {
  item: CostItemOption;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [costPerKg, setCostPerKg] = React.useState('');
  const [currency, setCurrency] = React.useState('PLN');
  const [source, setSource] = React.useState<CostSource>('manual');
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
        setError(errorLabel(result.error));
      }
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Edit cost · ${item.itemCode}`}
      footer={
        <>
          <Button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="btn-primary" form="technical-cost-edit-form" disabled={pending}>
            Record cost
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        Current cost / kg:{' '}
        <span className="font-mono tabular-nums">{formatCost(item.costPerKg)}</span>. Recording a new cost closes
        the active row and writes a history entry. Changes &gt; 20% require an approver (V-TEC-53).
      </p>
      <form id="technical-cost-edit-form" className="space-y-3" onSubmit={onSubmit}>
        <label className="block text-sm font-medium text-slate-700">
          New cost / kg
          <Input
            name="costPerKg"
            required
            inputMode="decimal"
            className="font-mono"
            placeholder="0.0000"
            value={costPerKg}
            onChange={(event) => setCostPerKg(event.currentTarget.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-slate-700">
            Currency
            <Input
              name="currency"
              maxLength={3}
              className="font-mono uppercase"
              value={currency}
              onChange={(event) => setCurrency(event.currentTarget.value.toUpperCase())}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Source
            <Select
              value={source}
              onValueChange={(v) => setSource(v as CostSource)}
              options={SOURCE_OPTIONS}
              aria-label="Cost source"
            />
          </label>
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Reason
          <Input
            name="notes"
            maxLength={2000}
            placeholder="Why is the cost changing?"
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
          />
        </label>
        {needsApprover ? (
          <label className="block text-sm font-medium text-slate-700">
            Approver (user id)
            <Input
              name="approverUserId"
              className="font-mono"
              placeholder="approver user UUID"
              value={approver}
              onChange={(event) => setApprover(event.currentTarget.value)}
            />
          </label>
        ) : null}
      </form>
      {error ? (
        <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

// ── History table (CostHistoryScreen:666-689) ──────────────────────────────────
function HistoryTable({ rows }: { rows: CostHistoryRow[] }) {
  return (
    <Card className="rounded-xl border bg-white shadow-sm">
      <CardContent className="p-0">
        <Table aria-label="Cost history">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Date</TableHead>
              <TableHead scope="col">Source</TableHead>
              <TableHead scope="col" className="text-right">
                Cost / kg
              </TableHead>
              <TableHead scope="col" className="text-right">
                Δ%
              </TableHead>
              <TableHead scope="col">Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => {
              // Δ% vs the chronologically-previous (older) row, i.e. the NEXT row
              // in the newest-first list. Exact decimal-string math (no JS float).
              const prev = rows[i + 1];
              const delta = prev ? deltaPctExact(prev.costPerKg, row.costPerKg) : null;
              const deltaClass =
                delta === null
                  ? 'text-muted-foreground'
                  : delta.startsWith('-')
                    ? 'text-green-700'
                    : delta === '0.0'
                      ? 'text-muted-foreground'
                      : 'text-red-700';
              return (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.effectiveFrom}
                  </TableCell>
                  <TableCell>
                    <Badge variant="muted">{row.source ? SOURCE_LABELS[row.source] : '—'}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold tabular-nums">
                    {formatCost(row.costPerKg)}
                  </TableCell>
                  <TableCell className={`text-right font-mono font-semibold tabular-nums ${deltaClass}`}>
                    {delta === null ? '—' : `${delta.startsWith('-') ? '' : '+'}${delta}%`}
                  </TableCell>
                  <TableCell className="text-sm">{row.currency}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function CostManager({ items, canEdit }: { items: CostItemOption[]; canEdit: boolean }) {
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
    <div className="flex flex-col gap-6">
      <Card className="rounded-xl border bg-white shadow-sm">
        <CardContent className="flex flex-wrap items-end justify-between gap-4 p-5">
          <label className="block text-sm font-medium text-slate-700">
            Item
            <div className="mt-1 w-80">
              <Select
                value={selectedId}
                onValueChange={setSelectedId}
                options={itemOptions}
                placeholder="Select an item…"
                aria-label="Select item"
              />
            </div>
          </label>
          {canEdit && selected ? (
            <Button type="button" className="btn-primary" data-modal-id="TEC-COST-EDIT" onClick={() => setEditOpen(true)}>
              Edit cost
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {!selected ? (
        <Card className="rounded-xl border bg-white shadow-sm">
          <CardContent className="px-6 py-8 text-center text-sm text-muted-foreground">
            Select an item to view its cost history.
          </CardContent>
        </Card>
      ) : loading ? (
        <Card className="rounded-xl border bg-white shadow-sm">
          <CardContent className="px-6 py-8">
            <div className="h-24 animate-pulse rounded-md bg-slate-100" aria-label="Loading cost history" />
          </CardContent>
        </Card>
      ) : loadError ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
          Unable to load cost history. Please try again.
        </div>
      ) : rows.length === 0 ? (
        <Card className="rounded-xl border bg-white shadow-sm">
          <CardContent className="px-6 py-8 text-center text-sm text-muted-foreground">
            No cost history yet for {selected.itemCode}.
            {canEdit ? ' Record the first cost roll to start the timeline.' : ''}
          </CardContent>
        </Card>
      ) : (
        <>
          <Sparkline rows={rows} />
          <HistoryTable rows={rows} />
        </>
      )}

      {!canEdit ? (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
          You can view cost history but do not have permission to edit master cost (technical.cost.edit).
        </div>
      ) : null}

      {editOpen && selected ? (
        <CostEditModal
          item={selected}
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

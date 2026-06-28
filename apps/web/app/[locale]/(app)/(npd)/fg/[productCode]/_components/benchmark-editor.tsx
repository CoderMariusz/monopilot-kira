'use client';

/**
 * BenchmarkEditor — FA Core tab multi-benchmark editor (migration 241).
 *
 * Replaces the single Core "Benchmark" <input> with a repeatable list of
 * {label, price} rows + "+ Add benchmark" + per-row remove. The separate
 * "Price (Brief)" Core field is unaffected.
 *
 * Prototype parity source:
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:513-514
 *   (Core form-grid "Benchmark" + "Price (Brief)" fields). This component owns
 *   the Benchmark cell only; it renders inside the Core form-grid where the single
 *   Benchmark field used to sit.
 *
 * Next16-safe: receives the Server Actions as PROPS (onUpsert/onDelete/onList) —
 * a client component never imports a 'use server' module directly, and function
 * props are the supported boundary. The Core tab loader passes the bound actions.
 *
 * shadcn/@monopilot/ui only (Card / Input / Button / Badge / EmptyState). No raw
 * <select>. i18n: every visible string is t('npd.benchmarks.*'), resolved by the
 * parent and passed via the `labels` prop (no inline English literals).
 *
 * Five states: ready / loading / empty / error / permission_denied.
 */

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader } from '@monopilot/ui/Card';
import { EmptyState } from '@monopilot/ui/EmptyState';
import Input from '@monopilot/ui/Input';

// Local row shape — mirrors the Server Action `Benchmark` result (string price).
export type BenchmarkRow = {
  id: string;
  label: string;
  price: string | null;
  displayOrder: number;
};

export type BenchmarkEditorState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type BenchmarkEditorLabels = {
  title: string;
  subtitle: string;
  countBadge: string; // e.g. "{n} benchmarks"
  labelHeader: string;
  priceHeader: string;
  labelPlaceholder: string;
  pricePlaceholder: string;
  add: string;
  save: string;
  saving: string;
  remove: string;
  saved: string;
  saveError: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
};

export type BenchmarkEditorProps = {
  productCode: string;
  /** Server-loaded initial rows (already org-scoped + RBAC-checked). */
  initialRows: BenchmarkRow[];
  labels: BenchmarkEditorLabels;
  state?: BenchmarkEditorState;
  /** Bound Server Actions (Next16-safe function props). */
  onUpsert: (input: {
    productCode: string;
    id?: string;
    label: string;
    price: string | null;
    displayOrder?: number;
  }) => Promise<BenchmarkRow>;
  onDelete: (input: { productCode: string; id: string }) => Promise<{ removed: boolean }>;
};

type DraftRow = {
  /** Stable client key; equals the persisted id once saved, else a temp key. */
  key: string;
  /** Persisted id (undefined for an unsaved new row). */
  id?: string;
  label: string;
  price: string;
  displayOrder: number;
};

let tempSeq = 0;
function nextTempKey(): string {
  tempSeq += 1;
  return `new-${tempSeq}`;
}

function toDraft(row: BenchmarkRow): DraftRow {
  return {
    key: row.id,
    id: row.id,
    label: row.label,
    price: row.price ?? '',
    displayOrder: row.displayOrder,
  };
}

function StateNotice({ state, labels }: { state: BenchmarkEditorState; labels: BenchmarkEditorLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="p-4 text-sm text-slate-600">
        {labels.loading}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="p-4 text-sm text-red-700">
        {labels.error}
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="p-4 text-sm text-red-700">
        {labels.forbidden}
      </div>
    );
  }
  return null;
}

export function BenchmarkEditor({
  productCode,
  initialRows,
  labels,
  state = 'ready',
  onUpsert,
  onDelete,
}: BenchmarkEditorProps) {
  const [rows, setRows] = React.useState<DraftRow[]>(() => initialRows.map(toDraft));
  const [savingKey, setSavingKey] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  );

  React.useEffect(() => {
    setRows(initialRows.map(toDraft));
  }, [initialRows]);

  function addRow() {
    setFeedback(null);
    setRows((prev) => [
      ...prev,
      { key: nextTempKey(), label: '', price: '', displayOrder: prev.length },
    ]);
  }

  function patchRow(key: string, patch: Partial<DraftRow>) {
    setFeedback(null);
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function saveRow(row: DraftRow) {
    if (row.label.trim() === '') {
      setFeedback({ tone: 'error', text: labels.saveError });
      return;
    }
    setSavingKey(row.key);
    setFeedback(null);
    try {
      const saved = await onUpsert({
        productCode,
        id: row.id,
        label: row.label.trim(),
        price: row.price.trim() === '' ? null : row.price.trim(),
        displayOrder: row.displayOrder,
      });
      // Promote a temp row to its persisted id; refresh values from the server.
      setRows((prev) =>
        prev.map((r) =>
          r.key === row.key
            ? { key: saved.id, id: saved.id, label: saved.label, price: saved.price ?? '', displayOrder: saved.displayOrder }
            : r,
        ),
      );
      setFeedback({ tone: 'success', text: labels.saved });
    } catch {
      setFeedback({ tone: 'error', text: labels.saveError });
    } finally {
      setSavingKey(null);
    }
  }

  async function removeRow(row: DraftRow) {
    setFeedback(null);
    // Unsaved row → just drop it locally.
    if (!row.id) {
      setRows((prev) => prev.filter((r) => r.key !== row.key));
      return;
    }
    setSavingKey(row.key);
    try {
      await onDelete({ productCode, id: row.id });
      setRows((prev) => prev.filter((r) => r.key !== row.key));
    } catch {
      setFeedback({ tone: 'error', text: labels.saveError });
    } finally {
      setSavingKey(null);
    }
  }

  const dataLoaded = state === 'ready' || state === 'empty';

  return (
    <section data-testid="fa-benchmark-editor" aria-labelledby="fa-benchmarks-title" className="space-y-3">
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="fa-benchmarks-title" className="text-sm font-semibold text-slate-900">
              {labels.title}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">{labels.subtitle}</p>
          </div>
          {dataLoaded ? (
            <Badge tone="muted" data-testid="fa-benchmarks-count">
              {labels.countBadge.replace('{n}', String(rows.length))}
            </Badge>
          ) : null}
        </CardHeader>

        <CardContent>
          {!dataLoaded ? (
            <StateNotice state={state} labels={labels} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="🏷️"
              title={labels.empty}
              body={labels.emptyBody}
              action={
                <Button type="button" data-testid="fa-benchmarks-add-empty" onClick={addRow}>
                  {labels.add}
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                <span>{labels.labelHeader}</span>
                <span>{labels.priceHeader}</span>
                <span className="sr-only">{labels.save}</span>
                <span className="sr-only">{labels.remove}</span>
              </div>

              {rows.map((row) => {
                const busy = savingKey === row.key;
                return (
                  <div
                    key={row.key}
                    data-testid="fa-benchmark-row"
                    data-row-id={row.id ?? ''}
                    className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2"
                  >
                    <Input
                      aria-label={labels.labelHeader}
                      value={row.label}
                      placeholder={labels.labelPlaceholder}
                      onChange={(e) => patchRow(row.key, { label: e.target.value })}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                    />
                    <Input
                      aria-label={labels.priceHeader}
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.price}
                      placeholder={labels.pricePlaceholder}
                      onChange={(e) => patchRow(row.key, { price: e.target.value })}
                      className="w-28 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-right text-sm text-slate-900"
                    />
                    <Button
                      type="button"
                      variant="default"
                      data-testid="fa-benchmark-save"
                      disabled={busy}
                      onClick={() => saveRow(row)}
                    >
                      {busy ? labels.saving : labels.save}
                    </Button>
                    <Button
                      type="button"
                      aria-label={labels.remove}
                      data-testid="fa-benchmark-remove"
                      disabled={busy}
                      onClick={() => removeRow(row)}
                      className="bg-transparent text-slate-500 hover:text-red-600"
                    >
                      ✕
                    </Button>
                  </div>
                );
              })}

              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  data-testid="fa-benchmarks-add"
                  onClick={addRow}
                  className="bg-transparent text-slate-700 hover:text-slate-900"
                >
                  + {labels.add}
                </Button>
              </div>
            </div>
          )}

          {feedback ? (
            <div
              role={feedback.tone === 'error' ? 'alert' : 'status'}
              aria-live={feedback.tone === 'error' ? 'assertive' : 'polite'}
              data-testid={`fa-benchmarks-feedback-${feedback.tone}`}
              className={
                feedback.tone === 'error'
                  ? 'mt-3 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700'
                  : 'mt-3 rounded-md border border-green-200 bg-green-50 p-2.5 text-sm text-green-700'
              }
            >
              {feedback.text}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

export default BenchmarkEditor;

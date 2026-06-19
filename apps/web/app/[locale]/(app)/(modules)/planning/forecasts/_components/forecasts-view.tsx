'use client';

/**
 * Wave E6 (second slice) — demand forecasts client grid (mig 302 demand_forecasts).
 *
 * Surface: an item × ISO-week matrix (forward window, default 12 weeks) with
 * inline-editable qty cells. Add-product picks a forecast-eligible item from
 * the REAL items master (searchForecastItems) and seeds an empty row;
 * copy-previous-week clones one week column into the next; the CSV importer is a
 * 4-step paste-driven flow. All writes go through the write-gated Server
 * Actions (planning.forecast.manage); the read gates on scheduler.run.read.
 *
 * Prototype note: no forecasts screen exists in prototypes/design/Monopilot
 * Design System/planning(-ext)/ — presentation follows the locked
 * MON-design-system conventions (card/table/badge/empty-state, Modal/Button/
 * Input/Select from @monopilot/ui, ItemPicker combobox) reused module-wide.
 *
 * No raw UUIDs: items render as code+name, weeks as ISO-week labels.
 * UI states: loading, permission-denied (amber note), error (red alert), empty
 * (CTA), grid; per-cell save pending/error; modal idle/pending/error.
 */
import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

import { ItemPicker } from '../../../../(npd)/_components/item-picker';
import type {
  ItemPickerOption,
  SearchItemsInput,
} from '../../../../../../(npd)/fa/actions/search-items';
import type {
  ForecastCell,
  ForecastGrid,
  ForecastItemRow,
  ForecastResult,
  CopyPreviousWeekResult,
  CsvImportSummary,
} from '../../_actions/forecasts';

export type ForecastsLabels = {
  add: string;
  copyWeek: string;
  copying: string;
  importCsv: string;
  empty: string;
  emptyHint: string;
  loading: string;
  denied: string;
  error: string;
  itemColumn: string;
  saving: string;
  cellError: string;
  copyResult: string;
  picker: {
    trigger: string;
    searchLabel: string;
    searchPlaceholder: string;
    loading: string;
    empty: string;
    cancel: string;
    error: string;
  };
  importModal: {
    title: string;
    step1: string;
    step2: string;
    step3: string;
    step4: string;
    pasteLabel: string;
    pastePlaceholder: string;
    parse: string;
    parsedRows: string;
    noRows: string;
    submit: string;
    submitting: string;
    cancel: string;
    close: string;
    resultImported: string;
    resultErrors: string;
    formatHint: string;
    colItem: string;
    colWeek: string;
    colQty: string;
  };
};

const QTY_PATTERN = /^\d+(?:\.\d{1,6})?$/;

type UpsertInput = { itemId: string; isoWeek: string; qty: string };
type CsvRow = { itemCode: string; isoWeek: string; qty: string };

export type ForecastsViewProps = {
  labels: ForecastsLabels;
  listAction: (weeks?: number) => Promise<ForecastResult<ForecastGrid>>;
  upsertAction: (input: UpsertInput) => Promise<ForecastResult<ForecastCell>>;
  copyWeekAction: (input: { fromWeek: string; toWeek: string }) => Promise<CopyPreviousWeekResult>;
  importCsvAction: (input: { rows: CsvRow[] }) => Promise<ForecastResult<CsvImportSummary>>;
  searchItemsAction: (input: SearchItemsInput) => Promise<ItemPickerOption[]>;
  /** Locale-aware ISO-week label formatter (server-composed; falls back to raw label). */
  weekFormatter?: (isoWeek: string) => string;
};

/** Trim a numeric string for display: drop trailing zeros / dot. */
function trimQty(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/\.?0+$/, '');
}

export function ForecastsView({
  labels,
  listAction,
  upsertAction,
  copyWeekAction,
  importCsvAction,
  searchItemsAction,
  weekFormatter,
}: ForecastsViewProps) {
  const [grid, setGrid] = React.useState<ForecastGrid | null>(null);
  const [state, setState] = React.useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  /** Items added in-session that have no stored cells yet (so they show an empty editable row). */
  const [extraItems, setExtraItems] = React.useState<ForecastItemRow[]>([]);
  const [copyMsg, setCopyMsg] = React.useState<string | null>(null);
  const [copying, setCopying] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);

  const load = React.useCallback(() => {
    setState('loading');
    listAction()
      .then((result) => {
        if (result.ok) {
          setGrid(result.data);
          setState('ready');
        } else {
          setState(result.error === 'forbidden' ? 'forbidden' : 'error');
        }
      })
      .catch(() => setState('error'));
  }, [listAction]);

  React.useEffect(() => {
    load();
  }, [load]);

  const formatWeek = (isoWeek: string): string =>
    weekFormatter ? weekFormatter(isoWeek) : isoWeek;

  // Merge stored rows with in-session extra (empty) rows, de-duplicated by item.
  const rows = React.useMemo<ForecastItemRow[]>(() => {
    if (!grid) return [];
    const stored = new Map(grid.rows.map((r) => [r.itemId, r]));
    const merged = [...grid.rows];
    for (const extra of extraItems) {
      if (!stored.has(extra.itemId)) merged.push(extra);
    }
    return merged.sort((a, b) => (a.itemCode ?? a.itemId).localeCompare(b.itemCode ?? b.itemId));
  }, [grid, extraItems]);

  const onAddItem = (item: ItemPickerOption) => {
    setExtraItems((prev) =>
      prev.some((r) => r.itemId === item.id) || grid?.rows.some((r) => r.itemId === item.id)
        ? prev
        : [
            ...prev,
            {
              itemId: item.id,
              itemCode: item.itemCode,
              itemName: item.name,
              uomBase: item.uomBase,
              cells: {},
            },
          ],
    );
  };

  const onCellSaved = (cell: ForecastCell) => {
    setGrid((prev) => {
      if (!prev) return prev;
      const rowsNext = prev.rows.map((r) => r);
      const idx = rowsNext.findIndex((r) => r.itemId === cell.itemId);
      if (idx >= 0) {
        const target = rowsNext[idx];
        rowsNext[idx] = { ...target, cells: { ...target.cells, [cell.isoWeek]: cell } };
      }
      return { ...prev, rows: rowsNext };
    });
  };

  const onCopyWeek = async () => {
    if (!grid || grid.weeks.length < 2) return;
    setCopyMsg(null);
    setCopying(true);
    try {
      const result = await copyWeekAction({ fromWeek: grid.weeks[0], toWeek: grid.weeks[1] });
      if (result.ok) {
        setCopyMsg(labels.copyResult.replace('{count}', String(result.data.copied)));
        load();
      }
    } finally {
      setCopying(false);
    }
  };

  const weeks = grid?.weeks ?? [];

  return (
    <div className="flex flex-col gap-6" data-testid="forecasts-view">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {copyMsg ? (
          <span className="mr-auto text-xs text-slate-500" data-testid="forecasts-copy-msg">
            {copyMsg}
          </span>
        ) : null}
        <ItemPicker
          searchItemsAction={searchItemsAction}
          onSelect={onAddItem}
          itemTypes={['fg', 'intermediate']}
          triggerClassName="btn btn--secondary btn-sm"
          labels={labels.picker}
        />
        <Button
          type="button"
          className="btn--secondary btn-sm"
          data-testid="forecasts-copy-week"
          disabled={copying || weeks.length < 2 || state !== 'ready'}
          onClick={onCopyWeek}
        >
          {copying ? labels.copying : labels.copyWeek}
        </Button>
        <Button
          type="button"
          className="btn--secondary btn-sm"
          data-testid="forecasts-import"
          disabled={state !== 'ready'}
          onClick={() => setImportOpen(true)}
        >
          {labels.importCsv}
        </Button>
      </div>

      {state === 'loading' ? (
        <div className="card px-6 py-4 text-sm text-slate-500" data-testid="forecasts-loading">
          {labels.loading}
        </div>
      ) : null}

      {state === 'forbidden' ? (
        <div
          role="note"
          data-testid="forecasts-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          {labels.denied}
        </div>
      ) : null}

      {state === 'error' ? (
        <div
          role="alert"
          data-testid="forecasts-error"
          className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
        >
          {labels.error}
        </div>
      ) : null}

      {state === 'ready' && rows.length === 0 ? (
        <div className="card">
          <div className="empty-state" data-testid="forecasts-empty">
            <div className="empty-state-icon" aria-hidden>
              📈
            </div>
            <div className="empty-state-body">{labels.empty}</div>
            <div className="mt-1 text-xs text-slate-400">{labels.emptyHint}</div>
          </div>
        </div>
      ) : null}

      {state === 'ready' && rows.length > 0 ? (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="forecasts-table">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="sticky left-0 z-10 bg-white px-3 py-2">{labels.itemColumn}</th>
                  {weeks.map((week) => (
                    <th key={week} className="px-2 py-2 text-right" data-testid={`forecasts-week-${week}`}>
                      {formatWeek(week)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.itemId} data-testid={`forecast-row-${row.itemCode ?? row.itemId}`}>
                    <td className="sticky left-0 z-10 bg-white px-3 py-2">
                      <div className="font-mono text-xs font-semibold text-slate-800">
                        {row.itemCode ?? row.itemId}
                      </div>
                      <div className="text-slate-600">{row.itemName ?? ''}</div>
                    </td>
                    {weeks.map((week) => (
                      <td key={week} className="px-1 py-1 text-right">
                        <ForecastCellInput
                          itemId={row.itemId}
                          itemCode={row.itemCode ?? row.itemId}
                          uomBase={row.uomBase}
                          isoWeek={week}
                          cell={row.cells[week] ?? null}
                          upsertAction={upsertAction}
                          onSaved={onCellSaved}
                          labels={labels}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {importOpen ? (
        <ImportCsvModal
          labels={labels}
          importCsvAction={importCsvAction}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function ForecastCellInput({
  itemId,
  itemCode,
  uomBase,
  isoWeek,
  cell,
  upsertAction,
  onSaved,
  labels,
}: {
  itemId: string;
  itemCode: string;
  uomBase: string | null;
  isoWeek: string;
  cell: ForecastCell | null;
  upsertAction: (input: UpsertInput) => Promise<ForecastResult<ForecastCell>>;
  onSaved: (cell: ForecastCell) => void;
  labels: ForecastsLabels;
}) {
  const initial = cell ? trimQty(cell.qty) : '';
  const [value, setValue] = React.useState(initial);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState(false);
  const lastSaved = React.useRef(initial);

  React.useEffect(() => {
    const next = cell ? trimQty(cell.qty) : '';
    setValue(next);
    lastSaved.current = next;
  }, [cell]);

  const commit = async () => {
    const trimmed = value.trim();
    if (trimmed === lastSaved.current) return;
    if (trimmed === '' || !QTY_PATTERN.test(trimmed)) {
      setError(true);
      return;
    }
    setError(false);
    setPending(true);
    try {
      const result = await upsertAction({ itemId, isoWeek, qty: trimmed });
      if (result.ok) {
        lastSaved.current = trimQty(result.data.qty);
        setValue(lastSaved.current);
        onSaved(result.data);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={value}
      disabled={pending}
      aria-busy={pending}
      aria-invalid={error}
      aria-label={`${itemCode} ${isoWeek}${uomBase ? ` ${uomBase}` : ''}`}
      data-testid={`forecast-cell-${itemCode}-${isoWeek}`}
      className={[
        'w-20 text-right font-mono text-xs tabular-nums',
        error ? 'border-red-400' : '',
        pending ? 'opacity-60' : '',
      ].join(' ')}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          void commit();
        }
      }}
    />
  );
}

/**
 * 4-step CSV importer (matches the technical/items import flow shape: paste →
 * parse/preview → submit → result). CSV columns: itemCode, isoWeek, qty.
 */
function ImportCsvModal({
  labels,
  importCsvAction,
  onClose,
  onImported,
}: {
  labels: ForecastsLabels;
  importCsvAction: (input: { rows: CsvRow[] }) => Promise<ForecastResult<CsvImportSummary>>;
  onClose: () => void;
  onImported: () => void;
}) {
  const [raw, setRaw] = React.useState('');
  const [parsed, setParsed] = React.useState<CsvRow[] | null>(null);
  const [pending, setPending] = React.useState(false);
  const [summary, setSummary] = React.useState<CsvImportSummary | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  const parse = () => {
    setFormError(null);
    const rows: CsvRow[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const cells = line.split(',').map((c) => c.trim());
      if (cells.length < 3 || cells[0] === '' || cells[0].toLowerCase() === 'itemcode') continue;
      rows.push({ itemCode: cells[0], isoWeek: cells[1], qty: cells[2] });
    }
    setParsed(rows);
    if (rows.length === 0) setFormError(labels.importModal.noRows);
  };

  const submit = async () => {
    if (!parsed || parsed.length === 0) return;
    setPending(true);
    setFormError(null);
    try {
      const result = await importCsvAction({ rows: parsed });
      if (result.ok) {
        setSummary(result.data);
      } else {
        setFormError(labels.importModal.noRows);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open onOpenChange={(open) => (!open ? onClose() : undefined)} size="lg" modalId="plan_forecast_import">
      <Modal.Header title={labels.importModal.title} />
      <Modal.Body>
        <div className="flex flex-col gap-4" data-testid="forecast-import">
          <ol className="flex flex-wrap gap-2 text-xs text-slate-500">
            <li className="rounded bg-slate-100 px-2 py-1">{labels.importModal.step1}</li>
            <li className="rounded bg-slate-100 px-2 py-1">{labels.importModal.step2}</li>
            <li className="rounded bg-slate-100 px-2 py-1">{labels.importModal.step3}</li>
            <li className="rounded bg-slate-100 px-2 py-1">{labels.importModal.step4}</li>
          </ol>

          {formError ? (
            <div
              role="alert"
              data-testid="forecast-import-error"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {formError}
            </div>
          ) : null}

          {summary ? (
            <div data-testid="forecast-import-summary" className="flex flex-col gap-2 text-sm">
              <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-green-800">
                {labels.importModal.resultImported.replace('{count}', String(summary.imported))}
              </div>
              {summary.errors.length > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                  {labels.importModal.resultErrors.replace('{count}', String(summary.errors.length))}
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">{labels.importModal.pasteLabel}</span>
                <textarea
                  value={raw}
                  data-testid="forecast-import-textarea"
                  placeholder={labels.importModal.pastePlaceholder}
                  onChange={(e) => setRaw(e.target.value)}
                  rows={6}
                  className="rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs"
                />
                <span className="text-xs text-slate-500">{labels.importModal.formatHint}</span>
              </label>

              <Button
                type="button"
                className="btn--secondary btn-sm self-start"
                data-testid="forecast-import-parse"
                onClick={parse}
              >
                {labels.importModal.parse}
              </Button>

              {parsed && parsed.length > 0 ? (
                <div className="overflow-x-auto" data-testid="forecast-import-preview">
                  <div className="mb-1 text-xs text-slate-500">
                    {labels.importModal.parsedRows.replace('{count}', String(parsed.length))}
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="px-2 py-1">{labels.importModal.colItem}</th>
                        <th className="px-2 py-1">{labels.importModal.colWeek}</th>
                        <th className="px-2 py-1 text-right">{labels.importModal.colQty}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.slice(0, 10).map((r, idx) => (
                        <tr key={`${r.itemCode}-${r.isoWeek}-${idx}`} className="border-t border-slate-100">
                          <td className="px-2 py-1 font-mono">{r.itemCode}</td>
                          <td className="px-2 py-1 font-mono">{r.isoWeek}</td>
                          <td className="px-2 py-1 text-right font-mono">{r.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        {summary ? (
          <Button type="button" className="btn--primary" data-testid="forecast-import-close" onClick={onImported}>
            {labels.importModal.close}
          </Button>
        ) : (
          <>
            <Button type="button" className="btn--ghost" data-testid="forecast-import-cancel" onClick={onClose}>
              {labels.importModal.cancel}
            </Button>
            <Button
              type="button"
              className="btn--primary"
              data-testid="forecast-import-submit"
              disabled={pending || !parsed || parsed.length === 0}
              aria-busy={pending}
              onClick={submit}
            >
              {pending ? labels.importModal.submitting : labels.importModal.submit}
            </Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}

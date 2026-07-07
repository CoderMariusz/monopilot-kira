'use client';

/**
 * WAVE E2B — Product temperature ranges settings screen (client island).
 *
 * Spec-driven (no exact prototype JSX exists for cold-chain). Parity pattern:
 * the labor-rates settings screen (settings/labor-rates/labor-rates-screen.client
 * — page head + primary CTA → editor dialog → upsert → list) and the established
 * ItemPicker (settings the item via the REAL items master, never free text / a raw
 * <select>). See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md §1.2 (nearest
 * reusable pattern when no JSX anchor exists).
 *
 * Editor: item picker (fg / intermediate / rm — the items that move through the
 * cold chain) + min/max °C numeric inputs + a "requires check" toggle, calling
 * upsertProductTempRange. The list shows one row per product range. All four UI
 * states render (loading / empty-with-CTA / error / data + permission-denied) and
 * a guard prevents min > max client-side (the action re-validates regardless).
 *
 * No raw UUIDs: rows are keyed by id but render item code/name/temps only. RBAC
 * (quality.coldchain.manage) is resolved server-side and threaded in as
 * `canManage`; affordances are disabled with a tooltip when absent.
 */
import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { ItemPicker, type ItemSearchFn } from '../../../../(npd)/_components/item-picker';
import type { ItemPickerOption } from '../../../../../../(npd)/fa/actions/search-items-types';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type TempRangeRow = {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  minTempC: number | null;
  maxTempC: number | null;
  requiresCheck: boolean;
};

export type UpsertTempRangeInput = {
  itemId: string;
  minTempC: number;
  maxTempC: number;
  requiresCheck: boolean;
};

export type UpsertTempRangeResult =
  | { ok: true; id: string }
  | { ok: false; error: 'forbidden' | 'invalid_input' | 'persistence_failed' };

export type TempRangesLabels = {
  eyebrow: string;
  title: string;
  subtitle: string;
  sectionTitle: string;
  provenance: string;
  addRange: string;
  emptyCta: string;
  columnItem: string;
  columnMin: string;
  columnMax: string;
  columnRequiresCheck: string;
  requiresCheckYes: string;
  requiresCheckNo: string;
  dialogAddTitle: string;
  fieldItem: string;
  fieldItemHelp: string;
  fieldMin: string;
  fieldMinHelp: string;
  fieldMax: string;
  fieldMaxHelp: string;
  fieldRequiresCheck: string;
  fieldRequiresCheckHelp: string;
  selectedItem: string;
  noItemSelected: string;
  save: string;
  savePending: string;
  cancel: string;
  createSuccess: string;
  saveFailed: string;
  invalidInput: string;
  minMaxOrder: string;
  insufficientPermission: string;
  loading: string;
  empty: string;
  error: string;
  forbidden: string;
  pickerTrigger: string;
  pickerSearchLabel: string;
  pickerSearchPlaceholder: string;
  pickerLoading: string;
  pickerEmpty: string;
  pickerCancel: string;
  pickerError: string;
};

type Draft = {
  item: ItemPickerOption | null;
  min: string;
  max: string;
  requiresCheck: boolean;
};

function emptyDraft(): Draft {
  return { item: null, min: '', max: '', requiresCheck: true };
}

function StateNotice({ state, labels }: { state: PageState; labels: TempRangesLabels }) {
  if (state === 'loading') return <div role="status" aria-live="polite">{labels.loading}</div>;
  if (state === 'empty') return <div role="status">{labels.empty}</div>;
  if (state === 'error') return <div role="alert">{labels.error}</div>;
  if (state === 'permission_denied') return <div role="alert">{labels.forbidden}</div>;
  return null;
}

const tempFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function formatTemp(value: number | null): string {
  return value === null ? '-' : `${tempFmt.format(value)} °C`;
}

export default function TempRangesScreen({
  initialRanges,
  labels,
  canManage,
  upsertTempRange,
  searchItems,
  state = 'ready',
}: {
  initialRanges: TempRangeRow[];
  labels: TempRangesLabels;
  canManage: boolean;
  upsertTempRange: (input: UpsertTempRangeInput) => Promise<UpsertTempRangeResult>;
  /** Item search seam (org-scoped searchItems) for the picker. */
  searchItems: ItemSearchFn<'fg' | 'intermediate' | 'rm'>;
  state?: PageState;
}) {
  const [rows, setRows] = React.useState<TempRangeRow[]>(() => [...initialRanges]);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [pending, setPending] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  function openAdd() {
    if (!canManage) return;
    setDraft(emptyDraft());
    setActionError(null);
    setDialogOpen(true);
  }

  async function submitDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || pending) return;
    const minValue = Number(draft.min);
    const maxValue = Number(draft.max);
    if (draft.item === null || draft.min === '' || draft.max === '' || !Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
      setActionError(labels.invalidInput);
      return;
    }
    if (minValue > maxValue) {
      setActionError(labels.minMaxOrder);
      return;
    }
    const item = draft.item;
    setPending(true);
    setActionError(null);
    setStatusMessage(null);
    try {
      const result = await upsertTempRange({
        itemId: item.id,
        minTempC: minValue,
        maxTempC: maxValue,
        requiresCheck: draft.requiresCheck,
      });
      if (!result.ok) {
        setActionError(result.error === 'invalid_input' ? labels.invalidInput : labels.saveFailed);
        return;
      }
      const saved: TempRangeRow = {
        id: result.id,
        itemId: item.id,
        itemCode: item.itemCode,
        itemName: item.name,
        minTempC: minValue,
        maxTempC: maxValue,
        requiresCheck: draft.requiresCheck,
      };
      setRows((current) => {
        // One range per item — replace any existing row for the same item.
        const without = current.filter((row) => row.itemId !== saved.itemId);
        return [saved, ...without].sort((a, b) => a.itemCode.localeCompare(b.itemCode));
      });
      setStatusMessage(labels.createSuccess);
      setDialogOpen(false);
      setDraft(emptyDraft());
    } catch {
      setActionError(labels.saveFailed);
    } finally {
      setPending(false);
    }
  }

  const effectiveState: PageState = state === 'empty' && rows.length > 0 ? 'ready' : state;
  const pickerLabels = {
    trigger: labels.pickerTrigger,
    searchLabel: labels.pickerSearchLabel,
    searchPlaceholder: labels.pickerSearchPlaceholder,
    loading: labels.pickerLoading,
    empty: labels.pickerEmpty,
    cancel: labels.pickerCancel,
    error: labels.pickerError,
  };

  return (
    <main
      data-testid="settings-temp-ranges-screen"
      data-screen="settings-temp-ranges-list"
      aria-labelledby="settings-temp-ranges-title"
      className="settings-screen settings-screen--temp-ranges space-y-4"
    >
      <header className="flex items-start justify-between gap-4" data-region="page-head">
        <div>
          <p className="settings-eyebrow">{labels.eyebrow}</p>
          <h1 id="settings-temp-ranges-title">{labels.title}</h1>
          <p className="muted">{labels.subtitle}</p>
        </div>
        <Button
          type="button"
          className="btn-primary"
          disabled={!canManage}
          title={!canManage ? labels.insufficientPermission : undefined}
          aria-label={canManage ? labels.addRange : `${labels.addRange} — ${labels.insufficientPermission}`}
          onClick={openAdd}
        >
          + {labels.addRange}
        </Button>
      </header>

      {statusMessage ? (
        <section role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm">
          {statusMessage}
        </section>
      ) : null}

      <section className="settings-section rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="temp-ranges-section-title">
        <div className="settings-section__head">
          <h2 id="temp-ranges-section-title">{labels.sectionTitle}</h2>
          <p className="muted text-sm">{labels.provenance}</p>
        </div>
        {actionError && !dialogOpen ? <div role="alert" className="mt-3 text-sm text-red-700">{actionError}</div> : null}
      </section>

      {dialogOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="temp-range-dialog-title"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <h2 id="temp-range-dialog-title" className="text-lg font-semibold text-slate-950">
                {labels.dialogAddTitle}
              </h2>
              <Button type="button" variant="dry-run" aria-label={labels.cancel} onClick={() => setDialogOpen(false)} disabled={pending}>
                x
              </Button>
            </div>
            <form onSubmit={(event) => void submitDraft(event)} className="mt-4 space-y-4">
              <div className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span id="temp-range-item-label">{labels.fieldItem}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <ItemPicker<'fg' | 'intermediate' | 'rm'>
                    labels={pickerLabels}
                    searchItemsAction={searchItems}
                    itemTypes={['fg', 'intermediate', 'rm']}
                    disabled={pending}
                    onSelect={(item) => setDraft((current) => ({ ...current, item }))}
                  />
                  <span data-testid="temp-range-selected-item" className="text-xs font-normal normal-case text-slate-700">
                    {draft.item ? (
                      <>
                        <span className="font-mono font-semibold text-blue-700">{draft.item.itemCode}</span>
                        <span className="ml-1 text-slate-800">{draft.item.name}</span>
                      </>
                    ) : (
                      <span className="text-slate-400">{labels.noItemSelected}</span>
                    )}
                  </span>
                </div>
                <span className="text-[11px] font-normal normal-case text-slate-500">{labels.fieldItemHelp}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="temp-range-min">
                  {labels.fieldMin}
                  <Input
                    id="temp-range-min"
                    aria-label={labels.fieldMin}
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={draft.min}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setDraft((current) => ({ ...current, min: value }));
                    }}
                    required
                    disabled={pending}
                  />
                  <span className="text-[11px] font-normal normal-case text-slate-500">{labels.fieldMinHelp}</span>
                </label>
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="temp-range-max">
                  {labels.fieldMax}
                  <Input
                    id="temp-range-max"
                    aria-label={labels.fieldMax}
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={draft.max}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setDraft((current) => ({ ...current, max: value }));
                    }}
                    required
                    disabled={pending}
                  />
                  <span className="text-[11px] font-normal normal-case text-slate-500">{labels.fieldMaxHelp}</span>
                </label>
              </div>
              <label className="flex items-start gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="temp-range-requires-check">
                <input
                  id="temp-range-requires-check"
                  aria-label={labels.fieldRequiresCheck}
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  checked={draft.requiresCheck}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setDraft((current) => ({ ...current, requiresCheck: checked }));
                  }}
                  disabled={pending}
                />
                <span className="flex flex-col gap-0.5">
                  <span>{labels.fieldRequiresCheck}</span>
                  <span className="text-[11px] font-normal normal-case text-slate-500">{labels.fieldRequiresCheckHelp}</span>
                </span>
              </label>
              {actionError ? <div role="alert" className="text-sm text-red-700">{actionError}</div> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="dry-run" onClick={() => setDialogOpen(false)} disabled={pending}>
                  {labels.cancel}
                </Button>
                <Button
                  type="submit"
                  className="btn-primary"
                  disabled={!canManage || pending}
                  aria-label={canManage ? labels.save : `${labels.save} — ${labels.insufficientPermission}`}
                >
                  {pending ? labels.savePending : labels.save}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="temp-range-list-title">
        <h2 id="temp-range-list-title" className="sr-only">{labels.sectionTitle}</h2>
        {effectiveState === 'ready' ? (
          rows.length > 0 ? (
            <Table aria-label={labels.title} className="w-full border-collapse text-left text-sm">
              <TableHeader className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <TableRow>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnItem}</TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right">{labels.columnMin}</TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right">{labels.columnMax}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnRequiresCheck}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {rows.map((range) => (
                  <TableRow
                    key={range.id}
                    data-testid="settings-temp-range-row"
                    data-range-id={range.id}
                    className="align-top hover:bg-slate-50"
                  >
                    <TableCell className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-950">{range.itemName}</span>
                        <span className="font-mono text-[11px] text-slate-500">{range.itemCode}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right font-mono text-sm tabular-nums text-slate-700">
                      {formatTemp(range.minTempC)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right font-mono text-sm tabular-nums text-slate-700">
                      {formatTemp(range.maxTempC)}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge
                        variant={range.requiresCheck ? 'info' : 'muted'}
                        aria-label={range.requiresCheck ? labels.requiresCheckYes : labels.requiresCheckNo}
                      >
                        {range.requiresCheck ? labels.requiresCheckYes : labels.requiresCheckNo}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-start gap-3 p-6">
              <p role="status" className="text-sm text-slate-600">{labels.empty}</p>
              <Button
                type="button"
                className="btn-primary"
                disabled={!canManage}
                title={!canManage ? labels.insufficientPermission : undefined}
                aria-label={canManage ? labels.emptyCta : `${labels.emptyCta} — ${labels.insufficientPermission}`}
                onClick={openAdd}
              >
                + {labels.emptyCta}
              </Button>
            </div>
          )
        ) : (
          <div className="p-4">
            <StateNotice state={effectiveState} labels={labels} />
          </div>
        )}
      </section>
    </main>
  );
}

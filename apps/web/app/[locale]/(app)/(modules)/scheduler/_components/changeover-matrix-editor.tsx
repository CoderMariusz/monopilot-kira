'use client';

/**
 * Wave E8 — /scheduler/changeover-matrix editor (client island).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/planning-ext/
 * matrix-screens.jsx:1-247 — the N×N FROM\TO grid (matrix-screens.jsx:101-143),
 * the single-cell editor opened on cell click (matrix-screens.jsx:122-138 →
 * matrix_cell_edit_modal), the diagonal "—" no-op cell (matrix-screens.jsx:118),
 * and the heatmap legend (matrix-screens.jsx:145-153). Honest deltas (deviation
 * log): the backend contract is one row per (from, to) with changeover_minutes +
 * requires_cleaning — there is no per-line override tab, version history, or
 * review queue in this slice, so those prototype tabs are omitted.
 *
 * Server-action seam (upsertChangeoverMatrixEntry) is injected by the RSC page;
 * RBAC is enforced server-side. UI states: empty (no profiles), error (save
 * error → inline alert), optimistic (saving disables the dialog).
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

import type {
  ChangeoverMatrixEntry,
  UpsertChangeoverMatrixEntryResult,
} from '../_actions/scheduler-types';
import { matrixCellIndex } from './scheduler-view-model';

export type ChangeoverMatrixLabels = {
  title: string;
  subtitle: string;
  fromTo: string; // "FROM \ TO" corner
  cellModalTitle: string; // "{from} → {to}"
  cost: string;
  washRequired: string;
  diagonalHint: string;
  emptyTitle: string;
  emptyHint: string;
  addPairTitle: string;
  allergenFrom: string;
  allergenTo: string;
  feasible: string;
  addPair: string;
  adding: string;
  save: string;
  saving: string;
  cancel: string;
  legend: {
    none: string;
    low: string;
    medium: string;
    high: string;
    wash: string;
  };
  errors: Record<string, string>;
};

type BootstrapValidationError = 'missing_from' | 'missing_to' | 'same_profile' | 'invalid_cost';

function validateBootstrapPair(
  from: string,
  to: string,
  costStr: string,
): BootstrapValidationError | null {
  const fromTrim = from.trim();
  const toTrim = to.trim();
  if (!fromTrim) return 'missing_from';
  if (!toTrim) return 'missing_to';
  if (fromTrim === toTrim) return 'same_profile';
  const cost = Number(costStr);
  if (!Number.isFinite(cost) || cost < 0) return 'invalid_cost';
  return null;
}

type UpsertAction = (
  entry: Partial<ChangeoverMatrixEntry>,
) => Promise<UpsertChangeoverMatrixEntryResult>;

type EditingCell = {
  from: string;
  to: string;
  cost: string;
  wash: boolean;
};

/** Heatmap class from the prototype's classifyCell (matrix-screens.jsx:4-10). */
function heatClass(minutes: number, wash: boolean): string {
  if (wash) return 'bg-violet-50 text-violet-800';
  if (minutes <= 0) return 'bg-emerald-50 text-emerald-700';
  if (minutes <= 15) return 'bg-green-100 text-green-800';
  if (minutes <= 45) return 'bg-amber-50 text-amber-800';
  return 'bg-red-50 text-red-700';
}

export function ChangeoverMatrixEditor({
  labels,
  profileKeys,
  entries,
  upsertAction,
}: {
  labels: ChangeoverMatrixLabels;
  profileKeys: string[];
  entries: ChangeoverMatrixEntry[];
  upsertAction: UpsertAction;
}) {
  const router = useRouter();
  const cells = React.useMemo(() => matrixCellIndex(entries), [entries]);

  const [editing, setEditing] = React.useState<EditingCell | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<string | null>(null);
  const [newFrom, setNewFrom] = React.useState('');
  const [newTo, setNewTo] = React.useState('');
  const [newCost, setNewCost] = React.useState('0');
  const [newFeasible, setNewFeasible] = React.useState(true);
  const [adding, setAdding] = React.useState(false);

  const errorLabel = (key: string) => labels.errors[key] ?? labels.errors.persistence_failed;

  const openCell = (from: string, to: string) => {
    if (from === to) return; // diagonal — no changeover
    const current = cells.get(`${from}→${to}`);
    setErrorKey(null);
    setEditing({
      from,
      to,
      cost: current ? String(current.changeoverMinutes) : '0',
      wash: current?.requiresCleaning ?? false,
    });
  };

  const closeCell = () => {
    if (saving) return;
    setEditing(null);
    setErrorKey(null);
  };

  const save = async () => {
    if (!editing) return;
    const cost = Number(editing.cost);
    if (!Number.isFinite(cost) || cost < 0) {
      setErrorKey('invalid_cost');
      return;
    }
    setSaving(true);
    setErrorKey(null);
    const result = await upsertAction({
      allergen_from: editing.from,
      allergen_to: editing.to,
      changeover_minutes: cost,
      requires_cleaning: editing.wash,
    });
    setSaving(false);
    if (result.ok) {
      setEditing(null);
      router.refresh();
    } else {
      setErrorKey(result.error);
    }
  };

  const addFirstPair = async () => {
    const validationError = validateBootstrapPair(newFrom, newTo, newCost);
    if (validationError) {
      setErrorKey(validationError);
      return;
    }
    const from = newFrom.trim();
    const to = newTo.trim();
    const cost = Number(newCost);
    setAdding(true);
    setErrorKey(null);
    const result = await upsertAction({
      allergen_from: from,
      allergen_to: to,
      changeover_minutes: cost,
      requires_cleaning: false,
      risk_level: newFeasible ? 'low' : 'segregated',
    });
    setAdding(false);
    if (result.ok) {
      router.refresh();
    } else {
      setErrorKey(result.error);
    }
  };

  if (profileKeys.length === 0) {
    return (
      <div
        data-testid="matrix-empty"
        className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8"
      >
        <div className="text-center">
          <p className="text-sm font-medium text-slate-700">{labels.emptyTitle}</p>
          <p className="mt-1 text-xs text-slate-500">{labels.emptyHint}</p>
        </div>
        <div className="mx-auto mt-6 max-w-md">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">{labels.addPairTitle}</h3>
          <div className="flex flex-col gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">{labels.allergenFrom}</span>
              <Input
                value={newFrom}
                data-testid="matrix-add-from"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewFrom(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">{labels.allergenTo}</span>
              <Input
                value={newTo}
                data-testid="matrix-add-to"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTo(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">{labels.cost}</span>
              <Input
                type="number"
                min={0}
                step={1}
                value={newCost}
                data-testid="matrix-add-cost"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCost(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={newFeasible}
                data-testid="matrix-add-feasible"
                onChange={(e) => setNewFeasible(e.target.checked)}
              />
              <span className="text-xs font-medium text-slate-600">{labels.feasible}</span>
            </label>
            {errorKey ? (
              <p
                role="alert"
                data-testid="matrix-add-error"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
              >
                {errorLabel(errorKey)}
              </p>
            ) : null}
            <Button
              type="button"
              className="btn--primary"
              data-testid="matrix-add-submit"
              onClick={addFirstPair}
              disabled={adding}
            >
              {adding ? labels.adding : labels.addPair}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="changeover-matrix">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-max border-collapse text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-600"
              >
                {labels.fromTo}
              </th>
              {profileKeys.map((to) => (
                <th
                  key={to}
                  scope="col"
                  data-testid={`matrix-col-${to}`}
                  className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-slate-700"
                >
                  {to}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profileKeys.map((from) => (
              <tr key={from} data-testid={`matrix-row-${from}`}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-700"
                >
                  {from}
                </th>
                {profileKeys.map((to) => {
                  const isDiag = from === to;
                  const cell = cells.get(`${from}→${to}`);
                  const minutes = cell?.changeoverMinutes ?? 0;
                  const wash = cell?.requiresCleaning ?? false;
                  return (
                    <td key={to} className="border-b border-slate-100 p-0.5 text-center">
                      <button
                        type="button"
                        data-testid={`matrix-cell-${from}-${to}`}
                        onClick={() => openCell(from, to)}
                        disabled={isDiag}
                        title={
                          isDiag
                            ? labels.diagonalHint
                            : `${from} → ${to}: ${minutes}${wash ? ` · ${labels.washRequired}` : ''}`
                        }
                        aria-label={`${from} → ${to}`}
                        className={[
                          'flex h-9 w-full min-w-14 items-center justify-center gap-1 rounded-md text-xs font-medium',
                          isDiag
                            ? 'cursor-default bg-slate-100 text-slate-400'
                            : `cursor-pointer hover:ring-2 hover:ring-sky-300 ${heatClass(minutes, wash)}`,
                        ].join(' ')}
                      >
                        {isDiag ? '—' : minutes}
                        {!isDiag && wash ? <span aria-hidden>⟳</span> : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend — matrix-screens.jsx:145-153. */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-emerald-50" aria-hidden />
          {labels.legend.none}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-green-100" aria-hidden />
          {labels.legend.low}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-amber-50" aria-hidden />
          {labels.legend.medium}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-red-50" aria-hidden />
          {labels.legend.high}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-violet-50" aria-hidden />
          {labels.legend.wash}
        </span>
      </div>

      {/* Single-cell editor — matrix_cell_edit_modal (matrix-screens.jsx:122-138). */}
      <Modal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) closeCell();
        }}
        size="sm"
        modalId="changeover-matrix-cell-modal"
      >
        {editing ? (
          <>
            <Modal.Header
              title={labels.cellModalTitle
                .replace('{from}', editing.from)
                .replace('{to}', editing.to)}
            />
            <Modal.Body>
              <div className="flex flex-col gap-4 text-sm">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-600">{labels.cost}</span>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={editing.cost}
                    data-testid="matrix-cost-input"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEditing((prev) => (prev ? { ...prev, cost: e.target.value } : prev))
                    }
                  />
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editing.wash}
                    data-testid="matrix-wash-toggle"
                    onChange={(e) =>
                      setEditing((prev) => (prev ? { ...prev, wash: e.target.checked } : prev))
                    }
                  />
                  <span className="text-xs font-medium text-slate-600">{labels.washRequired}</span>
                </label>
                {errorKey ? (
                  <p
                    role="alert"
                    data-testid="matrix-cell-error"
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                  >
                    {errorLabel(errorKey)}
                  </p>
                ) : null}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button type="button" onClick={closeCell} disabled={saving}>
                {labels.cancel}
              </Button>
              <Button
                type="button"
                className="btn--primary"
                data-testid="matrix-cell-save"
                onClick={save}
                disabled={saving}
              >
                {saving ? labels.saving : labels.save}
              </Button>
            </Modal.Footer>
          </>
        ) : null}
      </Modal>
    </div>
  );
}

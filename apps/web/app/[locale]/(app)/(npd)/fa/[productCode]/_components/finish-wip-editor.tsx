'use client';

/**
 * FinishWipEditor — multi-row "Finish WIP (production components)" editor for the
 * FG (FA) Core tab. Replaces the single comma-separated "Finish Meat / Recipe
 * components → Ingredient codes (auto)" Core field with a proper per-component
 * table backed by the REAL `prod_detail` table.
 *
 * Prototype parity (1:1 structural translation, shadcn/@monopilot/ui):
 *   prototypes/design/Monopilot Design System/npd/formulation-screens.jsx:78-151
 *   (SCR-07 FormulationEditor — ProdDetail multi-component editor: one card/row
 *   per component, mono PR code, "auto" fields rendered read-only with the green
 *   background `#E0FFE0`, "Save all"/"Add"/"Back" actions). Here we collapse the
 *   accordion into an inline editable table to fit the Core tab, preserving the
 *   per-component row + read-only-green auto code semantics.
 *
 * Multi vs single component (ProdDetail aggregate rule):
 *   - isMultiComponent === true  → add/remove ENABLED; many rows allowed.
 *   - isMultiComponent === false → exactly ONE locked row mirroring the Main
 *     Table; add/remove are DISABLED (single-component products mirror, not edit).
 *
 * Auto-derived RM/intermediate code (read-only GREEN, like Ingredient codes):
 *   `row.ingredientCode` is derived server-side from the component code via the
 *   cascade engine (chain 3) — the client NEVER authors it. The cell is
 *   read-only and styled green to match the Core tab's "auto" fields.
 *
 * Next16 RSC-safe: only plain-data props + Server Action function props
 * (onAddRow / onRemoveRow / onUpdateRow) are passed in. No value imports from a
 * server module; the page wires the real actions.
 *
 * 5 UI states: loading / empty / error / permission_denied / ready (+ optimistic
 * add-remove with rollback on failure).
 */

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader } from '@monopilot/ui/Card';
import { EmptyState } from '@monopilot/ui/EmptyState';
import Input from '@monopilot/ui/Input';

import type {
  AddProdDetailRowResult,
  FinishWipRow,
  RemoveProdDetailRowResult,
  UpdateProdDetailRowResult,
} from '../_actions/finish-wip-types';

export type FinishWipEditorState =
  | 'ready'
  | 'loading'
  | 'empty'
  | 'error'
  | 'permission_denied';

export type FinishWipEditorLabels = {
  title: string;
  subtitle: string;
  multiBadge: string;
  singleBadge: string;
  componentHeader: string;
  autoCodeHeader: string;
  weightHeader: string;
  actionsHeader: string;
  autoHint: string;
  addRow: string;
  removeRow: string;
  componentPlaceholder: string;
  singleLockedHint: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
  saving: string;
  saveError: string;
};

export type FinishWipEditorProps = {
  productCode: string;
  /** Real prod_detail rows (server-loaded, display order). */
  rows: FinishWipRow[];
  /**
   * Multi-component template? Derived server-side from the product template
   * (template starts with "Multi") OR more than one recipe component. When false
   * the editor shows exactly one locked mirror row and disables add/remove.
   */
  isMultiComponent: boolean;
  labels: FinishWipEditorLabels;
  state?: FinishWipEditorState;
  /** Server Actions (RSC-safe function props). Required in the ready state. */
  onAddRow?: (input: {
    productCode: string;
    intermediateCode: string;
  }) => Promise<AddProdDetailRowResult>;
  onRemoveRow?: (input: {
    productCode: string;
    prodDetailId: string;
  }) => Promise<RemoveProdDetailRowResult>;
  onUpdateRow?: (input: {
    productCode: string;
    prodDetailId: string;
    intermediateCode: string;
  }) => Promise<UpdateProdDetailRowResult>;
};

// ---------------------------------------------------------------------------
// State notices
// ---------------------------------------------------------------------------

function StateNotice({
  state,
  labels,
}: {
  state: FinishWipEditorState;
  labels: FinishWipEditorLabels;
}) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="p-6 text-sm text-slate-600">
        {labels.loading}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="p-6 text-sm text-red-700">
        {labels.error}
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="p-6 text-sm text-red-700">
        {labels.forbidden}
      </div>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export function FinishWipEditor({
  productCode,
  rows,
  isMultiComponent,
  labels,
  state = 'ready',
  onAddRow,
  onRemoveRow,
  onUpdateRow,
}: FinishWipEditorProps) {
  const [localRows, setLocalRows] = React.useState<FinishWipRow[]>(rows);
  const [pending, setPending] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [newCode, setNewCode] = React.useState('');

  React.useEffect(() => {
    setLocalRows(rows);
  }, [rows]);

  const Header = (
    <CardHeader>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{labels.title}</h3>
          <p className="text-xs text-slate-500">{labels.subtitle}</p>
        </div>
        <Badge variant={isMultiComponent ? 'default' : 'secondary'}>
          {isMultiComponent ? labels.multiBadge : labels.singleBadge}
        </Badge>
      </div>
    </CardHeader>
  );

  if (state !== 'ready') {
    return (
      <Card data-testid="finish-wip-editor" data-state={state}>
        {Header}
        <CardContent>
          <StateNotice state={state} labels={labels} />
        </CardContent>
      </Card>
    );
  }

  // Single-component: clamp to exactly one (locked, mirror) row.
  const displayRows = isMultiComponent ? localRows : localRows.slice(0, 1);
  const canMutate = isMultiComponent && !pending;

  async function handleAdd() {
    const code = newCode.trim();
    if (!code || !onAddRow || !canMutate) return;
    setErrorMsg(null);
    setPending(true);
    // Optimistic insert.
    const optimistic: FinishWipRow = {
      id: `optimistic-${code}`,
      componentIndex: localRows.length + 1,
      intermediateCode: code,
      ingredientCode: '…',
      componentWeight: null,
    };
    setLocalRows((prev) => [...prev, optimistic]);
    setNewCode('');
    try {
      const created = await onAddRow({ productCode, intermediateCode: code });
      setLocalRows((prev) => prev.map((r) => (r.id === optimistic.id ? created : r)));
    } catch {
      setLocalRows((prev) => prev.filter((r) => r.id !== optimistic.id));
      setErrorMsg(labels.saveError);
    } finally {
      setPending(false);
    }
  }

  async function handleRemove(row: FinishWipRow) {
    if (!onRemoveRow || !canMutate || !row.id) return;
    setErrorMsg(null);
    setPending(true);
    const snapshot = localRows;
    setLocalRows((prev) => prev.filter((r) => r.id !== row.id));
    try {
      await onRemoveRow({ productCode, prodDetailId: row.id });
    } catch {
      setLocalRows(snapshot);
      setErrorMsg(labels.saveError);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card data-testid="finish-wip-editor" data-state="ready" data-multi={String(isMultiComponent)}>
      {Header}
      <CardContent>
        {displayRows.length === 0 ? (
          <EmptyState
            icon={<span aria-hidden="true">🧩</span>}
            title={labels.empty}
            body={labels.emptyBody}
            action={
              <Button
                type="button"
                onClick={handleAdd}
                disabled={!canMutate || newCode.trim() === ''}
              >
                {labels.addRow}
              </Button>
            }
          />
        ) : (
          <table className="w-full text-sm" data-testid="finish-wip-table">
            <thead>
              <tr className="text-left text-xs font-medium text-slate-500">
                <th scope="col" className="px-2 py-1">
                  {labels.componentHeader}
                </th>
                <th scope="col" className="px-2 py-1">
                  {labels.autoCodeHeader}
                </th>
                <th scope="col" className="px-2 py-1">
                  {labels.weightHeader}
                </th>
                {isMultiComponent ? (
                  <th scope="col" className="px-2 py-1">
                    {labels.actionsHeader}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => (
                <tr key={row.id || row.componentIndex} data-testid="finish-wip-row" data-component={row.intermediateCode}>
                  <td className="px-2 py-1">
                    <span className="font-mono text-slate-800">{row.intermediateCode}</span>
                  </td>
                  <td className="px-2 py-1">
                    {/* AUTO-derived RM/intermediate code — read-only GREEN (mirrors
                        the Core tab "Ingredient codes (auto)" field). */}
                    <Input
                      aria-label={labels.autoCodeHeader}
                      value={row.ingredientCode}
                      readOnly
                      aria-readonly="true"
                      data-testid="finish-wip-auto-code"
                      className="rounded-md border border-green-200 bg-green-50 px-2 py-1.5 font-mono text-sm text-slate-800"
                    />
                  </td>
                  <td className="px-2 py-1 text-slate-600">
                    {row.componentWeight !== null ? `${row.componentWeight}` : '—'}
                  </td>
                  {isMultiComponent ? (
                    <td className="px-2 py-1">
                      <Button
                        type="button"
                        className="text-red-600"
                        onClick={() => void handleRemove(row)}
                        disabled={!canMutate || !row.id}
                        data-testid="finish-wip-remove"
                      >
                        {labels.removeRow}
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Add-component row — only when multi-component. */}
        {isMultiComponent ? (
          <div className="mt-3 flex items-end gap-2">
            <div className="grid gap-1">
              <label htmlFor="finish-wip-new" className="text-xs font-medium text-slate-700">
                {labels.componentHeader}
              </label>
              <Input
                id="finish-wip-new"
                value={newCode}
                placeholder={labels.componentPlaceholder}
                onChange={(e) => setNewCode(e.target.value)}
                disabled={pending}
                data-testid="finish-wip-new-code"
              />
            </div>
            <Button
              type="button"
              onClick={handleAdd}
              disabled={!canMutate || newCode.trim() === ''}
              data-testid="finish-wip-add"
            >
              {pending ? labels.saving : labels.addRow}
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500" data-testid="finish-wip-single-hint">
            {labels.singleLockedHint}
          </p>
        )}

        {errorMsg ? (
          <p role="alert" className="mt-2 text-xs text-red-700">
            {errorMsg}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default FinishWipEditor;

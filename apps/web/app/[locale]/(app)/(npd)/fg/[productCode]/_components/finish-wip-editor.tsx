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
 * 5 UI states: loading / empty / error / permission_denied / ready.
 *
 * BUG 4b — READ-ONLY / informational table (owner preference). These `prod_detail`
 * WIP rows do NOT flow into the generated BOM (the BOM RM lines come from
 * formulation_ingredients), so the table only DISPLAYS existing rows. The add-row,
 * the per-row remove control, and the actions column are NOT rendered. The
 * onAddRow / onRemoveRow / onUpdateRow Server Action props are still accepted (the
 * page keeps wiring them) but no mutating UI is exposed here.
 */

import { Badge } from '@monopilot/ui/Badge';
import { Card, CardContent, CardHeader } from '@monopilot/ui/Card';
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
  rows,
  isMultiComponent,
  labels,
  state = 'ready',
}: FinishWipEditorProps) {
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

  // BUG 4b — READ-ONLY informational table. Single-component still clamps to one
  // mirror row; multi-component lists every prod_detail row. No add/edit/delete
  // affordances are rendered (these rows do not flow into the generated BOM).
  const displayRows = isMultiComponent ? rows : rows.slice(0, 1);

  return (
    <Card data-testid="finish-wip-editor" data-state="ready" data-multi={String(isMultiComponent)} data-readonly="true">
      {Header}
      <CardContent>
        {displayRows.length === 0 ? (
          // Read-only empty state — informational only, NO add affordance (the
          // table never mutates). A plain notice instead of the EmptyState
          // primitive, which requires an action element.
          <div
            data-testid="finish-wip-empty"
            className="flex flex-col items-center gap-1 py-6 text-center"
          >
            <span aria-hidden="true">🧩</span>
            <p className="text-sm font-medium text-slate-700">{labels.empty}</p>
            <p className="text-xs text-slate-500">{labels.emptyBody}</p>
          </div>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Informational note — this table is read-only; no add/edit/delete UI. */}
        <p className="mt-3 text-xs text-slate-500" data-testid="finish-wip-single-hint">
          {labels.singleLockedHint}
        </p>
      </CardContent>
    </Card>
  );
}

export default FinishWipEditor;

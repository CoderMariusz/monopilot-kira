'use client';

/**
 * T-024 — FaProductionTab (SCR-03d FA detail Production tab) — schema-driven
 * ProdDetail per-component rows editor.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:571-653 (fa_production_tab)
 *   FAProductionTab: "Production detail — N component(s)" card with the
 *   "Edits reset Built flag automatically." sub-line; an amber locked alert
 *   ("Blocked: Pack_Size must be filled in Core …") when Pack_Size is missing;
 *   one block per ProdDetail component, each with the intermediate (PR) code +
 *   component label + weight + a V06 pass/warn badge, a 4-column grid of
 *   Process 1..4 (Select) + Yield P1..4 (Input number) + PR code P1..4 (auto,
 *   read-only GREEN), then Line * (Select), Dieset/equipment_setup (auto,
 *   read-only GREEN), Yield Line * (number), Staffing (text), Rate * (number),
 *   PR Code Final (auto, read-only GREEN); a read-only GREEN aggregate summary
 *   row when N>1; and a "Save Production" action row.
 *
 * STANDALONE component (this slice): the FA detail shell (fa-tabs.tsx) owns the
 * tab slots; per-tab wiring is T-105. This file deliberately does NOT edit
 * fa-tabs.tsx — it exports a tab body that T-105 will mount into the Production
 * slot.
 *
 * Schema-driven (NO hardcoded column list — task red line):
 *   The editable Production column set comes entirely from the `columns` prop,
 *   which the future T-105 server loader derives from `Reference.DeptColumns`
 *   (dept_code='Production') via the T-014 buildDeptZod runtime / dept-column
 *   metadata. The per-component values come from the real `prod_detail` rows
 *   (composite PK org_id + product_code), passed in as `rows`. NO mock data here.
 *
 * Write path (real data, RLS): each dirty editable cell is persisted by calling
 *   `updateFaCell(productCode, columnKey, value, { componentIndex })` (T-009,
 *   merged). That Server Action runs inside `withOrgContext` (app_user + RLS),
 *   re-validates the value against DeptColumns, enforces the per-dept RBAC
 *   permission server-side, and fires the cascades:
 *     - manufacturing_operation_N change → Chain 2 (derive intermediate_code_pN
 *       and intermediate_code_final from the process suffix).
 *     - line change                      → Chain 1 (autofill equipment_setup).
 *   The client NEVER trusts a client-side permission flag and NEVER writes the
 *   auto-derived intermediate_code_* / equipment_setup columns (read-only red
 *   line). Cascade logic lives ONLY server-side — never duplicated here.
 *
 * shadcn primitives only: Input / Select / Card / Badge / Button / EmptyState
 *   from @monopilot/ui. Raw <select> is a red line — dropdown columns render the
 *   shadcn Select.
 *
 * i18n: every visible string is a prop (npd.faProductionTab namespace, resolved
 *   server-side). No inline English literals.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@monopilot/ui/Select';

import { updateFaCell } from '../../../../../../(npd)/fa/actions/update-fa-cell';
import {
  addProdDetailComponent,
  removeProdDetailComponent,
} from '../../../../../../(npd)/fa/actions/add-prod-detail-component';
import { searchItems, type ItemPickerOption } from '../../../../../../(npd)/fa/actions/search-items';
import { ItemPicker, type ItemPickerLabels, type ItemSearchFn } from '../../../_components/item-picker';

// ---------------------------------------------------------------------------
// Types (schema-driven — mirror Reference.DeptColumns metadata + prod_detail)
// ---------------------------------------------------------------------------

export type FaProductionColumnType = 'text' | 'number' | 'date' | 'boolean' | 'dropdown' | 'formula';

export type FaProductionColumn = {
  /** Physical (lower-cased) prod_detail column key, e.g. 'manufacturing_operation_1'. */
  key: string;
  /** Resolved data type from DeptColumns (drives the control). */
  dataType: FaProductionColumnType;
  /** required_for_done — drives the required marker. */
  required: boolean;
  /** Read-only in the UI (auto-derived / formula). Never submitted. */
  readOnly: boolean;
  /** Auto-derived field (intermediate_code_*, equipment_setup) — styled green. */
  auto?: boolean;
  /** Reference dropdown table name (when dataType === 'dropdown'). */
  dropdownSource?: string;
  /** display_order (ascending) — render order within a component block. */
  displayOrder: number;
};

/** One real `prod_detail` row (per component). Composite PK org_id + product_code. */
export type ProdDetailRow = {
  /** prod_detail.id (stable React key + persistence target). */
  id: string;
  /** prod_detail.component_index (1-based). */
  componentIndex: number;
  /** prod_detail.intermediate_code — the component's PR code header. */
  intermediateCode: string;
  /** Human label for the component (optional). */
  componentLabel?: string;
  /** prod_detail.component_weight (grams). */
  componentWeight?: number | null;
  /** Server-computed V06 yield-chain completeness status. */
  v06Status: 'pass' | 'warn';
  /** Cell values keyed by physical column key (from the real prod_detail row). */
  values: Record<string, unknown>;
};

export type FaProductionTabState =
  | 'ready'
  | 'loading'
  | 'empty'
  | 'error'
  | 'permission_denied';

export type FaProductionTabLabels = {
  title: string;
  /** ICU-ready "{count} component(s)" — pre-formatted server-side. */
  componentsCount: string;
  subtitle: string;
  lockedTitle: string;
  lockedBody: string;
  v06Pass: string;
  v06Warn: string;
  aggregateTitle: string;
  autoHint: string;
  singleComponent: string;
  save: string;
  saving: string;
  saveSuccess: string;
  saveError: string;
  selectPlaceholder: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
  /** "+ Add production component" affordance + empty-state CTA. */
  addComponent: string;
  emptyCtaBody: string;
  removeComponent: string;
  removeError: string;
  /** Item-picker (combobox over the real items master) labels. */
  picker: ItemPickerLabels;
  /** Per-column human label keyed by physical column key. */
  fields: Record<string, string>;
};

export type FaProductionTabProps = {
  productCode: string;
  /** Pack_Size gate (Core). When false, every editable control is disabled. */
  packSizeFilled: boolean;
  /** Schema-driven Production column metadata (Reference.DeptColumns, server-loaded). */
  columns: FaProductionColumn[];
  /** Real prod_detail rows (one per component), server-loaded. */
  rows: ProdDetailRow[];
  /** Dropdown option values keyed by dropdownSource (Reference tables). */
  dropdowns: Record<string, string[]>;
  labels: FaProductionTabLabels;
  state?: FaProductionTabState;
  /** Test/wiring seam: override the write path (defaults to T-009 updateFaCell). */
  onPersistCell?: (
    productCode: string,
    columnKey: string,
    value: unknown,
    meta: { componentIndex: number },
  ) => Promise<unknown>;
  /** Server-side production-write permission (drives the add/remove affordances). */
  canWrite?: boolean;
  /** Test/wiring seam: item-search action (defaults to org-scoped searchItems). */
  onSearchItems?: ItemSearchFn;
  /** Test/wiring seam: add-component action (defaults to addProdDetailComponent). */
  onAddComponent?: typeof addProdDetailComponent;
  /** Test/wiring seam: remove-component action (defaults to removeProdDetailComponent). */
  onRemoveComponent?: typeof removeProdDetailComponent;
  /** Refresh callback after add/remove (defaults to router.refresh in the page). */
  onMutated?: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stringify a prod_detail value for an editable control (null/undefined → ''). */
function toFieldString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function fieldLabel(col: FaProductionColumn, labels: FaProductionTabLabels): string {
  return labels.fields[col.key] ?? col.key;
}

function sortColumns(columns: FaProductionColumn[]): FaProductionColumn[] {
  return [...columns].sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    return a.key.localeCompare(b.key);
  });
}

/** Replace the "{count}" placeholder in a pre-translated string. */
function withCount(template: string, count: number): string {
  return template.replace('{count}', String(count));
}

function uniqueJoin(rows: ProdDetailRow[], key: string): string {
  return [...new Set(rows.map((r) => toFieldString(r.values[key])).filter(Boolean))].join(', ');
}

// ---------------------------------------------------------------------------
// State notices (loading / error / permission_denied)
// ---------------------------------------------------------------------------

function StateNotice({
  state,
  labels,
}: {
  state: FaProductionTabState;
  labels: FaProductionTabLabels;
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
// Single schema-driven cell control (within a component block)
// ---------------------------------------------------------------------------

function ProductionField({
  col,
  labels,
  value,
  options,
  disabled,
  fieldId,
  onChange,
}: {
  col: FaProductionColumn;
  labels: FaProductionTabLabels;
  value: string;
  options: string[];
  disabled: boolean;
  fieldId: string;
  onChange: (next: string) => void;
}) {
  const label = fieldLabel(col, labels);
  const hintId = `${fieldId}-hint`;
  const isAuto = col.auto === true;
  const isReadOnly = col.readOnly === true;

  // Auto-derived / read-only columns: read-only Input; auto → green styling.
  if (isReadOnly) {
    return (
      <div className="grid gap-1" data-field={col.key} data-readonly="true">
        <label htmlFor={fieldId} className="text-xs font-medium text-slate-700">
          {label}
        </label>
        <Input
          id={fieldId}
          name={col.key}
          value={value}
          readOnly
          aria-readonly="true"
          aria-describedby={isAuto ? hintId : undefined}
          className={
            isAuto
              ? 'rounded-md border border-green-200 bg-green-50 px-2 py-1.5 font-mono text-sm text-slate-800'
              : 'rounded-md border border-slate-200 bg-slate-100 px-2 py-1.5 font-mono text-sm text-slate-700'
          }
        />
        {isAuto ? (
          <span id={hintId} className="text-[11px] text-slate-500">
            {labels.autoHint}
          </span>
        ) : null}
      </div>
    );
  }

  // Dropdown / boolean columns → shadcn Select (NEVER raw <select>).
  if (col.dataType === 'dropdown' || col.dataType === 'boolean') {
    const selectOptions = options.map((opt) => ({ value: opt, label: opt }));
    return (
      <div className="grid gap-1" data-field={col.key}>
        <label
          id={`${fieldId}-label`}
          htmlFor={fieldId}
          className="text-xs font-medium text-slate-700"
        >
          {label}
          {col.required ? <span aria-hidden="true"> *</span> : null}
        </label>
        <Select
          id={fieldId}
          name={col.key}
          value={value}
          disabled={disabled}
          onValueChange={onChange}
          options={selectOptions}
          aria-labelledby={`${fieldId}-label`}
        >
          <SelectTrigger aria-label={label}>
            <SelectValue placeholder={labels.selectPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {selectOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // Scalar columns → shadcn Input (text / number / date).
  const inputType = col.dataType === 'number' ? 'number' : col.dataType === 'date' ? 'date' : 'text';
  return (
    <div className="grid gap-1" data-field={col.key}>
      <label htmlFor={fieldId} className="text-xs font-medium text-slate-700">
        {label}
        {col.required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <Input
        id={fieldId}
        name={col.key}
        type={inputType}
        value={value}
        disabled={disabled}
        aria-required={col.required || undefined}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FaProductionTab
// ---------------------------------------------------------------------------

export function FaProductionTab({
  productCode,
  packSizeFilled,
  columns,
  rows,
  dropdowns,
  labels,
  state = 'ready',
  onPersistCell,
  canWrite = false,
  onSearchItems,
  onAddComponent,
  onRemoveComponent,
  onMutated,
}: FaProductionTabProps) {
  const ordered = React.useMemo(() => sortColumns(columns), [columns]);
  const locked = !packSizeFilled;

  const searchAction: ItemSearchFn = onSearchItems ?? searchItems;
  const addAction = onAddComponent ?? addProdDetailComponent;
  const removeAction = onRemoveComponent ?? removeProdDetailComponent;

  // Default refresh after add/remove re-renders the server component (re-reads the
  // real prod_detail rows). useRouter() is always called at the top (Rules of
  // Hooks). In the app it returns the App Router; in RTL the test mocks
  // next/navigation (or passes an explicit onMutated).
  const router = useRouter();
  const mutated = onMutated ?? (() => router.refresh());

  // Initial per-component string values, keyed by row id then column key.
  const initial = React.useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    for (const row of rows) {
      const cells: Record<string, string> = {};
      for (const col of ordered) {
        cells[col.key] = toFieldString(row.values[col.key]);
      }
      map[row.id] = cells;
    }
    return map;
  }, [ordered, rows]);

  const [form, setForm] = React.useState<Record<string, Record<string, string>>>(initial);
  const [saving, setSaving] = React.useState(false);
  const [mutating, setMutating] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  );

  async function handleAddComponent(item: ItemPickerOption) {
    setMutating(true);
    setFeedback(null);
    try {
      await addAction({ productCode, itemId: item.id });
      mutated?.();
    } catch {
      setFeedback({ tone: 'error', text: labels.saveError });
    } finally {
      setMutating(false);
    }
  }

  async function handleRemoveComponent(prodDetailId: string) {
    setMutating(true);
    setFeedback(null);
    try {
      await removeAction({ productCode, prodDetailId });
      mutated?.();
    } catch {
      setFeedback({ tone: 'error', text: labels.removeError });
    } finally {
      setMutating(false);
    }
  }

  // Re-sync when the server-loaded rows change (e.g. after a revalidate).
  React.useEffect(() => {
    setForm(initial);
  }, [initial]);

  const persist = onPersistCell ?? updateFaCell;

  function setValue(rowId: string, key: string, next: string) {
    setForm((prev) => ({ ...prev, [rowId]: { ...prev[rowId], [key]: next } }));
    setFeedback(null);
  }

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      let dirtyCount = 0;
      for (const row of rows) {
        const cells = form[row.id] ?? {};
        const base = initial[row.id] ?? {};
        const dirty = ordered.filter(
          (col) => !col.readOnly && (cells[col.key] ?? '') !== (base[col.key] ?? ''),
        );
        // Sequential writes: a single failed cell surfaces an error without
        // masking later cascade-bearing writes. Auto/read-only columns
        // (intermediate_code_*, equipment_setup) are NEVER submitted.
        for (const col of dirty) {
          await persist(productCode, col.key, cells[col.key], {
            componentIndex: row.componentIndex,
          });
          dirtyCount += 1;
        }
      }
      if (dirtyCount > 0) {
        setFeedback({ tone: 'success', text: labels.saveSuccess });
      }
    } catch {
      setFeedback({ tone: 'error', text: labels.saveError });
    } finally {
      setSaving(false);
    }
  }

  const dataLoaded = state === 'ready' || state === 'empty';

  // "+ Add production component" picker — only shown when the user can write and
  // the Production tab is not locked by the Pack_Size gate. Opens the combobox
  // over the REAL items master and creates a prod_detail row on select.
  const addPicker =
    canWrite && !locked ? (
      <ItemPicker
        labels={labels.picker}
        searchItemsAction={searchAction}
        itemTypes={['rm', 'ingredient', 'intermediate', 'co_product', 'byproduct']}
        disabled={mutating}
        onSelect={handleAddComponent}
      />
    ) : null;

  return (
    <section
      data-testid="fa-production-tab"
      aria-labelledby="fa-production-title"
      className="space-y-3"
    >
      {dataLoaded && locked && rows.length > 0 ? (
        <div
          role="alert"
          data-testid="fa-production-locked"
          className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        >
          <strong className="font-semibold">{labels.lockedTitle}:</strong> {labels.lockedBody}
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="fa-production-title" className="text-base font-semibold text-slate-900">
              {labels.title}
              {dataLoaded && rows.length > 0 ? (
                <>
                  <span aria-hidden="true" className="ml-1 font-normal text-slate-500">
                    —{' '}
                  </span>
                  <span className="font-normal text-slate-500">
                    {withCount(labels.componentsCount, rows.length)}
                  </span>
                </>
              ) : null}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">{labels.subtitle}</p>
          </div>
          {dataLoaded && rows.length > 0 ? addPicker : null}
        </CardHeader>

        <CardContent>
          {!dataLoaded ? (
            <StateNotice state={state} labels={labels} />
          ) : rows.length === 0 ? (
            <div
              data-testid="fa-production-empty"
              className="flex flex-col items-center gap-1 p-8 text-center"
            >
              <span aria-hidden="true" className="text-2xl">
                🏭
              </span>
              <p className="text-sm font-medium text-slate-700">{labels.empty}</p>
              <p className="text-xs text-slate-500">{labels.emptyCtaBody}</p>
              {addPicker ? <div className="mt-2">{addPicker}</div> : null}
            </div>
          ) : (
            <div className="space-y-4">
              {rows.map((row, idx) => (
                <div
                  key={row.id}
                  data-testid="fa-prod-component"
                  data-component-index={row.componentIndex}
                  className={idx ? 'border-t border-slate-200 pt-4' : ''}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-blue-700">
                      {row.intermediateCode}
                    </span>
                    <span className="text-xs text-slate-500">
                      {row.componentLabel ?? labels.singleComponent}
                    </span>
                    {row.componentWeight != null ? (
                      <span className="font-mono text-xs text-slate-500">
                        {toFieldString(row.componentWeight)}g
                      </span>
                    ) : null}
                    <span className="ml-auto flex items-center gap-2">
                      {row.v06Status === 'pass' ? (
                        <Badge tone="success" data-testid="fa-prod-v06-pass">
                          {labels.v06Pass}
                        </Badge>
                      ) : (
                        <Badge tone="warning" data-testid="fa-prod-v06-warn">
                          {labels.v06Warn}
                        </Badge>
                      )}
                      {canWrite && !locked ? (
                        <Button
                          type="button"
                          className="btn--ghost"
                          data-testid="fa-prod-remove"
                          aria-label={`${labels.removeComponent} ${row.intermediateCode}`}
                          disabled={mutating}
                          onClick={() => handleRemoveComponent(row.id)}
                        >
                          <span aria-hidden="true">✕</span>
                        </Button>
                      ) : null}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {ordered.map((col) => {
                      const fieldId = `fa-prod-${row.id}-${col.key}`;
                      return (
                        <ProductionField
                          key={col.key}
                          col={col}
                          labels={labels}
                          fieldId={fieldId}
                          value={form[row.id]?.[col.key] ?? ''}
                          options={col.dropdownSource ? (dropdowns[col.dropdownSource] ?? []) : []}
                          disabled={locked}
                          onChange={(next) => setValue(row.id, col.key, next)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}

              {rows.length > 1 ? (
                <div
                  data-testid="fa-production-aggregate"
                  className="rounded-md border border-green-200 bg-green-50 p-3 text-xs text-slate-700"
                >
                  <strong className="font-semibold">{labels.aggregateTitle}:</strong>{' '}
                  <span className="font-mono">
                    {labels.fields.line}: {uniqueJoin(rows, 'line')} · {labels.fields.equipment_setup}:{' '}
                    {uniqueJoin(rows, 'equipment_setup')} · {labels.fields.intermediate_code_final}:{' '}
                    {uniqueJoin(rows, 'intermediate_code_final')}
                  </span>
                </div>
              ) : null}

              {feedback ? (
                <div
                  role={feedback.tone === 'error' ? 'alert' : 'status'}
                  aria-live={feedback.tone === 'error' ? 'assertive' : 'polite'}
                  data-testid={`fa-production-feedback-${feedback.tone}`}
                  className={
                    feedback.tone === 'error'
                      ? 'rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700'
                      : 'rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700'
                  }
                >
                  {feedback.text}
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  data-testid="fa-production-save"
                  disabled={saving || locked}
                  onClick={handleSave}
                >
                  {saving ? labels.saving : labels.save}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <span className="sr-only">{productCode}</span>
    </section>
  );
}

export default FaProductionTab;

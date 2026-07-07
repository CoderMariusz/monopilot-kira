'use client';

/**
 * T-024 — FaProductionTab (SCR-03d FA detail Production tab) — schema-driven
 * ProdDetail per-component rows editor.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:571-653 (fa_production_tab)
 *   FAProductionTab: "Production detail — N component(s)" card with the
 *   "Edits reset Built flag automatically." sub-line; an amber locked alert
 *   ("Blocked: add at least one ingredient …") when the current formulation has
 *   no ingredient rows;
 *   one block per ProdDetail component, each with the intermediate (PR) code +
 *   component label + weight + a V06 pass/warn badge, a 4-column grid of
 *   Process 1..4 (Select) + Yield P1..4 (Input number) + PR code P1..4 (auto,
 *   read-only GREEN), then Line * (Select), Dieset/dieset (auto,
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
 *     - line change                      → Chain 1 (autofill dieset).
 *   The client NEVER trusts a client-side permission flag and NEVER writes the
 *   auto-derived intermediate_code_* / dieset columns (read-only red
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
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { Switch } from '@monopilot/ui/Switch';
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
import type {
  ComponentProcess,
} from '../../../../../../(npd)/fa/actions/get-component-processes';
import {
  resolveComponentProcessBundle,
  type ComponentProcessBundle,
} from '../../../../../../(npd)/fa/actions/map-definition-process-chain';
import { publishWipDefinitionFromComponent } from '../../../../(modules)/technical/wip-library/_actions/wip-definition-actions';
import {
  addWipProcess,
  updateWipProcess,
  removeWipProcess,
  saveWipProcessRoles,
} from '../../../../../../(npd)/fa/actions/wip-process-actions';
import { getProcessDefault } from '../../../../(admin)/settings/process-defaults/_actions/process-defaults-actions';
import { wipProcessPrefillFromDefault } from '../../../../../../(npd)/fa/_lib/wip-process-prefill';
import { isLegacyProcessColumn } from './legacy-process-column';
import { isW5HiddenProductionColumn } from '../../../../../../(npd)/fa/_components/w5-production-constants';
import { ProductionLinePicker } from '../../../../../../(npd)/fa/_components/production-line-picker';
import { ProcessYieldHint } from '../../../../../../(npd)/fa/_components/process-yield-hint';
import type { FaProductionLineOption } from '../../../../../../(npd)/fa/_components/w5-production-constants';
import type { SetProductionLineResult } from '../../../../../../(npd)/fa/_actions/set-production-line-types';
import { canEditProductionFromFormulationIngredientCount } from './production-unlock';

export type { ComponentProcess } from '../../../../../../(npd)/fa/actions/get-component-processes';

// ---------------------------------------------------------------------------
// S5b (owner D6/D9) — dynamic per-component PROCESS LIST. The fixed legacy
// process columns are filtered OUT of the schema-driven grid (they live in the
// dynamic process list instead). The set is matched by physical key against
// LEGACY_PROCESS_COLUMN_RE so a future seed can't reintroduce them by adding a
// numbered slot column.
// ---------------------------------------------------------------------------

// isLegacyProcessColumn lives in ./legacy-process-column (plain module) — the
// server page loader also calls it, and a 'use client' export is uncallable
// server-side in the production build.

/** An active ManufacturingOperations row, reduced to the picker shape (id + name). */
export type OperationOption = { id: string; operationName: string };

/** Contract subset of getProcessDefault's payload (Settings → process defaults). */
type ProcessDefaultPayload = {
  operationId: string;
  operationName: string;
  standardCost: number;
  defaultDurationHours: number;
  setupCost?: number;
  throughputPerHour?: number | null;
  throughputUom?: string | null;
  yieldPct?: number;
  roles: { roleGroup: string; defaultHeadcount: number }[];
};

type GetProcessDefaultFn = (
  operationId: string,
) => Promise<{ ok: true; data: ProcessDefaultPayload | null } | { ok: false; error: string }>;
type AddProcessFn = typeof addWipProcess;
type UpdateProcessFn = typeof updateWipProcess;
type RemoveProcessFn = typeof removeWipProcess;
type SaveProcessRolesFn = typeof saveWipProcessRoles;

export type ProductionProcessLabels = {
  sectionTitle: string;
  sectionSubtitle: string;
  addProcess: string;
  pickerLabel: string;
  pickerPlaceholder: string;
  pickerEmpty: string;
  pickerLoading: string;
  pickerError: string;
  pickerCancel: string;
  empty: string;
  emptyBody: string;
  duration: string;
  additionalCost: string;
  throughputPerHour?: string;
  throughputUom?: string;
  setupCost?: string;
  yieldPct?: string;
  processCost: string;
  createsWip: string;
  rolesHeader: string;
  editProcess: string;
  removeProcess: string;
  save: string;
  saving: string;
  cancel: string;
  addError: string;
  updateError: string;
  removeError: string;
  saveRolesError: string;
  subtotalLabel: string;
  roleGroup: string;
  headcount: string;
  loading: string;
  loadError: string;
  /** W3-L10 — referenced WIP definition chain is read-only in the project. */
  readOnlyDefinition?: string;
  editInWipLibrary?: string;
  publishAsWipDefinition?: string;
  publishWipNameLabel?: string;
  publishWipNamePlaceholder?: string;
  publishWipConfirm?: string;
  publishWipCancel?: string;
  publishWipPublishing?: string;
  publishWipError?: string;
};

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
  /** Auto-derived field (intermediate_code_*, dieset) — styled green. */
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
  /** S5b — dynamic per-component process list labels. */
  processes: ProductionProcessLabels;
  /** W5 — project-scoped production line picker labels. */
  productionLine: string;
  productionLinePlaceholder: string;
  productionLineEmpty: string;
  productionLineSaveError: string;
  /** Per-column human label keyed by physical column key. */
  fields: Record<string, string>;
};

export type FaProductionTabProps = {
  productCode: string;
  /** Count of rows in the current formulation version. Editing unlocks at >= 1 row. */
  formulationIngredientCount?: number;
  /** @deprecated kept only for older test fixtures; real loaders pass formulationIngredientCount. */
  packSizeFilled?: boolean;
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

  // -- S5b dynamic per-component process list -------------------------------
  /** Server-loaded processes keyed by prod_detail_id (= ProdDetailRow.id). */
  componentProcesses?: Record<string, ComponentProcess[] | ComponentProcessBundle>;
  /** Active ManufacturingOperations (id + name) for the process picker. */
  operationOptions?: OperationOption[];
  /** Seam: getProcessDefault(operationId) (Settings → process defaults). */
  onGetProcessDefault?: GetProcessDefaultFn;
  /** Seam: addWipProcess (defaults to the real CRUD action). */
  onAddProcess?: AddProcessFn;
  /** Seam: updateWipProcess. */
  onUpdateProcess?: UpdateProcessFn;
  /** Seam: removeWipProcess. */
  onRemoveProcess?: RemoveProcessFn;
  /** Seam: saveWipProcessRoles. */
  onSaveProcessRoles?: SaveProcessRolesFn;
  /** W3-L10 — publish a local component chain as a reusable WIP definition. */
  onPublishWipDefinition?: typeof publishWipDefinitionFromComponent;
  /** W5 — project-scoped production line (UUID FK on npd_projects). */
  projectId?: string;
  productionLineId?: string | null;
  productionLineOptions?: FaProductionLineOption[];
  ingredientQtyKgPerPack?: number | null;
  onSetProductionLine?: (input: {
    projectId: string;
    productionLineId: string | null;
  }) => Promise<SetProductionLineResult>;
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
  // S5b (D6/D9): drop the legacy fixed-slot process columns from the grid — they
  // are replaced by the dynamic per-component process list below. Defense-in-depth
  // vs. the page-loader filter so a future seed cannot reintroduce a slot column.
  return [...columns]
    .filter((col) => !isLegacyProcessColumn(col.key))
    .filter((col) => !isW5HiddenProductionColumn(col.key, col.dropdownSource))
    .sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return a.key.localeCompare(b.key);
    });
}

/** Format a numeric cost for display (2dp, locale-agnostic, no currency symbol). */
function fmtCost(value: number): string {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
}

/** English fallbacks so a partial/absent `labels.processes` bundle never crashes
 * the process list (mirrors the ItemPicker DEFAULT_PICKER_LABELS pattern). */
const DEFAULT_PROCESS_LABELS: ProductionProcessLabels = {
  sectionTitle: 'Processes',
  sectionSubtitle: 'Add the manufacturing processes for this component.',
  addProcess: '+ Add process',
  pickerLabel: 'Select a process',
  pickerPlaceholder: 'Search processes…',
  pickerEmpty: 'No processes available',
  pickerLoading: 'Loading processes…',
  pickerError: 'Could not load processes',
  pickerCancel: 'Cancel',
  empty: 'No processes yet',
  emptyBody: 'Add the first manufacturing process.',
  duration: 'Duration (h)',
  additionalCost: 'Standard cost',
  throughputPerHour: 'Throughput / hour',
  throughputUom: 'Throughput unit',
  setupCost: 'Setup cost (£)',
  yieldPct: 'Yield %',
  processCost: 'Process cost',
  createsWip: 'Creates WIP',
  rolesHeader: 'Roles',
  editProcess: 'Edit process',
  removeProcess: 'Remove process',
  save: 'Save process',
  saving: 'Saving…',
  cancel: 'Cancel',
  addError: 'Could not add the process',
  updateError: 'Could not update the process',
  removeError: 'Could not remove the process',
  saveRolesError: 'Could not save the roles',
  subtotalLabel: 'Process subtotal',
  roleGroup: 'Role',
  headcount: 'Headcount',
  loading: 'Loading processes…',
  loadError: 'Could not load processes',
  readOnlyDefinition: 'Referenced WIP definition',
  editInWipLibrary: 'Edit in WIP library',
  publishAsWipDefinition: 'Publish as WIP definition',
  publishWipNameLabel: 'Definition name',
  publishWipNamePlaceholder: 'Enter a name for this WIP definition',
  publishWipConfirm: 'Publish',
  publishWipCancel: 'Cancel',
  publishWipPublishing: 'Publishing…',
  publishWipError: 'Could not publish the WIP definition',
};

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
// S5b — Operation picker (combobox over active ManufacturingOperations). No raw
// <select> (red line): a search Input + a portaled listbox, mirroring ItemPicker.
// ---------------------------------------------------------------------------

function OperationPicker({
  labels,
  options,
  disabled,
  onSelect,
}: {
  labels: ProductionProcessLabels;
  options: OperationOption[];
  disabled: boolean;
  onSelect: (op: OperationOption) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [rect, setRect] = React.useState<{ top: number; left: number; width: number } | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === '' ? options : options.filter((o) => o.operationName.toLowerCase().includes(q));
  }, [options, query]);

  const reposition = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(420, Math.max(280, r.width, window.innerWidth - 24));
    const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
    setRect({ top: r.bottom + 4, left, width });
  }, []);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setRect(null);
      setActiveIndex(0);
      return undefined;
    }
    reposition();
    const onScroll = () => reposition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, reposition]);

  React.useEffect(() => {
    if (open && rect) inputRef.current?.focus();
  }, [open, rect]);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (!containerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function choose(op: OperationOption) {
    onSelect(op);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const op = filtered[activeIndex];
      if (op) choose(op);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  const listId = React.useId();

  return (
    <div ref={containerRef} className="relative inline-block">
      <Button
        type="button"
        className="btn--secondary"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={labels.addProcess}
        data-testid="fa-prod-add-process"
        onClick={() => setOpen((v) => !v)}
      >
        {labels.addProcess}
      </Button>

      {open && rect && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label={labels.pickerLabel}
              style={{
                position: 'fixed',
                top: rect.top,
                left: rect.left,
                width: rect.width,
                zIndex: 1000,
                pointerEvents: 'auto',
              }}
              className="rounded-md border border-slate-200 bg-white p-2 shadow-xl"
              data-testid="fa-prod-process-picker"
            >
              <Input
                ref={inputRef}
                role="combobox"
                aria-expanded={open}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-label={labels.pickerLabel}
                value={query}
                placeholder={labels.pickerPlaceholder}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              />
              <ul
                id={listId}
                role="listbox"
                aria-label={labels.pickerLabel}
                className="mt-1 max-h-56 overflow-auto"
              >
                {filtered.length === 0 ? (
                  <li className="px-2 py-2 text-xs text-slate-500" data-testid="fa-prod-process-picker-empty">
                    {labels.pickerEmpty}
                  </li>
                ) : (
                  filtered.map((op, idx) => (
                    <li
                      key={op.id}
                      role="option"
                      aria-selected={idx === activeIndex}
                      data-testid={`process-option-${op.id}`}
                      className={[
                        'cursor-pointer rounded px-2 py-1.5 text-sm',
                        idx === activeIndex ? 'bg-blue-50' : 'hover:bg-slate-50',
                      ].join(' ')}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => choose(op)}
                    >
                      {op.operationName}
                    </li>
                  ))
                )}
              </ul>
              <div className="mt-1 flex justify-end">
                <Button type="button" className="btn--ghost" onClick={() => setOpen(false)}>
                  {labels.pickerCancel}
                </Button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// S5b — Process edit dialog (duration / additionalCost / createsWipItem). Roles
// are pre-filled from the operation default on add; this editor adjusts the
// process scalars (role re-editing is a follow-up; the toggle + numbers are the
// owner's must-haves). Built on @monopilot/ui Switch/Input/Button — no Radix
// outside packages/ui.
// ---------------------------------------------------------------------------

function ProcessEditDialog({
  process,
  labels,
  disabled,
  onClose,
  onSubmit,
}: {
  process: ComponentProcess;
  labels: ProductionProcessLabels;
  disabled: boolean;
  onClose: () => void;
  onSubmit: (next: {
    durationHours: number;
    additionalCost: number;
    createsWipItem: boolean;
    throughputPerHour: number;
    throughputUom: 'kg' | 'pack' | 'each' | 'l';
    setupCost: number;
    yieldPct: number;
  }) => void;
}) {
  const [duration, setDuration] = React.useState(String(process.durationHours ?? 0));
  const [addCost, setAddCost] = React.useState(String(process.additionalCost ?? 0));
  const [createsWip, setCreatesWip] = React.useState(Boolean(process.createsWipItem));
  const [throughput, setThroughput] = React.useState(String(process.throughputPerHour ?? 0));
  const [throughputUom, setThroughputUom] = React.useState<'kg' | 'pack' | 'each' | 'l'>(
    (process.throughputUom as 'kg' | 'pack' | 'each' | 'l') ?? 'kg',
  );
  const [setupCost, setSetupCost] = React.useState(String(process.setupCost ?? 0));
  const [yieldPct, setYieldPct] = React.useState(String(process.yieldPct ?? 100));
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${labels.editProcess} ${process.processName}`}
      data-testid="fa-prod-process-editor"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15,23,42,0.45)',
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          {labels.editProcess} — <span className="font-mono">{process.processName}</span>
        </h3>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <label htmlFor="fa-prod-process-duration" className="text-xs font-medium text-slate-700">
              {labels.duration}
            </label>
            <Input
              id="fa-prod-process-duration"
              data-testid="fa-prod-process-duration"
              type="number"
              value={duration}
              disabled={disabled}
              onChange={(e) => setDuration(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <div className="grid gap-1">
            <label htmlFor="fa-prod-process-addcost" className="text-xs font-medium text-slate-700">
              {labels.additionalCost}
            </label>
            <Input
              id="fa-prod-process-addcost"
              data-testid="fa-prod-process-addcost"
              type="number"
              value={addCost}
              disabled={disabled}
              onChange={(e) => setAddCost(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <div className="grid gap-1">
            <label htmlFor="fa-prod-process-throughput" className="text-xs font-medium text-slate-700">
              {labels.throughputPerHour}
            </label>
            <Input
              id="fa-prod-process-throughput"
              data-testid="fa-prod-process-throughput"
              type="number"
              min={0}
              step="0.01"
              value={throughput}
              disabled={disabled}
              onChange={(e) => setThroughput(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <div className="grid gap-1">
            <label htmlFor="fa-prod-process-throughput-uom" className="text-xs font-medium text-slate-700">
              {labels.throughputUom}
            </label>
            <Select
              id="fa-prod-process-throughput-uom"
              value={throughputUom}
              disabled={disabled}
              onValueChange={(value) => setThroughputUom(value as 'kg' | 'pack' | 'each' | 'l')}
              options={[
                { value: 'kg', label: 'kg' },
                { value: 'pack', label: 'pack' },
                { value: 'each', label: 'each' },
                { value: 'l', label: 'l' },
              ]}
            >
              <SelectTrigger aria-label={labels.throughputUom} data-testid="fa-prod-process-throughput-uom">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['kg', 'pack', 'each', 'l'] as const).map((uom) => (
                  <SelectItem key={uom} value={uom}>
                    {uom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <label htmlFor="fa-prod-process-setup-cost" className="text-xs font-medium text-slate-700">
              {labels.setupCost}
            </label>
            <Input
              id="fa-prod-process-setup-cost"
              data-testid="fa-prod-process-setup-cost"
              type="number"
              min={0}
              step="0.01"
              value={setupCost}
              disabled={disabled}
              onChange={(e) => setSetupCost(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <div className="grid gap-1">
            <label htmlFor="fa-prod-process-yield-pct" className="text-xs font-medium text-slate-700">
              {labels.yieldPct}
            </label>
            <Input
              id="fa-prod-process-yield-pct"
              data-testid="fa-prod-process-yield-pct"
              type="number"
              min={0.001}
              max={100}
              step="0.001"
              value={yieldPct}
              disabled={disabled}
              onChange={(e) => setYieldPct(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-center justify-between">
            <span id="fa-prod-process-wip-label" className="text-xs font-medium text-slate-700">
              {labels.createsWip}
            </span>
            <Switch
              checked={createsWip}
              disabled={disabled}
              aria-labelledby="fa-prod-process-wip-label"
              data-testid="fa-prod-process-creates-wip"
              onCheckedChange={setCreatesWip}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" className="btn--ghost" onClick={onClose}>
            {labels.cancel}
          </Button>
          <Button
            type="button"
            data-testid="fa-prod-process-save"
            disabled={disabled}
            onClick={() => {
              const parsedYield = Number(yieldPct);
              if (!Number.isFinite(parsedYield) || parsedYield <= 0 || parsedYield > 100) return;
              onSubmit({
                durationHours: Number(duration) || 0,
                additionalCost: Number(addCost) || 0,
                createsWipItem: createsWip,
                throughputPerHour: Number(throughput) || 0,
                throughputUom,
                setupCost: Number(setupCost) || 0,
                yieldPct: parsedYield,
              });
            }}
          >
            {labels.save}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// W3-L10 — publish local component chain as a reusable WIP definition
// ---------------------------------------------------------------------------

function PublishWipDialog({
  defaultName,
  labels,
  busy,
  onClose,
  onConfirm,
}: {
  defaultName: string;
  labels: ProductionProcessLabels;
  busy: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = React.useState(defaultName);
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.publishAsWipDefinition}
      data-testid="fa-prod-publish-wip-dialog"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15,23,42,0.45)',
        pointerEvents: 'auto',
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">{labels.publishAsWipDefinition}</h3>
        <label htmlFor="fa-prod-publish-wip-name" className="mb-1 block text-xs font-medium text-slate-700">
          {labels.publishWipNameLabel}
        </label>
        <Input
          id="fa-prod-publish-wip-name"
          data-testid="fa-prod-publish-wip-name"
          value={name}
          disabled={busy}
          placeholder={labels.publishWipNamePlaceholder}
          onChange={(event) => setName(event.target.value)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" className="btn--ghost" disabled={busy} onClick={onClose}>
            {labels.publishWipCancel}
          </Button>
          <Button
            type="button"
            data-testid="fa-prod-publish-wip-confirm"
            disabled={busy || name.trim().length === 0}
            onClick={() => onConfirm(name.trim())}
          >
            {busy ? labels.publishWipPublishing : labels.publishWipConfirm}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// S5b — per-component dynamic process list. One instance per ProdDetailRow.
// ---------------------------------------------------------------------------

function ComponentProcesses({
  prodDetailId,
  bundle,
  operations,
  labels,
  canWrite,
  locked,
  locale,
  componentLabel,
  getDefault,
  addProcess,
  updateProcess,
  removeProcess,
  saveRoles,
  publishWipDefinition,
  onMutated,
  ingredientQtyKgPerPack,
}: {
  prodDetailId: string;
  bundle: ComponentProcessBundle;
  operations: OperationOption[];
  labels: ProductionProcessLabels;
  canWrite: boolean;
  locked: boolean;
  locale: string;
  componentLabel?: string;
  getDefault: GetProcessDefaultFn;
  addProcess: AddProcessFn;
  updateProcess: UpdateProcessFn;
  removeProcess: RemoveProcessFn;
  saveRoles: SaveProcessRolesFn;
  publishWipDefinition: typeof publishWipDefinitionFromComponent;
  onMutated: () => void;
  ingredientQtyKgPerPack?: number | null;
}) {
  const processes = bundle.processes;
  const readOnly = Boolean(bundle.readOnly);
  const definitionId = bundle.definitionId;
  const definitionName = bundle.definitionName;
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<ComponentProcess | null>(null);
  const [publishOpen, setPublishOpen] = React.useState(false);

  const writable = canWrite && !locked && !readOnly;
  const canPublish =
    canWrite && !locked && !readOnly && processes.some((process) => process.createsWipItem);
  const subtotal = processes.reduce((sum, p) => sum + (Number(p.processCost) || 0), 0);

  async function handlePick(op: OperationOption) {
    setBusy(true);
    setError(null);
    try {
      const def = await getDefault(op.id);
      const payload = def.ok ? def.data : null;
      const processName = payload?.operationName ?? op.operationName;
      const prefill = wipProcessPrefillFromDefault(payload);
      const added = await addProcess({
        prodDetailId,
        processName,
        durationHours: prefill.durationHours,
        additionalCost: prefill.additionalCost,
        throughputPerHour: prefill.throughputPerHour,
        throughputUom: prefill.throughputUom,
        setupCost: prefill.setupCost,
        yieldPct: prefill.yieldPct,
        createsWipItem: false,
      });
      if (!added.ok) {
        setError(labels.addError);
        return;
      }
      const roles = payload?.roles ?? [];
      if (roles.length > 0) {
        const saved = await saveRoles({
          processId: added.id,
          roles: roles.map((r) => ({ roleGroup: r.roleGroup, headcount: r.defaultHeadcount })),
        });
        if (!saved.ok) {
          setError(labels.saveRolesError);
          return;
        }
      }
      onMutated();
    } catch {
      setError(labels.addError);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await removeProcess({ id });
      if (!res.ok) {
        setError(labels.removeError);
        return;
      }
      onMutated();
    } catch {
      setError(labels.removeError);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(
    id: string,
    next: {
      durationHours: number;
      additionalCost: number;
      createsWipItem: boolean;
      throughputPerHour: number;
      throughputUom: 'kg' | 'pack' | 'each' | 'l';
      setupCost: number;
      yieldPct: number;
    },
  ) {
    setBusy(true);
    setError(null);
    try {
      const res = await updateProcess({ id, ...next, yieldPct: next.yieldPct });
      if (!res.ok) {
        setError(labels.updateError);
        return;
      }
      setEditing(null);
      onMutated();
    } catch {
      setError(labels.updateError);
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish(name: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await publishWipDefinition({ prodDetailId, name });
      if (!result.ok) {
        setError(result.error ?? labels.publishWipError ?? 'Could not publish the WIP definition');
        return;
      }
      setPublishOpen(false);
      onMutated();
    } catch {
      setError(labels.publishWipError ?? 'Could not publish the WIP definition');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mt-3 rounded-md border border-slate-200 bg-slate-50/60 p-3"
      data-testid={`fa-prod-processes-${prodDetailId}`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-800">{labels.sectionTitle}</h4>
          <p className="text-[11px] text-slate-500">{labels.sectionSubtitle}</p>
          {readOnly && definitionName ? (
            <p className="mt-1 text-[11px] text-amber-800" data-testid={`fa-prod-wip-readonly-${prodDetailId}`}>
              {labels.readOnlyDefinition}: <span className="font-medium">{definitionName}</span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {readOnly && definitionId ? (
            <Link
              href={`/${locale}/technical/wip-library/${encodeURIComponent(definitionId)}`}
              prefetch={false}
              data-testid={`fa-prod-edit-wip-library-${prodDetailId}`}
              className="text-xs font-medium text-blue-700 hover:underline"
            >
              {labels.editInWipLibrary}
            </Link>
          ) : null}
          {canPublish ? (
            <Button
              type="button"
              className="btn-secondary btn-sm"
              data-testid={`fa-prod-publish-wip-${prodDetailId}`}
              disabled={busy}
              onClick={() => setPublishOpen(true)}
            >
              {labels.publishAsWipDefinition}
            </Button>
          ) : null}
          {writable ? (
            <OperationPicker
              labels={labels}
              options={operations}
              disabled={busy}
              onSelect={handlePick}
            />
          ) : null}
        </div>
      </div>

      {processes.length === 0 ? (
        <div className="flex flex-col items-center gap-0.5 py-4 text-center">
          <p className="text-xs font-medium text-slate-600">{labels.empty}</p>
          <p className="text-[11px] text-slate-400">{labels.emptyBody}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {processes.map((proc) => (
            <li
              key={proc.id}
              data-testid={`fa-prod-process-${proc.id}`}
              className="rounded-md border border-slate-200 bg-white p-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-800">{proc.processName}</span>
                {proc.createsWipItem ? (
                  <Badge tone="info" data-testid={`fa-prod-process-wip-${proc.id}`}>
                    {labels.createsWip}
                  </Badge>
                ) : null}
                <span className="ml-auto flex items-center gap-3 text-xs text-slate-600">
                  <span className="tabular-nums">
                    {labels.duration}: {fmtCost(Number(proc.durationHours))}
                  </span>
                  <span className="tabular-nums">
                    {labels.additionalCost}: {fmtCost(Number(proc.additionalCost))}
                  </span>
                  <span className="tabular-nums">
                    {labels.yieldPct}: {fmtCost(Number(proc.yieldPct ?? 100))}
                  </span>
                  <span className="font-semibold tabular-nums text-slate-800">
                    {labels.processCost}:{' '}
                    <span data-testid={`fa-prod-process-cost-${proc.id}`}>
                      {fmtCost(Number(proc.processCost))}
                    </span>
                  </span>
                  {writable ? (
                    <>
                      <Button
                        type="button"
                        className="btn--ghost"
                        data-testid={`fa-prod-edit-process-${proc.id}`}
                        aria-label={`${labels.editProcess} ${proc.processName}`}
                        disabled={busy}
                        onClick={() => setEditing(proc)}
                      >
                        ✎
                      </Button>
                      <Button
                        type="button"
                        className="btn--ghost"
                        data-testid={`fa-prod-remove-process-${proc.id}`}
                        aria-label={`${labels.removeProcess} ${proc.processName}`}
                        disabled={busy}
                        onClick={() => handleRemove(proc.id)}
                      >
                        ✕
                      </Button>
                    </>
                  ) : null}
                </span>
              </div>
              {proc.roles.length > 0 ? (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <span className="text-[11px] font-medium text-slate-500">{labels.rolesHeader}:</span>
                  {proc.roles.map((role) => (
                    <span
                      key={role.roleGroup}
                      data-testid={`fa-prod-process-role-${proc.id}-${role.roleGroup}`}
                      className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
                    >
                      {role.roleGroup} ×{role.headcount}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <ProcessYieldHint baseQtyKg={ingredientQtyKgPerPack} processes={processes} />

      <div
        className="mt-2 flex justify-end text-xs font-semibold text-slate-800"
        data-testid={`fa-prod-process-subtotal-${prodDetailId}`}
      >
        {labels.subtotalLabel}: <span className="ml-1 tabular-nums">{fmtCost(subtotal)}</span>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700"
          data-testid={`fa-prod-process-error-${prodDetailId}`}
        >
          {error}
        </div>
      ) : null}

      {editing ? (
        <ProcessEditDialog
          process={editing}
          labels={labels}
          disabled={busy}
          onClose={() => setEditing(null)}
          onSubmit={(next) => handleUpdate(editing.id, next)}
        />
      ) : null}

      {publishOpen ? (
        <PublishWipDialog
          defaultName={componentLabel?.trim() || definitionName || ''}
          labels={labels}
          busy={busy}
          onClose={() => setPublishOpen(false)}
          onConfirm={handlePublish}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FaProductionTab
// ---------------------------------------------------------------------------

export function FaProductionTab({
  productCode,
  formulationIngredientCount,
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
  componentProcesses,
  operationOptions = [],
  onGetProcessDefault,
  onAddProcess,
  onUpdateProcess,
  onRemoveProcess,
  onSaveProcessRoles,
  onPublishWipDefinition,
  projectId,
  productionLineId = null,
  productionLineOptions = [],
  ingredientQtyKgPerPack = null,
  onSetProductionLine,
}: FaProductionTabProps) {
  const params = useParams();
  const locale = typeof params?.locale === 'string' ? params.locale : 'en';
  const ordered = React.useMemo(() => sortColumns(columns), [columns]);
  const locked =
    formulationIngredientCount == null
      ? !packSizeFilled
      : !canEditProductionFromFormulationIngredientCount(formulationIngredientCount);

  const searchAction: ItemSearchFn = onSearchItems ?? searchItems;
  const addAction = onAddComponent ?? addProdDetailComponent;
  const removeAction = onRemoveComponent ?? removeProdDetailComponent;

  // S5b — dynamic process-list action seams (default to the real CRUD actions).
  const getDefaultAction: GetProcessDefaultFn = onGetProcessDefault ?? getProcessDefault;
  const addProcessAction: AddProcessFn = onAddProcess ?? addWipProcess;
  const updateProcessAction: UpdateProcessFn = onUpdateProcess ?? updateWipProcess;
  const removeProcessAction: RemoveProcessFn = onRemoveProcess ?? removeWipProcess;
  const saveRolesAction: SaveProcessRolesFn = onSaveProcessRoles ?? saveWipProcessRoles;
  const publishWipAction = onPublishWipDefinition ?? publishWipDefinitionFromComponent;

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
        // (intermediate_code_*, dieset) are NEVER submitted.
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
  // the Production tab is unlocked by at least one formulation ingredient. Opens the combobox
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
          {projectId && onSetProductionLine ? (
            <div className="mb-4">
              <ProductionLinePicker
                projectId={projectId}
                value={productionLineId}
                options={productionLineOptions}
                labels={{
                  productionLine: labels.productionLine,
                  productionLinePlaceholder: labels.productionLinePlaceholder,
                  productionLineEmpty: labels.productionLineEmpty,
                  productionLineSaveError: labels.productionLineSaveError,
                }}
                canWrite={canWrite}
                disabled={locked}
                onSetProductionLine={onSetProductionLine}
                onSaved={() => mutated?.()}
              />
            </div>
          ) : null}

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

                  {/* S5b (D6/D9) — dynamic per-component process list. Replaces the
                      legacy fixed 4 manufacturing_operation slots. */}
                  <ComponentProcesses
                    prodDetailId={row.id}
                    bundle={resolveComponentProcessBundle(componentProcesses?.[row.id])}
                    operations={operationOptions}
                    labels={{ ...DEFAULT_PROCESS_LABELS, ...labels.processes }}
                    canWrite={canWrite}
                    locked={locked}
                    locale={locale}
                    componentLabel={row.componentLabel ?? row.intermediateCode}
                    getDefault={getDefaultAction}
                    addProcess={addProcessAction}
                    updateProcess={updateProcessAction}
                    removeProcess={removeProcessAction}
                    saveRoles={saveRolesAction}
                    publishWipDefinition={publishWipAction}
                    onMutated={() => mutated?.()}
                    ingredientQtyKgPerPack={ingredientQtyKgPerPack}
                  />
                </div>
              ))}

              {rows.length > 1 ? (
                <div
                  data-testid="fa-production-aggregate"
                  className="rounded-md border border-green-200 bg-green-50 p-3 text-xs text-slate-700"
                >
                  <strong className="font-semibold">{labels.aggregateTitle}:</strong>{' '}
                  <span className="font-mono">
                    {labels.fields.dieset}: {uniqueJoin(rows, 'dieset')} ·{' '}
                    {labels.fields.intermediate_code_final}: {uniqueJoin(rows, 'intermediate_code_final')}
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

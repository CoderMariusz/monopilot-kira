'use client';

/**
 * T-104 — FaPlanningTab (SCR-03b FA detail Planning tab) — schema-driven Planning dept form.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:537-557 (fa_planning_tab)
 *   FAPlanningTab: "Planning section" card with an open/closed badge
 *   (closed_planning → ✓ Closed green / Open gray), a form-grid of 3 fields
 *   (Meat % *, Runs per week *, Date codes per week *), a blue Technical BOM v1
 *   transition Alert, and a "Save Planning" + "Close Planning section" action row.
 *
 * STANDALONE component (this slice): the per-tab wiring into fa-tabs.tsx is T-105
 * and is explicitly OUT OF SCOPE. This file deliberately does NOT edit
 * fa-tabs.tsx — it exports a tab body that T-105 will mount into the Planning
 * slot. The Core-close gate (Planning unlocks only after Core is closed) is
 * enforced by the parent wiring (T-105), NOT inside this tab.
 *
 * Schema-driven (NO hardcoded field list — task red line):
 *   The rendered fields come entirely from the `columns` prop, which the future
 *   T-105 server loader derives from `Reference.DeptColumns` (dept_code=
 *   'Planning') via the T-014 buildDeptZod runtime / dept-column metadata. The
 *   component renders whatever Planning columns the org has configured, in
 *   display order. Field values come from the real `public.product` row
 *   (composite PK org_id + product_code) — passed in as `values`. NO mock data.
 *
 * Write path (real data, RLS): each dirty editable cell is persisted by calling
 *   `updateFaCell(productCode, columnKey, value)` (T-009, merged). That Server
 *   Action runs inside `withOrgContext` (app_user + RLS via app.current_org_id()),
 *   re-validates the value against DeptColumns and enforces the per-dept RBAC
 *   permission (npd.planning.write) server-side. The client NEVER trusts a
 *   client-side permission flag and NEVER writes auto-derived / read-only columns.
 *
 * shadcn primitives only: Input / Select / Card / Badge / Button / EmptyState
 *   from @monopilot/ui. Raw <select> is a red line — dropdown columns render the
 *   shadcn Select. (@monopilot/ui has no Alert primitive; the blue Technical BOM
 *   note is rendered as a styled role="status" region, matching the merged
 *   fa-core-tab amber-alert pattern — see deviation log in closeout.)
 *
 * i18n: every visible string is a prop (npd.faPlanningTab namespace, resolved
 *   server-side). No inline English literals.
 */

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader } from '@monopilot/ui/Card';
import { EmptyState } from '@monopilot/ui/EmptyState';
import Input from '@monopilot/ui/Input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@monopilot/ui/Select';

import { updateFaCell } from '../../../../../../(npd)/fa/actions/update-fa-cell';

// ---------------------------------------------------------------------------
// Types (schema-driven — mirror Reference.DeptColumns metadata)
// ---------------------------------------------------------------------------

export type FaPlanningColumnType =
  | 'text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'dropdown'
  | 'formula';

export type FaPlanningColumn = {
  /** Physical (lower-cased) product column key, e.g. 'meat_pct'. */
  key: string;
  /** Resolved data type from DeptColumns (drives the control). */
  dataType: FaPlanningColumnType;
  /** required_for_done — drives the required marker. */
  required: boolean;
  /** Read-only in the UI (PK / auto-derived / formula). Never submitted. */
  readOnly: boolean;
  /** Auto-derived field — styled green. */
  auto?: boolean;
  /** Reference dropdown table name (when dataType === 'dropdown'). */
  dropdownSource?: string;
  /** display_order (ascending) — render order. */
  displayOrder: number;
};

export type FaPlanningTabState =
  | 'ready'
  | 'loading'
  | 'empty'
  | 'error'
  | 'permission_denied';

export type FaPlanningTabLabels = {
  title: string;
  subtitle: string;
  closedBadge: string;
  openBadge: string;
  /** Blue Technical BOM v1 transition note. */
  bomNoteTitle: string;
  bomNoteBody: string;
  save: string;
  saving: string;
  saveSuccess: string;
  saveError: string;
  closeSection: string;
  selectPlaceholder: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
  /** Per-column human label keyed by physical column key. */
  fields: Record<string, string>;
};

export type FaPlanningTabProps = {
  productCode: string;
  /** Schema-driven Planning column metadata (Reference.DeptColumns, server-loaded). */
  columns: FaPlanningColumn[];
  /** Real product-row values keyed by physical column key (server-loaded). */
  values: Record<string, unknown>;
  /** Dropdown option values keyed by dropdownSource (Reference tables). */
  dropdowns: Record<string, string[]>;
  labels: FaPlanningTabLabels;
  state?: FaPlanningTabState;
  /** Test/wiring seam: override the write path (defaults to T-009 updateFaCell). */
  onPersistCell?: (productCode: string, columnKey: string, value: unknown) => Promise<unknown>;
  /**
   * Test/wiring seam for "Close Planning section". The deptClose modal + gate is
   * owned by T-105 wiring; by default the button navigates via URL param
   * (?tab=planning&close=planning) so the parent shell can open the modal.
   */
  onCloseSection?: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stringify a product value for an editable control (null/undefined → ''). */
function toFieldString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function fieldLabel(col: FaPlanningColumn, labels: FaPlanningTabLabels): string {
  return labels.fields[col.key] ?? col.key;
}

function sortColumns(columns: FaPlanningColumn[]): FaPlanningColumn[] {
  return [...columns].sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    return a.key.localeCompare(b.key);
  });
}

// ---------------------------------------------------------------------------
// State notices (loading / error / permission_denied)
// ---------------------------------------------------------------------------

function StateNotice({
  state,
  labels,
}: {
  state: FaPlanningTabState;
  labels: FaPlanningTabLabels;
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
// Single schema-driven field control
// ---------------------------------------------------------------------------

function PlanningField({
  col,
  labels,
  value,
  options,
  onChange,
}: {
  col: FaPlanningColumn;
  labels: FaPlanningTabLabels;
  value: string;
  options: string[];
  onChange: (next: string) => void;
}) {
  const label = fieldLabel(col, labels);
  const fieldId = `fa-planning-${col.key}`;
  const isReadOnly = col.readOnly === true;
  const isAuto = col.auto === true;

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
          className={
            isAuto
              ? 'rounded-md border border-green-200 bg-green-50 px-2 py-1.5 font-mono text-sm text-slate-800'
              : 'rounded-md border border-slate-200 bg-slate-100 px-2 py-1.5 font-mono text-sm text-slate-700'
          }
        />
      </div>
    );
  }

  // Dropdown / boolean columns → shadcn Select (NEVER raw <select>).
  if (col.dataType === 'dropdown' || col.dataType === 'boolean') {
    const selectOptions = options.map((opt) => ({ value: opt, label: opt }));
    return (
      <div className="grid gap-1" data-field={col.key}>
        <label id={`${fieldId}-label`} htmlFor={fieldId} className="text-xs font-medium text-slate-700">
          {label}
          {col.required ? <span aria-hidden="true"> *</span> : null}
        </label>
        <Select
          id={fieldId}
          name={col.key}
          value={value}
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
  const inputType =
    col.dataType === 'number' ? 'number' : col.dataType === 'date' ? 'date' : 'text';
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
        aria-required={col.required || undefined}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FaPlanningTab
// ---------------------------------------------------------------------------

export function FaPlanningTab({
  productCode,
  columns,
  values,
  dropdowns,
  labels,
  state = 'ready',
  onPersistCell,
  onCloseSection,
}: FaPlanningTabProps) {
  const ordered = React.useMemo(() => sortColumns(columns), [columns]);

  // Initial string values per column (from the real product row).
  const initial = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const col of ordered) {
      map[col.key] = toFieldString(values[col.key]);
    }
    return map;
  }, [ordered, values]);

  const [form, setForm] = React.useState<Record<string, string>>(initial);
  const [saving, setSaving] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  );

  // Re-sync when the server-loaded values change (e.g. after a revalidate).
  React.useEffect(() => {
    setForm(initial);
  }, [initial]);

  const persist = onPersistCell ?? updateFaCell;

  // closed_planning drives the badge — it may live in the product row even when
  // it is not a rendered Planning column (it is a System/close-confirm field).
  const closedRaw = toFieldString(values.closed_planning ?? form.closed_planning ?? '');
  const isClosed = closedRaw.toLowerCase() === 'yes';

  function setValue(key: string, next: string) {
    setForm((prev) => ({ ...prev, [key]: next }));
    setFeedback(null);
  }

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      const dirty = ordered.filter(
        (col) => !col.readOnly && (form[col.key] ?? '') !== (initial[col.key] ?? ''),
      );
      // Sequential writes: a single failed cell surfaces an error without
      // masking later writes. Read-only/auto columns are NEVER submitted.
      for (const col of dirty) {
        await persist(productCode, col.key, form[col.key]);
      }
      if (dirty.length > 0) {
        setFeedback({ tone: 'success', text: labels.saveSuccess });
      }
    } catch {
      setFeedback({ tone: 'error', text: labels.saveError });
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    if (onCloseSection) {
      onCloseSection();
      return;
    }
    // Default: navigate via URL param so the parent shell (T-105) opens the
    // deptClose modal for the Planning dept.
    if (typeof window !== 'undefined') {
      window.location.assign('?tab=planning&close=planning');
    }
  }

  const dataLoaded = state === 'ready' || state === 'empty';

  return (
    <section
      data-testid="fa-planning-tab"
      aria-labelledby="fa-planning-title"
      className="space-y-3"
    >
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="fa-planning-title" className="text-base font-semibold text-slate-900">
              {labels.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">{labels.subtitle}</p>
          </div>
          {dataLoaded && ordered.length > 0 ? (
            isClosed ? (
              <Badge tone="success" data-testid="fa-planning-closed">
                {labels.closedBadge}
              </Badge>
            ) : (
              <Badge tone="muted" data-testid="fa-planning-open">
                {labels.openBadge}
              </Badge>
            )
          ) : null}
        </CardHeader>

        <CardContent>
          {!dataLoaded ? (
            <StateNotice state={state} labels={labels} />
          ) : ordered.length === 0 ? (
            <EmptyState
              icon="📋"
              title={labels.empty}
              body={labels.emptyBody}
              action={
                <a href="?tab=planning" aria-label={labels.title}>
                  {labels.title}
                </a>
              }
            />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {ordered.map((col) => (
                  <PlanningField
                    key={col.key}
                    col={col}
                    labels={labels}
                    value={form[col.key] ?? ''}
                    options={col.dropdownSource ? (dropdowns[col.dropdownSource] ?? []) : []}
                    onChange={(next) => setValue(col.key, next)}
                  />
                ))}
              </div>

              {/* Blue Technical BOM v1 transition note (prototype alert-blue). */}
              <div
                role="status"
                data-testid="fa-planning-bom-note"
                className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800"
              >
                <strong className="font-semibold">{labels.bomNoteTitle}</strong>
                <p className="mt-0.5">{labels.bomNoteBody}</p>
              </div>

              {feedback ? (
                <div
                  role={feedback.tone === 'error' ? 'alert' : 'status'}
                  aria-live={feedback.tone === 'error' ? 'assertive' : 'polite'}
                  data-testid={`fa-planning-feedback-${feedback.tone}`}
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
                  data-testid="fa-planning-save"
                  className="bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
                  disabled={saving}
                  onClick={handleSave}
                >
                  {saving ? labels.saving : labels.save}
                </Button>
                <Button
                  type="button"
                  data-testid="fa-planning-close"
                  disabled={saving}
                  onClick={handleClose}
                >
                  {labels.closeSection}
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

export default FaPlanningTab;

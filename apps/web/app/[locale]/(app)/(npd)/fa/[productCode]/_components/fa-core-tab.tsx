'use client';

/**
 * T-023 — FaCoreTab (SCR-03a FA detail Core tab) — schema-driven Core dept form.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:455-517 (fa_core_tab)
 *   FACoreTab: "Core section" card with an open/closed badge, a form-grid of
 *   fields (FA Code read-only, Product Name *, Pack Size * <select>, Number of
 *   cases, Finish Meat / Recipe components, RM Code / Ingredient codes auto
 *   read-only GREEN, Template <select>, Closed_Core <select>), a Comments
 *   textarea, the V05 required-missing alert, and a "Save Core" action row.
 *
 * STANDALONE component (this slice): the shell (T-136 fa-tabs.tsx) owns the tab
 * slots; the per-tab wiring is T-105. This file deliberately does NOT edit
 * fa-tabs.tsx — it exports a tab body that T-105 will mount into the Core slot.
 *
 * Schema-driven (NO hardcoded field list — task red line):
 *   The rendered fields come entirely from the `columns` prop, which the future
 *   T-105 server loader derives from `Reference.DeptColumns` (dept_code='Core')
 *   via the T-014 buildDeptZod runtime / dept-column metadata. The component
 *   renders whatever Core columns the org has configured, in display order.
 *   Field values come from the real `public.product` row (composite PK
 *   org_id + product_code) — passed in as `values`. NO mock data here.
 *
 * Write path (real data, RLS): each dirty editable cell is persisted by calling
 *   `updateFaCell(productCode, columnKey, value)` (T-009, merged). That Server
 *   Action runs inside `withOrgContext` (app_user + RLS), re-validates the value
 *   against DeptColumns, enforces the per-dept RBAC permission server-side, and
 *   fires the cascades:
 *     - Recipe_Components edit → Chain 3 (auto-derive Ingredient_Codes +
 *       idempotent sync_prod_detail_rows).
 *     - Pack_Size change       → Chain 1 (clears Line + equipment_setup).
 *   The client NEVER trusts a client-side permission flag and NEVER writes the
 *   auto-derived `ingredient_codes` column (read-only red line).
 *
 * shadcn primitives only: Input / Select / Textarea / Card / Badge / Button /
 *   EmptyState from @monopilot/ui. Raw <select> is a red line — dropdown columns
 *   render the shadcn Select.
 *
 * i18n: every visible string is a prop (npd.faCoreTab namespace, resolved
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
import Textarea from '@monopilot/ui/Textarea';

import { updateFaCell } from '../../../../../../(npd)/fa/actions/update-fa-cell';

// ---------------------------------------------------------------------------
// Types (schema-driven — mirror Reference.DeptColumns metadata)
// ---------------------------------------------------------------------------

export type FaCoreColumnType = 'text' | 'number' | 'date' | 'boolean' | 'dropdown' | 'formula';

export type FaCoreColumn = {
  /** Physical (lower-cased) product column key, e.g. 'pack_size'. */
  key: string;
  /** Resolved data type from DeptColumns (drives the control). */
  dataType: FaCoreColumnType;
  /** required_for_done — drives the V05 required-missing alert + marker. */
  required: boolean;
  /** Read-only in the UI (PK / auto-derived / formula). Never submitted. */
  readOnly: boolean;
  /** Auto-derived field (e.g. ingredient_codes) — styled green. */
  auto?: boolean;
  /** Reference dropdown table name (when dataType === 'dropdown'). */
  dropdownSource?: string;
  /** display_order (ascending) — render order. */
  displayOrder: number;
};

export type FaCoreTabState =
  | 'ready'
  | 'loading'
  | 'empty'
  | 'error'
  | 'permission_denied';

export type FaCoreTabLabels = {
  title: string;
  subtitle: string;
  closedBadge: string;
  openBadge: string;
  autoHint: string;
  requiredMissingTitle: string;
  requiredMissingBody: string;
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
  /** Per-column human label keyed by physical column key. */
  fields: Record<string, string>;
};

export type FaCoreTabProps = {
  productCode: string;
  /** Schema-driven Core column metadata (Reference.DeptColumns, server-loaded). */
  columns: FaCoreColumn[];
  /** Real product-row values keyed by physical column key (server-loaded). */
  values: Record<string, unknown>;
  /** Dropdown option values keyed by dropdownSource (Reference tables). */
  dropdowns: Record<string, string[]>;
  labels: FaCoreTabLabels;
  state?: FaCoreTabState;
  /** Test/wiring seam: override the write path (defaults to T-009 updateFaCell). */
  onPersistCell?: (productCode: string, columnKey: string, value: unknown) => Promise<unknown>;
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

function fieldLabel(col: FaCoreColumn, labels: FaCoreTabLabels): string {
  return labels.fields[col.key] ?? col.key;
}

/** A field is "filled" iff its current string value is non-empty. */
function isFilled(value: string): boolean {
  return value.trim() !== '';
}

function sortColumns(columns: FaCoreColumn[]): FaCoreColumn[] {
  return [...columns].sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    return a.key.localeCompare(b.key);
  });
}

// ---------------------------------------------------------------------------
// State notices (loading / error / permission_denied) + empty
// ---------------------------------------------------------------------------

function StateNotice({ state, labels }: { state: FaCoreTabState; labels: FaCoreTabLabels }) {
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

function CoreField({
  col,
  labels,
  value,
  options,
  onChange,
}: {
  col: FaCoreColumn;
  labels: FaCoreTabLabels;
  value: string;
  options: string[];
  onChange: (next: string) => void;
}) {
  const label = fieldLabel(col, labels);
  const fieldId = `fa-core-${col.key}`;
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
        aria-required={col.required || undefined}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FaCoreTab
// ---------------------------------------------------------------------------

export function FaCoreTab({
  productCode,
  columns,
  values,
  dropdowns,
  labels,
  state = 'ready',
  onPersistCell,
}: FaCoreTabProps) {
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

  const closedCol = ordered.find((c) => c.key === 'closed_core');
  const isClosed = closedCol ? (form[closedCol.key] ?? '').toLowerCase() === 'yes' : false;

  // V05: every required, editable column must be filled.
  const requiredMissing = ordered.some(
    (col) => col.required && !col.readOnly && !isFilled(form[col.key] ?? ''),
  );

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
      // masking later cascade-bearing writes.
      for (const col of dirty) {
        // Read-only/auto columns (e.g. ingredient_codes) are NEVER submitted.
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

  const dataLoaded = state === 'ready' || state === 'empty';

  return (
    <section data-testid="fa-core-tab" aria-labelledby="fa-core-title" className="space-y-3">
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="fa-core-title" className="text-base font-semibold text-slate-900">
              {labels.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">{labels.subtitle}</p>
          </div>
          {dataLoaded && ordered.length > 0 ? (
            isClosed ? (
              <Badge tone="success" data-testid="fa-core-closed">
                {labels.closedBadge}
              </Badge>
            ) : (
              <Badge tone="muted" data-testid="fa-core-open">
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
                <a href="?tab=core" aria-label={labels.title}>
                  {labels.title}
                </a>
              }
            />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {ordered
                  .filter((col) => col.key !== 'comments')
                  .map((col) => (
                    <CoreField
                      key={col.key}
                      col={col}
                      labels={labels}
                      value={form[col.key] ?? ''}
                      options={col.dropdownSource ? (dropdowns[col.dropdownSource] ?? []) : []}
                      onChange={(next) => setValue(col.key, next)}
                    />
                  ))}
              </div>

              {/* Comments column (if configured) spans full width as a textarea. */}
              {ordered.some((c) => c.key === 'comments') ? (
                <div className="grid gap-1" data-field="comments">
                  <label htmlFor="fa-core-comments" className="text-xs font-medium text-slate-700">
                    {labels.fields.comments ?? 'comments'}
                  </label>
                  <Textarea
                    id="fa-core-comments"
                    name="comments"
                    rows={2}
                    value={form.comments ?? ''}
                    onChange={(event) => setValue('comments', event.target.value)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                  />
                </div>
              ) : null}

              {requiredMissing ? (
                <div
                  role="alert"
                  data-testid="fa-core-required-missing"
                  className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
                >
                  <strong className="font-semibold">{labels.requiredMissingTitle}</strong>
                  <p className="mt-0.5">{labels.requiredMissingBody}</p>
                </div>
              ) : null}

              {feedback ? (
                <div
                  role={feedback.tone === 'error' ? 'alert' : 'status'}
                  aria-live={feedback.tone === 'error' ? 'assertive' : 'polite'}
                  data-testid={`fa-core-feedback-${feedback.tone}`}
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
                  data-testid="fa-core-save"
                  disabled={saving}
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

export default FaCoreTab;

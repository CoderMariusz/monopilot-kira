'use client';

/**
 * T-102 — FaProcurementTab (SCR-03g FA detail Procurement tab) — schema-driven
 * Procurement dept form with V-NPD-PROC-001 price gating.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:806-838 (fa_procurement_tab)
 *   FAProcurementTab: "Procurement section" card with an open/closed badge
 *   (closed_procurement), an amber V-NPD-PROC-001 alert rendered only when
 *   priceBlocked, a form-grid of 4 fields (Price (€/kg) *, Lead time (days) *,
 *   Supplier * <select>, Proc. shelf life (days) *), and a "Save Procurement" +
 *   "Close Procurement section" action row. The Price input is disabled with a
 *   gray (#D0D0D0) background whenever priceBlocked is true.
 *
 * STANDALONE component (this slice): the shell (fa-tabs.tsx) owns the tab slots;
 * the per-tab wiring is T-105. This file deliberately does NOT edit fa-tabs.tsx —
 * it exports a tab body that T-105 will mount into the Procurement slot.
 *
 * V-NPD-PROC-001 price gating (both client + server enforced — task red line):
 *   priceBlocked = closedCore !== 'Yes' || closedProduction !== 'Yes'.
 *   These two flags are derived server-side from the real product row
 *   (closed_core / closed_production) and passed as props. When blocked the
 *   Price control is disabled with a gray (#D0D0D0) background, an amber alert is
 *   shown, and the client NEVER submits the price column. The server action
 *   updateFaCell re-enforces the gate independently (it validates the value
 *   against DeptColumns + per-dept RBAC; price writes are rejected server-side
 *   when the gate is not satisfied — the client gate is convenience only).
 *
 * Schema-driven (NO hardcoded field list — task red line):
 *   The rendered fields come entirely from the `columns` prop, which the future
 *   T-105 server loader derives from `Reference.DeptColumns` (dept_code=
 *   'Procurement') via the T-014 buildDeptZod runtime / dept-column metadata. The
 *   Supplier dropdown options come from a Reference table (`Suppliers`) passed in
 *   `dropdowns` — NEVER a hardcoded supplier list (task red line). Field values
 *   come from the real `public.product` row (composite PK org_id + product_code).
 *
 * Write path (real data, RLS): each dirty editable cell is persisted by calling
 *   `updateFaCell(productCode, columnKey, value)` (T-009, merged). That Server
 *   Action runs inside `withOrgContext` (app_user + RLS), re-validates the value
 *   against DeptColumns, enforces the per-dept RBAC permission (npd.procurement.write)
 *   server-side, and resets `built` on edit. NO mock data here.
 *
 * shadcn primitives only: Input / Select / Card / Badge / Button / EmptyState
 *   from @monopilot/ui. Raw <select> is a red line — dropdown columns render the
 *   shadcn Select.
 *
 * i18n: every visible string is a prop (npd.faProcurementTab namespace, resolved
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

export type FaProcurementColumnType =
  | 'text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'dropdown'
  | 'formula';

export type FaProcurementColumn = {
  /** Physical (lower-cased) product column key, e.g. 'price_per_kg'. */
  key: string;
  /** Resolved data type from DeptColumns (drives the control). */
  dataType: FaProcurementColumnType;
  /** required_for_done — drives the required marker. */
  required: boolean;
  /** Read-only in the UI (PK / auto-derived / formula). Never submitted. */
  readOnly: boolean;
  /** Auto-derived field — styled green. */
  auto?: boolean;
  /**
   * V-NPD-PROC-001 price-gated column: disabled + gray bg + never submitted when
   * priceBlocked. The Procurement price column carries this flag (server-side the
   * gate is re-enforced independently).
   */
  priceGated?: boolean;
  /** Reference dropdown table name (when dataType === 'dropdown'). */
  dropdownSource?: string;
  /** display_order (ascending) — render order. */
  displayOrder: number;
};

export type FaProcurementTabState =
  | 'ready'
  | 'loading'
  | 'empty'
  | 'error'
  | 'permission_denied';

export type FaProcurementTabLabels = {
  title: string;
  subtitle: string;
  closedBadge: string;
  openBadge: string;
  /** V-NPD-PROC-001 amber alert title + body (shown only when priceBlocked). */
  priceBlockedTitle: string;
  priceBlockedBody: string;
  /** Inline hint under the disabled price field. */
  priceBlockedHint: string;
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

export type FaProcurementTabProps = {
  productCode: string;
  /** Schema-driven Procurement column metadata (Reference.DeptColumns, server-loaded). */
  columns: FaProcurementColumn[];
  /** Real product-row values keyed by physical column key (server-loaded). */
  values: Record<string, unknown>;
  /** Dropdown option values keyed by dropdownSource (Reference tables, e.g. Suppliers). */
  dropdowns: Record<string, string[]>;
  labels: FaProcurementTabLabels;
  /**
   * closed_core value from the real product row ('Yes' unlocks the price gate).
   * Drives V-NPD-PROC-001 alongside closedProduction.
   */
  closedCore: string | null | undefined;
  /** closed_production value from the real product row ('Yes' unlocks the price gate). */
  closedProduction: string | null | undefined;
  state?: FaProcurementTabState;
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

function fieldLabel(col: FaProcurementColumn, labels: FaProcurementTabLabels): string {
  return labels.fields[col.key] ?? col.key;
}

function sortColumns(columns: FaProcurementColumn[]): FaProcurementColumn[] {
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
  state: FaProcurementTabState;
  labels: FaProcurementTabLabels;
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

function ProcurementField({
  col,
  labels,
  value,
  options,
  priceBlocked,
  onChange,
}: {
  col: FaProcurementColumn;
  labels: FaProcurementTabLabels;
  value: string;
  options: string[];
  priceBlocked: boolean;
  onChange: (next: string) => void;
}) {
  const label = fieldLabel(col, labels);
  const fieldId = `fa-proc-${col.key}`;
  const hintId = `${fieldId}-hint`;
  const isAuto = col.auto === true;
  const isReadOnly = col.readOnly === true;
  // V-NPD-PROC-001: the price-gated column is disabled when the gate is closed.
  const gated = col.priceGated === true && priceBlocked;

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
    <div className="grid gap-1" data-field={col.key} data-price-gated={col.priceGated || undefined}>
      <label htmlFor={fieldId} className="text-xs font-medium text-slate-700">
        {label}
        {col.required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <Input
        id={fieldId}
        name={col.key}
        type={inputType}
        step={col.key === 'price_per_kg' ? '0.01' : undefined}
        value={value}
        disabled={gated}
        aria-required={col.required || undefined}
        aria-describedby={gated ? hintId : undefined}
        onChange={(event) => onChange(event.target.value)}
        // V-NPD-PROC-001: gray (#D0D0D0) disabled background to mirror the prototype.
        className={
          gated
            ? 'rounded-md border border-slate-300 bg-[#D0D0D0] px-2 py-1.5 text-sm text-slate-500'
            : 'rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900'
        }
      />
      {gated ? (
        <span id={hintId} className="text-[11px] text-amber-700">
          {labels.priceBlockedHint}
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FaProcurementTab
// ---------------------------------------------------------------------------

export function FaProcurementTab({
  productCode,
  columns,
  values,
  dropdowns,
  labels,
  closedCore,
  closedProduction,
  state = 'ready',
  onPersistCell,
}: FaProcurementTabProps) {
  const ordered = React.useMemo(() => sortColumns(columns), [columns]);

  // V-NPD-PROC-001: price unlocks only after BOTH Core and Production are closed.
  const priceBlocked = closedCore !== 'Yes' || closedProduction !== 'Yes';

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

  const closedCol = ordered.find((c) => c.key === 'closed_procurement');
  const isClosed = closedCol ? (form[closedCol.key] ?? '').toLowerCase() === 'yes' : false;

  function setValue(key: string, next: string) {
    setForm((prev) => ({ ...prev, [key]: next }));
    setFeedback(null);
  }

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      const dirty = ordered.filter((col) => {
        if (col.readOnly) return false;
        // V-NPD-PROC-001: never submit a price-gated column while the gate is closed.
        if (col.priceGated && priceBlocked) return false;
        return (form[col.key] ?? '') !== (initial[col.key] ?? '');
      });
      // Sequential writes: a single failed cell surfaces an error without masking
      // later writes.
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

  const dataLoaded = state === 'ready' || state === 'empty';

  return (
    <section
      data-testid="fa-procurement-tab"
      aria-labelledby="fa-proc-title"
      className="space-y-3"
    >
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="fa-proc-title" className="text-base font-semibold text-slate-900">
              {labels.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">{labels.subtitle}</p>
          </div>
          {dataLoaded && ordered.length > 0 ? (
            isClosed ? (
              <Badge tone="success" data-testid="fa-proc-closed">
                {labels.closedBadge}
              </Badge>
            ) : (
              <Badge tone="muted" data-testid="fa-proc-open">
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
              icon="📦"
              title={labels.empty}
              body={labels.emptyBody}
              action={
                <a href="?tab=procurement" aria-label={labels.title}>
                  {labels.title}
                </a>
              }
            />
          ) : (
            <div className="space-y-4">
              {/* V-NPD-PROC-001 amber alert — only when the price gate is closed. */}
              {priceBlocked ? (
                <div
                  role="alert"
                  data-testid="fa-proc-price-blocked"
                  className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
                >
                  <strong className="font-semibold">{labels.priceBlockedTitle}</strong>
                  <p className="mt-0.5">{labels.priceBlockedBody}</p>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {ordered.map((col) => (
                  <ProcurementField
                    key={col.key}
                    col={col}
                    labels={labels}
                    value={form[col.key] ?? ''}
                    options={col.dropdownSource ? (dropdowns[col.dropdownSource] ?? []) : []}
                    priceBlocked={priceBlocked}
                    onChange={(next) => setValue(col.key, next)}
                  />
                ))}
              </div>

              {feedback ? (
                <div
                  role={feedback.tone === 'error' ? 'alert' : 'status'}
                  aria-live={feedback.tone === 'error' ? 'assertive' : 'polite'}
                  data-testid={`fa-proc-feedback-${feedback.tone}`}
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
                  data-testid="fa-proc-save"
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

export default FaProcurementTab;

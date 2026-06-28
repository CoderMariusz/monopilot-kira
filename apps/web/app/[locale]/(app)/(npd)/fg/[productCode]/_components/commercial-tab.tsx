'use client';

/**
 * T-103 — FaCommercialTab (SCR-03c FA detail Commercial tab) — schema-driven
 * Commercial dept form with the V08 launch-date rule.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:559-586 (FACommercialTab)
 *   FACommercialTab: "Commercial section" card with an open/closed badge
 *   (closed_commercial: Yes → green "✓ Closed", else gray "Open"); a blue V08
 *   Alert when `fa.brief_id` is present ("V08 · Launch Date must be ≥ 24 weeks
 *   from Brief handoff. Earliest: {earliest}."); a form-grid of 7 fields
 *   (Launch Date * date, Department number *, Article number *, Bar codes (GS1) *
 *   mono, Cases/week W1 *, W2 *, W3 * number); a "Save Commercial" +
 *   "Close Commercial section" action row.
 *
 * STANDALONE component (this slice): the shell (T-136 fa-tabs.tsx) owns the tab
 * slots; the per-tab wiring is T-105. This file deliberately does NOT edit
 * fa-tabs.tsx — it exports a tab body that T-105 will mount into the Commercial
 * slot. (Mirrors the merged T-023 FaCoreTab pattern.)
 *
 * Schema-driven (NO hardcoded field list — task red line):
 *   The rendered fields come entirely from the `columns` prop, which the future
 *   T-105 server loader derives from `Reference.DeptColumns` (dept_code =
 *   'Commercial') via the T-014 buildDeptZod runtime / dept-column metadata. The
 *   component renders whatever Commercial columns the org has configured, in
 *   display order. Field values come from the real `public.product` row
 *   (composite PK org_id + product_code) — passed in as `values`. NO mock data.
 *
 * V08 launch-date rule (NOT hardcoded — task red line):
 *   When the product has a `brief_id`, Launch Date must be ≥ 24 weeks from the
 *   Brief handoff date. `earliest` is computed SERVER-SIDE (brief handoff + 24
 *   weeks) and passed in as a prop — never derived/hardcoded here. The client
 *   shows the V08 advisory alert and blocks a launch_date write that is earlier
 *   than `earliest`; the canonical enforcement lives in the `updateFaCell`
 *   Server Action (T-009), which re-validates server-side.
 *
 * Write path (real data, RLS): each dirty editable cell is persisted by calling
 *   `updateFaCell(productCode, columnKey, value)` (T-009, merged). That Server
 *   Action runs inside `withOrgContext` (app_user + RLS), re-validates the value
 *   against DeptColumns, enforces the per-dept RBAC permission (npd.commercial.write)
 *   server-side, and never trusts a client-side permission flag.
 *
 * shadcn primitives only: Input / Card / Badge / Button / EmptyState from
 *   @monopilot/ui. Bar codes (GS1) renders in font-mono per the prototype.
 *
 * i18n: every visible string is a prop (npd.faCommercialTab namespace, resolved
 *   server-side). No inline English literals.
 */

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader } from '@monopilot/ui/Card';
import { EmptyState } from '@monopilot/ui/EmptyState';
import Input from '@monopilot/ui/Input';

import { updateFaCell } from '../../../../../../(npd)/fa/actions/update-fa-cell';

// ---------------------------------------------------------------------------
// Types (schema-driven — mirror Reference.DeptColumns metadata)
// ---------------------------------------------------------------------------

export type FaCommercialColumnType = 'text' | 'number' | 'date' | 'boolean' | 'dropdown' | 'formula';

export type FaCommercialColumn = {
  /** Physical (lower-cased) product column key, e.g. 'launch_date'. */
  key: string;
  /** Resolved data type from DeptColumns (drives the control). */
  dataType: FaCommercialColumnType;
  /** required_for_done — drives the required-missing alert + marker. */
  required: boolean;
  /** Read-only in the UI (PK / auto-derived / formula). Never submitted. */
  readOnly: boolean;
  /** Render the value in a monospace font (e.g. Bar codes / GS1). */
  mono?: boolean;
  /** display_order (ascending) — render order. */
  displayOrder: number;
};

export type FaCommercialTabState =
  | 'ready'
  | 'loading'
  | 'empty'
  | 'error'
  | 'permission_denied';

export type FaCommercialTabLabels = {
  title: string;
  subtitle: string;
  closedBadge: string;
  openBadge: string;
  /** ICU-style template containing the `{earliest}` placeholder (advisory). */
  v08Alert: string;
  /** ICU-style template containing the `{earliest}` placeholder (violation). */
  v08Violation: string;
  requiredMissingTitle: string;
  requiredMissingBody: string;
  save: string;
  saving: string;
  saveSuccess: string;
  saveError: string;
  close: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
  /** Per-column human label keyed by physical column key. */
  fields: Record<string, string>;
};

export type FaCommercialTabProps = {
  productCode: string;
  /** Schema-driven Commercial column metadata (Reference.DeptColumns, server-loaded). */
  columns: FaCommercialColumn[];
  /** Real product-row values keyed by physical column key (server-loaded). */
  values: Record<string, unknown>;
  /** closed_commercial value from the real product row ('Yes' → Closed badge). */
  closedCommercial: string | null;
  /** Product's brief_id (real product row). When present, the V08 rule applies. */
  briefId: string | null;
  /** Earliest allowed Launch Date (brief handoff + 24 weeks), computed SERVER-SIDE. */
  earliest: string | null;
  labels: FaCommercialTabLabels;
  state?: FaCommercialTabState;
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

function fieldLabel(col: FaCommercialColumn, labels: FaCommercialTabLabels): string {
  return labels.fields[col.key] ?? col.key;
}

/** A field is "filled" iff its current string value is non-empty. */
function isFilled(value: string): boolean {
  return value.trim() !== '';
}

function sortColumns(columns: FaCommercialColumn[]): FaCommercialColumn[] {
  return [...columns].sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    return a.key.localeCompare(b.key);
  });
}

/** Replace the `{earliest}` placeholder in an i18n template. */
function fillEarliest(template: string, earliest: string | null): string {
  return template.replace('{earliest}', earliest ?? '');
}

/**
 * V08 client guard: a launch_date string violates the rule when a brief_id is
 * present, an `earliest` is known, and the entered date is strictly before it.
 * Canonical enforcement is server-side (updateFaCell / T-009).
 */
function violatesV08(launchDate: string, briefId: string | null, earliest: string | null): boolean {
  if (!briefId || !earliest) return false;
  if (!isFilled(launchDate)) return false;
  return launchDate < earliest; // ISO yyyy-mm-dd → lexical compare is chronological.
}

// ---------------------------------------------------------------------------
// State notices (loading / error / permission_denied)
// ---------------------------------------------------------------------------

function StateNotice({
  state,
  labels,
}: {
  state: FaCommercialTabState;
  labels: FaCommercialTabLabels;
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

function CommercialField({
  col,
  labels,
  value,
  onChange,
}: {
  col: FaCommercialColumn;
  labels: FaCommercialTabLabels;
  value: string;
  onChange: (next: string) => void;
}) {
  const label = fieldLabel(col, labels);
  const fieldId = `fa-commercial-${col.key}`;
  const isReadOnly = col.readOnly === true;
  const inputType =
    col.dataType === 'number' ? 'number' : col.dataType === 'date' ? 'date' : 'text';
  const monoClass = col.mono ? ' font-mono' : '';

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
          className={`rounded-md border border-slate-200 bg-slate-100 px-2 py-1.5 text-sm text-slate-700${monoClass}`}
        />
      </div>
    );
  }

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
        className={`rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900${monoClass}`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FaCommercialTab
// ---------------------------------------------------------------------------

export function FaCommercialTab({
  productCode,
  columns,
  values,
  closedCommercial,
  briefId,
  earliest,
  labels,
  state = 'ready',
  onPersistCell,
}: FaCommercialTabProps) {
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
  const [v08Violated, setV08Violated] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  );

  // Re-sync when the server-loaded values change (e.g. after a revalidate).
  React.useEffect(() => {
    setForm(initial);
  }, [initial]);

  const persist = onPersistCell ?? updateFaCell;

  // Badge driven by the real product row (NOT mutated by a cell save).
  const isClosed = (closedCommercial ?? '').toLowerCase() === 'yes';

  // Required-missing: every required, editable column must be filled.
  const requiredMissing = ordered.some(
    (col) => col.required && !col.readOnly && !isFilled(form[col.key] ?? ''),
  );

  function setValue(key: string, next: string) {
    setForm((prev) => ({ ...prev, [key]: next }));
    setFeedback(null);
    if (key === 'launch_date') {
      setV08Violated(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    setV08Violated(false);
    try {
      const dirty = ordered.filter(
        (col) => !col.readOnly && (form[col.key] ?? '') !== (initial[col.key] ?? ''),
      );

      let wrote = false;
      for (const col of dirty) {
        // V08: block a non-conforming launch_date client-side before the write.
        if (
          col.key === 'launch_date' &&
          violatesV08(form[col.key] ?? '', briefId, earliest)
        ) {
          setV08Violated(true);
          continue;
        }
        await persist(productCode, col.key, form[col.key]);
        wrote = true;
      }

      if (wrote) {
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
      data-testid="fa-commercial-tab"
      aria-labelledby="fa-commercial-title"
      className="space-y-3"
    >
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="fa-commercial-title" className="text-base font-semibold text-slate-900">
              {labels.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">{labels.subtitle}</p>
          </div>
          {dataLoaded && ordered.length > 0 ? (
            isClosed ? (
              <Badge tone="success" data-testid="fa-commercial-closed">
                {labels.closedBadge}
              </Badge>
            ) : (
              <Badge tone="muted" data-testid="fa-commercial-open">
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
              icon="🛒"
              title={labels.empty}
              body={labels.emptyBody}
              action={
                <a href="?tab=commercial" aria-label={labels.title}>
                  {labels.title}
                </a>
              }
            />
          ) : (
            <div className="space-y-4">
              {/* V08 advisory alert — only when the product has a brief_id. */}
              {briefId ? (
                <div
                  role="note"
                  data-testid="fa-commercial-v08"
                  className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800"
                >
                  {fillEarliest(labels.v08Alert, earliest)}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {ordered.map((col) => (
                  <CommercialField
                    key={col.key}
                    col={col}
                    labels={labels}
                    value={form[col.key] ?? ''}
                    onChange={(next) => setValue(col.key, next)}
                  />
                ))}
              </div>

              {requiredMissing ? (
                <div
                  role="alert"
                  data-testid="fa-commercial-required-missing"
                  className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
                >
                  <strong className="font-semibold">{labels.requiredMissingTitle}</strong>
                  <p className="mt-0.5">{labels.requiredMissingBody}</p>
                </div>
              ) : null}

              {v08Violated ? (
                <div
                  role="alert"
                  aria-live="assertive"
                  data-testid="fa-commercial-v08-violation"
                  className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                  {fillEarliest(labels.v08Violation, earliest)}
                </div>
              ) : null}

              {feedback ? (
                <div
                  role={feedback.tone === 'error' ? 'alert' : 'status'}
                  aria-live={feedback.tone === 'error' ? 'assertive' : 'polite'}
                  data-testid={`fa-commercial-feedback-${feedback.tone}`}
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
                  data-testid="fa-commercial-save"
                  disabled={saving}
                  onClick={handleSave}
                >
                  {saving ? labels.saving : labels.save}
                </Button>
                <Button type="button" data-testid="fa-commercial-close" disabled={saving}>
                  {labels.close}
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

export default FaCommercialTab;

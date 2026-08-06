'use client';

import React from 'react';

import { PageHead, Section } from '../_components';
import type { OverrideTypeRow, ReasonCodeRow, RmaReasonCodeRow } from './_actions/shipping-overrides';

/**
 * Shipping override reasons settings screen.
 *
 * Prototype parity:
 * prototypes/design/Monopilot Design System/settings/admin-screens.jsx:720-799
 * (ShippingOverrideReasonsScreen) — override-type card grid (`.sg-card-grid`)
 * with per-type reason counts, the selected type's reason-code table, and the
 * RMA reason-codes table.
 *
 * Built from the shared settings primitives (`PageHead`, `Section`) so the
 * `.sg-*` structure stays in parity with the prototype. All data is real
 * (Supabase rows loaded server-side via `_actions/shipping-overrides.ts`;
 * tables `shipping_override_types`, `shipping_override_reasons`,
 * `rma_reason_codes`); no mocks.
 *
 * Selecting an override-type card is a client-only highlight: the initial
 * reason-code list is the server-loaded set for the first override type.
 *
 * D2: "Add reason" used to be decorative — page.tsx never handed the screen a
 * writer, so the button produced 0 DOM changes, 0 requests, 0 rows. Both tables
 * now have an inline add form bound to the `_actions` writers. The RMA one is
 * the one that matters operationally: the RMA create form validates the chosen
 * reason against `rma_reason_codes`, so an empty table meant no return could be
 * filed at all and there was nowhere in the product to fix that.
 */

const PROTOTYPE_SOURCE = 'prototypes/design/Monopilot Design System/settings/admin-screens.jsx:720-799';

export type ShipOverrideReasonsScreenLabels = {
  title: string;
  subtitle: string;
  exportCsv: string;
  addReason: string;
  reasonCodesSuffix: string;
  reasonCodesSubtitle: string;
  reasonColumns: {
    code: string;
    label: string;
    requiresNote: string;
    status: string;
  };
  rmaTitle: string;
  rmaSubtitle: string;
  rmaColumns: {
    code: string;
    labelEn: string;
    labelPl: string;
    status: string;
  };
  statusActive: string;
  statusInactive: string;
  requiresNoteYes: string;
  requiresNoteNo: string;
  codesCountSuffix: string;
  emptyOverrideTypes: string;
  emptyReasonCodes: string;
  emptyRmaCodes: string;
  addRmaReason: string;
  formSave: string;
  formCancel: string;
  formError: string;
};

/** What the writers resolve to; `data` is the persisted row, so the table can show it at once. */
export type AddReasonResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type ShipOverrideReasonsScreenProps = {
  overrideTypes: OverrideTypeRow[];
  selectedOverrideTypeId: string | null;
  reasonCodes: ReasonCodeRow[];
  rmaReasonCodes: RmaReasonCodeRow[];
  canEdit?: boolean;
  labels: ShipOverrideReasonsScreenLabels;
  onAddReason?: (input: {
    overrideTypeId: string;
    code: string;
    label: string;
  }) => Promise<AddReasonResult<ReasonCodeRow>>;
  onAddRmaReason?: (input: { code: string; label_en: string }) => Promise<AddReasonResult<RmaReasonCodeRow>>;
  onSelectOverrideType?: (overrideTypeId: string) => void;
};

function mergeRows<T extends { id: string }>(serverRows: T[], addedRows: T[]): T[] {
  const seen = new Set(serverRows.map((row) => row.id));
  return [...serverRows, ...addedRows.filter((row) => !seen.has(row.id))];
}

function StatusBadge({ active, activeLabel, inactiveLabel }: { active: boolean; activeLabel: string; inactiveLabel: string }) {
  return active ? (
    <span className="badge badge-green" style={{ fontSize: 9 }}>
      {activeLabel}
    </span>
  ) : (
    <span className="badge badge-gray" style={{ fontSize: 9 }}>
      {inactiveLabel}
    </span>
  );
}

/**
 * Inline "code + label" add row, used by both tables. Everything else the two
 * tables carry (requires_note, label_pl, display_order) has a server-side default,
 * so two text inputs are all it takes to unblock the flows that need a row to exist.
 */
function AddReasonForm({
  codeLabel,
  valueLabel,
  saveLabel,
  cancelLabel,
  errorLabel,
  testId,
  onSubmit,
  onCancel,
}: {
  codeLabel: string;
  valueLabel: string;
  saveLabel: string;
  cancelLabel: string;
  errorLabel: string;
  testId: string;
  onSubmit: (code: string, value: string) => Promise<{ ok: boolean }>;
  onCancel: () => void;
}) {
  const [code, setCode] = React.useState('');
  const [value, setValue] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const canSubmit = code.trim().length > 0 && value.trim().length > 0 && !busy;

  return (
    <form
      data-testid={testId}
      className="flex flex-wrap items-end gap-2"
      style={{ marginBottom: 12 }}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canSubmit) return;
        setBusy(true);
        setFailed(false);
        try {
          const result = await onSubmit(code.trim(), value.trim());
          if (result.ok) {
            setCode('');
            setValue('');
            onCancel();
          } else {
            setFailed(true);
          }
        } catch {
          setFailed(true);
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        aria-label={codeLabel}
        className="mono"
        disabled={busy}
        placeholder={codeLabel}
        value={code}
        onChange={(event) => setCode(event.currentTarget.value)}
      />
      <input
        aria-label={valueLabel}
        disabled={busy}
        placeholder={valueLabel}
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
      />
      <button className="btn btn-primary" disabled={!canSubmit} type="submit">
        {saveLabel}
      </button>
      <button className="btn btn-ghost" disabled={busy} type="button" onClick={onCancel}>
        {cancelLabel}
      </button>
      {failed ? (
        <span className="text-sm text-red-600" role="alert">
          {errorLabel}
        </span>
      ) : null}
    </form>
  );
}

export default function ShipOverrideReasonsScreen({
  overrideTypes,
  selectedOverrideTypeId,
  reasonCodes,
  rmaReasonCodes,
  canEdit = false,
  labels,
  onAddReason,
  onAddRmaReason,
  onSelectOverrideType,
}: ShipOverrideReasonsScreenProps) {
  const [activeTypeId, setActiveTypeId] = React.useState<string | null>(
    selectedOverrideTypeId ?? overrideTypes[0]?.id ?? null,
  );
  const [showReasonForm, setShowReasonForm] = React.useState(false);
  const [showRmaForm, setShowRmaForm] = React.useState(false);
  // Rows this session just persisted. revalidateLocalized() invalidates the route
  // cache, but nothing re-renders the server component until the operator navigates,
  // so without this the row they just created looks like it vanished.
  // ponytail: deduped by id, so a later server render replaces rather than doubles.
  const [addedReasonCodes, setAddedReasonCodes] = React.useState<ReasonCodeRow[]>([]);
  const [addedRmaCodes, setAddedRmaCodes] = React.useState<RmaReasonCodeRow[]>([]);

  const activeType = overrideTypes.find((type) => type.id === activeTypeId) ?? null;
  // The server-loaded reason codes correspond to `selectedOverrideTypeId`; show
  // them only while that type stays selected (no client refetch in this pass).
  const showServerReasonCodes = activeTypeId === selectedOverrideTypeId;
  const visibleReasonCodes = mergeRows(
    showServerReasonCodes ? reasonCodes : [],
    addedReasonCodes.filter((row) => row.override_type_id === activeTypeId),
  );
  const visibleRmaCodes = mergeRows(rmaReasonCodes, addedRmaCodes);

  const reasonSectionTitle = activeType
    ? `${activeType.label}${labels.reasonCodesSuffix}`
    : labels.reasonCodesSuffix.replace(/^[\s—·-]+/, '');

  function handleSelect(overrideTypeId: string) {
    setActiveTypeId(overrideTypeId);
    onSelectOverrideType?.(overrideTypeId);
  }

  return (
    <main
      aria-label={labels.title}
      className="mx-auto grid max-w-5xl gap-3 p-6"
      data-prototype-source={PROTOTYPE_SOURCE}
    >
      <PageHead
        title={labels.title}
        sub={labels.subtitle}
        actions={
          <>
            <button className="btn btn-secondary" type="button" disabled={!canEdit}>
              {labels.exportCsv}
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!canEdit || !onAddReason || !activeTypeId}
              onClick={() => setShowReasonForm((open) => !open)}
            >
              {labels.addReason}
            </button>
          </>
        }
      />

      {overrideTypes.length === 0 ? (
        <div className="muted" data-testid="ship-override-types-empty" role="status">
          {labels.emptyOverrideTypes}
        </div>
      ) : (
        <div className="sg-card-grid" data-testid="ship-override-types-grid" style={{ marginBottom: 12 }}>
          {overrideTypes.map((type) => {
            const isActive = type.id === activeTypeId;
            return (
              <button
                key={type.id}
                type="button"
                aria-pressed={isActive}
                data-testid="ship-override-type-card"
                data-active={isActive ? 'true' : 'false'}
                className={`sg-card${isActive ? ' active' : ''}`}
                onClick={() => handleSelect(type.id)}
                style={{
                  textAlign: 'left',
                  borderColor: isActive ? 'var(--blue)' : undefined,
                }}
              >
                <div className="sg-card-title">{type.label}</div>
                <div className="sg-card-desc" style={{ marginTop: 4 }}>
                  {type.reason_count} {labels.codesCountSuffix}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Section title={reasonSectionTitle} sub={labels.reasonCodesSubtitle}>
        {showReasonForm && canEdit && onAddReason && activeTypeId ? (
          <AddReasonForm
            testId="ship-reason-code-add-form"
            codeLabel={labels.reasonColumns.code}
            valueLabel={labels.reasonColumns.label}
            saveLabel={labels.formSave}
            cancelLabel={labels.formCancel}
            errorLabel={labels.formError}
            onCancel={() => setShowReasonForm(false)}
            onSubmit={async (code, label) => {
              const result = await onAddReason({ overrideTypeId: activeTypeId, code, label });
              if (result.ok) setAddedReasonCodes((rows) => [...rows, result.data]);
              return result;
            }}
          />
        ) : null}
        {visibleReasonCodes.length === 0 ? (
          <div className="muted" data-testid="ship-reason-codes-empty" role="status">
            {labels.emptyReasonCodes}
          </div>
        ) : (
          <table data-testid="ship-reason-codes-table">
            <thead>
              <tr>
                <th>{labels.reasonColumns.code}</th>
                <th>{labels.reasonColumns.label}</th>
                <th>{labels.reasonColumns.requiresNote}</th>
                <th>{labels.reasonColumns.status}</th>
              </tr>
            </thead>
            <tbody>
              {visibleReasonCodes.map((reason) => (
                <tr key={reason.id}>
                  <td className="mono" style={{ fontWeight: 600 }}>
                    {reason.code}
                  </td>
                  <td>{reason.label}</td>
                  <td>{reason.requires_note ? labels.requiresNoteYes : labels.requiresNoteNo}</td>
                  <td>
                    <StatusBadge
                      active={reason.is_active}
                      activeLabel={labels.statusActive}
                      inactiveLabel={labels.statusInactive}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title={labels.rmaTitle}
        sub={labels.rmaSubtitle}
        action={
          <button
            className="btn btn-primary"
            type="button"
            disabled={!canEdit || !onAddRmaReason}
            onClick={() => setShowRmaForm((open) => !open)}
          >
            {labels.addRmaReason}
          </button>
        }
      >
        {showRmaForm && canEdit && onAddRmaReason ? (
          <AddReasonForm
            testId="ship-rma-code-add-form"
            codeLabel={labels.rmaColumns.code}
            valueLabel={labels.rmaColumns.labelEn}
            saveLabel={labels.formSave}
            cancelLabel={labels.formCancel}
            errorLabel={labels.formError}
            onCancel={() => setShowRmaForm(false)}
            onSubmit={async (code, labelEn) => {
              const result = await onAddRmaReason({ code, label_en: labelEn });
              if (result.ok) setAddedRmaCodes((rows) => [...rows, result.data]);
              return result;
            }}
          />
        ) : null}
        {visibleRmaCodes.length === 0 ? (
          <div className="muted" data-testid="ship-rma-codes-empty" role="status">
            {labels.emptyRmaCodes}
          </div>
        ) : (
          <table data-testid="ship-rma-codes-table">
            <thead>
              <tr>
                <th>{labels.rmaColumns.code}</th>
                <th>{labels.rmaColumns.labelEn}</th>
                <th>{labels.rmaColumns.labelPl}</th>
                <th>{labels.rmaColumns.status}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRmaCodes.map((rma) => (
                <tr key={rma.id}>
                  <td className="mono" style={{ fontWeight: 600 }}>
                    {rma.code}
                  </td>
                  <td>{rma.label_en}</td>
                  <td className="muted">{rma.label_pl ?? '—'}</td>
                  <td>
                    <StatusBadge
                      active={rma.is_active}
                      activeLabel={labels.statusActive}
                      inactiveLabel={labels.statusInactive}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </main>
  );
}

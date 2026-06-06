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
 * reason-code list is the server-loaded set for the first override type. The
 * card-driven refetch / add-reason mutation flow is intentionally out of scope
 * for this read-only parity pass (the loaders + mutations exist in `_actions`).
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
};

export type ShipOverrideReasonsScreenProps = {
  overrideTypes: OverrideTypeRow[];
  selectedOverrideTypeId: string | null;
  reasonCodes: ReasonCodeRow[];
  rmaReasonCodes: RmaReasonCodeRow[];
  canEdit?: boolean;
  labels: ShipOverrideReasonsScreenLabels;
  onAddReason?: () => void;
  onSelectOverrideType?: (overrideTypeId: string) => void;
};

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

export default function ShipOverrideReasonsScreen({
  overrideTypes,
  selectedOverrideTypeId,
  reasonCodes,
  rmaReasonCodes,
  canEdit = false,
  labels,
  onAddReason,
  onSelectOverrideType,
}: ShipOverrideReasonsScreenProps) {
  const [activeTypeId, setActiveTypeId] = React.useState<string | null>(
    selectedOverrideTypeId ?? overrideTypes[0]?.id ?? null,
  );

  const activeType = overrideTypes.find((type) => type.id === activeTypeId) ?? null;
  // The server-loaded reason codes correspond to `selectedOverrideTypeId`; show
  // them only while that type stays selected (no client refetch in this pass).
  const showServerReasonCodes = activeTypeId === selectedOverrideTypeId;
  const visibleReasonCodes = showServerReasonCodes ? reasonCodes : [];

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
              disabled={!canEdit}
              onClick={() => onAddReason?.()}
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

      <Section title={labels.rmaTitle} sub={labels.rmaSubtitle}>
        {rmaReasonCodes.length === 0 ? (
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
              {rmaReasonCodes.map((rma) => (
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

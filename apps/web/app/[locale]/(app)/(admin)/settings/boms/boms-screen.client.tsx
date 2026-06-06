'use client';

import React, { useState, useTransition } from 'react';

import { PageHead, Section, SelectField, SRow, Toggle } from '../_components';
import type { BomRow, BomKpis, BomSettings, UpdateBomSettingsResult } from './_actions/boms';

/**
 * BOMs & recipes settings screen.
 *
 * Prototype parity:
 * prototypes/design/Monopilot Design System/settings/data-screens.jsx:55-103
 * (BomsScreen) — 3 KPI stat cards (Active / Draft / Archived with a coloured
 * bottom border), a BOMs table (BOM #, Product, Version, Ingredients, Last
 * updated, Status) inside a Section, and a "BOM settings" Section with two
 * toggles (Auto-calculate nutrition, Require allergen review) + a version
 * retention `<select>` rendered through the shared `SelectField`.
 *
 * Built from the shared settings primitives (`PageHead`, `Section`, `SRow`,
 * `Toggle`, `SelectField`) so the `.sg-*` structure stays in parity with the
 * prototype. KPI tiles use the global `.kpi` / `.kpi-label` / `.kpi-value`
 * classes. All data is real (Supabase rows loaded server-side via
 * `_actions/boms.ts`); no mocks.
 */

const PROTOTYPE_SOURCE = 'prototypes/design/Monopilot Design System/settings/data-screens.jsx:55-103';

export type BomsScreenLabels = {
  title: string;
  subtitle: string;
  kpiActive: string;
  kpiDraft: string;
  kpiArchived: string;
  tableTitle: string;
  emptyTable: string;
  loadError: string;
  columns: {
    bomNumber: string;
    product: string;
    version: string;
    ingredients: string;
    lastUpdated: string;
    status: string;
  };
  statusActive: string;
  statusDraft: string;
  statusArchived: string;
  settingsTitle: string;
  settingsSubtitle: string;
  autoCalcLabel: string;
  autoCalcHint: string;
  allergenLabel: string;
  allergenHint: string;
  retentionLabel: string;
  retentionHint: string;
  retentionAll: string;
  save: string;
  saving: string;
  saved: string;
  saveErrorForbidden: string;
  saveErrorGeneric: string;
};

export type BomsScreenProps = {
  /** Real BOM rows resolved from public.bom_headers via withOrgContext. */
  rows: BomRow[];
  /** Active / Draft / Archived counts derived from the same rows. */
  kpis: BomKpis;
  /** Persisted BOM-settings (defaults when no row exists yet). */
  settings: BomSettings;
  /** Whether the org context could not be resolved / the loaders failed. */
  loadError?: boolean;
  /** Whether the current user may persist BOM settings. */
  canEdit?: boolean;
  /** Server action persisting the BOM settings. */
  onSaveSettings?: (settings: BomSettings) => Promise<UpdateBomSettingsResult>;
  labels: BomsScreenLabels;
};

function StatusBadge({
  status,
  labels,
}: {
  status: BomRow['status'];
  labels: BomsScreenLabels;
}) {
  if (status === 'active') {
    return <span className="badge badge-green">● {labels.statusActive}</span>;
  }
  if (status === 'archived') {
    return <span className="badge badge-gray">✕ {labels.statusArchived}</span>;
  }
  return <span className="badge badge-amber">⟳ {labels.statusDraft}</span>;
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

export default function BomsScreen({
  rows,
  kpis,
  settings,
  loadError = false,
  canEdit = false,
  onSaveSettings,
  labels,
}: BomsScreenProps) {
  const [draft, setDraft] = useState<BomSettings>(settings);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [isPending, startTransition] = useTransition();

  const retentionOptions = [
    { value: '5', label: '5' },
    { value: '10', label: '10' },
    { value: '25', label: '25' },
    { value: 'all', label: labels.retentionAll },
  ];

  function handleSave() {
    if (!onSaveSettings) return;
    setSaveState({ kind: 'idle' });
    startTransition(async () => {
      const result = await onSaveSettings(draft);
      if (result.ok) {
        setDraft(result.settings);
        setSaveState({ kind: 'saved' });
      } else {
        setSaveState({
          kind: 'error',
          message: result.error === 'forbidden' ? labels.saveErrorForbidden : labels.saveErrorGeneric,
        });
      }
    });
  }

  return (
    <main
      aria-label={labels.title}
      className="mx-auto grid max-w-5xl gap-3 p-6"
      data-prototype-source={PROTOTYPE_SOURCE}
    >
      <PageHead title={labels.title} sub={labels.subtitle} />

      {loadError ? (
        <div className="alert alert-red" role="alert" data-testid="boms-load-error">
          {labels.loadError}
        </div>
      ) : null}

      <div
        className="kpi-row"
        data-testid="boms-kpis"
        style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
      >
        <div className="kpi" data-testid="boms-kpi-active">
          <div className="kpi-label">{labels.kpiActive}</div>
          <div className="kpi-value">{kpis.active}</div>
        </div>
        <div className="kpi amber" data-testid="boms-kpi-draft">
          <div className="kpi-label">{labels.kpiDraft}</div>
          <div className="kpi-value">{kpis.draft}</div>
        </div>
        <div className="kpi" data-testid="boms-kpi-archived" style={{ borderBottomColor: 'var(--gray-400, #94a3b8)' }}>
          <div className="kpi-label">{labels.kpiArchived}</div>
          <div className="kpi-value">{kpis.archived}</div>
        </div>
      </div>

      <Section title={labels.tableTitle}>
        {rows.length === 0 ? (
          <div className="muted" data-testid="boms-table-empty" role="status">
            {labels.emptyTable}
          </div>
        ) : (
          <table data-testid="boms-table">
            <thead>
              <tr>
                <th>{labels.columns.bomNumber}</th>
                <th>{labels.columns.product}</th>
                <th>{labels.columns.version}</th>
                <th>{labels.columns.ingredients}</th>
                <th>{labels.columns.lastUpdated}</th>
                <th>{labels.columns.status}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="mono">{row.bomNumber}</td>
                  <td style={{ fontWeight: 500 }}>{row.product}</td>
                  <td className="mono">{row.version}</td>
                  <td className="mono num">{row.ingredientsCount}</td>
                  <td className="mono">{row.lastUpdated}</td>
                  <td>
                    <StatusBadge status={row.status} labels={labels} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title={labels.settingsTitle}
        sub={labels.settingsSubtitle}
        foot={
          <>
            {saveState.kind === 'saved' ? (
              <span className="muted" role="status" data-testid="boms-settings-saved">
                {labels.saved}
              </span>
            ) : null}
            {saveState.kind === 'error' ? (
              <span className="badge badge-red" role="alert" data-testid="boms-settings-error">
                {saveState.message}
              </span>
            ) : null}
            <button
              className="btn btn-primary"
              type="button"
              disabled={!canEdit || isPending}
              onClick={handleSave}
              data-testid="boms-settings-save"
            >
              {isPending ? labels.saving : labels.save}
            </button>
          </>
        }
      >
        <SRow label={labels.autoCalcLabel} hint={labels.autoCalcHint}>
          <Toggle
            aria-label={labels.autoCalcLabel}
            checked={draft.autoCalculateNutrition}
            disabled={!canEdit}
            onChange={(value) => setDraft((current) => ({ ...current, autoCalculateNutrition: value }))}
          />
        </SRow>

        <SRow label={labels.allergenLabel} hint={labels.allergenHint}>
          <Toggle
            aria-label={labels.allergenLabel}
            checked={draft.requireAllergenReview}
            disabled={!canEdit}
            onChange={(value) => setDraft((current) => ({ ...current, requireAllergenReview: value }))}
          />
        </SRow>

        <SelectField
          id="boms-retention"
          label={labels.retentionLabel}
          hint={labels.retentionHint}
          options={retentionOptions}
          value={draft.retention}
          disabled={!canEdit}
          onChange={(value) =>
            setDraft((current) => ({
              ...current,
              retention: (value as BomSettings['retention']) ?? current.retention,
            }))
          }
        />
      </Section>
    </main>
  );
}

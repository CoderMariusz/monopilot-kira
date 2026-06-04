'use client';

/**
 * T-113 — NutritionPanel (per-100g traffic-light bars) · NPD-g formulation editor.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/recipe.jsx:26-65 (NutritionPanel)
 *   prototype-index entry: nutrition_panel
 *   (_meta/prototype-labels/prototype-index-npd.json#nutrition_panel)
 *
 * Translation notes (prototype → production):
 *   - NutritionPanel meatPct/saltPct mock derivation       → REMOVED. The panel is a PURE Client island
 *                                                             that CONSUMES the per-100g compute output
 *                                                             (T-065 `recomputeCalc` / T-074 nutrition
 *                                                             tables, read server-side via withOrgContext
 *                                                             by the wiring task T-117). It NEVER computes
 *                                                             nutrition itself (risk red-line).
 *   - `n` object with {val, unit, max, label, target}       → `nutrition` prop = per-100g rows keyed by the
 *                                                             domain NUTRIENT_CODES (energy_kj…salt_g), each
 *                                                             a NUMERIC string + unit; `targets` prop carries
 *                                                             the per-nutrient amber/red thresholds (reference
 *                                                             data, NUMERIC strings). MONEY/VALUES are exact:
 *                                                             every comparison runs through `Dec`, never a
 *                                                             binary float.
 *   - barColor() var(--red)/var(--amber)/var(--green)        → traffic-light status (green/amber/red) computed
 *                                                             via Dec.cmp; rendered as role="progressbar" with
 *                                                             aria-valuenow/min/max AND a text status label
 *                                                             (Within target / Over target / Over max) +
 *                                                             a glyph — a11y: color is NEVER the only signal.
 *   - .card / .card-head / .card-title / .nut-bar           → @monopilot/ui Card / CardHeader / CardContent /
 *                                                             CardFooter + Tailwind progress fill.
 *   - Export-label btn-ghost (recipe.jsx:51)                 → @monopilot/ui Button stub (no-op for this slice;
 *                                                             PDF export owned elsewhere — onExportLabel prop).
 *   - bottom targets note (recipe.jsx:60-62)                 → CardFooter targets note via i18n
 *                                                             (npd.nutritionPanel.targetsNote) with the actual
 *                                                             target strings interpolated.
 *   - card-title "· live" muted note                         → i18n liveNote.
 *
 * Required UI states: loading / empty / error / permission-denied (via `state`). The panel re-renders
 * reactively whenever the parent passes a new `nutrition` prop (parent owns the compute lifecycle).
 *
 * i18n: this is a Client Component, so all visible strings arrive pre-resolved in the `labels` prop
 * (npd.nutritionPanel namespace, resolved by the RSC parent / wiring task). No inline literals.
 */

import React from 'react';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardFooter, CardHeader } from '@monopilot/ui/Card';
import { Dec } from '@monopilot/domain';

// Canonical nutrient render order (matches prototype recipe.jsx:32-38 and the domain NUTRIENT_CODES).
export const NUTRIENT_ROW_ORDER = [
  'energy_kj',
  'fat_g',
  'saturates_g',
  'carbs_g',
  'sugars_g',
  'protein_g',
  'salt_g',
] as const;

export type NutrientRowCode = (typeof NUTRIENT_ROW_ORDER)[number];

/** Traffic-light status. green = within target, amber = over target ≤ max, red = over max. */
export type TrafficStatus = 'green' | 'amber' | 'red';

export type NutritionPanelState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

/**
 * A single per-100g nutrient value as produced by the formulation compute
 * (T-065 `recomputeCalc.nutrition` / T-074 nutrition tables). Values are NUMERIC
 * strings — never JS numbers (binary-float drift is forbidden for declared values).
 */
export interface NutritionRow {
  nutrientCode: NutrientRowCode | string;
  /** Per-100g value, NUMERIC string (e.g. "20.40"). */
  per100g: string;
  /** Display unit (e.g. "g", "kJ", "kcal"). */
  unit: string;
}

/** Per-nutrient amber/red thresholds (reference data). NUMERIC strings, no floats. */
export type NutritionTargets = Partial<
  Record<NutrientRowCode | string, { target: string; max: string }>
>;

export interface NutritionPanelLabels {
  title: string;
  liveNote: string;
  exportLabel: string;
  /** ICU-ish template: "Targets: Protein ≥ {protein} · Salt ≤ {salt} · Fat ≤ {fat} per 100g". */
  targetsNote: string;
  withinTarget: string;
  overTarget: string;
  overMax: string;
  energyLabel: string;
  fatLabel: string;
  saturatesLabel: string;
  carbsLabel: string;
  sugarsLabel: string;
  proteinLabel: string;
  saltLabel: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
}

export interface NutritionPanelProps {
  /** Per-100g compute output (parent owns the lifecycle; this component never recomputes). */
  nutrition: NutritionRow[];
  /** Per-nutrient traffic-light thresholds (reference data). */
  targets: NutritionTargets;
  /** Pre-resolved i18n strings (npd.nutritionPanel). */
  labels: NutritionPanelLabels;
  /** UI state gate (server-resolved for permission_denied). */
  state?: NutritionPanelState;
  /** "Export label" stub handler — no-op for this slice (PDF export owned elsewhere). */
  onExportLabel?: () => void;
}

function nutrientLabel(code: string, labels: NutritionPanelLabels): string {
  switch (code) {
    case 'energy_kj':
      return labels.energyLabel;
    case 'fat_g':
      return labels.fatLabel;
    case 'saturates_g':
      return labels.saturatesLabel;
    case 'carbs_g':
      return labels.carbsLabel;
    case 'sugars_g':
      return labels.sugarsLabel;
    case 'protein_g':
      return labels.proteinLabel;
    case 'salt_g':
      return labels.saltLabel;
    default:
      return code;
  }
}

/**
 * Exact traffic-light classification (prototype barColor): val > max → red,
 * val > target → amber, else green. All comparisons via Dec (no binary float).
 */
function trafficStatus(value: string, target: string | undefined, max: string | undefined): TrafficStatus {
  const v = Dec.from(value);
  if (max !== undefined && v.cmp(Dec.from(max)) > 0) return 'red';
  if (target !== undefined && v.cmp(Dec.from(target)) > 0) return 'amber';
  return 'green';
}

/**
 * Bar fill width as an integer percentage string, exact via Dec:
 * min(100, value/max*100). Returns "0" when max is missing/zero.
 */
function fillPercent(value: string, max: string | undefined): string {
  if (max === undefined) return '0';
  const maxDec = Dec.from(max);
  if (maxDec.isZero()) return '0';
  const pct = Dec.from(value).div(maxDec).mul(Dec.from('100'));
  // Clamp to 100 (exact compare, no float).
  const hundred = Dec.from('100');
  const clamped = pct.cmp(hundred) > 0 ? hundred : pct;
  return clamped.toFixed(0);
}

/**
 * aria-valuenow / aria-valuemax as numbers — REQUIRED by React's AriaAttributes
 * typing and by AT range semantics. This is a presentational a11y hint ONLY: it
 * is never displayed, never fed back into cost/nutrition math, and never replaces
 * the exact NUMERIC string used for the visible value. Returns undefined for a
 * non-numeric value so the attribute is simply omitted.
 */
function ariaNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

const STATUS_GLYPH: Record<TrafficStatus, string> = {
  green: '✓',
  amber: '!',
  red: '⚠',
};

const STATUS_FILL: Record<TrafficStatus, string> = {
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
};

function statusLabel(status: TrafficStatus, labels: NutritionPanelLabels): string {
  switch (status) {
    case 'green':
      return labels.withinTarget;
    case 'amber':
      return labels.overTarget;
    case 'red':
      return labels.overMax;
  }
}

function NutrientBar({
  row,
  threshold,
  labels,
}: {
  row: NutritionRow;
  threshold: { target: string; max: string } | undefined;
  labels: NutritionPanelLabels;
}) {
  const status = trafficStatus(row.per100g, threshold?.target, threshold?.max);
  const width = fillPercent(row.per100g, threshold?.max);
  const label = nutrientLabel(row.nutrientCode, labels);
  const sLabel = statusLabel(status, labels);

  return (
    <div
      data-testid="nutrition-row"
      data-nutrient={row.nutrientCode}
      className="grid grid-cols-[5.5rem_1fr_5rem] items-center gap-3 py-1"
    >
      <span className="text-sm text-slate-700">{label}</span>
      <div
        role="progressbar"
        aria-label={`${label}: ${sLabel}`}
        aria-valuenow={ariaNumber(row.per100g)}
        aria-valuemin={0}
        aria-valuemax={ariaNumber(threshold?.max)}
        data-status={status}
        className="h-2 w-full overflow-hidden rounded bg-slate-100"
      >
        <div
          className={`h-full ${STATUS_FILL[status]}`}
          style={{ width: `${width}%`, transition: 'width 0.2s' }}
        />
      </div>
      <span className="flex items-center justify-end gap-1 text-right font-mono text-xs tabular-nums text-slate-700">
        {/* glyph + text status pair so color is never the only signal (a11y) */}
        <span aria-hidden="true" data-testid="nutrition-status-glyph">
          {STATUS_GLYPH[status]}
        </span>
        <span data-testid="nutrition-value">
          {row.per100g} {row.unit}
        </span>
        {/* visually-hidden status text keeps SR users informed without color */}
        <span className="sr-only">{sLabel}</span>
      </span>
    </div>
  );
}

function StateNotice({
  state,
  labels,
}: {
  state: Exclude<NutritionPanelState, 'ready' | 'empty'>;
  labels: NutritionPanelLabels;
}) {
  if (state === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="nutrition-panel-loading"
        className="p-6 text-sm text-slate-600"
      >
        {labels.loading}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" data-testid="nutrition-panel-error" className="p-6 text-sm text-red-700">
        {labels.error}
      </div>
    );
  }
  // permission_denied
  return (
    <div role="alert" data-testid="nutrition-panel-forbidden" className="p-6 text-sm text-red-700">
      {labels.forbidden}
    </div>
  );
}

export function NutritionPanel({
  nutrition,
  targets,
  labels,
  state = 'ready',
  onExportLabel,
}: NutritionPanelProps) {
  // Stable, prototype-ordered rows. Memoised so re-renders that don't change
  // `nutrition` skip the sort/lookup work, while a NEW `nutrition` prop (parent
  // formulation state change) recomputes the rows reactively in the same cycle.
  const orderedRows = React.useMemo<NutritionRow[]>(() => {
    const byCode = new Map(nutrition.map((r) => [r.nutrientCode, r]));
    return NUTRIENT_ROW_ORDER.map((code) => byCode.get(code)).filter(
      (r): r is NutritionRow => r !== undefined,
    );
  }, [nutrition]);

  const targetsNote = labels.targetsNote
    .replace('{protein}', `${targets.protein_g?.target ?? '—'}g`)
    .replace('{salt}', `${targets.salt_g?.target ?? '—'}g`)
    .replace('{fat}', `${targets.fat_g?.target ?? '—'}g`);

  return (
    <Card data-testid="nutrition-panel" data-prototype-anchor="npd/recipe.jsx:26-65">
      <CardHeader className="flex items-center justify-between gap-2">
        <h3 className="font-semibold" data-slot="card-title">
          {labels.title}{' '}
          <span className="text-[11px] font-normal text-slate-500" data-testid="nutrition-live-note">
            {labels.liveNote}
          </span>
        </h3>
        <Button
          type="button"
          className="text-xs"
          data-testid="nutrition-export-label"
          onClick={onExportLabel}
        >
          {labels.exportLabel}
        </Button>
      </CardHeader>

      {state === 'loading' || state === 'error' || state === 'permission_denied' ? (
        <StateNotice state={state} labels={labels} />
      ) : state === 'empty' || orderedRows.length === 0 ? (
        <CardContent>
          <div data-testid="nutrition-panel-empty" className="p-4 text-center">
            <p className="text-sm font-medium text-slate-700">{labels.empty}</p>
            <p className="text-xs text-slate-500">{labels.emptyBody}</p>
          </div>
        </CardContent>
      ) : (
        <>
          <CardContent>
            {orderedRows.map((row) => (
              <NutrientBar
                key={row.nutrientCode}
                row={row}
                threshold={targets[row.nutrientCode]}
                labels={labels}
              />
            ))}
          </CardContent>
          <CardFooter
            data-testid="nutrition-targets-note"
            className="border-t border-slate-200 pt-2 text-[11px] text-slate-500"
          >
            {targetsNote}
          </CardFooter>
        </>
      )}
    </Card>
  );
}

export default NutritionPanel;

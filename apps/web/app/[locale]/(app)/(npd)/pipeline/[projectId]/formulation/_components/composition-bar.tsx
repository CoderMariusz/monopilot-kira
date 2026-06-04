'use client';

/**
 * T-116 — CompositionBar (horizontal stacked %-by-ingredient bar + legend).
 *
 * Standalone Client Component extracted from the inline composition strip of
 * RecipeScreen. It is intentionally state-free (controlled via `segments`) so
 * T-117 can wire it to the live formulation rows without this component owning
 * any composition state (risk red-line: "Do not own composition state").
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/recipe.jsx:230-250
 *     (composition stacked bar + legend inside RecipeScreen)
 *
 * Parity mapping (prototype → production):
 *   recipe.jsx:232  uppercase "Composition" label            → labels.title (i18n npd.compositionBar.title)
 *   recipe.jsx:233  flex / height 24 / rounded / border       → flex h-6 rounded border
 *   recipe.jsx:234  ingredients.map → per-ingredient <div>    → segments.map → per-segment <div data-testid=composition-segment>
 *   recipe.jsx:235  10-colour palette literal                 → COMPOSITION_COLORS (Tailwind, same 10 hues)
 *   recipe.jsx:236  width = (pct / totalPct) * 100%           → segmentWidth() via Dec (NUMERIC-exact, no float drift)
 *   recipe.jsx:236  title={`${name}: ${pct}%`}                → aria-label (a11y: labelled, NOT colour-alone) + title
 *   recipe.jsx:240  filter(pct > 0.5) legend                  → legend filter via Dec.cmp(0.5) > 0
 *   recipe.jsx:243-246  swatch 8px + "name pct%" chip         → swatch (aria-hidden) + "name pct%" text chip
 *
 * Translation notes / deviations (prototype → production):
 *   - pct stays a decimal STRING (formulation_ingredients NUMERIC, T-065/T-066),
 *     NOT the `number` shown in the task-JSON contract. All width math uses the
 *     exact `Dec` helper (@monopilot/domain) so 0.1 + 0.2 never drifts. This keeps
 *     the component on the same NUMERIC-exact money/percent path as T-066 and the
 *     real Supabase read; rendering a JS float here would re-introduce IEEE-754
 *     drift the rest of the slice is engineered to avoid.
 *   - rmCode is carried alongside name (task instruction: "rm_code + pct") and is
 *     used as the human label fallback when name is empty.
 *   - container is role='img' + aria-label so the strip is announced as a single
 *     labelled graphic; aria-live='polite' announces reactive width/legend updates.
 *   - a11y is verified with RTL role/aria-label assertions (segments labelled, not
 *     colour-alone). jest-axe / axe-core is NOT installed in this workspace and
 *     adding a dependency is out of scope (STRICT SCOPE: never touch package.json);
 *     per T-066 precedent + AC#5 this RTL attribute check is the documented
 *     fallback for the jest-axe assertion. See deviation log in the closeout.
 *
 * No inline user-facing strings — every label is injected via `labels`
 * (i18n namespace npd.compositionBar, keyed in en/pl/ro/uk).
 */

import React from 'react';

import { Dec } from '@monopilot/domain';

/** One ingredient slice of the composition (real shape from formulation_ingredients). */
export type CompositionSegment = {
  /** Stable React key (DB id for persisted rows, generated id for new rows). */
  id: string;
  /** Raw-material code — the persisted key + label fallback. */
  rmCode: string;
  /** Display label (raw-material name); falls back to rmCode when empty. */
  name: string;
  /** Decimal STRING percentage (% w/w) — NUMERIC-exact, never a JS float. */
  pct: string;
  /** Optional explicit segment colour (CSS colour); overrides the palette fallback. */
  categoryColor?: string;
};

export type CompositionBarLabels = {
  /** Uppercase section heading above the bar. */
  title: string;
  /** Accessible name for the whole bar (role='img'). */
  ariaLabel: string;
  /** Shown when there is nothing to render (no rows / all-zero total). */
  empty: string;
  /** Per-segment aria-label template: must contain {name} and {pct}. */
  segmentLabel: string;
};

/**
 * 10-colour palette (recipe.jsx:235). The prototype literal hexes map 1:1:
 *   #D97757, #3b82f6 (blue-500), #10b981 (emerald-500), #f59e0b (amber-500),
 *   #8b5cf6 (violet-500), #ec4899 (pink-500), #14b8a6 (teal-500),
 *   #f97316 (orange-500), #6366f1 (indigo-500), #84cc16 (lime-500).
 * Kept identical to the FormulationEditor strip so the wired bar matches T-066.
 */
const COMPOSITION_COLORS = [
  'bg-[#D97757]',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-indigo-500',
  'bg-lime-500',
] as const;

/** Legend threshold (prototype rule recipe.jsx:240): only pct > 0.5 appears. */
const LEGEND_MIN = Dec.from('0.5');

function isDecimalString(value: string): boolean {
  return /^\d+(?:\.\d+)?$/.test(value.trim());
}

/** Exact percent sum (3 dp) of every segment that holds a valid decimal string. */
function totalPct(segments: CompositionSegment[]): Dec {
  let acc = Dec.zero();
  for (const s of segments) if (isDecimalString(s.pct)) acc = acc.add(Dec.from(s.pct));
  return acc;
}

/** Segment width as a percent of the (non-zero) total — NUMERIC-exact, 3 dp. */
function segmentWidth(pct: string, total: Dec): string {
  if (!isDecimalString(pct) || total.isZero()) return '0.000';
  return Dec.from(pct).div(total).mul(Dec.from('100')).toFixed(3);
}

export function CompositionBar({
  segments,
  labels,
}: {
  segments: CompositionSegment[];
  labels: CompositionBarLabels;
}) {
  // Only rows with a valid decimal pct contribute to the strip; preserve order
  // so palette index === visual position (parity with recipe.jsx:234-236).
  const renderable = segments.filter((s) => isDecimalString(s.pct));
  const total = totalPct(renderable);

  if (renderable.length === 0 || total.isZero()) {
    return (
      <div className="px-3.5 pb-4 pt-3" data-testid="composition-bar">
        <div className="mb-1.5 text-[10px] uppercase tracking-wide text-slate-500">{labels.title}</div>
        <p className="text-xs text-slate-500" data-testid="composition-empty">
          {labels.empty}
        </p>
      </div>
    );
  }

  const colorFor = (index: number): string => COMPOSITION_COLORS[index % COMPOSITION_COLORS.length];

  const labelFor = (segment: CompositionSegment): string =>
    labels.segmentLabel
      .replace('{name}', segment.name || segment.rmCode)
      .replace('{pct}', segment.pct);

  return (
    <div className="px-3.5 pb-4 pt-3" data-testid="composition-bar">
      <div className="mb-1.5 text-[10px] uppercase tracking-wide text-slate-500">{labels.title}</div>

      {/* Stacked bar — role=img so the strip is announced as one labelled graphic;
          aria-live=polite announces reactive width/legend changes (AC#2/#3). */}
      <div
        className="flex h-6 overflow-hidden rounded border"
        role="img"
        aria-label={labels.ariaLabel}
        aria-live="polite"
        data-testid="composition-bar-track"
      >
        {renderable.map((segment, i) => {
          const className = segment.categoryColor ? '' : colorFor(i);
          const label = labelFor(segment);
          return (
            <div
              key={segment.id}
              className={className}
              style={{
                width: `${segmentWidth(segment.pct, total)}%`,
                ...(segment.categoryColor ? { backgroundColor: segment.categoryColor } : {}),
              }}
              role="img"
              aria-label={label}
              title={label}
              data-testid="composition-segment"
            />
          );
        })}
      </div>

      {/* Legend — only segments with pct > 0.5 (recipe.jsx:240). Swatch colour
          matches the bar segment colour by the same render index. */}
      <ul
        className="mt-2 flex list-none flex-wrap gap-2 p-0 text-xs"
        data-testid="composition-legend"
      >
        {renderable.map((segment, i) => {
          if (!(Dec.from(segment.pct).cmp(LEGEND_MIN) > 0)) return null;
          const swatchColor = segment.categoryColor ? '' : colorFor(i);
          return (
            <li
              key={segment.id}
              className="inline-flex items-center gap-1"
              data-testid="composition-legend-chip"
            >
              <span
                aria-hidden="true"
                className={['inline-block h-2 w-2 rounded-sm', swatchColor].filter(Boolean).join(' ')}
                style={segment.categoryColor ? { backgroundColor: segment.categoryColor } : undefined}
              />
              <span>
                {(segment.name || segment.rmCode)} {segment.pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

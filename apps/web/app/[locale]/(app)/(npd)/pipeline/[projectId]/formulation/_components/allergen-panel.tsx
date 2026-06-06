'use client';

/**
 * T-115 — AllergenPanel (EU14 presence badges), formulation-editor slice.
 *
 * STANDALONE component. Wiring into the editor page is T-117 — this file does NOT
 * import or modify formulation-editor.tsx and owns no allergen state (controlled
 * via props).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/recipe.jsx:103-122 (AllergenPanel)
 *
 * Prototype → production mapping (translation, never paste):
 *   - `<div className="card">` + `.card-title` "Allergens"
 *        → @monopilot/ui Card + CardHeader/CardTitle (+ subtitle).
 *   - `window.NPD_ALLERGENS.map(a => <span className="allergen-chip {on}">)`
 *        → a presence grid of @monopilot/ui Badge chips, one per EU14 allergen.
 *        The prototype's binary `.on` highlight becomes a THREE-state token:
 *          present → variant="danger"  (red)
 *          trace   → variant="warning" (amber)
 *          absent  → variant="muted"   (outline/muted)
 *        Status is conveyed by TEXT + GLYPH + aria-label, never color alone (a11y).
 *   - `<div className="alert alert-amber"> N allergen(s) detected: … Must be
 *        declared on label.` → a role="alert" region listing the detected
 *        allergens + the declared-on-label message (rendered only when ≥1 is
 *        present/trace).
 *   - `<div className="muted"> No allergens detected …` → the empty hint,
 *        rendered when every EU14 allergen is absent.
 *
 * Real-data shape (T-117 will supply this from the cascade/compute path):
 *   The formulation compute engine (`@monopilot/domain` recomputeCalc →
 *   RecomputeResult.allergens) emits a union `string[]` of detected allergen
 *   codes; the cascade read-model (T-038 fa_allergen_cascade) additionally
 *   distinguishes confirmed vs may_contain/trace. T-117 maps that to the
 *   `AllergenStatus[]` prop contract below (confirmed → 'present',
 *   may_contain/trace → 'trace', otherwise 'absent'). This panel renders the
 *   resolved status and recomputes reactively whenever the prop changes.
 *
 * DEVIATIONS (see closeout deviation log):
 *   D1 — EU14 vs prototype's 11 chips: the prototype `window.NPD_ALLERGENS` lists
 *        only 11 entries and data.jsx flags the allergen set as a PRD partial that
 *        "belongs to 09-QUALITY / 03-TECHNICAL". The task contract + EU FIC
 *        1169/2011 mandate all 14 mandatory allergens, so the panel always renders
 *        EU14 (superset of the prototype). Codes match the T-040 EU14 seed.
 *   D2 — shadcn Alert: @monopilot/ui has no Alert primitive; the repo convention
 *        (T-040 AllergenCascadeWidget) uses a role="alert" region. This panel
 *        follows that convention; the AC ("verified by RTL role='alert'") is met.
 *   D3 — three-state status: the prototype highlight is binary (on/off). The task
 *        contract introduces absent/trace/present, so the panel renders three
 *        tokens (trace = amber).
 */

import React from 'react';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';

/** EU FIC 1169/2011 — 14 mandatory allergens. Codes match the Reference EU14 seed
 * (identical order/codes to T-040 AllergenCascadeWidget for cross-component parity). */
export const EU14_ALLERGEN_CODES = [
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soybeans',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const;

export type EU14Code = (typeof EU14_ALLERGEN_CODES)[number];

export type AllergenPresence = 'absent' | 'trace' | 'present';

/** Controlled prop shape — resolved server-side from the cascade/compute path. */
export type AllergenStatus = {
  code: EU14Code | string;
  /** Locale-resolved display name (server-supplied). */
  name: string;
  status: AllergenPresence;
};

/** i18n message values (resolved server-side by the T-117 wiring via getTranslations
 * on namespace `npd.allergenPanel`, then passed down). Labels-as-props mirrors the
 * established T-040 widget pattern so the component stays a pure, testable island. */
export type AllergenPanelLabels = {
  title: string;
  subtitle: string;
  present: string;
  trace: string;
  absent: string;
  detectedHeading: string;
  mustDeclare: string;
  noneDetected: string;
  /** aria connector, e.g. "{name}: {status}". Rendered as `${name}: ${status}`. */
  statusLabel: string;
};

const VARIANT_BY_STATUS: Record<AllergenPresence, BadgeVariant> = {
  present: 'danger',
  trace: 'warning',
  absent: 'muted',
};

/** Design-system tone class per status (the @monopilot/ui Badge BEM variants are
 *  unstyled; the single-dash `.badge-*` tones in globals.css carry the colour). */
const TONE_CLASS_BY_STATUS: Record<AllergenPresence, string> = {
  present: 'badge-red',
  trace: 'badge-amber',
  absent: 'badge-gray',
};

/** Filled circle for present/trace, hollow for absent — a secondary (non-color) signal. */
const GLYPH_BY_STATUS: Record<AllergenPresence, string> = {
  present: '●',
  trace: '◐',
  absent: '○',
};

function statusText(status: AllergenPresence, labels: AllergenPanelLabels): string {
  return status === 'present' ? labels.present : status === 'trace' ? labels.trace : labels.absent;
}

export function AllergenPanel({
  allergens,
  labels,
}: {
  allergens: AllergenStatus[];
  labels: AllergenPanelLabels;
}) {
  // Detected = present OR trace (both must be declared on label).
  const detected = React.useMemo(
    () => allergens.filter((a) => a.status === 'present' || a.status === 'trace'),
    [allergens],
  );

  return (
    <Card data-testid="allergen-panel" aria-labelledby="allergen-panel-title">
      <CardHeader>
        <CardTitle id="allergen-panel-title">{labels.title}</CardTitle>
        <p className="text-xs muted">{labels.subtitle}</p>
      </CardHeader>
      <CardContent>
        <ul
          data-testid="allergen-panel-grid"
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
        >
          {allergens.map((a) => {
            const sText = statusText(a.status, labels);
            const accessibleName = labels.statusLabel
              .replace('{name}', a.name)
              .replace('{status}', sText);
            return (
              <li
                key={a.code}
                data-testid={`allergen-cell-${a.code}`}
                data-status={a.status}
              >
                <Badge
                  variant={VARIANT_BY_STATUS[a.status]}
                  className={`${TONE_CLASS_BY_STATUS[a.status]} flex w-full items-center justify-between gap-1`}
                  aria-label={accessibleName}
                >
                  <span className="flex items-center gap-1">
                    <span role="img" aria-hidden="true">
                      {GLYPH_BY_STATUS[a.status]}
                    </span>
                    <span>{a.name}</span>
                  </span>
                  <span className="text-[10px] font-medium uppercase tracking-wide">{sText}</span>
                </Badge>
              </li>
            );
          })}
        </ul>

        {detected.length > 0 ? (
          <div
            role="alert"
            data-testid="allergen-panel-alert"
            className="alert alert-amber mt-3"
          >
            <strong>{labels.detectedHeading.replace('{count}', String(detected.length))}</strong>{' '}
            {detected.map((d) => d.name).join(', ')}. {labels.mustDeclare}
          </div>
        ) : (
          <p
            data-testid="allergen-panel-empty"
            className="mt-3 text-xs muted"
          >
            {labels.noneDetected}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default AllergenPanel;

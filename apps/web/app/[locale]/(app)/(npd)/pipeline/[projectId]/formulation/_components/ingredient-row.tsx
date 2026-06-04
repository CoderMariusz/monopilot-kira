'use client';

/**
 * T-066 — IngredientRow (RecipeScreen prototype).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/recipe.jsx:124-139 (IngredientRow)
 *
 * Translation notes (prototype → production):
 *   - bare <input value={ing.name}> + code subtitle  → @monopilot/ui Input + mono code line
 *   - bare <input type="number" value={ing.pct}>      → @monopilot/ui Input (raw <select> is a red-line; numbers stay text)
 *   - bare <input type="number" value={ing.costPerKg}>→ @monopilot/ui Input
 *   - (pct/100 × costPerKg).toFixed(3) € contribution → Dec (NUMERIC-exact, never a binary float)
 *   - amber allergen badge / "—"                      → @monopilot/ui Badge + i18n noAllergen text
 *   - "✕" delete affordance                           → @monopilot/ui Button with aria-label
 *
 * Money/percent values are decimal STRINGS end-to-end. Contribution is computed
 * with the exact `Dec` helper from @monopilot/domain — there is no `Number()` on
 * the money path.
 */

import React from 'react';

import { Dec } from '@monopilot/domain';
import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { TableCell, TableRow } from '@monopilot/ui/Table';

export type IngredientField = 'rmCode' | 'name' | 'pct' | 'costPerKgEur';

export type EditableIngredient = {
  /** Stable client key (DB id for persisted rows, generated id for new rows). */
  id: string;
  rmCode: string;
  /** Display label (raw-material name); not persisted by saveDraft (rm_code is the key). */
  name: string;
  /** Decimal STRING percentage (% w/w). */
  pct: string;
  /** Decimal STRING cost €/kg. */
  costPerKgEur: string;
  /** Inherited allergen label or null. */
  allergen: string | null;
  sequence: number;
};

export type IngredientRowLabels = {
  colIngredient: string;
  colPct: string;
  colCostPerKg: string;
  deleteRow: string;
  noAllergen: string;
  pctRangeError: string;
  rmCodeRequired: string;
};

/**
 * NUMERIC-exact ingredient contribution = (pct / 100) × costPerKg, 3 dp.
 * Returns an empty string for inputs that aren't valid decimals (so a row being
 * typed into never throws / never shows NaN).
 */
export function computeContribution(pct: string, costPerKgEur: string): string {
  if (!isDecimalString(pct) || !isDecimalString(costPerKgEur)) return '';
  const fraction = Dec.from(pct).div(Dec.from('100'));
  return fraction.mul(Dec.from(costPerKgEur)).toFixed(3);
}

export function isDecimalString(value: string): boolean {
  return /^\d+(?:\.\d+)?$/.test(value.trim());
}

export type RowError = { pct?: string; rmCode?: string };

export function IngredientRow({
  ingredient,
  index,
  labels,
  disabled,
  error,
  onChange,
  onCommit,
  onDelete,
}: {
  ingredient: EditableIngredient;
  index: number;
  labels: IngredientRowLabels;
  disabled: boolean;
  error: RowError | undefined;
  onChange: (index: number, field: IngredientField, value: string) => void;
  onCommit: (index: number) => void;
  onDelete: (index: number) => void;
}) {
  const contribution = computeContribution(ingredient.pct, ingredient.costPerKgEur);
  const pctErrorId = `ing-${ingredient.id}-pct-error`;
  const rmErrorId = `ing-${ingredient.id}-rm-error`;

  return (
    <TableRow data-testid="ingredient-row" data-sequence={ingredient.sequence}>
      <TableCell>
        <Input
          aria-label={labels.colIngredient}
          value={ingredient.rmCode}
          disabled={disabled}
          aria-invalid={error?.rmCode ? true : undefined}
          aria-describedby={error?.rmCode ? rmErrorId : undefined}
          onChange={(e) => onChange(index, 'rmCode', e.target.value)}
          onBlur={() => onCommit(index)}
        />
        {ingredient.name ? (
          <div className="mt-0.5 font-mono text-[10px] text-slate-500">{ingredient.name}</div>
        ) : null}
        {error?.rmCode ? (
          <p id={rmErrorId} role="alert" className="mt-0.5 text-xs text-red-600">
            {error.rmCode}
          </p>
        ) : null}
      </TableCell>

      <TableCell className="text-right">
        <Input
          aria-label={labels.colPct}
          inputMode="decimal"
          value={ingredient.pct}
          disabled={disabled}
          aria-invalid={error?.pct ? true : undefined}
          aria-describedby={error?.pct ? pctErrorId : undefined}
          className="text-right"
          onChange={(e) => onChange(index, 'pct', e.target.value)}
          onBlur={() => onCommit(index)}
        />
        {error?.pct ? (
          <p id={pctErrorId} role="alert" className="mt-0.5 text-xs text-red-600">
            {error.pct}
          </p>
        ) : null}
      </TableCell>

      <TableCell className="text-right">
        <Input
          aria-label={labels.colCostPerKg}
          inputMode="decimal"
          value={ingredient.costPerKgEur}
          disabled={disabled}
          className="text-right"
          onChange={(e) => onChange(index, 'costPerKgEur', e.target.value)}
          onBlur={() => onCommit(index)}
        />
      </TableCell>

      <TableCell className="text-right font-mono" data-testid="ingredient-contribution">
        {contribution ? `${contribution} €` : '—'}
      </TableCell>

      <TableCell>
        {ingredient.allergen ? (
          <Badge variant="warning">{ingredient.allergen}</Badge>
        ) : (
          <span className="text-xs text-slate-400">{labels.noAllergen}</span>
        )}
      </TableCell>

      <TableCell className="text-right">
        <Button
          type="button"
          aria-label={labels.deleteRow}
          disabled={disabled}
          className="btn--ghost"
          onClick={() => onDelete(index)}
        >
          <span aria-hidden="true">✕</span>
        </Button>
      </TableCell>
    </TableRow>
  );
}

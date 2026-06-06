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

import {
  ItemPicker,
  type ItemPickerLabels,
  type ItemSearchFn,
} from '../../../../_components/item-picker';
import type { ItemPickerOption } from '../../../../../../../(npd)/fa/actions/search-items';

export type IngredientField = 'rmCode' | 'name' | 'pct' | 'costPerKgEur' | 'itemId';

export type EditableIngredient = {
  /** Stable client key (DB id for persisted rows, generated id for new rows). */
  id: string;
  rmCode: string;
  /** Lane-B: FK to the real items master row this ingredient represents (or null). */
  itemId: string | null;
  /** Display label (raw-material name); populated from the picked item. */
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
  /** "Choose item" affordance text shown when no item is picked yet. */
  chooseItem: string;
  /** Item-picker (combobox over the real items master) labels. */
  picker: ItemPickerLabels;
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
  searchItemsAction,
  onChange,
  onSelectItem,
  onCommit,
  onDelete,
}: {
  ingredient: EditableIngredient;
  index: number;
  labels: IngredientRowLabels;
  disabled: boolean;
  error: RowError | undefined;
  /** Org-scoped item-search Server Action for the ingredient picker. */
  searchItemsAction: ItemSearchFn;
  onChange: (index: number, field: IngredientField, value: string) => void;
  /** Lane-B: a real item was chosen — wire item_id + populate code/name/cost/allergen. */
  onSelectItem: (index: number, item: ItemPickerOption) => void;
  onCommit: (index: number) => void;
  onDelete: (index: number) => void;
}) {
  const contribution = computeContribution(ingredient.pct, ingredient.costPerKgEur);
  const pctErrorId = `ing-${ingredient.id}-pct-error`;
  const rmErrorId = `ing-${ingredient.id}-rm-error`;

  return (
    <TableRow data-testid="ingredient-row" data-sequence={ingredient.sequence}>
      <TableCell>
        {/* Lane-B: a "component"/ingredient must be a REAL item from the items
            master — the free-text rmCode <Input> is replaced by the ItemPicker
            combobox. The chosen item's code/name/cost/allergen populate the row. */}
        <div className="flex items-center gap-2" data-field="rmCode">
          {ingredient.rmCode ? (
            <span
              className="mono text-xs font-semibold"
              style={{ color: 'var(--blue)' }}
              aria-label={labels.colIngredient}
              data-item-id={ingredient.itemId ?? undefined}
            >
              {ingredient.rmCode}
            </span>
          ) : (
            <span className="text-xs muted">{labels.chooseItem}</span>
          )}
          <ItemPicker
            labels={labels.picker}
            searchItemsAction={searchItemsAction}
            itemTypes={['rm', 'intermediate', 'co_product']}
            disabled={disabled}
            triggerClassName="btn-ghost btn-sm"
            onSelect={(item) => onSelectItem(index, item)}
          />
        </div>
        {ingredient.name ? (
          <div className="mt-0.5 text-[10px] muted">{ingredient.name}</div>
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
          className="form-input mono text-right"
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
          className="form-input mono text-right"
          onChange={(e) => onChange(index, 'costPerKgEur', e.target.value)}
          onBlur={() => onCommit(index)}
        />
      </TableCell>

      <TableCell className="text-right mono" data-testid="ingredient-contribution">
        {contribution ? `${contribution} €` : '—'}
      </TableCell>

      <TableCell>
        {ingredient.allergen ? (
          <Badge variant="warning" className="badge-amber">{ingredient.allergen}</Badge>
        ) : (
          <span className="text-xs muted">{labels.noAllergen}</span>
        )}
      </TableCell>

      <TableCell className="text-right">
        <Button
          type="button"
          aria-label={labels.deleteRow}
          disabled={disabled}
          className="btn-ghost btn-icon"
          onClick={() => onDelete(index)}
        >
          <span aria-hidden="true">✕</span>
        </Button>
      </TableCell>
    </TableRow>
  );
}

'use client';

/**
 * T-066 — IngredientRow (RecipeScreen prototype).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/recipe.jsx:124-139 (IngredientRow)
 *
 * Translation notes (prototype → production):
 *   - bare <input value={ing.name}> + code subtitle  → @monopilot/ui Input + mono code line
 *   - bare <input type="number" value={ing.qty}>      → @monopilot/ui Input (Costing v2: qty/pack in kg)
 *   - bare <input type="number" value={ing.costPerKg}>→ @monopilot/ui Input
 *   - (qtyKg × costPerKg).toFixed(3) € contribution   → Dec (NUMERIC-exact, never a binary float)
 *   - amber allergen badge / "—"                      → @monopilot/ui Badge + i18n noAllergen text
 *   - "✕" delete affordance                           → @monopilot/ui Button with aria-label
 *
 * Money/percent values are decimal STRINGS end-to-end. Contribution is computed
 * with the exact `Dec` helper from @monopilot/domain — there is no `Number()` on
 * the money path.
 */

import React from 'react';
import Link from 'next/link';

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
import { symbolFor } from './cost-panel';

export type IngredientField = 'rmCode' | 'name' | 'qtyKg' | 'pct' | 'costPerKgEur' | 'itemId' | 'substituteItemId';

export type EditableIngredient = {
  /** Stable client key (DB id for persisted rows, generated id for new rows). */
  id: string;
  rmCode: string;
  /** Lane-B: FK to the real items master row this ingredient represents (or null). */
  itemId: string | null;
  /** W3-L10: reusable WIP definition referenced by this recipe line. */
  wipDefinitionId?: string | null;
  /** W3-L10: display name of the referenced WIP definition. */
  wipDefinitionName?: string | null;
  /** F6-D17: optional substitute item allowed for this line at consumption only. */
  substituteItemId: string | null;
  substituteItemCode?: string | null;
  substituteItemName?: string | null;
  /** Display label (raw-material name); populated from the picked item. */
  name: string;
  /** Costing v2: decimal STRING amount used in ONE pack, in kg. */
  qtyKg: string;
  /** Legacy decimal STRING percentage (% w/w); retained for composition/back-compat. */
  pct: string;
  /** Decimal STRING cost €/kg. */
  costPerKgEur: string;
  /**
   * F-A08 (W9-L4): FULL inherited allergen set (derived server-side from the
   * SSOT item_allergen_profiles) — one chip per allergen, never truncated to
   * a single entry. Empty array → "—" (truly absent).
   */
  allergens: string[];
  sequence: number;
};

export type IngredientRowLabels = {
  colIngredient: string;
  /** Costing v2: "Qty / pack (kg)" column header. */
  colQtyPerPack: string;
  colCostPerKg: string;
  deleteRow: string;
  noAllergen: string;
  qtyRangeError: string;
  rmCodeRequired: string;
  /** "Choose item" affordance text shown when no item is picked yet. */
  chooseItem: string;
  substitute: string;
  chooseSubstitute: string;
  clearSubstitute: string;
  /**
   * Phase-3 NPD↔Technical shortcut — "↗" link title to open the picked item in
   * Technical. Optional (English fallback in the row) for back-compat with callers
   * that have not threaded the new label yet.
   */
  openInTechnical?: string;
  /** Item-picker (combobox over the real items master) labels. */
  picker: ItemPickerLabels;
  /** W3-L10 — badge label for reusable WIP recipe lines. */
  wipBadge?: string;
};

/**
 * Costing v2 — NUMERIC-exact ingredient contribution = qtyKg × costPerKg, 3 dp
 * (the raw-material cost this ingredient adds to ONE pack). Returns an empty
 * string for inputs that aren't valid decimals (so a row being typed into never
 * throws / never shows NaN).
 */
export function computeContribution(qtyKg: string, costPerKgEur: string): string {
  if (!isDecimalString(qtyKg) || !isDecimalString(costPerKgEur)) return '';
  return Dec.from(qtyKg).mul(Dec.from(costPerKgEur)).toFixed(3);
}

export function isDecimalString(value: string): boolean {
  return /^\d+(?:\.\d+)?$/.test(value.trim());
}

export type RowError = { qtyKg?: string; rmCode?: string };

export function IngredientRow({
  ingredient,
  index,
  labels,
  disabled,
  error,
  cascadeControl,
  searchItemsAction,
  currency = 'GBP',
  onChange,
  onSelectItem,
  onSelectSubstitute,
  onClearSubstitute,
  onCommit,
  onDelete,
}: {
  ingredient: EditableIngredient;
  index: number;
  labels: IngredientRowLabels;
  disabled: boolean;
  error: RowError | undefined;
  cascadeControl?: React.ReactNode;
  /** Org-scoped item-search Server Action for the ingredient picker. */
  searchItemsAction: ItemSearchFn;
  /**
   * F-D08b — ISO-4217 currency code for the contribution cell (same map as
   * CostPanel: PLN → zł). Optional with the GBP default (org single currency,
   * no FX); the formulation editor threads its own `currency` prop through.
   */
  currency?: string;
  onChange: (index: number, field: IngredientField, value: string) => void;
  /** Lane-B: a real item was chosen — wire item_id + populate code/name/cost/allergen. */
  onSelectItem: (index: number, item: ItemPickerOption) => void;
  /** F6-D17: a real item was chosen as the line substitute. */
  onSelectSubstitute: (index: number, item: ItemPickerOption) => void;
  onClearSubstitute: (index: number) => void;
  onCommit: (index: number) => void;
  onDelete: (index: number) => void;
}) {
  const contribution = computeContribution(ingredient.qtyKg, ingredient.costPerKgEur);
  const qtyErrorId = `ing-${ingredient.id}-qty-error`;
  const rmErrorId = `ing-${ingredient.id}-rm-error`;
  const isWipRow = Boolean(ingredient.wipDefinitionId);

  return (
    <TableRow data-testid="ingredient-row" data-sequence={ingredient.sequence}>
      <TableCell>
        {/* Lane-B: a "component"/ingredient must be a REAL item from the items
            master — the free-text rmCode <Input> is replaced by the ItemPicker
            combobox. The chosen item's code/name/cost/allergen populate the row. */}
        <div className="flex items-center gap-2" data-field="rmCode">
          {cascadeControl}
          {isWipRow ? (
            <Badge variant="info" className="badge-blue" data-testid="ingredient-wip-badge">
              {labels.wipBadge ?? 'WIP'}
            </Badge>
          ) : null}
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
          {/* Phase-3 NPD↔Technical shortcut — subtle "↗" read-level link to the
              picked item's Technical item card. Rendered ONLY when a real item is
              wired (rmCode present); omitted otherwise (no layout shift). Muted,
              no underline; prefetch={false} per the project perf rule. Existing
              row controls are unchanged. */}
          {ingredient.rmCode ? (
            <Link
              href={`/technical/items/${encodeURIComponent(ingredient.rmCode)}`}
              prefetch={false}
              data-testid="ingredient-open-in-technical"
              title={labels.openInTechnical ?? 'Open item in Technical'}
              aria-label={labels.openInTechnical ?? 'Open item in Technical'}
              className="text-xs muted no-underline hover:underline"
              style={{ color: 'var(--text-muted)' }}
            >
              <span aria-hidden="true">↗</span>
            </Link>
          ) : null}
          {!isWipRow ? (
            <ItemPicker
              labels={labels.picker}
              searchItemsAction={searchItemsAction}
              itemTypes={['rm', 'ingredient', 'intermediate', 'co_product', 'byproduct']}
              disabled={disabled}
              triggerClassName="btn-ghost btn-sm"
              onSelect={(item) => onSelectItem(index, item)}
              /* F6 — on a fresh org the raw-material library is empty, so the
                 picker's "no matching items" state is a Cancel-only dead-end.
                 Point the user to Technical → Items (create wizard auto-opens via
                 ?modal=create) so they can self-serve the recipe stage. */
              createItemHref="/technical/items?modal=create"
            />
          ) : null}
        </div>
        {ingredient.name ? (
          <div className="mt-0.5 text-[10px] muted">
            {ingredient.name}
            {ingredient.wipDefinitionName ? (
              <span className="ml-1 text-slate-400">({ingredient.wipDefinitionName})</span>
            ) : null}
          </div>
        ) : null}
        {!isWipRow ? (
        <div className="mt-2 rounded-md border border-slate-200 bg-slate-50/60 p-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-normal text-slate-500">
            {labels.substitute}
          </div>
          {ingredient.substituteItemId ? (
            <div className="mb-1 flex items-center gap-2">
              <span className="mono text-xs font-semibold" data-substitute-item-id={ingredient.substituteItemId}>
                {ingredient.substituteItemCode ?? ingredient.substituteItemId}
              </span>
              {ingredient.substituteItemName ? (
                <span className="text-[10px] muted">{ingredient.substituteItemName}</span>
              ) : null}
              <Button
                type="button"
                className="btn-ghost btn-sm"
                disabled={disabled}
                onClick={() => onClearSubstitute(index)}
              >
                {labels.clearSubstitute}
              </Button>
            </div>
          ) : (
            <div className="mb-1 text-[10px] muted">{labels.chooseSubstitute}</div>
          )}
          <ItemPicker
            labels={{ ...labels.picker, trigger: labels.chooseSubstitute }}
            searchItemsAction={searchItemsAction}
            itemTypes={['rm', 'ingredient', 'intermediate', 'co_product', 'byproduct']}
            disabled={disabled || !ingredient.itemId}
            triggerClassName="btn-ghost btn-sm"
            onSelect={(item) => onSelectSubstitute(index, item)}
            createItemHref="/technical/items?modal=create"
          />
        </div>
        ) : null}
        {error?.rmCode ? (
          <p id={rmErrorId} role="alert" className="mt-0.5 text-xs text-red-600">
            {error.rmCode}
          </p>
        ) : null}
      </TableCell>

      <TableCell className="text-right">
        <Input
          aria-label={labels.colQtyPerPack}
          inputMode="decimal"
          value={ingredient.qtyKg}
          disabled={disabled}
          aria-invalid={error?.qtyKg ? true : undefined}
          aria-describedby={error?.qtyKg ? qtyErrorId : undefined}
          className="form-input mono text-right"
          onChange={(e) => onChange(index, 'qtyKg', e.target.value)}
          onBlur={() => onCommit(index)}
        />
        {error?.qtyKg ? (
          <p id={qtyErrorId} role="alert" className="mt-0.5 text-xs text-red-600">
            {error.qtyKg}
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
        {contribution ? `${contribution} ${symbolFor(currency)}` : '—'}
      </TableCell>

      <TableCell>
        {ingredient.allergens.length > 0 ? (
          <div className="flex flex-wrap gap-1" data-testid="ingredient-allergens">
            {ingredient.allergens.map((allergen) => (
              <Badge key={allergen} variant="warning" className="badge-amber">
                {allergen}
              </Badge>
            ))}
          </div>
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

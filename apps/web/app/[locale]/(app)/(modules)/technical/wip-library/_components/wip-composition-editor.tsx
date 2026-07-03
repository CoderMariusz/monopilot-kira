'use client';

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

import { searchItems } from '../../../../../../(npd)/fa/actions/search-items';
import { ItemPicker } from '../../../../(npd)/_components/item-picker';
import type { WipIngredientRow } from '../_lib/wip-definition-contract';
import type { WipLibraryLabels } from './wip-labels';

const INGREDIENT_UOMS = ['kg', 'g', 'each', 'pack', 'l', 'ml'] as const;

export function WipCompositionEditor({
  ingredients,
  labels,
  canEdit,
  locale,
  onChange,
}: {
  ingredients: WipIngredientRow[];
  labels: WipLibraryLabels;
  canEdit: boolean;
  locale: string;
  onChange: (next: WipIngredientRow[]) => void;
}) {
  const readOnly = !canEdit;

  function addIngredient(item: { id: string; itemCode: string; name: string; uomBase: string }) {
    if (ingredients.some((row) => row.itemId === item.id)) return;
    onChange([
      ...ingredients,
      {
        itemId: item.id,
        itemCode: item.itemCode,
        itemName: item.name,
        qtyPerUnit: '0',
        uom: item.uomBase || 'kg',
        sequence: ingredients.length,
      },
    ]);
  }

  function updateRow(index: number, patch: Partial<WipIngredientRow>) {
    onChange(ingredients.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    onChange(
      ingredients
        .filter((_, i) => i !== index)
        .map((row, sequence) => ({ ...row, sequence })),
    );
  }

  return (
    <section className="card" style={{ padding: 0, overflowX: 'auto' }} data-testid="wip-composition-editor">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{labels.compositionTitle}</h2>
        <p className="text-xs text-slate-500">{labels.compositionSubtitle}</p>
      </div>

      {ingredients.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-500">{labels.compositionEmpty}</div>
      ) : (
        <table aria-label={labels.compositionTitle}>
          <thead>
            <tr>
              <th scope="col">{labels.compositionColItem}</th>
              <th scope="col">{labels.compositionColQty}</th>
              <th scope="col">{labels.compositionColUom}</th>
              <th scope="col">{labels.compositionColActions}</th>
            </tr>
          </thead>
          <tbody>
            {ingredients.map((row, index) => (
              <tr key={`${row.itemId}-${index}`} data-testid="wip-composition-row">
                <td>
                  <span className="font-mono text-xs font-semibold text-blue-700">{row.itemCode ?? row.itemId}</span>
                  {row.itemName ? <span className="ml-2 text-sm text-slate-800">{row.itemName}</span> : null}
                </td>
                <td>
                  <Input
                    type="number"
                    min={0}
                    step="0.000001"
                    value={row.qtyPerUnit}
                    disabled={readOnly}
                    aria-label={labels.compositionColQty}
                    onChange={(e) => updateRow(index, { qtyPerUnit: e.target.value })}
                    className="w-28 rounded-md border border-slate-200 px-2 py-1 text-sm"
                  />
                </td>
                <td>
                  <Select
                    value={row.uom}
                    disabled={readOnly}
                    onValueChange={(value) => updateRow(index, { uom: value })}
                    options={INGREDIENT_UOMS.map((u) => ({ value: u, label: u }))}
                  >
                    <SelectTrigger aria-label={labels.compositionColUom} className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INGREDIENT_UOMS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td>
                  {readOnly ? null : (
                    <Button
                      type="button"
                      className="btn--ghost btn--sm"
                      aria-label={labels.compositionRemove}
                      onClick={() => removeRow(index)}
                    >
                      {labels.compositionRemove}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {readOnly ? null : (
        <div className="border-t border-slate-200 px-4 py-3">
          <ItemPicker
            labels={{
              trigger: labels.compositionAdd,
              searchLabel: labels.pickerSearchLabel,
              searchPlaceholder: labels.pickerSearchPlaceholder,
              loading: labels.pickerLoading,
              empty: labels.pickerEmpty,
              cancel: labels.pickerCancel,
              error: labels.pickerError,
              createItemCta: labels.pickerCreateItemCta,
            }}
            searchItemsAction={searchItems}
            itemTypes={['rm', 'ingredient', 'intermediate', 'packaging']}
            createItemHref={`/${locale}/technical/items?modal=create`}
            onSelect={(item) => addIngredient(item)}
          />
        </div>
      )}
    </section>
  );
}

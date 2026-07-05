'use client';

import React from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@monopilot/ui/Select';

import type { FaProductionLineOption } from '../_components/w5-production-constants';
import type { SetProductionLineResult } from '../_actions/set-production-line-types';

const UNSET = '__none__';

export type ProductionLinePickerLabels = {
  productionLine: string;
  productionLinePlaceholder: string;
  productionLineEmpty: string;
  productionLineSaveError: string;
};

export function ProductionLinePicker({
  projectId,
  value,
  options,
  labels,
  canWrite,
  disabled,
  onSetProductionLine,
  onSaved,
}: {
  projectId: string;
  value: string | null;
  options: FaProductionLineOption[];
  labels: ProductionLinePickerLabels;
  canWrite: boolean;
  disabled?: boolean;
  onSetProductionLine: (input: {
    projectId: string;
    productionLineId: string | null;
  }) => Promise<SetProductionLineResult>;
  onSaved?: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const selectValue = value ?? UNSET;

  async function handleChange(next: string) {
    if (!canWrite || disabled || busy) return;
    const productionLineId = next === UNSET ? null : next;
    if (productionLineId === value) return;

    setBusy(true);
    setError(null);
    try {
      const result = await onSetProductionLine({ projectId, productionLineId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved?.();
    } catch {
      setError(labels.productionLineSaveError);
    } finally {
      setBusy(false);
    }
  }

  const readOnly = !canWrite || disabled || busy;

  return (
    <div
      className="rounded-md border border-slate-200 bg-slate-50/80 p-3"
      data-testid="fa-production-line-picker"
    >
      <label
        id="fa-production-line-label"
        className="mb-1 block text-xs font-medium text-slate-700"
      >
        {labels.productionLine}
      </label>
      {options.length === 0 ? (
        <p className="text-xs text-slate-500" data-testid="fa-production-line-empty">
          {labels.productionLineEmpty}
        </p>
      ) : (
        <Select
          value={selectValue}
          disabled={readOnly}
          onValueChange={handleChange}
          options={[
            { value: UNSET, label: labels.productionLinePlaceholder },
            ...options.map((line) => ({
              value: line.id,
              label: `${line.code} — ${line.name}`,
            })),
          ]}
          aria-labelledby="fa-production-line-label"
        >
          <SelectTrigger aria-label={labels.productionLine} data-testid="fa-production-line-select">
            <SelectValue placeholder={labels.productionLinePlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET}>{labels.productionLinePlaceholder}</SelectItem>
            {options.map((line) => (
              <SelectItem key={line.id} value={line.id}>
                {line.code} — {line.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-red-700" data-testid="fa-production-line-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

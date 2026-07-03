'use client';

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

import { upsertNpdCostParams } from './_actions/upsert-npd-cost-params';

export type NpdCostParamsLabels = {
  title: string;
  subtitle: string;
  sectionTitle: string;
  helper: string;
  fieldOverhead: string;
  fieldLogistics: string;
  save: string;
  saving: string;
  saved: string;
  saveError: string;
  readOnlyNotice: string;
  forbidden: string;
  loadError: string;
};

export type NpdCostParamsScreenProps = {
  labels: NpdCostParamsLabels;
  overheadPerKg: string;
  logisticsPerBox: string;
  canWrite: boolean;
  onSave?: typeof upsertNpdCostParams;
};

export function NpdCostParamsScreen({
  labels,
  overheadPerKg,
  logisticsPerBox,
  canWrite,
  onSave = upsertNpdCostParams,
}: NpdCostParamsScreenProps) {
  const [overhead, setOverhead] = React.useState(overheadPerKg);
  const [logistics, setLogistics] = React.useState(logisticsPerBox);
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  React.useEffect(() => {
    setOverhead(overheadPerKg);
    setLogistics(logisticsPerBox);
  }, [overheadPerKg, logisticsPerBox]);

  async function handleSave() {
    if (!canWrite || saveState === 'saving') return;
    setSaveState('saving');
    try {
      const result = await onSave({ overheadPerKg: overhead, logisticsPerBox: logistics });
      setSaveState(result.ok ? 'saved' : 'error');
    } catch {
      setSaveState('error');
    }
  }

  return (
    <section data-testid="npd-cost-params-screen" className="grid gap-4">
      {!canWrite ? (
        <div className="alert alert-amber" role="status" data-testid="npd-cost-params-read-only">
          {labels.readOnlyNotice}
        </div>
      ) : null}

      <div className="card" data-testid="npd-cost-params-form">
        <div className="card__header">
          <h2 className="text-base font-semibold">{labels.sectionTitle}</h2>
          <p className="muted text-sm">{labels.helper}</p>
        </div>
        <div className="card__content grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1">
            <label htmlFor="npd-cost-overhead" className="text-xs font-medium">
              {labels.fieldOverhead}
            </label>
            <Input
              id="npd-cost-overhead"
              data-testid="npd-cost-overhead"
              type="number"
              min={0}
              step="0.01"
              value={overhead}
              disabled={!canWrite}
              onChange={(e) => {
                setSaveState('idle');
                setOverhead(e.target.value);
              }}
            />
          </div>
          <div className="grid gap-1">
            <label htmlFor="npd-cost-logistics" className="text-xs font-medium">
              {labels.fieldLogistics}
            </label>
            <Input
              id="npd-cost-logistics"
              data-testid="npd-cost-logistics"
              type="number"
              min={0}
              step="0.01"
              value={logistics}
              disabled={!canWrite}
              onChange={(e) => {
                setSaveState('idle');
                setLogistics(e.target.value);
              }}
            />
          </div>
        </div>
        {canWrite ? (
          <div className="card__footer flex items-center gap-3">
            <Button
              type="button"
              className="btn-primary"
              data-testid="npd-cost-save"
              disabled={saveState === 'saving'}
              onClick={handleSave}
            >
              {saveState === 'saving' ? labels.saving : labels.save}
            </Button>
            {saveState === 'saved' ? (
              <span role="status" className="text-sm text-emerald-700" data-testid="npd-cost-saved">
                {labels.saved}
              </span>
            ) : null}
            {saveState === 'error' ? (
              <span role="alert" className="text-sm text-red-700" data-testid="npd-cost-save-error">
                {labels.saveError}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default NpdCostParamsScreen;

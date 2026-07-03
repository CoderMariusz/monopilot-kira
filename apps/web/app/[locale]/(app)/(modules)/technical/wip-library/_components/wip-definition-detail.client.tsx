'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';

import { archiveWipDefinition, saveWipDefinition } from '../_actions/wip-definition-actions';
import type {
  OperationOption,
  WipDefinitionDetail,
  WipIngredientRow,
  WipProcessRow,
  WipWhereUsedRow,
} from '../_lib/wip-definition-contract';
import { toSaveBaseUom, toSaveIngredients, toSaveProcesses } from '../_lib/map-wip-api';
import { WipCompositionEditor } from './wip-composition-editor';
import {
  definitionToHeaderDraft,
  WipArchiveConfirmDialog,
  WipDefinitionHeader,
  type WipHeaderDraft,
} from './wip-definition-header';
import { WipProcessChainEditor } from './wip-process-chain-editor';
import type { WipLibraryLabels } from './wip-labels';
import { WipWhereUsedPanel } from './wip-where-used-panel';

type ArchiveResult = { ok: true } | { ok: false; error: string; code?: string; status?: number };

export function WipDefinitionDetailClient({
  definition,
  ingredients: initialIngredients,
  processes: initialProcesses,
  whereUsed,
  operations,
  canEdit,
  canDeactivate,
  labels,
  locale,
}: {
  definition: WipDefinitionDetail;
  ingredients: WipIngredientRow[];
  processes: WipProcessRow[];
  whereUsed: WipWhereUsedRow[];
  operations: OperationOption[];
  canEdit: boolean;
  canDeactivate: boolean;
  labels: WipLibraryLabels;
  locale: string;
}) {
  const router = useRouter();
  const [header, setHeader] = React.useState<WipHeaderDraft>(() => definitionToHeaderDraft(definition));
  const [ingredients, setIngredients] = React.useState(initialIngredients);
  const [processes, setProcesses] = React.useState(initialProcesses);
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [archiveBusy, setArchiveBusy] = React.useState(false);
  const [archiveError, setArchiveError] = React.useState<string | null>(null);

  const writable = canEdit && header.status !== 'archived';

  async function handleSave() {
    setSaveState('saving');
    setSaveError(null);
    try {
      const result = await saveWipDefinition({
        id: definition.id,
        name: header.name.trim(),
        description: header.description.trim() || null,
        baseUom: toSaveBaseUom(header.baseUom),
        yieldPct: Number(header.yieldPct) || 100,
        reusable: header.reusable,
        ingredients: toSaveIngredients(ingredients),
        processes: toSaveProcesses(processes),
      });
      if (!result.ok) {
        setSaveState('error');
        setSaveError(labels.detailSaveError);
        return;
      }
      setHeader((prev) => ({ ...prev, version: result.version }));
      setSaveState('saved');
      router.refresh();
    } catch {
      setSaveState('error');
      setSaveError(labels.detailSaveError);
    }
  }

  async function handleArchive() {
    setArchiveBusy(true);
    setArchiveError(null);
    try {
      const result = (await archiveWipDefinition({ id: definition.id })) as ArchiveResult;
      if (!result.ok) {
        setArchiveError(result.error);
        return;
      }
      setArchiveOpen(false);
      router.push(`/${locale}/technical/wip-library`);
      router.refresh();
    } catch {
      setArchiveError(labels.detailSaveError);
    } finally {
      setArchiveBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-screen="wip-definition-detail">
      <WipDefinitionHeader draft={header} labels={labels} canEdit={writable} onChange={setHeader} />

      <WipCompositionEditor
        ingredients={ingredients}
        labels={labels}
        canEdit={writable}
        locale={locale}
        onChange={setIngredients}
      />

      <WipProcessChainEditor
        processes={processes}
        operations={operations}
        labels={labels}
        canEdit={writable}
        onChange={setProcesses}
      />

      <WipWhereUsedPanel rows={whereUsed} labels={labels} locale={locale} />

      <div className="flex flex-wrap items-center gap-3">
        {writable ? (
          <Button
            type="button"
            className="btn btn-primary"
            data-testid="wip-save-definition"
            disabled={saveState === 'saving' || !header.name.trim()}
            onClick={() => void handleSave()}
          >
            {saveState === 'saving' ? labels.detailSaving : labels.detailSave}
          </Button>
        ) : null}
        {saveState === 'saved' ? <span className="text-sm text-green-700">{labels.detailSaved}</span> : null}
        {saveError ? (
          <div role="alert" className="text-sm text-red-600">
            {saveError}
          </div>
        ) : null}
        {canDeactivate && header.status !== 'archived' ? (
          <Button type="button" className="btn--ghost" data-testid="wip-archive-definition" onClick={() => setArchiveOpen(true)}>
            {labels.detailArchive}
          </Button>
        ) : null}
      </div>

      {!canEdit && !canDeactivate ? (
        <div role="alert" className="alert alert-amber">
          {labels.detailViewerOnly}
        </div>
      ) : null}

      <WipArchiveConfirmDialog
        open={archiveOpen}
        labels={labels}
        busy={archiveBusy}
        error={archiveError}
        onCancel={() => {
          setArchiveOpen(false);
          setArchiveError(null);
        }}
        onConfirm={() => void handleArchive()}
      />
    </div>
  );
}

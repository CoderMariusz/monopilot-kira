/**
 * Process allergen additions screen — /technical/allergens/process-additions.
 *
 * Parity anchor: prototypes/design/Monopilot Design System/technical/
 *   other-screens.jsx:1432-1484 (ProcessAllergenScreen). Manufacturing-operation →
 *   allergen mapping config; the cascade rule merges these into FG allergen
 *   profiles (PRD §10.4). See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Wired to the EXISTING manufacturing-op service (lib/technical/allergens/
 * manufacturing-op.ts) via the load-config Server Actions — withOrgContext + RLS,
 * real Supabase data, no mocks. Five states: loading (Suspense), empty, error,
 * permission-denied, ready (+optimistic add).
 */

import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import {
  loadAllergensConfig,
  saveMfgOpAddition,
  removeMfgOpAddition,
} from '../../allergens-config/_actions/load-config';
import { ProcessAdditions, type ProcessAdditionsLabels } from './_components/process-additions.client';

export const dynamic = 'force-dynamic';

function ProcessSkeleton() {
  return (
    <div data-testid="process-additions-loading" aria-busy="true" className="card">
      <div className="h-48 animate-pulse rounded bg-slate-100" />
    </div>
  );
}

async function ProcessContent() {
  const t = await getTranslations('technical.allergens.process');
  const data = await loadAllergensConfig();

  const labels: ProcessAdditionsLabels = {
    infoNote: t('infoNote'),
    addCta: t('addCta'),
    colOperation: t('col.operation'),
    colAllergen: t('col.allergen'),
    colIntensity: t('col.intensity'),
    colReason: t('col.reason'),
    colActions: t('col.actions'),
    intensityContains: t('intensity.contains'),
    delete: t('delete'),
    empty: t('empty'),
    emptyBody: t('emptyBody'),
    error: t('error'),
    denied: t('denied'),
    readOnlyTag: t('readOnlyTag'),
    warnNote: t('warnNote'),
    modalTitle: t('modal.title'),
    modalSubtitle: t('modal.subtitle'),
    modalOperation: t('modal.operation'),
    modalAllergen: t('modal.allergen'),
    modalReason: t('modal.reason'),
    modalReasonPlaceholder: t('modal.reasonPlaceholder'),
    modalReasonHelp: t('modal.reasonHelp'),
    modalSave: t('modal.save'),
    modalCancel: t('modal.cancel'),
    saveError: t('saveError'),
    selectPlaceholder: t('selectPlaceholder'),
  };

  const state =
    data.state === 'error'
      ? 'error'
      : data.mfgOpAdditions.length === 0 && data.operations.length === 0
        ? 'empty'
        : 'ready';

  return (
    <ProcessAdditions
      state={state}
      additions={data.mfgOpAdditions}
      operations={data.operations}
      allergens={data.allergens}
      canEdit={data.canEdit}
      labels={labels}
      saveAction={saveMfgOpAddition}
      removeAction={removeMfgOpAddition}
    />
  );
}

export default async function ProcessAdditionsPage() {
  const t = await getTranslations('technical.allergens.process');

  return (
    <main data-screen="technical-allergen-process" className="flex w-full flex-col gap-4 px-6 py-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.technical') },
          { label: t('breadcrumb.compliance') },
          { label: t('breadcrumb.process') },
        ]}
      />
      <Suspense fallback={<ProcessSkeleton />}>
        <ProcessContent />
      </Suspense>
    </main>
  );
}

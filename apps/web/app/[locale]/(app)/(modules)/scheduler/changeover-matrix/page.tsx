/**
 * Wave E8 — SCREEN /scheduler/changeover-matrix — from→to changeover editor.
 *
 * Prototype parity anchor:
 *   prototypes/design/Monopilot Design System/planning-ext/matrix-screens.jsx:1-247
 *     (N×N FROM\TO grid + single-cell editor). Honest deltas in the editor
 *     component header: no per-line override tab / version history / review
 *     queue — the backend contract is one row per (from, to) with
 *     changeover_minutes + requires_cleaning.
 *
 * Reads the matrix via the backend-owned listChangeoverMatrix and injects
 * upsertChangeoverMatrixEntry as the write seam. RBAC enforced server-side in
 * both actions. UI states: loading (Suspense skeleton), permission-denied
 * (denied panel), error (read failed → banner), empty (no profiles → editor's
 * empty state), optimistic (saving handled in the island).
 */
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listChangeoverMatrix, upsertChangeoverMatrixEntry } from '../_actions/scheduler-actions';
import {
  ChangeoverMatrixEditor,
  type ChangeoverMatrixLabels,
} from '../_components/changeover-matrix-editor';
import { matrixProfileKeys } from '../_components/scheduler-view-model';

export const dynamic = 'force-dynamic';

type MatrixPageProps = {
  params: Promise<{ locale: string }>;
};

function MatrixSkeleton() {
  return (
    <div data-testid="matrix-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function MatrixContent() {
  const t = await getTranslations('Scheduler.matrix');
  const result = await listChangeoverMatrix();

  if (!result.ok && result.error === 'forbidden') {
    return (
      <div
        role="note"
        data-testid="matrix-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {t('denied')}
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div
        role="alert"
        data-testid="matrix-load-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('loadError')}
      </div>
    );
  }

  const labels: ChangeoverMatrixLabels = {
    title: t('title'),
    subtitle: t('subtitle'),
    fromTo: t('fromTo'),
    cellModalTitle: t('cellModalTitle'),
    cost: t('cost'),
    washRequired: t('washRequired'),
    diagonalHint: t('diagonalHint'),
    emptyTitle: t('emptyTitle'),
    emptyHint: t('emptyHint'),
    save: t('save'),
    saving: t('saving'),
    cancel: t('cancel'),
    legend: {
      none: t('legend.none'),
      low: t('legend.low'),
      medium: t('legend.medium'),
      high: t('legend.high'),
      wash: t('legend.wash'),
    },
    errors: {
      invalid_input: t('errors.invalid_input'),
      forbidden: t('errors.forbidden'),
      not_found: t('errors.not_found'),
      persistence_failed: t('errors.persistence_failed'),
    },
  };

  return (
    <ChangeoverMatrixEditor
      labels={labels}
      profileKeys={matrixProfileKeys(result.entries)}
      entries={result.entries}
      upsertAction={upsertChangeoverMatrixEntry}
    />
  );
}

export default async function ChangeoverMatrixPage({ params }: MatrixPageProps) {
  const { locale } = await params;
  const t = await getTranslations('Scheduler.matrix');

  return (
    <main
      data-screen="scheduler-changeover-matrix"
      data-testid="changeover-matrix-page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[
          { label: t('breadcrumbScheduler'), href: `/${locale}/scheduler` },
          { label: t('breadcrumb') },
        ]}
      />
      <Suspense fallback={<MatrixSkeleton />}>
        <MatrixContent />
      </Suspense>
    </main>
  );
}

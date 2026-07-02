/**
 * Contamination risk matrix screen — /technical/allergens/contamination-risk.
 *
 * Parity anchor: prototypes/design/Monopilot Design System/technical/
 *   other-screens.jsx:1485-1574 (ContaminationRiskScreen). Line × allergen
 *   cross-contamination risk grid; standalone register today — integration with the
 *   allergen-changeover gate in 08-PRODUCTION (PRD §10.5) is a roadmap item and is
 *   NOT yet live. See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Wired to the EXISTING contamination service (lib/technical/allergens/
 * contamination.ts, migration 161) via the load-config Server Actions —
 * withOrgContext + RLS, real Supabase data, no mocks. Five states: loading
 * (Suspense), empty, error, permission-denied, ready (+optimistic cell write).
 */

import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import {
  loadAllergensConfig,
  saveRiskCell,
  removeRiskCell,
} from '../../allergens-config/_actions/load-config';
import { ContaminationRisk, type ContaminationLabels } from './_components/contamination-risk.client';

export const dynamic = 'force-dynamic';

function ContaminationSkeleton() {
  return (
    <div data-testid="contamination-loading" aria-busy="true" className="flex flex-col gap-3">
      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded border border-slate-200 bg-slate-100" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function ContaminationContent() {
  const t = await getTranslations('technical.allergens.contamination');
  const data = await loadAllergensConfig();

  const labels: ContaminationLabels = {
    kpiHigh: t('kpi.high'),
    kpiHighSub: t('kpi.highSub'),
    kpiMedium: t('kpi.medium'),
    kpiMediumSub: t('kpi.mediumSub'),
    kpiSegregated: t('kpi.segregated'),
    kpiSegregatedSub: t('kpi.segregatedSub'),
    kpiCoverage: t('kpi.coverage'),
    kpiCoverageSub: t('kpi.coverageSub'),
    colLine: t('colLine'),
    edit: t('edit'),
    done: t('done'),
    riskLevel: {
      high: t('riskLevel.high'),
      medium: t('riskLevel.medium'),
      low: t('riskLevel.low'),
      segregated: t('riskLevel.segregated'),
    },
    riskNone: t('riskNone'),
    legendHigh: t('legend.high'),
    legendMedium: t('legend.medium'),
    legendLow: t('legend.low'),
    legendSegregated: t('legend.segregated'),
    legendTitle: t('legend.title'),
    changeoverNote: t('changeoverNote'),
    empty: t('empty'),
    emptyBody: t('emptyBody'),
    error: t('error'),
    denied: t('denied'),
    readOnlyTag: t('readOnlyTag'),
    saveError: t('saveError'),
    cellAria: t('cellAria'),
  };

  const state =
    data.state === 'error'
      ? 'error'
      : data.lines.length === 0 || data.allergens.length === 0
        ? 'empty'
        : 'ready';

  return (
    <ContaminationRisk
      state={state}
      lines={data.lines}
      allergens={data.allergens}
      risks={data.risks}
      canEdit={data.canEdit}
      labels={labels}
      saveAction={saveRiskCell}
      removeAction={removeRiskCell}
    />
  );
}

export default async function ContaminationRiskPage() {
  const t = await getTranslations('technical.allergens.contamination');

  return (
    <main data-screen="technical-allergen-contamination" className="flex w-full flex-col gap-4 px-6 py-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.technical') },
          { label: t('breadcrumb.compliance') },
          { label: t('breadcrumb.contamination') },
        ]}
      />
      <Suspense fallback={<ContaminationSkeleton />}>
        <ContaminationContent />
      </Suspense>
    </main>
  );
}

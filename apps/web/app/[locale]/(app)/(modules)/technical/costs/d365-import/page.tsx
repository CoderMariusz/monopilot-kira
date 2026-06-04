/**
 * T-089 — TEC-052 Cost Import from D365 (spec-driven server page).
 *
 * Spec-driven Wave0 surface (PRD §0/§5/§17). Parity anchor (layout-primitive):
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:551-648
 *   (cost_import_d365_screen). See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Reads REAL Supabase data org-scoped via withOrgContext + RLS (loadD365CostImport):
 * the D365 enabled-state via the EXISTING gate, the sync_trigger RBAC, and the
 * current-vs-incoming cost diff. The Apply action enqueues the EXISTING D365 pull
 * worker (append-only, R15). No mocks.
 *
 * UI states: loading (Suspense skeleton), empty (D365 on but no incoming diff →
 * empty card), error (failed read → banner), disabled/permission-denied (D365 off
 * → banner keeping the rest of Technical usable; Apply gated by canTrigger),
 * optimistic — the Apply uses a transition (pending state on the button).
 */

import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { loadD365CostImport } from './_actions/load-d365-cost-import';
import { CostImport, type CostImportCopy } from './_components/cost-import.client';

export const dynamic = 'force-dynamic';

function CostImportSkeleton() {
  return (
    <div data-testid="technical-d365-cost-import-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function CostImportContent() {
  const t = await getTranslations('technical.costImport');
  const result = await loadD365CostImport();

  if (!result.ok) {
    return (
      <div
        role="alert"
        data-testid="technical-d365-cost-import-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('error')}
      </div>
    );
  }

  const copy: CostImportCopy = {
    disabledBanner: t('disabledBanner'),
    settingsLink: t('settingsLink'),
    settingsHref: '/settings/integrations/d365',
    sourceOfTruthNote: t('sourceOfTruthNote'),
    kpi: {
      connector: t('kpi.connector'),
      connectorValue: t('kpi.connectorValue'),
      pulled: t('kpi.pulled'),
      changed: t('kpi.changed'),
      over5: t('kpi.over5'),
    },
    signoffLabel: t('signoff.label'),
    signoffHelp: t('signoff.help'),
    signoffPlaceholder: t('signoff.placeholder'),
    apply: t('apply'),
    applying: t('applying'),
    applied: (jobId) => t('applied', { jobId }),
    duplicate: t('duplicate'),
    triggerForbidden: t('triggerForbidden'),
    triggerError: t('triggerError'),
    col: {
      code: t('col.code'),
      name: t('col.name'),
      current: t('col.current'),
      incoming: t('col.incoming'),
      delta: t('col.delta'),
      source: t('col.source'),
    },
    empty: t('empty'),
    noChange: t('noChange'),
  };

  return (
    <CostImport
      d365Enabled={result.d365Enabled}
      canTrigger={result.ok && 'canTrigger' in result ? result.canTrigger : false}
      rows={result.state === 'disabled' ? [] : result.rows}
      counts={result.counts}
      copy={copy}
    />
  );
}

export default async function TechnicalD365CostImportPage() {
  const t = await getTranslations('technical.costImport');

  return (
    <main data-screen="technical-d365-cost-import-page" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.technical') },
          { label: t('breadcrumb.costs') },
          { label: t('breadcrumb.d365Import') },
        ]}
      />
      <Suspense fallback={<CostImportSkeleton />}>
        <CostImportContent />
      </Suspense>
    </main>
  );
}

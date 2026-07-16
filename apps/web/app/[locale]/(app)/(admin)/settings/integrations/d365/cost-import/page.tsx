/**
 * T-089 — TEC-052 Cost Import from D365 (spec-driven server page).
 *
 * RELOCATED 2026-06-05: moved with the D365 group out of Technical into
 * Settings › Integrations › D365 (old path
 * technical/costs/d365-import/page.tsx). Route is now
 * /settings/integrations/d365/cost-import. Server actions, RLS and the
 * real-Supabase reads are unchanged.
 *
 * Spec-driven Wave0 surface (PRD §0/§5/§17). Parity anchor (layout-primitive):
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:551-648
 *   (cost_import_d365_screen). See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Conformance to the LOCKED design system (MON-design-system): breadcrumb +
 * `.page-title` + one-line muted description, canonical `.kpi`/`.card`/`.table`,
 * 5 semantic badge tones, `.alert` banners, `.empty-state`. Reads REAL Supabase
 * data org-scoped via withOrgContext + RLS (loadD365CostImport). The Apply action
 * enqueues the EXISTING D365 pull worker (append-only, R15). No mocks.
 *
 * UI states: loading (Suspense skeleton), empty (D365 on but no incoming diff →
 * empty card), error (failed read → banner), disabled/permission-denied (D365 off
 * → banner keeping the rest of Settings usable; Apply gated by canTrigger),
 * optimistic — the Apply uses a transition (pending state on the button).
 */

import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { loadD365CostImport } from './_actions/load-d365-cost-import';
import { CostImport, type CostImportCopy } from './_components/cost-import.client';

export const dynamic = 'force-dynamic';

function CostImportSkeleton() {
  return (
    <div data-testid="settings-d365-cost-import-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="kpi" style={{ height: 70, opacity: 0.4 }} />
        ))}
      </div>
      <div className="card" style={{ height: 256, opacity: 0.4 }} />
    </div>
  );
}

async function CostImportContent() {
  const t = await getTranslations('technical.costImport');
  const result = await loadD365CostImport();

  if (!result.ok) {
    return (
      <div role="alert" data-testid="settings-d365-cost-import-error" className="alert alert-red">
        <div className="alert-title">{t('error')}</div>
      </div>
    );
  }

  const copy: CostImportCopy = {
    disabledBanner: t('disabledBanner'),
    exportOnlyBanner: t('exportOnlyBanner'),
    mappingLink: t('mappingLink'),
    mappingHref: '/settings/integrations/d365/mapping',
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
    applied: t('applied', { jobId: '{jobId}' }),
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
      exportOnly={result.ok && result.state === 'export_only'}
      canTrigger={result.ok && 'canTrigger' in result ? result.canTrigger : false}
      rows={result.state === 'disabled' || result.state === 'export_only' ? [] : result.rows}
      counts={result.counts}
      copy={copy}
    />
  );
}

export default async function SettingsD365CostImportPage() {
  const t = await getTranslations('technical.costImport');

  return (
    <main
      data-screen="settings-d365-cost-import-page"
      data-route="/settings/integrations/d365/cost-import"
      className="flex w-full flex-col gap-4 px-6 py-6"
    >
      <nav className="breadcrumb" aria-label="Breadcrumb">
        {t('breadcrumb.settings')} / {t('breadcrumb.integrations')} / {t('breadcrumb.d365')} / {t('breadcrumb.d365Import')}
      </nav>
      <header>
        <h1 className="page-title">{t('title')}</h1>
        <p className="helper mt-1 max-w-3xl">{t('subtitle')}</p>
      </header>
      <Suspense fallback={<CostImportSkeleton />}>
        <CostImportContent />
      </Suspense>
    </main>
  );
}

/**
 * W9-M2 — SCREEN /planning/mrp — read-first MRP vertical (was a 404; clickthrough §4).
 *
 * Prototype anchor: NONE EXISTS — prototypes/design/Monopilot Design System/
 * planning/ and planning-ext/ contain no MRP screen (verified: zero `mrp`
 * matches across all jsx files). This screen therefore follows MON-design-system
 * conventions reused from sibling planning screens (PageHeader + kpi tiles +
 * card/table/badge/empty-state markup of dashboard + po-list-view).
 *
 * "Run MRP" invokes the runMrp Server Action (pure read + compute — persists
 * nothing, creates no orders) and renders shortage-sorted netting results.
 * RBAC is enforced inside the action (scheduler.run.read).
 */
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { runMrp } from '../_actions/mrp';
import { MrpView, type MrpLabels } from './_components/mrp-view';

type MrpPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function PlanningMrpPage({ params }: MrpPageProps) {
  const { locale } = await params;
  const t = await getTranslations('Planning');

  const labels: MrpLabels = {
    run: t('mrp.run'),
    running: t('mrp.running'),
    ranAt: t('mrp.ranAt'),
    denied: t('mrp.denied'),
    error: t('mrp.error'),
    emptyInitial: t('mrp.emptyInitial'),
    emptyInitialHint: t('mrp.emptyInitialHint'),
    emptyRows: t('mrp.emptyRows'),
    excludedUoms: t('mrp.excludedUoms'),
    readOnlyNote: t('mrp.readOnlyNote'),
    kpis: {
      itemsShort: t('mrp.kpis.itemsShort'),
      coverage: t('mrp.kpis.coverage'),
      itemsAnalyzed: t('mrp.kpis.itemsAnalyzed'),
      totalDemand: t('mrp.kpis.totalDemand'),
      totalDemandHint: t('mrp.kpis.totalDemandHint'),
    },
    columns: {
      item: t('mrp.columns.item'),
      type: t('mrp.columns.type'),
      onHand: t('mrp.columns.onHand'),
      reserved: t('mrp.columns.reserved'),
      openSupply: t('mrp.columns.openSupply'),
      demand: t('mrp.columns.demand'),
      net: t('mrp.columns.net'),
      action: t('mrp.columns.action'),
    },
    severity: {
      shortage: t('mrp.severity.shortage'),
      at_risk: t('mrp.severity.atRisk'),
      covered: t('mrp.severity.covered'),
    },
    actionTypes: {
      buy: t('mrp.actionTypes.buy'),
      make: t('mrp.actionTypes.make'),
      none: t('mrp.actionTypes.none'),
    },
    itemTypes: {
      rm: t('mrp.itemTypes.rm'),
      ingredient: t('mrp.itemTypes.ingredient'),
      intermediate: t('mrp.itemTypes.intermediate'),
      packaging: t('mrp.itemTypes.packaging'),
    },
  };

  return (
    <main
      data-screen="planning-mrp"
      data-testid="planning-mrp-page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('mrp.title')}
        subtitle={t('mrp.subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.planning'), href: `/${locale}/planning` },
          { label: t('mrp.breadcrumb') },
        ]}
      />
      <MrpView labels={labels} runAction={runMrp} />
    </main>
  );
}

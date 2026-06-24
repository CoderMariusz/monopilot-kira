/**
 * W9-M2 — SCREEN /planning/mrp — read-first MRP vertical (was a 404; clickthrough §4).
 * CL2 slice 2 — persist toggle (mrp_runs/mrp_requirements, mig 178), reorder-
 * threshold severity + due dates, and the "Previous runs" history section.
 *
 * Prototype anchor: NONE EXISTS — prototypes/design/Monopilot Design System/
 * planning/ and planning-ext/ contain no MRP screen (verified: zero `mrp`
 * matches across all jsx files). This screen therefore follows MON-design-system
 * conventions reused from sibling planning screens (PageHeader + kpi tiles +
 * card/table/badge/empty-state markup of dashboard + po-list-view).
 *
 * "Run MRP" invokes the runMrp Server Action; with the persist toggle it also
 * writes the run header + requirement ledger (write-gated on npd.planning.write
 * inside the action). No orders are ever auto-created. Reads gate on
 * scheduler.run.read.
 */
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { getMrpRunRequirements, listMrpRuns, runMrp } from '../_actions/mrp';
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
    persistToggle: t('mrp.persistToggle'),
    persistNote: t('mrp.persistNote'),
    persistedAs: t('mrp.persistedAs'),
    minQty: t('mrp.minQty'),
    dueBy: t('mrp.dueBy'),
    kpis: {
      itemsShort: t('mrp.kpis.itemsShort'),
      coverage: t('mrp.kpis.coverage'),
      itemsAnalyzed: t('mrp.kpis.itemsAnalyzed'),
      totalDemand: t('mrp.kpis.totalDemand'),
      totalDemandHint: t('mrp.kpis.totalDemandHint'),
      belowMin: t('mrp.kpis.belowMin'),
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
      below_min: t('mrp.severity.belowMin'),
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
    status: {
      suggested: t('mrp.status.suggested'),
      planned: t('mrp.status.planned'),
      cancelled: t('mrp.status.cancelled'),
      completed: t('mrp.status.completed'),
      failed: t('mrp.status.failed'),
    },
    previousRuns: {
      title: t('mrp.previousRuns.title'),
      empty: t('mrp.previousRuns.empty'),
      loading: t('mrp.previousRuns.loading'),
      error: t('mrp.previousRuns.error'),
      expand: t('mrp.previousRuns.expand'),
      collapse: t('mrp.previousRuns.collapse'),
      columns: {
        run: t('mrp.previousRuns.columns.run'),
        date: t('mrp.previousRuns.columns.date'),
        items: t('mrp.previousRuns.columns.items'),
        exceptions: t('mrp.previousRuns.columns.exceptions'),
        status: t('mrp.previousRuns.columns.status'),
      },
      requirements: {
        item: t('mrp.previousRuns.requirements.item'),
        gross: t('mrp.previousRuns.requirements.gross'),
        receipts: t('mrp.previousRuns.requirements.receipts'),
        projected: t('mrp.previousRuns.requirements.projected'),
        net: t('mrp.previousRuns.requirements.net'),
        empty: t('mrp.previousRuns.requirements.empty'),
      },
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
      <MrpView
        labels={labels}
        runAction={runMrp}
        listRunsAction={listMrpRuns}
        getRunRequirementsAction={getMrpRunRequirements}
      />
    </main>
  );
}

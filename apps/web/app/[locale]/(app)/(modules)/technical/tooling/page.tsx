/**
 * 03-technical · TEC-087 Tooling / Equipment Setup List (T-053) page.
 *
 * Real Supabase-backed list of the org's tooling / equipment setups — derived
 * from the canonical routings data (migration 163: routings + routing_operations,
 * every op that binds a line/machine + setup time). Org-scoped via
 * withOrgContext + RLS (`app.current_org_id()`); no hardcoded data.
 *
 * Prototype parity:
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:314-352
 *   (`tooling_screen`) — PageHeader + filter pills + list table + Create CTA.
 *   See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * UI states: loading (RSC streaming) / empty / error / permission-denied
 * (Create CTA hidden when the caller lacks technical.bom.create) / populated.
 */

import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardDescription, CardHeader } from '@monopilot/ui/Card';

import { listToolingSetups } from './_actions/list-tooling-setups';
import { ToolingList, type ToolingListLabels } from './_components/tooling-list.client';

export const dynamic = 'force-dynamic';

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function buildLabels(t: Translator): ToolingListLabels {
  return {
    searchPlaceholder: t('list.searchPlaceholder'),
    createCta: t('list.createCta'),
    filterAll: t('list.filter.all'),
    filterMachine: t('list.filter.machine'),
    filterLine: t('list.filter.line'),
    colCode: t('list.col.code'),
    colName: t('list.col.name'),
    colType: t('list.col.type'),
    colResource: t('list.col.resource'),
    colItem: t('list.col.item'),
    colSetup: t('list.col.setup'),
    colCostPerHour: t('list.col.costPerHour'),
    colUpdated: t('list.col.updated'),
    colStatus: t('list.col.status'),
    noMatches: t('list.noMatches'),
    typeMachine: t('list.type.machine'),
    typeLine: t('list.type.line'),
    setupUnit: t('list.setupUnit'),
  };
}

export default async function TechnicalToolingPage() {
  const { setups, canWrite, state } = await listToolingSetups();
  const t = await getTranslations('technical.tooling');
  const labels = buildLabels(t);

  return (
    <main data-screen="technical-tooling" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
      </header>

      {state === 'error' ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
          {t('error')}
        </div>
      ) : state === 'empty' ? (
        <Card className="rounded-xl border bg-white shadow-sm">
          <CardHeader className="space-y-1 px-6 py-6">
            <h2 className="text-lg font-semibold tracking-tight">{t('empty.title')}</h2>
            <CardDescription className="text-sm text-muted-foreground">
              {canWrite ? t('empty.bodyCanWrite') : t('empty.body')}
            </CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      ) : (
        <ToolingList setups={setups} canWrite={canWrite} routingsHref="../routings" labels={labels} />
      )}
    </main>
  );
}

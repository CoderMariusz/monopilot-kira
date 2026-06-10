/**
 * 03-technical · TEC-087 Tooling / Equipment Setup List (T-053) page.
 *
 * Real Supabase-backed list of the org's tooling / equipment setups — derived
 * from the canonical routings data (migration 163: routings + routing_operations,
 * every op that binds a line/machine + setup time). Org-scoped via
 * withOrgContext + RLS (`app.current_org_id()`); no hardcoded data.
 *
 * Prototype parity:
 *   No dedicated ToolingScreen JSX exists in the design SSOT; the nearest design
 *   anchors are the TOOLING data constant (technical/other-screens.jsx:199-207)
 *   and WORK_CENTERS (:160-170) rendered with the standard list-screen pattern.
 *   (A prior comment mis-cited :314-352, which is MaterialsListScreen.)
 *   See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * UI states: loading (RSC streaming) / empty / error / permission-denied
 * (Create CTA hidden when the caller lacks technical.bom.create) / populated.
 */

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

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
    <main data-screen="technical-tooling" className="flex w-full flex-col gap-4 px-6 py-6">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/technical">Technical</Link> / {t('title')}
      </nav>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <p className="helper mt-1 max-w-3xl">{t('subtitle')}</p>
        </div>
      </header>

      {state === 'error' ? (
        <div role="alert" className="alert alert-red">
          <div className="alert-title">{t('error')}</div>
        </div>
      ) : state === 'empty' ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="empty-state">
            <div className="empty-state-icon">🛠️</div>
            <div className="empty-state-title">{t('empty.title')}</div>
            <div className="empty-state-body">{canWrite ? t('empty.bodyCanWrite') : t('empty.body')}</div>
          </div>
        </div>
      ) : (
        <ToolingList setups={setups} canWrite={canWrite} routingsHref="../routings" labels={labels} />
      )}
    </main>
  );
}

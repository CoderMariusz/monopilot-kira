/**
 * Lane A1 — 03-technical Materials list page (NEW route, TEC-003).
 */

import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';

import { listItems } from '../items/_actions/list-items';
import type { ItemType } from '../items/_actions/shared';
import { MaterialsTableClient, type MaterialsTableLabels } from './_components/materials-table.client';

export const dynamic = 'force-dynamic';

const MATERIAL_TYPES: readonly ItemType[] = ['rm', 'ingredient', 'intermediate', 'packaging'];

function parsePage(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export default async function TechnicalMaterialsPage({
  searchParams,
}: {
  searchParams?: Promise<{ type?: string; q?: string; page?: string }>;
}) {
  const locale = await getLocale();
  const sp = await searchParams;
  const page = parsePage(sp?.page);
  const search = sp?.q?.trim() ?? '';
  const initialType = MATERIAL_TYPES.find((tab) => tab === sp?.type);
  const t = await getTranslations('technical.materials');
  const { items, canCreate, state, pagination, typeCounts } = await listItems({
    itemTypes: MATERIAL_TYPES,
    page,
    search: search || undefined,
    itemType: initialType,
  });

  const typeTabs: Array<{ key: 'all' | ItemType; label: string }> = [
    { key: 'all', label: t('tabs.all') },
    { key: 'rm', label: t('tabs.rm') },
    { key: 'ingredient', label: t('tabs.ingredient') },
    { key: 'intermediate', label: t('tabs.intermediate') },
    { key: 'packaging', label: t('tabs.packaging') },
  ];

  const tableLabels: MaterialsTableLabels = {
    tabAll: t('tabs.all'),
    searchPlaceholder: t('searchPlaceholder'),
    searchAria: t('searchAria'),
    colCode: t('cols.code'),
    colName: t('cols.name'),
    colType: t('cols.type'),
    colUom: t('cols.uom'),
    colCost: t('cols.cost'),
    colUpdated: t('cols.updated'),
    colStatus: t('cols.status'),
    noMatchTitle: t('noMatchTitle'),
    noMatchBody: t('noMatchBody'),
    countSummary: t('countSummary'),
    pagination: {
      showing: t('pagination.showing'),
      previous: t('pagination.previous'),
      next: t('pagination.next'),
    },
    typeLabels: {
      rm: t('types.rm'),
      ingredient: t('types.ingredient'),
      intermediate: t('types.intermediate'),
      packaging: t('types.packaging'),
    },
    statusLabels: {
      draft: t('statuses.draft'),
      active: t('statuses.active'),
      deprecated: t('statuses.deprecated'),
      blocked: t('statuses.blocked'),
    },
  };

  return (
    <main data-screen="technical-materials" className="flex w-full flex-col gap-4 px-6 py-6">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href=".">{t('breadcrumbRoot')}</Link> / {t('breadcrumb')}
      </nav>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <p className="helper mt-1 max-w-3xl">{t('description')}</p>
        </div>
        {canCreate ? (
          <Link href={`/${locale}/technical/items`} prefetch={false} className="btn btn-secondary">
            {t('manageInItems')}
          </Link>
        ) : null}
      </header>

      {state === 'error' ? (
        <div role="alert" className="alert alert-red">
          <div className="alert-title">{t('errorTitle')}</div>
          {t('errorBody')}
        </div>
      ) : state === 'empty' ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🧱</div>
            <div className="empty-state-title">{t('emptyTitle')}</div>
            <div className="empty-state-body">{t('emptyBody')}</div>
          </div>
        </div>
      ) : (
        <MaterialsTableClient
          locale={locale}
          items={items}
          pagination={pagination}
          typeCounts={typeCounts}
          filters={{ search, type: initialType ?? '' }}
          typeTabs={typeTabs}
          labels={tableLabels}
        />
      )}
    </main>
  );
}

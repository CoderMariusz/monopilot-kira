/**
 * Lane A1 — 03-technical Materials list page (NEW route, TEC-003).
 *
 * Real Supabase-backed list of public.items filtered to material types
 * (rm + intermediate) — org-scoped via listItems({ itemTypes }) → withOrgContext +
 * RLS (`app.current_org_id()`). No service-role bypass, no hardcoded/mock data.
 * Loading / empty / error / permission-denied / ready states are all rendered.
 * Detail links reuse the existing item-detail route (/technical/items/[item_code]).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/technical/
 * other-screens.jsx:304-352 — `MaterialsListScreen` (TEC-003): breadcrumb
 * (Technical › Materials) + 20/700 page title + one-line muted description, pills
 * filter by type, dense design table (mono codes, type badge, UoM, cost/UoM,
 * updated, 5-tone status badge), EmptyState. The interactive list lives in
 * materials-table.client.tsx; this server page resolves data + labels only.
 */

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { listItems } from '../items/_actions/list-items';
import type { ItemType } from '../items/_actions/shared';
import { MaterialsTableClient, type MaterialsTableLabels } from './_components/materials-table.client';

export const dynamic = 'force-dynamic';

// Material types in our item master (the prototype's "packaging" maps to none —
// the canonical item_type domain is rm / intermediate / fg / co_product / byproduct).
const MATERIAL_TYPES: readonly ItemType[] = ['rm', 'ingredient', 'intermediate'];

export default async function TechnicalMaterialsPage() {
  const t = await getTranslations('technical.materials');
  const { items, canCreate, state } = await listItems({ itemTypes: MATERIAL_TYPES });

  const typeTabs: Array<{ key: 'all' | ItemType; label: string }> = [
    { key: 'all', label: t('tabs.all') },
    { key: 'rm', label: t('tabs.rm') },
    { key: 'ingredient', label: t('tabs.ingredient') },
    { key: 'intermediate', label: t('tabs.intermediate') },
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
    typeLabels: { rm: t('types.rm'), ingredient: t('types.ingredient'), intermediate: t('types.intermediate') },
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
          // Absolute locale-less href — relative `../items` resolved against
          // /technical/materials to /<locale>/items → 404 (same class as the BOM CTA).
          <Link href="/technical/items" prefetch={false} className="btn btn-secondary">
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
        <MaterialsTableClient items={items} typeTabs={typeTabs} labels={tableLabels} />
      )}
    </main>
  );
}

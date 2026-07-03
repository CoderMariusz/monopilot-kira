/**
 * W3 L10 — Technical › WIP library list page.
 *
 * Structural pattern mirrors technical/items/page.tsx: RSC resolves data +
 * RBAC flags server-side, client island renders the interactive table.
 */

import Link from 'next/link';

import { buildWipLibraryLabels } from './_lib/build-wip-labels';
import { loadWipListPage } from './_lib/load-wip-pages';
import { WipLibraryListClient } from './_components/wip-library-list.client';

export const dynamic = 'force-dynamic';

export default async function WipLibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ modal?: string }>;
}) {
  const { locale } = await params;
  const autoOpenCreate = (await searchParams)?.modal === 'create';
  const { definitions, canCreate, canEdit, canDeactivate, state } = await loadWipListPage();
  const labels = await buildWipLibraryLabels();

  return (
    <main data-screen="technical-wip-library" className="flex w-full flex-col gap-4 px-6 py-6">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href={`/${locale}/technical`}>{labels.breadcrumbRoot}</Link> / {labels.listTitle}
      </nav>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">{labels.listTitle}</h1>
          <p className="helper mt-1 max-w-3xl">{labels.listDescription}</p>
        </div>
      </header>

      {state === 'error' ? (
        <div role="alert" className="alert alert-red">
          <div className="alert-title">{labels.listErrorTitle}</div>
          {labels.listErrorBody}
        </div>
      ) : state === 'empty' ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">⚗️</div>
            <div className="empty-state-title">{labels.listEmptyTitle}</div>
            <div className="empty-state-body">
              {canCreate ? labels.listEmptyBodyCreate : labels.listEmptyBodyView}
            </div>
          </div>
        </div>
      ) : (
        <WipLibraryListClient
          definitions={definitions}
          canCreate={canCreate}
          canEdit={canEdit}
          canDeactivate={canDeactivate}
          labels={labels}
          locale={locale}
          autoOpenCreate={autoOpenCreate}
        />
      )}
    </main>
  );
}

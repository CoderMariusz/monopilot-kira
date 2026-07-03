/**
 * W3 L10 — Technical › WIP library detail page (composition + process chain).
 */

import Link from 'next/link';

import { buildWipLibraryLabels } from '../_lib/build-wip-labels';
import { loadWipDetailPage } from '../_lib/load-wip-pages';
import { WipDefinitionDetailClient } from '../_components/wip-definition-detail.client';

export const dynamic = 'force-dynamic';

export default async function WipDefinitionDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const labels = await buildWipLibraryLabels();
  const result = await loadWipDetailPage(id);

  return (
    <main data-screen="technical-wip-definition" className="flex w-full flex-col gap-4 px-6 py-6">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href={`/${locale}/technical`}>{labels.breadcrumbRoot}</Link> /{' '}
        <Link href={`/${locale}/technical/wip-library`}>{labels.detailBreadcrumb}</Link> /{' '}
        {result.definition?.name ?? id}
      </nav>

      {result.state === 'error' ? (
        <div role="alert" className="alert alert-red">
          <div className="alert-title">{labels.detailErrorTitle}</div>
        </div>
      ) : result.state === 'not_found' || !result.definition ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">⚠️</div>
            <div className="empty-state-title">{labels.detailNotFoundTitle}</div>
            <div className="empty-state-body">{labels.detailNotFoundBody}</div>
          </div>
        </div>
      ) : (
        <WipDefinitionDetailClient
          definition={result.definition}
          ingredients={result.ingredients}
          processes={result.processes}
          whereUsed={result.whereUsed}
          operations={result.operations}
          canEdit={result.canEdit}
          canDeactivate={result.canDeactivate}
          labels={labels}
          locale={locale}
        />
      )}
    </main>
  );
}

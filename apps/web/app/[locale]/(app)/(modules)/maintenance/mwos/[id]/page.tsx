/**
 * 13-MAINTENANCE — MWO operator detail (/maintenance/mwos/[id]).
 */
import { Suspense } from 'react';
import { notFound } from 'next/navigation';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { getMaintenanceTranslator } from '../../maintenance-labels';
import { buildMwoListLabels } from '../../_components/mwo-detail-labels';
import { getMwoById, getMwoPermissions, listEquipmentForMwo, transitionMwo, updateMwo, verifyMwoLotoLockout, verifyMwoLotoRelease } from '../../_actions/mwo-actions';
import { MwoDetailClient } from './_components/mwo-detail.client';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; id: string }> };

function DetailSkeleton() {
  return (
    <div data-testid="mwo-detail-loading" data-state="loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-6 w-32 animate-pulse rounded bg-slate-100" />
      <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function DetailContent({ locale, id }: { locale: string; id: string }) {
  const t = getMaintenanceTranslator(locale);
  const labels = buildMwoListLabels(t);

  const [mwoResult, permissions, equipmentResult] = await Promise.all([
    getMwoById(id),
    getMwoPermissions(),
    listEquipmentForMwo(),
  ]);
  const equipment = equipmentResult.ok ? equipmentResult.data : [];

  if (!mwoResult.ok) {
    if (mwoResult.reason === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="mwo-detail-denied"
          data-state="permission-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          {labels.detail.denied}
        </div>
      );
    }
    return (
      <div
        role="alert"
        data-testid="mwo-detail-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {labels.detail.error}
      </div>
    );
  }

  if (!mwoResult.data) notFound();

  return (
    <MwoDetailClient
      locale={locale}
      mwo={mwoResult.data}
      equipment={equipment}
      labels={labels}
      permissions={{
        canEdit: permissions.canCreate,
        canExecute: permissions.canExecute,
        canCancel: permissions.canCancel,
        canLotoApply: permissions.canLotoApply,
        canLotoClear: permissions.canLotoClear,
      }}
      transitionMwoAction={transitionMwo}
      updateMwoAction={updateMwo}
      verifyLotoLockoutAction={verifyMwoLotoLockout}
      verifyLotoReleaseAction={verifyMwoLotoRelease}
    />
  );
}

export default async function MwoDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  const t = getMaintenanceTranslator(locale);

  return (
    <main
      data-screen="maintenance-mwo-detail"
      data-prototype-label="mwo_detail"
      className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('detail.overviewTitle')}
        subtitle={t('list.subtitle')}
        breadcrumb={[
          { label: t('list.breadcrumb.maintenance'), href: `/${locale}/maintenance` },
          { label: t('list.title'), href: `/${locale}/maintenance` },
          { label: t('detail.overviewTitle') },
        ]}
      />
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent locale={locale} id={id} />
      </Suspense>
    </main>
  );
}

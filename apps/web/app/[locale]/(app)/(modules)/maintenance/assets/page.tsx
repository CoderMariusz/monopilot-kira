import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { getAssetPermissions, listEquipmentAssets } from './_actions/asset-actions';
import { AssetRegisterClient, type AssetRegisterLabels } from './_components/asset-register.client';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

const PROTOTYPE_ANCHOR =
  'prototypes/design/Monopilot Design System/maintenance/assets.jsx:48-183';

type AssetTranslator = Awaited<ReturnType<typeof getTranslations<'maintenance.assets'>>>;

function buildLabels(t: AssetTranslator): AssetRegisterLabels {
  return {
    searchPlaceholder: t('list.searchPlaceholder'),
    countLine: t('list.countLine'),
    addAsset: t('list.addAsset'),
    exportCsv: t('list.exportCsv'),
    emptyTitle: t('list.emptyTitle'),
    emptyBody: t('list.emptyBody'),
    col: {
      code: t('list.col.code'),
      name: t('list.col.name'),
      type: t('list.col.type'),
      loto: t('list.col.loto'),
      calibration: t('list.col.calibration'),
      status: t('list.col.status'),
    },
    lotoYes: t('list.lotoYes'),
    lotoNo: t('list.lotoNo'),
    calYes: t('list.calYes'),
    calNo: t('list.calNo'),
    statusActive: t('list.statusActive'),
    statusInactive: t('list.statusInactive'),
    types: {
      mixer: t('types.mixer'),
      oven: t('types.oven'),
      packer: t('types.packer'),
      scale: t('types.scale'),
      thermometer: t('types.thermometer'),
      conveyor: t('types.conveyor'),
      other: t('types.other'),
    },
    form: {
      createTitle: t('form.createTitle'),
      code: t('form.code'),
      codePlaceholder: t('form.codePlaceholder'),
      name: t('form.name'),
      namePlaceholder: t('form.namePlaceholder'),
      type: t('form.type'),
      requiresLoto: t('form.requiresLoto'),
      requiresCalibration: t('form.requiresCalibration'),
      submit: t('form.submit'),
      submitting: t('form.submitting'),
      cancel: t('form.cancel'),
      errorRequired: t('form.errorRequired'),
      errorFailed: t('form.errorFailed'),
      errorForbidden: t('form.errorForbidden'),
      errorConflict: t('form.errorConflict'),
      types: {
        mixer: t('types.mixer'),
        oven: t('types.oven'),
        packer: t('types.packer'),
        scale: t('types.scale'),
        thermometer: t('types.thermometer'),
        conveyor: t('types.conveyor'),
        other: t('types.other'),
      },
    },
  };
}

export default async function MaintenanceAssetsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'maintenance.assets' });
  const permissions = await getAssetPermissions();

  if (!permissions.canRead) {
    return (
      <main
        data-screen="maintenance-assets-register"
        data-prototype-anchor={PROTOTYPE_ANCHOR}
        className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
      >
        <div
          role="alert"
          data-testid="asset-register-denied"
          data-state="permission-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          {t('list.denied')}
        </div>
      </main>
    );
  }

  const result = await listEquipmentAssets();
  const labels = buildLabels(t);

  if (!result.ok) {
    return (
      <main
        data-screen="maintenance-assets-register"
        data-prototype-anchor={PROTOTYPE_ANCHOR}
        className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
      >
        <div
          role="alert"
          data-testid="asset-register-error"
          data-state="error"
          className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
        >
          {t('list.error')}
        </div>
      </main>
    );
  }

  return (
    <main
      data-screen="maintenance-assets-register"
      data-prototype-anchor={PROTOTYPE_ANCHOR}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('list.title')}
        subtitle={t('list.subtitle')}
        breadcrumb={[
          { label: t('list.breadcrumb.maintenance'), href: `/${locale}/maintenance` },
          { label: t('list.breadcrumb.assets') },
        ]}
      />

      <nav aria-label="Maintenance navigation" className="flex flex-wrap gap-2">
        <Link
          href={`/${locale}/maintenance`}
          prefetch={false}
          className="inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-950 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          {t('list.breadcrumb.maintenance')}
        </Link>
        <Link
          href={`/${locale}/maintenance/calibration`}
          prefetch={false}
          className="inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-950 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          Calibration
        </Link>
      </nav>

      <AssetRegisterClient rows={result.data} labels={labels} canEdit={permissions.canEdit} />
    </main>
  );
}

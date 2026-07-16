import Link from 'next/link';

import {
  getCalibrationPermissions,
  listActiveInstruments,
} from './_actions/calibration-actions';
import { listCalibration } from './_actions/list-calibration';
import { CalibrationRegisterClient, type CalibrationRegisterLabels } from './_components/calibration-register.client';
import { getCalibrationTranslator, type CalibrationTranslator } from './calibration-labels';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

function buildLabels(t: CalibrationTranslator): CalibrationRegisterLabels {
  return {
    exportCsv: t('list.exportCsv'),
    instruments: t('list.instruments'),
    overdue: t('list.overdue'),
    asOf: t('list.asOf'),
    emptyTitle: t('list.emptyTitle'),
    emptyBody: t('list.emptyBody'),
    col: {
      instrument: t('list.col.instrument'),
      type: t('list.col.type'),
      standard: t('list.col.standard'),
      range: t('list.col.range'),
      lastCalibrated: t('list.col.lastCalibrated'),
      result: t('list.col.result'),
      certificate: t('list.col.certificate'),
      nextDue: t('list.col.nextDue'),
      status: t('list.col.status'),
    },
    rangeNotSet: t('list.rangeNotSet'),
    neverCalibrated: t('list.neverCalibrated'),
    noRecord: t('list.noRecord'),
    noCertificate: t('list.noCertificate'),
    nextDueNotSet: t('list.nextDueNotSet'),
    statusOverdue: t('list.statusOverdue'),
    statusDue: t('list.statusDue'),
    statusNoDue: t('list.statusNoDue'),
    statusInactive: t('list.statusInactive'),
    addInstrument: t('list.addInstrument'),
    recordCalibration: t('list.recordCalibration'),
    editInstrument: t('list.editInstrument'),
    types: {
      scale: t('types.scale'),
      thermometer: t('types.thermometer'),
      ph_meter: t('types.ph_meter'),
      other: t('types.other'),
    },
    standards: {
      ISO_9001: t('standards.ISO_9001'),
      NIST: t('standards.NIST'),
      internal: t('standards.internal'),
      other: t('standards.other'),
    },
    results: {
      PASS: t('results.PASS'),
      FAIL: t('results.FAIL'),
      OUT_OF_SPEC: t('results.OUT_OF_SPEC'),
    },
    instrument: {
      createTitle: t('instrument.createTitle'),
      editTitle: t('instrument.editTitle'),
      code: t('instrument.code'),
      codePlaceholder: t('instrument.codePlaceholder'),
      type: t('instrument.type'),
      standard: t('instrument.standard'),
      intervalDays: t('instrument.intervalDays'),
      rangeMin: t('instrument.rangeMin'),
      rangeMax: t('instrument.rangeMax'),
      unit: t('instrument.unit'),
      unitPlaceholder: t('instrument.unitPlaceholder'),
      submit: t('instrument.submit'),
      submitting: t('instrument.submitting'),
      cancel: t('instrument.cancel'),
      deactivate: t('instrument.deactivate'),
      deactivating: t('instrument.deactivating'),
      reactivate: t('instrument.reactivate'),
      reactivating: t('instrument.reactivating'),
      errorRequired: t('instrument.errorRequired'),
      errorFailed: t('instrument.errorFailed'),
      errorForbidden: t('instrument.errorForbidden'),
      types: {
        scale: t('types.scale'),
        thermometer: t('types.thermometer'),
        ph_meter: t('types.ph_meter'),
        other: t('types.other'),
      },
      standards: {
        ISO_9001: t('standards.ISO_9001'),
        NIST: t('standards.NIST'),
        internal: t('standards.internal'),
        other: t('standards.other'),
      },
    },
    record: {
      title: t('record.title'),
      instrument: t('record.instrument'),
      instrumentPlaceholder: t('record.instrumentPlaceholder'),
      calibratedAt: t('record.calibratedAt'),
      result: t('record.result'),
      resultPass: t('record.resultPass'),
      resultFail: t('record.resultFail'),
      resultOutOfSpec: t('record.resultOutOfSpec'),
      measuredValues: t('record.measuredValues'),
      measuredPlaceholder: t('record.measuredPlaceholder'),
      notes: t('record.notes'),
      certificateRef: t('record.certificateRef'),
      certificatePlaceholder: t('record.certificatePlaceholder'),
      calibratorPassword: t('record.calibratorPassword'),
      reviewerUserId: t('record.reviewerUserId'),
      reviewerUserIdPlaceholder: t('record.reviewerUserIdPlaceholder'),
      reviewerPassword: t('record.reviewerPassword'),
      dualSignWarning: t('record.dualSignWarning'),
      submit: t('record.submit'),
      submitting: t('record.submitting'),
      cancel: t('record.cancel'),
      errorRequired: t('record.errorRequired'),
      errorFailed: t('record.errorFailed'),
      errorForbidden: t('record.errorForbidden'),
      errorEsign: t('record.errorEsign'),
      errorSod: t('record.errorSod'),
    },
  };
}

export default async function CalibrationRegisterPage({ params }: PageProps) {
  const { locale } = await params;
  const t = getCalibrationTranslator(locale);
  const permissions = await getCalibrationPermissions();

  if (!permissions.canRead) {
    return (
      <main data-screen="maintenance-calibration-register" className="flex w-full flex-col gap-6 px-6 py-6">
        <div
          role="alert"
          data-testid="calibration-register-denied"
          data-state="permission-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          {t('list.denied')}
        </div>
      </main>
    );
  }

  const [rows, instrumentsResult] = await Promise.all([listCalibration(), listActiveInstruments()]);
  const instruments = instrumentsResult.ok ? instrumentsResult.data : [];
  const labels = buildLabels(t);

  return (
    <main data-screen="maintenance-calibration-register" className="flex w-full flex-col gap-6 px-6 py-6">
      <header>
        <p className="text-sm font-medium text-slate-500">
          <Link href={`/${locale}/maintenance`} className="hover:underline">
            {t('list.breadcrumb.maintenance')}
          </Link>
          {' / '}
          {t('list.breadcrumb.calibration')}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">{t('list.title')}</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">{t('list.subtitle')}</p>
      </header>

      <CalibrationRegisterClient
        rows={rows}
        instruments={instruments}
        labels={labels}
        permissions={{
          canEditInstrument: permissions.canEditInstrument,
          canDeactivateInstrument: permissions.canDeactivateInstrument,
          canRecord: permissions.canRecord,
        }}
      />
    </main>
  );
}

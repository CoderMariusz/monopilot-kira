'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { toCsv } from '../../../../../../../lib/shared/download';
import type { CalibrationDueRow, CalibrationRecordRowPatch, InstrumentOption } from '../_types/calibration-schemas';
import {
  createInstrument,
  deactivateInstrument,
  reactivateInstrument,
  recordCalibration,
  updateInstrument,
} from '../_actions/calibration-actions';
import type { CalibrationReviewerOption } from '../_actions/calibration-esign';
import { InstrumentFormModal, type InstrumentFormLabels } from './instrument-form-modal';
import { RecordCalibrationModal, type RecordCalibrationLabels } from './record-calibration-modal';

export type CalibrationRegisterLabels = {
  exportCsv: string;
  instruments: string;
  overdue: string;
  asOf: string;
  emptyTitle: string;
  emptyBody: string;
  col: {
    instrument: string;
    type: string;
    standard: string;
    range: string;
    lastCalibrated: string;
    result: string;
    certificate: string;
    nextDue: string;
    status: string;
  };
  rangeNotSet: string;
  neverCalibrated: string;
  noRecord: string;
  noCertificate: string;
  nextDueNotSet: string;
  statusOverdue: string;
  statusDue: string;
  statusNoDue: string;
  statusInactive: string;
  addInstrument: string;
  recordCalibration: string;
  editInstrument: string;
  types: Record<string, string>;
  standards: Record<string, string>;
  results: Record<string, string>;
  instrument: InstrumentFormLabels;
  record: RecordCalibrationLabels;
};

function isOverdue(nextDueDate: string | null, today: string): boolean {
  return nextDueDate !== null && nextDueDate < today;
}

function formatRange(row: CalibrationDueRow, rangeNotSet: string): string {
  if (row.rangeMin === null && row.rangeMax === null) return rangeNotSet;
  const unit = row.unitOfMeasure ? ` ${row.unitOfMeasure}` : '';
  return `${row.rangeMin ?? '...'} - ${row.rangeMax ?? '...'}${unit}`;
}

function statusText(row: CalibrationDueRow, today: string, labels: CalibrationRegisterLabels): string {
  if (!row.active) return labels.statusInactive;
  if (isOverdue(row.nextDueDate, today)) return labels.statusOverdue;
  if (!row.nextDueDate) return labels.statusNoDue;
  return labels.statusDue;
}

function buildCsvHref(rows: CalibrationDueRow[], today: string, labels: CalibrationRegisterLabels): string {
  const csv = toCsv(
    [
      labels.col.instrument,
      labels.col.type,
      labels.col.standard,
      labels.col.range,
      labels.col.lastCalibrated,
      labels.col.result,
      labels.col.certificate,
      labels.col.nextDue,
      labels.col.status,
    ],
    rows.map((row) => [
      row.instrumentCode,
      labels.types[row.instrumentType] ?? row.instrumentType,
      labels.standards[row.standard] ?? row.standard,
      formatRange(row, labels.rangeNotSet),
      row.calibratedAt?.slice(0, 10) ?? '',
      row.result ? (labels.results[row.result] ?? row.result) : '',
      row.certificateFileUrl ?? '',
      row.nextDueDate ?? '',
      statusText(row, today, labels),
    ]),
  );

  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
}

function applyRecordRowPatch(rows: CalibrationDueRow[], patch: CalibrationRecordRowPatch): CalibrationDueRow[] {
  return rows.map((row) =>
    row.instrumentId === patch.instrumentId
      ? {
          ...row,
          recordId: row.recordId,
          calibratedAt: patch.calibratedAt,
          result: patch.result,
          certificateFileUrl: patch.certificateFileUrl,
          nextDueDate: patch.nextDueDate,
          active: patch.active,
        }
      : row,
  );
}

export function CalibrationRegisterClient({
  rows: rowsProp,
  instruments,
  reviewers,
  labels,
  permissions,
}: {
  rows: CalibrationDueRow[];
  instruments: InstrumentOption[];
  reviewers: CalibrationReviewerOption[];
  labels: CalibrationRegisterLabels;
  permissions: {
    canEditInstrument: boolean;
    canDeactivateInstrument: boolean;
    canRecord: boolean;
  };
}) {
  const router = useRouter();
  const [rows, setRows] = useState(rowsProp);
  useEffect(() => {
    setRows(rowsProp);
  }, [rowsProp]);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const overdueCount = rows.filter((row) => row.active && isOverdue(row.nextDueDate, today)).length;
  const csvHref = buildCsvHref(rows, today, labels);

  const [modal, setModal] = useState<
  | { kind: 'create-instrument' }
  | { kind: 'edit-instrument'; instrument: CalibrationDueRow }
  | { kind: 'record'; instrumentId?: string }
  | null
  >(null);

  const refresh = () => {
    setModal(null);
    router.refresh();
  };

  const refreshAfterRecord = (rowPatch: CalibrationRecordRowPatch) => {
    setModal(null);
    setRows((current) => applyRecordRowPatch(current, rowPatch));
    router.refresh();
  };

  return (
    <>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {permissions.canEditInstrument ? (
            <button
              type="button"
              onClick={() => setModal({ kind: 'create-instrument' })}
              data-testid="calibration-add-instrument"
              className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
            >
              {labels.addInstrument}
            </button>
          ) : null}
          {permissions.canRecord ? (
            <button
              type="button"
              onClick={() => setModal({ kind: 'record' })}
              data-testid="calibration-record-button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
            >
              {labels.recordCalibration}
            </button>
          ) : null}
        </div>
        <a
          href={csvHref}
          download={`calibration-due-register-${today}.csv`}
          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
        >
          {labels.exportCsv}
        </a>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{labels.instruments}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{rows.length}</p>
        </div>
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{labels.overdue}</p>
          <p className="mt-1 text-2xl font-semibold text-red-900">{overdueCount}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{labels.asOf}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{today}</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h2 className="text-base font-semibold text-slate-950">{labels.emptyTitle}</h2>
            <p className="mt-2 text-sm text-slate-600">{labels.emptyBody}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="calibration-register-table">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3">{labels.col.instrument}</th>
                  <th scope="col" className="px-4 py-3">{labels.col.type}</th>
                  <th scope="col" className="px-4 py-3">{labels.col.standard}</th>
                  <th scope="col" className="px-4 py-3">{labels.col.range}</th>
                  <th scope="col" className="px-4 py-3">{labels.col.lastCalibrated}</th>
                  <th scope="col" className="px-4 py-3">{labels.col.result}</th>
                  <th scope="col" className="px-4 py-3">{labels.col.certificate}</th>
                  <th scope="col" className="px-4 py-3">{labels.col.nextDue}</th>
                  <th scope="col" className="px-4 py-3">{labels.col.status}</th>
                  {permissions.canEditInstrument ? (
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((row) => {
                  const overdue = row.active && isOverdue(row.nextDueDate, today);
                  const inactive = !row.active;
                  return (
                    <tr
                      key={row.instrumentId}
                      data-testid={`calibration-row-${row.instrumentCode}`}
                      className={
                        inactive
                          ? 'bg-slate-100 text-slate-500'
                          : overdue
                            ? 'bg-red-50 text-red-950'
                            : 'bg-white text-slate-800'
                      }
                    >
                      <td className="px-4 py-3 font-medium text-slate-950">{row.instrumentCode}</td>
                      <td className="px-4 py-3">{labels.types[row.instrumentType] ?? row.instrumentType}</td>
                      <td className="px-4 py-3">{labels.standards[row.standard] ?? row.standard}</td>
                      <td className="px-4 py-3">{formatRange(row, labels.rangeNotSet)}</td>
                      <td className="px-4 py-3">
                        {row.calibratedAt ? row.calibratedAt.slice(0, 10) : labels.neverCalibrated}
                      </td>
                      <td className="px-4 py-3">
                        {row.result ? (labels.results[row.result] ?? row.result) : labels.noRecord}
                      </td>
                      <td className="px-4 py-3">{row.certificateFileUrl ?? labels.noCertificate}</td>
                      <td className="px-4 py-3">{row.nextDueDate ?? labels.nextDueNotSet}</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            inactive
                              ? 'rounded-md bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700'
                              : overdue
                                ? 'rounded-md bg-red-100 px-2 py-1 text-xs font-semibold text-red-800'
                                : 'rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700'
                          }
                        >
                          {statusText(row, today, labels)}
                        </span>
                      </td>
                      {permissions.canEditInstrument ? (
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setModal({ kind: 'edit-instrument', instrument: row })}
                            data-testid={`calibration-edit-${row.instrumentCode}`}
                            className="text-xs font-medium text-slate-700 underline hover:text-slate-900"
                          >
                            {labels.editInstrument}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal?.kind === 'create-instrument' ? (
        <InstrumentFormModal
          mode="create"
          labels={labels.instrument}
          canDeactivate={false}
          createInstrumentAction={createInstrument}
          updateInstrumentAction={updateInstrument}
          deactivateInstrumentAction={deactivateInstrument}
          reactivateInstrumentAction={reactivateInstrument}
          onClose={() => setModal(null)}
          onSaved={refresh}
        />
      ) : null}

      {modal?.kind === 'edit-instrument' ? (
        <InstrumentFormModal
          mode="edit"
          instrument={modal.instrument}
          labels={labels.instrument}
          canDeactivate={permissions.canDeactivateInstrument}
          createInstrumentAction={createInstrument}
          updateInstrumentAction={updateInstrument}
          deactivateInstrumentAction={deactivateInstrument}
          reactivateInstrumentAction={reactivateInstrument}
          onClose={() => setModal(null)}
          onSaved={refresh}
        />
      ) : null}

      {modal?.kind === 'record' ? (
        <RecordCalibrationModal
          instruments={instruments}
          reviewers={reviewers}
          defaultInstrumentId={modal.instrumentId}
          labels={labels.record}
          recordCalibrationAction={recordCalibration}
          onClose={() => setModal(null)}
          onRecorded={refreshAfterRecord}
        />
      ) : null}
    </>
  );
}

import { toCsv } from '../../../../../../lib/shared/download';
import { listCalibration } from './_actions/list-calibration';

export const dynamic = 'force-dynamic';

type CalibrationRow = Awaited<ReturnType<typeof listCalibration>>[number];

function isOverdue(nextDueDate: string | null, today: string): boolean {
  return nextDueDate !== null && nextDueDate < today;
}

function formatRange(row: CalibrationRow): string {
  if (row.rangeMin === null && row.rangeMax === null) return 'Not set';
  const unit = row.unitOfMeasure ? ` ${row.unitOfMeasure}` : '';
  return `${row.rangeMin ?? '...'} - ${row.rangeMax ?? '...'}${unit}`;
}

function statusText(row: CalibrationRow, today: string): string {
  if (isOverdue(row.nextDueDate, today)) return 'Overdue';
  if (!row.nextDueDate) return 'No due date';
  return 'Due';
}

function buildCsvHref(rows: CalibrationRow[], today: string): string {
  const csv = toCsv(
    [
      'Instrument code',
      'Instrument type',
      'Standard',
      'Range',
      'Last calibrated',
      'Result',
      'Next due date',
      'Status',
    ],
    rows.map((row) => [
      row.instrumentCode,
      row.instrumentType,
      row.standard,
      formatRange(row),
      row.calibratedAt ?? '',
      row.result ?? '',
      row.nextDueDate ?? '',
      statusText(row, today),
    ]),
  );

  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
}

export default async function CalibrationRegisterPage() {
  const rows = await listCalibration();
  const today = new Date().toISOString().slice(0, 10);
  const overdueCount = rows.filter((row) => isOverdue(row.nextDueDate, today)).length;
  const csvHref = buildCsvHref(rows, today);

  return (
    <main data-screen="maintenance-calibration-register" className="flex w-full flex-col gap-6 px-6 py-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Maintenance / Calibration</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">
            Calibration due register
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Read-only register of calibration instruments and their latest calibration record.
          </p>
        </div>
        <a
          href={csvHref}
          download={`calibration-due-register-${today}.csv`}
          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
        >
          Export CSV
        </a>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Instruments</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{rows.length}</p>
        </div>
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">Overdue</p>
          <p className="mt-1 text-2xl font-semibold text-red-900">{overdueCount}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">As of</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{today}</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h2 className="text-base font-semibold text-slate-950">No calibration instruments found</h2>
            <p className="mt-2 text-sm text-slate-600">
              Instruments will appear here when they exist for the current organisation.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Instrument
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Type
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Standard
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Range
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Last calibrated
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Result
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Next due
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((row) => {
                  const overdue = isOverdue(row.nextDueDate, today);
                  return (
                    <tr
                      key={row.instrumentId}
                      className={overdue ? 'bg-red-50 text-red-950' : 'bg-white text-slate-800'}
                    >
                      <td className="px-4 py-3 font-medium text-slate-950">{row.instrumentCode}</td>
                      <td className="px-4 py-3">{row.instrumentType}</td>
                      <td className="px-4 py-3">{row.standard}</td>
                      <td className="px-4 py-3">{formatRange(row)}</td>
                      <td className="px-4 py-3">{row.calibratedAt ?? 'Never'}</td>
                      <td className="px-4 py-3">{row.result ?? 'No record'}</td>
                      <td className="px-4 py-3">{row.nextDueDate ?? 'Not set'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            overdue
                              ? 'rounded-md bg-red-100 px-2 py-1 text-xs font-semibold text-red-800'
                              : 'rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700'
                          }
                        >
                          {statusText(row, today)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
